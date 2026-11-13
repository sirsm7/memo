window.SUPABASE_URL = '';
window.SUPABASE_KEY = '';
window.SUPABASE_ANON_KEY = '';
window.GAS_URL = '';
window.GAS_ENDPOINT_URL = '';
window._supabase = null;
window.__ENV = null;
window.APP_CONFIG = null;

async function initializeAppConfig() {
  const response = await fetch('/api/config', {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    let serverError = `Gagal memuatkan konfigurasi pelayan (HTTP ${response.status}).`;
    try {
      const errorBody = await response.json();
      if (errorBody && errorBody.error) {
        serverError = errorBody.error;
      }
    } catch (parseErr) {}
    throw new Error(serverError);
  }

  const config = await response.json();

  const supabaseUrl = String((config && config.SUPABASE_URL) || '').trim();
  const supabaseAnonKey = String((config && (config.SUPABASE_ANON_KEY || config.SUPABASE_KEY)) || '').trim();
  const gasEndpointUrl = String((config && (config.GAS_ENDPOINT_URL || config.GAS_URL)) || '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Konfigurasi tidak lengkap: SUPABASE_URL atau SUPABASE_ANON_KEY tiada.');
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('Pustaka klien @supabase/supabase-js v2 gagal dimuatkan.');
  }

  const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  window.SUPABASE_URL = supabaseUrl;
  window.SUPABASE_KEY = supabaseAnonKey;
  window.SUPABASE_ANON_KEY = supabaseAnonKey;
  window.GAS_URL = gasEndpointUrl;
  window.GAS_ENDPOINT_URL = gasEndpointUrl;
  window._supabase = supabaseClient;

  const rawEnv = {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_KEY: supabaseAnonKey
  };

  if (gasEndpointUrl) {
    rawEnv.GAS_ENDPOINT_URL = gasEndpointUrl;
    rawEnv.GAS_URL = gasEndpointUrl;
  }

  const frozenConfig = Object.freeze(rawEnv);

  window.APP_CONFIG = frozenConfig;
  window.__ENV = frozenConfig;

  window.dispatchEvent(new CustomEvent('appConfigLoaded', {
    detail: {
      supabaseUrl,
      gasUrl: gasEndpointUrl
    }
  }));

  return frozenConfig;
}

window.reloadAppConfig = function() {
  const promise = initializeAppConfig();
  window.appConfigReady = promise;
  window.ENV_READY = promise;
  return promise;
};

window.appConfigReady = initializeAppConfig();
window.ENV_READY = window.appConfigReady;