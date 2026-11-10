const DB_NAME = 'MemoAG_CacheDB';
const DB_VERSION = 2;
const STORES = ['memo_rekod', 'memo_pegawai', 'memo_admin', 'cache_meta'];
const DEFAULT_TTL = 30 * 60 * 1000;

window.__memoryCache = window.__memoryCache || {
  memo_rekod: new Map(),
  memo_pegawai: new Map(),
  memo_admin: new Map(),
  cache_meta: new Map()
};

const sortRecords = (data, orderCol, ascending) => {
  return [...data].sort((a, b) => {
    let valA = a ? a[orderCol] : null;
    let valB = b ? b[orderCol] : null;

    if (valA === null || valA === undefined) valA = '';
    if (valB === null || valB === undefined) valB = '';

    if (typeof valA === 'number' && typeof valB === 'number') {
      return ascending ? valA - valB : valB - valA;
    }

    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();

    if (valA < valB) return ascending ? -1 : 1;
    if (valA > valB) return ascending ? 1 : -1;
    return 0;
  });
};

const CacheService = {
  db: null,
  isMemory: false,
  ttl: DEFAULT_TTL,

  init: function() {
    return new Promise((resolve) => {
      if (this.db) {
        resolve(this.db);
        return;
      }

      if (this.isMemory || typeof indexedDB === 'undefined') {
        this.isMemory = true;
        resolve(null);
        return;
      }

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          STORES.forEach(storeName => {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: 'id' });
            }
          });
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve(this.db);
        };

        request.onerror = () => {
          this.isMemory = true;
          resolve(null);
        };
      } catch (e) {
        this.isMemory = true;
        resolve(null);
      }
    });
  },

  setMeta: async function(storeName) {
    const meta = { id: storeName, updatedAt: Date.now() };
    if (this.isMemory || !this.db) {
      window.__memoryCache.cache_meta.set(storeName, meta);
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('cache_meta', 'readwrite');
        const store = tx.objectStore('cache_meta');
        store.put(meta);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        window.__memoryCache.cache_meta.set(storeName, meta);
        resolve();
      }
    });
  },

  getMeta: async function(storeName) {
    if (this.isMemory || !this.db) {
      return window.__memoryCache.cache_meta.get(storeName) || null;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('cache_meta', 'readonly');
        const store = tx.objectStore('cache_meta');
        const req = store.get(storeName);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(window.__memoryCache.cache_meta.get(storeName) || null);
      } catch (err) {
        resolve(window.__memoryCache.cache_meta.get(storeName) || null);
      }
    });
  },

  isExpired: async function(storeName, customTtl) {
    const meta = await this.getMeta(storeName);
    if (!meta || !meta.updatedAt) return true;
    const duration = customTtl !== undefined ? customTtl : this.ttl;
    return (Date.now() - meta.updatedAt) > duration;
  },

  setAll: async function(storeName, dataArray) {
    await this.init();
    const items = Array.isArray(dataArray) ? dataArray : [];

    if (this.isMemory || !this.db) {
      if (!window.__memoryCache[storeName]) {
        window.__memoryCache[storeName] = new Map();
      }
      window.__memoryCache[storeName].clear();
      items.forEach(item => {
        if (item && item.id !== undefined) {
          window.__memoryCache[storeName].set(item.id, item);
        }
      });
      await this.setMeta(storeName);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([storeName, 'cache_meta'], 'readwrite');
        const store = tx.objectStore(storeName);
        const metaStore = tx.objectStore('cache_meta');

        store.clear();
        items.forEach(item => {
          store.put(item);
        });
        metaStore.put({ id: storeName, updatedAt: Date.now() });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      } catch (err) {
        if (!window.__memoryCache[storeName]) {
          window.__memoryCache[storeName] = new Map();
        }
        window.__memoryCache[storeName].clear();
        items.forEach(item => {
          if (item && item.id !== undefined) {
            window.__memoryCache[storeName].set(item.id, item);
          }
        });
        this.setMeta(storeName).then(resolve);
      }
    });
  },

  getAll: async function(storeName, orderCol = 'id', ascending = true) {
    await this.init();

    if (this.isMemory || !this.db) {
      const memoryStore = window.__memoryCache[storeName] || new Map();
      const data = Array.from(memoryStore.values());
      return sortRecords(data, orderCol, ascending);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => {
          const data = req.result || [];
          resolve(sortRecords(data, orderCol, ascending));
        };

        req.onerror = (e) => reject(e.target.error);
      } catch (err) {
        const memoryStore = window.__memoryCache[storeName] || new Map();
        const data = Array.from(memoryStore.values());
        resolve(sortRecords(data, orderCol, ascending));
      }
    });
  },

  upsertRecord: async function(storeName, record) {
    if (!record || record.id === undefined) return;
    await this.init();

    if (this.isMemory || !this.db) {
      if (!window.__memoryCache[storeName]) {
        window.__memoryCache[storeName] = new Map();
      }
      window.__memoryCache[storeName].set(record.id, record);
      await this.setMeta(storeName);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([storeName, 'cache_meta'], 'readwrite');
        const store = tx.objectStore(storeName);
        const metaStore = tx.objectStore('cache_meta');

        store.put(record);
        metaStore.put({ id: storeName, updatedAt: Date.now() });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      } catch (err) {
        if (!window.__memoryCache[storeName]) {
          window.__memoryCache[storeName] = new Map();
        }
        window.__memoryCache[storeName].set(record.id, record);
        this.setMeta(storeName).then(resolve);
      }
    });
  },

  deleteRecord: async function(storeName, id) {
    if (id === undefined || id === null) return;
    await this.init();

    if (this.isMemory || !this.db) {
      if (window.__memoryCache[storeName]) {
        window.__memoryCache[storeName].delete(id);
      }
      await this.setMeta(storeName);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([storeName, 'cache_meta'], 'readwrite');
        const store = tx.objectStore(storeName);
        const metaStore = tx.objectStore('cache_meta');

        store.delete(id);
        metaStore.put({ id: storeName, updatedAt: Date.now() });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      } catch (err) {
        if (window.__memoryCache[storeName]) {
          window.__memoryCache[storeName].delete(id);
        }
        this.setMeta(storeName).then(resolve);
      }
    });
  },

  clearStore: async function(storeName) {
    await this.init();

    if (this.isMemory || !this.db) {
      if (window.__memoryCache[storeName]) {
        window.__memoryCache[storeName].clear();
      }
      if (window.__memoryCache.cache_meta) {
        window.__memoryCache.cache_meta.delete(storeName);
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([storeName, 'cache_meta'], 'readwrite');
        const store = tx.objectStore(storeName);
        const metaStore = tx.objectStore('cache_meta');

        store.clear();
        metaStore.delete(storeName);

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      } catch (err) {
        if (window.__memoryCache[storeName]) {
          window.__memoryCache[storeName].clear();
        }
        if (window.__memoryCache.cache_meta) {
          window.__memoryCache.cache_meta.delete(storeName);
        }
        resolve();
      }
    });
  },

  handleRealtimePayload: async function(storeName, payload) {
    if (!payload || !payload.eventType) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (newRecord && newRecord.id !== undefined) {
        await this.upsertRecord(storeName, newRecord);
      }
    } else if (eventType === 'DELETE') {
      const targetId = (oldRecord && oldRecord.id !== undefined) ? oldRecord.id : (payload.id || null);
      if (targetId !== null) {
        await this.deleteRecord(storeName, targetId);
      }
    }
  },

  fetchSWR: async function(tableName, orderCol, ascending, callback) {
    try {
      const cachedData = await this.getAll(tableName, orderCol, ascending);
      if (cachedData && cachedData.length > 0) {
        callback(cachedData, true);
      }
    } catch (cacheErr) {}

    try {
      if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
        await window.appConfigReady;
      }

      const client = window._supabase;
      if (!client || typeof client.from !== 'function') {
        throw new Error('Klien Supabase belum sedia.');
      }

      const { data, error } = await client
        .from(tableName)
        .select('*')
        .order(orderCol, { ascending: ascending });

      if (error) throw error;

      const freshData = data || [];

      await this.setAll(tableName, freshData).catch(() => {});

      callback(freshData, false);
    } catch (networkErr) {}
  }
};

window.CacheService = CacheService;