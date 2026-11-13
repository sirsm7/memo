(function() {
  if (window.__realtimeManagerInitialized) {
    return;
  }
  window.__realtimeManagerInitialized = true;

  let activeChannel = null;
  let isSubscribing = false;
  let syncDebounceTimer = null;

  function getTargetSchema() {
    const schema = (window.__ENV && window.__ENV.SUPABASE_SCHEMA)
      || (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_SCHEMA)
      || window.SUPABASE_SCHEMA
      || 'memo_ag';
    return String(schema).trim() || 'memo_ag';
  }

  function isNewerOrEqualTimestamp(newRecord, cachedRecord) {
    if (!newRecord || !cachedRecord) {
      return true;
    }
    if (!newRecord.updated_at || !cachedRecord.updated_at) {
      return true;
    }
    const newTime = Date.parse(newRecord.updated_at);
    const cachedTime = Date.parse(cachedRecord.updated_at);
    if (Number.isNaN(newTime) || Number.isNaN(cachedTime)) {
      return true;
    }
    return newTime >= cachedTime;
  }

  async function shouldProcessPayload(storeName, payload) {
    if (!payload || !payload.eventType) {
      return false;
    }
    if (payload.eventType === 'DELETE') {
      return true;
    }
    const newRecord = payload.new;
    if (!newRecord || newRecord.id === undefined || newRecord.id === null) {
      return false;
    }
    if (!window.CacheService || typeof window.CacheService.getAll !== 'function') {
      return true;
    }
    try {
      const cachedList = await window.CacheService.getAll(storeName, 'id', true);
      const cachedRecord = Array.isArray(cachedList)
        ? cachedList.find(item => item && item.id === newRecord.id)
        : null;
      return isNewerOrEqualTimestamp(newRecord, cachedRecord);
    } catch (err) {
      return true;
    }
  }

  function syncGlobalPegawaiState(payload) {
    if (!Array.isArray(window.globalPegawaiFlat)) {
      window.globalPegawaiFlat = [];
    }

    if (payload.eventType === 'INSERT' && payload.new) {
      if (!window.globalPegawaiFlat.some(p => p && p.id === payload.new.id)) {
        window.globalPegawaiFlat.push(payload.new);
      }
    } else if (payload.eventType === 'UPDATE' && payload.new) {
      const idx = window.globalPegawaiFlat.findIndex(p => p && p.id === payload.new.id);
      if (idx !== -1) {
        window.globalPegawaiFlat[idx] = payload.new;
      } else {
        window.globalPegawaiFlat.push(payload.new);
      }
    } else if (payload.eventType === 'DELETE') {
      const targetId = payload.old && payload.old.id !== undefined ? payload.old.id : payload.id;
      if (targetId !== undefined && targetId !== null) {
        window.globalPegawaiFlat = window.globalPegawaiFlat.filter(p => p && p.id !== targetId);
      }
    }

    if (typeof window.processPegawai === 'function') {
      window.processPegawai(window.globalPegawaiFlat);
    } else {
      const rebuilt = {};
      window.globalPegawaiFlat.forEach(p => {
        if (!p || !p.sektor || !p.unit) return;
        if (!rebuilt[p.sektor]) rebuilt[p.sektor] = {};
        if (!rebuilt[p.sektor][p.unit]) rebuilt[p.sektor][p.unit] = [];
        rebuilt[p.sektor][p.unit].push({ nama: p.nama, emel: p.emel_rasmi });
      });
      window.groupedData = rebuilt;
    }

    if (typeof window.populateSektor === 'function') {
      window.populateSektor();
    }
  }

  async function handleMemoRekodChange(payload) {
    const valid = await shouldProcessPayload('memo_rekod', payload);
    if (!valid) {
      return;
    }

    if (window.CacheService && typeof window.CacheService.handleRealtimePayload === 'function') {
      await window.CacheService.handleRealtimePayload('memo_rekod', payload);
    }

    if (typeof window.handleAnalyticsRealtimeUpdate === 'function') {
      window.handleAnalyticsRealtimeUpdate(payload);
    }

    if (typeof window.handleAdminRealtimeUpdate === 'function') {
      window.handleAdminRealtimeUpdate('memo_rekod', payload);
    }

    const activeAdmin = window.currentAdmin || null;
    if (
      typeof window.loadManagerMemo === 'function' &&
      activeAdmin &&
      (activeAdmin.isManager || activeAdmin.isSystemAdmin)
    ) {
      window.loadManagerMemo();
    }
  }

  async function handleMemoPegawaiChange(payload) {
    const valid = await shouldProcessPayload('memo_pegawai', payload);
    if (!valid) {
      return;
    }

    if (window.CacheService && typeof window.CacheService.handleRealtimePayload === 'function') {
      await window.CacheService.handleRealtimePayload('memo_pegawai', payload);
    }

    syncGlobalPegawaiState(payload);

    if (typeof window.handleAdminRealtimeUpdate === 'function') {
      window.handleAdminRealtimeUpdate('memo_pegawai', payload);
    }
  }

  async function handleMemoAdminChange(payload) {
    const valid = await shouldProcessPayload('memo_admin', payload);
    if (!valid) {
      return;
    }

    if (window.CacheService && typeof window.CacheService.handleRealtimePayload === 'function') {
      await window.CacheService.handleRealtimePayload('memo_admin', payload);
    }

    if (typeof window.handleAdminRealtimeUpdate === 'function') {
      window.handleAdminRealtimeUpdate('memo_admin', payload);
    }
  }

  async function cleanupRealtimeChannel() {
    const client = window._supabase;
    if (activeChannel && client && typeof client.removeChannel === 'function') {
      try {
        await client.removeChannel(activeChannel);
      } catch (err) {}
    }
    activeChannel = null;
  }

  async function initRealtimeSubscription(forceResubscribe = false) {
    if (isSubscribing) {
      return activeChannel;
    }

    isSubscribing = true;

    try {
      const readyPromise = window.ENV_READY || window.appConfigReady;
      if (readyPromise && typeof readyPromise.then === 'function') {
        await readyPromise;
      }

      const client = window._supabase;
      if (!client || typeof client.channel !== 'function') {
        return null;
      }

      if (activeChannel) {
        const currentState = activeChannel.state;
        if (!forceResubscribe && (currentState === 'joined' || currentState === 'joining')) {
          return activeChannel;
        }
        await cleanupRealtimeChannel();
      }

      const targetSchema = getTargetSchema();
      const channelName = `memo-realtime-${targetSchema}`;

      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: targetSchema, table: 'memo_rekod' },
          (payload) => {
            handleMemoRekodChange(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: targetSchema, table: 'memo_pegawai' },
          (payload) => {
            handleMemoPegawaiChange(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: targetSchema, table: 'memo_admin' },
          (payload) => {
            handleMemoAdminChange(payload);
          }
        );

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (activeChannel === channel) {
            cleanupRealtimeChannel();
          }
        }
      });

      activeChannel = channel;
      return channel;
    } catch (err) {
      return null;
    } finally {
      isSubscribing = false;
    }
  }

  function triggerSWRBackgroundSync() {
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }

    syncDebounceTimer = setTimeout(() => {
      if (!window.CacheService || typeof window.CacheService.fetchSWR !== 'function') {
        return;
      }

      window.CacheService.fetchSWR('memo_pegawai', 'sektor', true, (data, isFromCache) => {
        if (!isFromCache && Array.isArray(data)) {
          window.globalPegawaiFlat = data;
          if (typeof window.processPegawai === 'function') {
            window.processPegawai(data);
          } else {
            const rebuilt = {};
            data.forEach(p => {
              if (!p || !p.sektor || !p.unit) return;
              if (!rebuilt[p.sektor]) rebuilt[p.sektor] = {};
              if (!rebuilt[p.sektor][p.unit]) rebuilt[p.sektor][p.unit] = [];
              rebuilt[p.sektor][p.unit].push({ nama: p.nama, emel: p.emel_rasmi });
            });
            window.groupedData = rebuilt;
          }
          if (typeof window.populateSektor === 'function') {
            window.populateSektor();
          }
        }
      });

      const tabAnalisis = document.getElementById('tabAnalisis');
      const isAnalisisVisible = tabAnalisis && !tabAnalisis.classList.contains('hidden');
      const activeAdmin = window.currentAdmin || null;

      if (isAnalisisVisible && typeof window.loadDashboardData === 'function') {
        window.loadDashboardData();
      } else if (activeAdmin && (activeAdmin.isSystemAdmin || activeAdmin.isManager)) {
        window.CacheService.fetchSWR('memo_rekod', 'created_at', false, (data, isFromCache) => {
          if (!isFromCache && Array.isArray(data)) {
            if (typeof window.adminMemoData !== 'undefined') {
              window.adminMemoData = data;
            }
            if (activeAdmin.isSystemAdmin && typeof window.loadAdminMemo === 'function') {
              window.loadAdminMemo();
            }
            if (typeof window.loadManagerMemo === 'function') {
              window.loadManagerMemo();
            }
          }
        });
      }
    }, 300);
  }

  async function handleLifecycleResume() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }

    const readyPromise = window.ENV_READY || window.appConfigReady;
    if (readyPromise && typeof readyPromise.then === 'function') {
      try {
        await readyPromise;
      } catch (err) {
        if (typeof window.reloadAppConfig === 'function') {
          try {
            await window.reloadAppConfig();
          } catch (reloadErr) {
            return;
          }
        } else {
          return;
        }
      }
    }

    const needsReconnect = !activeChannel || activeChannel.state !== 'joined';
    if (needsReconnect) {
      await initRealtimeSubscription(true);
    }

    triggerSWRBackgroundSync();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleLifecycleResume();
    }
  });

  window.addEventListener('online', () => {
    handleLifecycleResume();
  });

  window.addEventListener('pagehide', () => {
    cleanupRealtimeChannel();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initRealtimeSubscription(false);
    });
  } else {
    initRealtimeSubscription(false);
  }

  window.RealtimeService = {
    init: initRealtimeSubscription,
    cleanup: cleanupRealtimeChannel,
    syncNow: triggerSWRBackgroundSync,
    getChannel: () => activeChannel
  };
})();