window.SUPABASE_URL = '';
window.SUPABASE_KEY = '';
window.SUPABASE_ANON_KEY = '';
window.SUPABASE_SCHEMA = 'memo_ag';
window.GAS_URL = '';
window.GAS_ENDPOINT_URL = '';
window._supabase = null;
window.__ENV = null;
window.APP_CONFIG = null;
window.DB_CONNECTED = false;
window.DB_CONNECTION_ERROR = '';

let activeVerifyPromise = null;
let hasEvaluatedDbState = false;
const externalScriptPromises = new Map();

window.loadExternalScript = function(src, globalCheckName) {
  if (globalCheckName && typeof window[globalCheckName] !== 'undefined') {
    return Promise.resolve(window[globalCheckName]);
  }
  if (externalScriptPromises.has(src)) {
    return externalScriptPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalCheckName ? window[globalCheckName] : true), { once: true });
      existing.addEventListener('error', () => {
        externalScriptPromises.delete(src);
        reject(new Error(`Gagal memuatkan pustaka skrip: ${src}`));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(globalCheckName ? window[globalCheckName] : true);
    script.onerror = () => {
      externalScriptPromises.delete(src);
      reject(new Error(`Gagal memuatkan pustaka skrip: ${src}`));
    };
    document.head.appendChild(script);
  });

  externalScriptPromises.set(src, promise);
  return promise;
};

function buildFallbackMaintenanceOverlay() {
  let overlay = document.getElementById('dbMaintenanceOverlay');
  if (overlay) {
    return overlay;
  }

  if (!document.body) {
    return null;
  }

  overlay = document.createElement('div');
  overlay.id = 'dbMaintenanceOverlay';
  overlay.setAttribute('role', 'alert');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.className = 'hidden bg-slate-50 p-6 sm:p-12 min-h-[460px] flex items-center justify-center border-t border-slate-100';

  const card = document.createElement('div');
  card.className = 'max-w-xl w-full bg-white rounded-2xl shadow-lg border border-amber-200 p-6 sm:p-10 text-center';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'w-16 h-16 mx-auto mb-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'w-8 h-8');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('viewBox', '0 0 24 24');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z');
  svg.appendChild(path);
  iconWrap.appendChild(svg);

  const badge = document.createElement('span');
  badge.className = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 mb-4';
  badge.textContent = 'Gangguan Sambungan Pangkalan Data';

  const title = document.createElement('h3');
  title.className = 'text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight mb-3';
  title.textContent = 'Sistem Tergendala & Dalam Proses Kemaskini';

  const desc = document.createElement('p');
  desc.className = 'text-sm sm:text-base text-slate-600 leading-relaxed mb-4';
  desc.textContent = 'Harap maaf. Sambungan langsung ke pangkalan data utama sedang tergendala atau dalam proses penyelenggaraan dan kemaskini.';

  const noticeBox = document.createElement('div');
  noticeBox.className = 'bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-left';

  const noticeText = document.createElement('p');
  noticeText.className = 'text-xs sm:text-sm font-semibold text-red-700 leading-relaxed';
  noticeText.textContent = 'Semua urusan pendaftaran memo/surat, muat naik dokumen, log masuk pentadbir, dan semakan rekod tidak akan berfungsi selagi mana tiada sambungan langsung pada pangkalan data.';
  noticeBox.appendChild(noticeText);

  const reasonEl = document.createElement('p');
  reasonEl.id = 'dbMaintenanceReason';
  reasonEl.className = 'text-xs font-mono text-slate-500 bg-slate-100 px-3 py-2 rounded-lg mb-6 break-words';
  reasonEl.textContent = window.DB_CONNECTION_ERROR || 'Status: Tiada sambungan langsung ke pelayan pangkalan data.';

  const retryBtn = document.createElement('button');
  retryBtn.id = 'btnRetryDbConnection';
  retryBtn.type = 'button';
  retryBtn.className = 'min-h-[44px] px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors inline-flex items-center justify-center';
  retryBtn.textContent = 'Semak Semula Sambungan';
  retryBtn.addEventListener('click', () => {
    if (typeof window.retryDatabaseConnection === 'function') {
      window.retryDatabaseConnection();
    }
  });

  card.appendChild(iconWrap);
  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(noticeBox);
  card.appendChild(reasonEl);
  card.appendChild(retryBtn);
  overlay.appendChild(card);

  const tabUtama = document.getElementById('tabUtama');
  if (tabUtama && tabUtama.parentNode) {
    tabUtama.parentNode.insertBefore(overlay, tabUtama);
  } else {
    document.body.appendChild(overlay);
  }

  return overlay;
}

