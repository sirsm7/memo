window.SUPABASE_URL = '';
window.SUPABASE_KEY = '';
window.SUPABASE_ANON_KEY = '';
window.GAS_URL = '';
window.GAS_ENDPOINT_URL = '';
window._supabase = null;
window.__ENV = null;

window.appConfigReady = (async function() {
  try {
    const response = await fetch('/api/config', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Gagal memuatkan konfigurasi: ${response.status}`);
    }

    const config = await response.json();

    const supabaseUrl = config.SUPABASE_URL || '';
    const supabaseKey = config.SUPABASE_KEY || config.SUPABASE_ANON_KEY || '';
    const gasUrl = config.GAS_URL || config.GAS_ENDPOINT_URL || '';

    let supabaseClient = null;
    if (window.supabase && typeof window.supabase.createClient === 'function' && supabaseUrl && supabaseKey) {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }

    window.SUPABASE_URL = supabaseUrl;
    window.SUPABASE_KEY = supabaseKey;
    window.SUPABASE_ANON_KEY = supabaseKey;
    window.GAS_URL = gasUrl;
    window.GAS_ENDPOINT_URL = gasUrl;
    window._supabase = supabaseClient;

    const frozenConfig = Object.freeze({
      SUPABASE_URL: supabaseUrl,
      SUPABASE_KEY: supabaseKey,
      SUPABASE_ANON_KEY: supabaseKey,
      GAS_URL: gasUrl,
      GAS_ENDPOINT_URL: gasUrl
    });

    window.APP_CONFIG = frozenConfig;
    window.__ENV = frozenConfig;

    window.dispatchEvent(new CustomEvent('appConfigLoaded', {
      detail: {
        supabaseUrl,
        gasUrl
      }
    }));

    return frozenConfig;
  } catch (error) {
    throw error;
  }
})();

window.ENV_READY = window.appConfigReady;