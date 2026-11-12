window.ENV_READY = (async function initializeConfig() {
  try {
    const response = await fetch('/api/config', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-store'
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const serverMessage = data && typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : `HTTP error fetching config: ${response.status}`;
      throw new Error(serverMessage);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid configuration payload received.');
    }

    const resolvedConfig = {
      SUPABASE_URL: String(data.SUPABASE_URL || '').trim(),
      SUPABASE_ANON_KEY: String(data.SUPABASE_ANON_KEY || '').trim(),
      GAS_ENDPOINT_URL: String(data.GAS_ENDPOINT_URL || '').trim()
    };

    if (!resolvedConfig.SUPABASE_URL || !resolvedConfig.SUPABASE_ANON_KEY) {
      throw new Error('Missing required SUPABASE_URL or SUPABASE_ANON_KEY configuration.');
    }

    window.__ENV = Object.freeze(resolvedConfig);
    return window.__ENV;
  } catch (err) {
    window.__ENV = Object.freeze({
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      GAS_ENDPOINT_URL: ''
    });
    throw err;
  }
})();