function toggleLegacyWorkspaceVisibility(showWorkspace) {
  const legacySections = [
    'tabUtama',
    'tabDaftar',
    'tabAnalisis',
    'tabKalendar',
    'tabAdmin',
    'tabTppd',
    'tabAbout'
  ];

  const legacyHeaderControls = [
    'btnTentang',
    'btnBukaLoginAdmin',
    'btnLogKeluarAdmin',
    'tabBtnAdminPanel',
    'tabBtnTppdPanel'
  ];

  if (!showWorkspace) {
    legacySections.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('hidden');
      }
    });

    legacyHeaderControls.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('hidden');
      }
    });

    const modals = [
      'modalLoginAdmin',
      'modalPegawai',
      'modalMemo',
      'modalTppdAssign',
      'modalTambahAdmin'
    ];
    modals.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('hidden');
      }
    });
  } else {
    const btnTentang = document.getElementById('btnTentang');
    if (btnTentang) {
      btnTentang.classList.remove('hidden');
    }

    const sessionStr = sessionStorage.getItem('memo_admin_session');
    if (sessionStr && typeof window.showAdminUI === 'function') {
      window.showAdminUI(true);
    } else {
      const btnLogin = document.getElementById('btnBukaLoginAdmin');
      if (btnLogin) {
        btnLogin.classList.remove('hidden');
      }
      if (typeof window.switchTab === 'function') {
        window.switchTab('utama');
      } else {
        const tabUtama = document.getElementById('tabUtama');
        if (tabUtama) {
          tabUtama.classList.remove('hidden');
        }
      }
    }
  }
}

function syncMaintenanceUIWithState() {
  if (!hasEvaluatedDbState) {
    return;
  }

  const isConnected = Boolean(window.DB_CONNECTED);
  const overlay = buildFallbackMaintenanceOverlay();
  const workspace = document.getElementById('appMainWorkspace');
  const initialLoading = document.getElementById('dbInitialLoading');
  const reasonEl = document.getElementById('dbMaintenanceReason');

  if (reasonEl) {
    reasonEl.textContent = window.DB_CONNECTION_ERROR || 'Status: Tiada sambungan langsung ke pelayan pangkalan data.';
  }
  if (initialLoading) {
    initialLoading.classList.add('hidden');
  }

  if (!isConnected) {
    if (overlay) {
      overlay.classList.remove('hidden');
    }
    if (workspace) {
      workspace.classList.add('hidden');
    }
    toggleLegacyWorkspaceVisibility(false);
  } else {
    if (overlay) {
      overlay.classList.add('hidden');
    }
    if (workspace) {
      workspace.classList.remove('hidden');
      workspace.classList.add('fade-in-panel');
    }
    toggleLegacyWorkspaceVisibility(true);
  }
}

window.setDatabaseConnectionState = function(isConnected, reason = '') {
  const nextState = Boolean(isConnected);
  const previousState = Boolean(window.DB_CONNECTED);
  const cleanReason = nextState
    ? ''
    : String(reason || 'Tiada sambungan langsung ke pangkalan data.').trim();

  window.DB_CONNECTED = nextState;
  window.DB_CONNECTION_ERROR = cleanReason;
  hasEvaluatedDbState = true;

  syncMaintenanceUIWithState();

  if (previousState !== nextState || !nextState) {
    window.dispatchEvent(new CustomEvent('dbConnectionStateChanged', {
      detail: {
        connected: nextState,
        reason: cleanReason
      }
    }));
  }

  return nextState;
};

window.verifyDatabaseConnection = function(options = {}) {
  if (activeVerifyPromise) {
    return activeVerifyPromise;
  }

  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  const silent = Boolean(options.silent);

  activeVerifyPromise = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Peranti berada di luar talian (tiada sambungan internet).');
      }

      const client = window._supabase;
      if (!client || typeof client.from !== 'function') {
        throw new Error('Klien pangkalan data belum sedia atau gagal dikonfigurasi.');
      }

      const controller = new AbortController();
      const timerId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        let query = client
          .from('memo_pegawai')
          .select('id')
          .limit(1);

        if (typeof query.abortSignal === 'function') {
          query = query.abortSignal(controller.signal);
        }

        const { error } = await query;
        if (error) {
          throw new Error(error.message || 'Pangkalan data gagal memberi maklum balas.');
        }
      } finally {
        clearTimeout(timerId);
      }

      window.setDatabaseConnectionState(true, '');
      return true;
    } catch (err) {
      const isAbort = err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('abort'));
      const errorMsg = isAbort
        ? 'Sambungan ke pangkalan data tamat masa (timeout).'
        : (err && err.message ? err.message : 'Gagal menyambung ke pangkalan data.');

      window.setDatabaseConnectionState(false, errorMsg);

      if (!silent) {
        throw new Error(errorMsg);
      }
      return false;
    } finally {
      activeVerifyPromise = null;
    }
  })();

  return activeVerifyPromise;
};

