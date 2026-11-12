import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let supabaseClientInstance = null;
let activeChannel = null;
let activeClient = null;
let activePayloadHandler = null;
let activeSyncHandler = null;
let isSubscribed = false;
let isReconnecting = false;
let lifecycleListenersBound = false;

const timestampRegistry = new Map();

function resolveRecordId(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const rawId = record.id ?? record.booking_id;
  if (rawId === undefined || rawId === null || rawId === '') {
    return null;
  }
  return String(rawId);
}

function createChannelSubscription(client) {
  if (!client || typeof client.channel !== 'function') {
    return null;
  }

  return client
    .channel('public:erom_bookings')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'erom_bookings' },
      async (payload) => {
        const record = payload.new || payload.old;
        const recordId = resolveRecordId(record);

        if (record && !isLatestPayload(record)) {
          return;
        }

        if (payload.eventType === 'DELETE' && recordId) {
          timestampRegistry.delete(recordId);
        }

        if (typeof activePayloadHandler === 'function') {
          await activePayloadHandler(payload);
        }
      }
    )
    .subscribe();
}

async function handleResumeSync() {
  if (!isSubscribed || !activeClient || isReconnecting) {
    return;
  }

  isReconnecting = true;
  try {
    const channelState = activeChannel ? activeChannel.state : null;
    if (!activeChannel || channelState !== 'joined') {
      if (activeChannel && typeof activeClient.removeChannel === 'function') {
        const staleChannel = activeChannel;
        activeChannel = null;
        try {
          await activeClient.removeChannel(staleChannel);
        } catch {}
      }
      if (isSubscribed && activeClient) {
        activeChannel = createChannelSubscription(activeClient);
      }
    }

    if (isSubscribed && typeof activeSyncHandler === 'function') {
      await activeSyncHandler();
    }
  } finally {
    isReconnecting = false;
  }
}

function handleVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    handleResumeSync();
  }
}

function handleNetworkOnline() {
  handleResumeSync();
}

function bindLifecycleListeners() {
  if (lifecycleListenersBound) {
    return;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleNetworkOnline);
  }
  lifecycleListenersBound = true;
}

export async function getSupabaseClient() {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }
  if (typeof window !== 'undefined' && window.ENV_READY) {
    await window.ENV_READY;
  }
  const env = (typeof window !== 'undefined' && window.__ENV) ? window.__ENV : {};
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) {
    throw new Error('Supabase configuration credentials missing');
  }
  supabaseClientInstance = createClient(url, key);
  return supabaseClientInstance;
}

export function isLatestPayload(record) {
  const id = resolveRecordId(record);
  if (!id) {
    return true;
  }
  const parsedTime = record.updated_at ? Date.parse(record.updated_at) : NaN;
  const incomingTime = Number.isNaN(parsedTime) ? Date.now() : parsedTime;
  const existingTime = timestampRegistry.get(id);

  if (existingTime && incomingTime < existingTime) {
    return false;
  }

  timestampRegistry.set(id, incomingTime);
  return true;
}

export function teardownRealtime(client) {
  const targetClient = client || activeClient || supabaseClientInstance;
  const channelToRemove = activeChannel;

  isSubscribed = false;
  activeChannel = null;
  activePayloadHandler = null;
  activeSyncHandler = null;

  if (channelToRemove && targetClient && typeof targetClient.removeChannel === 'function') {
    try {
      return Promise.resolve(targetClient.removeChannel(channelToRemove)).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }
  return Promise.resolve();
}

export function subscribeBookingsRealtime(client, onPayload, onReconnectSync) {
  const targetClient = client || supabaseClientInstance;
  if (!targetClient || typeof targetClient.channel !== 'function') {
    return null;
  }

  if (activeChannel) {
    teardownRealtime(targetClient);
  }

  activeClient = targetClient;
  activePayloadHandler = typeof onPayload === 'function' ? onPayload : null;
  activeSyncHandler = typeof onReconnectSync === 'function' ? onReconnectSync : null;
  isSubscribed = true;

  bindLifecycleListeners();
  activeChannel = createChannelSubscription(targetClient);

  return activeChannel;
}