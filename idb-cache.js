const DB_NAME = 'erom_db';
const DB_VERSION = 2;
const STORE_NAME = 'cache_store';

let dbInstance = null;
let openPromise = null;

if (typeof window !== 'undefined' && !window.__memoryCache) {
  window.__memoryCache = new Map();
}

function isValidCacheRecord(item) {
  return Boolean(
    item &&
    typeof item === 'object' &&
    typeof item.cache_key === 'string' &&
    typeof item.timestamp === 'number' &&
    typeof item.ttl === 'number' &&
    Object.prototype.hasOwnProperty.call(item, 'data')
  );
}

function getMemoryEntry(key) {
  if (typeof window === 'undefined' || !window.__memoryCache || !window.__memoryCache.has(key)) {
    return null;
  }
  const item = window.__memoryCache.get(key);
  if (!isValidCacheRecord(item)) {
    window.__memoryCache.delete(key);
    return null;
  }
  const age = Date.now() - item.timestamp;
  return {
    data: item.data,
    isStale: age > (item.ttl || 0),
    timestamp: item.timestamp
  };
}

export function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (openPromise) {
    return openPromise;
  }

  openPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      openPromise = null;
      return resolve(null);
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        db.createObjectStore(STORE_NAME, { keyPath: 'cache_key' });
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
        };
        dbInstance.onclose = () => {
          dbInstance = null;
        };
        dbInstance.onerror = () => {
          dbInstance = null;
        };
        openPromise = null;
        resolve(dbInstance);
      };

      request.onerror = () => {
        openPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        openPromise = null;
        resolve(null);
      };
    } catch {
      openPromise = null;
      resolve(null);
    }
  });

  return openPromise;
}

export async function setCache(key, data, ttlSeconds = 300) {
  const timestamp = Date.now();
  const ttl = Math.max(0, Number(ttlSeconds) || 0) * 1000;
  const record = {
    cache_key: String(key),
    data: data,
    timestamp: timestamp,
    ttl: ttl
  };

  const db = await openDB();
  if (!db) {
    if (typeof window !== 'undefined' && window.__memoryCache) {
      window.__memoryCache.set(record.cache_key, record);
      return true;
    }
    return false;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => {
        if (typeof window !== 'undefined' && window.__memoryCache) {
          window.__memoryCache.delete(record.cache_key);
        }
        resolve(true);
      };
      req.onerror = () => {
        if (typeof window !== 'undefined' && window.__memoryCache) {
          window.__memoryCache.set(record.cache_key, record);
        }
        resolve(false);
      };
    } catch {
      dbInstance = null;
      if (typeof window !== 'undefined' && window.__memoryCache) {
        window.__memoryCache.set(record.cache_key, record);
      }
      resolve(false);
    }
  });
}

export async function getCacheEntry(key) {
  const normalizedKey = String(key);
  const db = await openDB();
  if (!db) {
    return getMemoryEntry(normalizedKey);
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(normalizedKey);

      req.onsuccess = () => {
        const item = req.result;
        if (!item) {
          return resolve(getMemoryEntry(normalizedKey));
        }

        if (!isValidCacheRecord(item)) {
          deleteCache(normalizedKey).catch(() => {});
          return resolve(null);
        }

        const age = Date.now() - item.timestamp;
        resolve({
          data: item.data,
          isStale: age > (item.ttl || 0),
          timestamp: item.timestamp
        });
      };

      req.onerror = () => {
        resolve(getMemoryEntry(normalizedKey));
      };
    } catch {
      dbInstance = null;
      resolve(getMemoryEntry(normalizedKey));
    }
  });
}

export async function getCache(key) {
  const entry = await getCacheEntry(key);
  if (!entry || entry.isStale) return null;
  return entry.data;
}

export async function deleteCache(key) {
  const normalizedKey = String(key);
  if (typeof window !== 'undefined' && window.__memoryCache) {
    window.__memoryCache.delete(normalizedKey);
  }

  const db = await openDB();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(normalizedKey);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      dbInstance = null;
      resolve(false);
    }
  });
}

export async function deleteCacheByPrefix(prefix) {
  const normalizedPrefix = String(prefix);
  let memoryDeleted = 0;

  if (typeof window !== 'undefined' && window.__memoryCache) {
    for (const k of window.__memoryCache.keys()) {
      if (typeof k === 'string' && k.startsWith(normalizedPrefix)) {
        window.__memoryCache.delete(k);
        memoryDeleted++;
      }
    }
  }

  const db = await openDB();
  if (!db) return memoryDeleted;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      let deletedCount = 0;

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(normalizedPrefix)) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount + memoryDeleted);
        }
      };

      req.onerror = () => resolve(memoryDeleted);
    } catch {
      dbInstance = null;
      resolve(memoryDeleted);
    }
  });
}

export async function clearExpiredCache() {
  const now = Date.now();
  let purgedMemory = 0;

  if (typeof window !== 'undefined' && window.__memoryCache) {
    for (const [k, v] of window.__memoryCache.entries()) {
      if (!isValidCacheRecord(v) || (v.ttl && now - v.timestamp > v.ttl)) {
        window.__memoryCache.delete(k);
        purgedMemory++;
      }
    }
  }

  const db = await openDB();
  if (!db) return purgedMemory;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      let purgedCount = 0;

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const item = cursor.value;
          if (!isValidCacheRecord(item) || (item.ttl && now - item.timestamp > item.ttl)) {
            cursor.delete();
            purgedCount++;
          }
          cursor.continue();
        } else {
          resolve(purgedCount + purgedMemory);
        }
      };

      req.onerror = () => resolve(purgedMemory);
    } catch {
      dbInstance = null;
      resolve(purgedMemory);
    }
  });
}

export async function clearAllCache() {
  if (typeof window !== 'undefined' && window.__memoryCache) {
    window.__memoryCache.clear();
  }

  const db = await openDB();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      dbInstance = null;
      resolve(false);
    }
  });
}