window.retryDatabaseConnection = async function() {
  const retryBtn = document.getElementById('btnRetryDbConnection');
  const reasonEl = document.getElementById('dbMaintenanceReason');

  if (retryBtn) {
    retryBtn.disabled = true;
    retryBtn.classList.add('opacity-60', 'cursor-not-allowed');
    retryBtn.textContent = 'Menyemak Sambungan...';
  }

  if (reasonEl) {
    reasonEl.textContent = 'Sedang menguji sambungan langsung ke pangkalan data...';
  }

  try {
    await window.reloadAppConfig();
    if (window.DB_CONNECTED && typeof window.loadPublicPegawaiData === 'function') {
      window.loadPublicPegawaiData();
    }
  } catch (err) {
    window.setDatabaseConnectionState(false, err && err.message ? err.message : 'Sambungan masih gagal.');
  } finally {
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      retryBtn.textContent = 'Semak Semula Sambungan';
    }
  }
};

async function initializeAppConfig() {
  try {
    const controller = new AbortController();
    const timerId = setTimeout(() => {
      controller.abort();
    }, 8000);

    let response;
    try {
      response = await fetch('/api/config', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        cache: 'no-store',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timerId);
    }

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
    const supabaseSchema = String((config && config.SUPABASE_SCHEMA) || 'memo_ag').trim() || 'memo_ag';
    const gasEndpointUrl = String((config && (config.GAS_ENDPOINT_URL || config.GAS_URL)) || '').trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Konfigurasi tidak lengkap: SUPABASE_URL atau SUPABASE_ANON_KEY tiada.');
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Pustaka klien @supabase/supabase-js v2 gagal dimuatkan.');
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      db: {
        schema: supabaseSchema
      }
    });

    window.SUPABASE_URL = supabaseUrl;
    window.SUPABASE_KEY = supabaseAnonKey;
    window.SUPABASE_ANON_KEY = supabaseAnonKey;
    window.SUPABASE_SCHEMA = supabaseSchema;
    window.GAS_URL = gasEndpointUrl;
    window.GAS_ENDPOINT_URL = gasEndpointUrl;
    window._supabase = supabaseClient;

    const rawEnv = {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: supabaseAnonKey,
      SUPABASE_KEY: supabaseAnonKey,
      SUPABASE_SCHEMA: supabaseSchema
    };

    if (gasEndpointUrl) {
      rawEnv.GAS_ENDPOINT_URL = gasEndpointUrl;
      rawEnv.GAS_URL = gasEndpointUrl;
    }

    const frozenConfig = Object.freeze(rawEnv);

    window.APP_CONFIG = frozenConfig;
    window.__ENV = frozenConfig;

    await window.verifyDatabaseConnection({ timeoutMs: 8000, silent: false });

    window.dispatchEvent(new CustomEvent('appConfigLoaded', {
      detail: {
        supabaseUrl,
        supabaseSchema,
        gasUrl: gasEndpointUrl
      }
    }));

    return frozenConfig;
  } catch (err) {
    const isAbort = err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('abort'));
    const reason = isAbort
      ? 'Sambungan ke pelayan konfigurasi tamat masa (timeout).'
      : (err && err.message ? err.message : 'Gagal menyambung ke pangkalan data.');

    window.setDatabaseConnectionState(false, reason);
    throw new Error(reason);
  }
}

window.reloadAppConfig = function() {
  const promise = initializeAppConfig();
  window.appConfigReady = promise;
  window.ENV_READY = promise;
  return promise;
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const retryBtn = document.getElementById('btnRetryDbConnection');
    if (retryBtn && !retryBtn.dataset.bound) {
      retryBtn.dataset.bound = 'true';
      retryBtn.addEventListener('click', () => {
        window.retryDatabaseConnection();
      });
    }
    syncMaintenanceUIWithState();
  });
} else {
  const retryBtn = document.getElementById('btnRetryDbConnection');
  if (retryBtn && !retryBtn.dataset.bound) {
    retryBtn.dataset.bound = 'true';
    retryBtn.addEventListener('click', () => {
      window.retryDatabaseConnection();
    });
  }
  syncMaintenanceUIWithState();
}

window.addEventListener('offline', () => {
  window.setDatabaseConnectionState(false, 'Peranti terputus daripada sambungan internet.');
});

window.appConfigReady = initializeAppConfig();
window.ENV_READY = window.appConfigReady;