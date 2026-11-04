const DB_NAME = 'MemoAG_CacheDB';
const DB_VERSION = 1;
const STORES = ['memo_rekod', 'memo_pegawai', 'memo_admin'];

const CacheService = {
    db: null,

    init: function() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                resolve(this.db);
                return;
            }

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

            request.onerror = (event) => {
                console.error("[CacheService] Ralat inisialisasi IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    setAll: async function(storeName, dataArray) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            store.clear();

            dataArray.forEach(item => {
                store.put(item);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    getAll: async function(storeName, orderCol = 'id', ascending = true) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                let data = request.result || [];

                data.sort((a, b) => {
                    let valA = a[orderCol];
                    let valB = b[orderCol];

                    if (valA === null || valA === undefined) valA = '';
                    if (valB === null || valB === undefined) valB = '';

                    if (typeof valA === 'string') valA = valA.toLowerCase();
                    if (typeof valB === 'string') valB = valB.toLowerCase();

                    if (valA < valB) return ascending ? -1 : 1;
                    if (valA > valB) return ascending ? 1 : -1;
                    return 0;
                });

                resolve(data);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    },

    upsertRecord: async function(storeName, record) {
        if (!record || !record.id) return;
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.put(record);

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    deleteRecord: async function(storeName, id) {
        if (!id) return;
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.delete(id);

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    clearStore: async function(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.clear();

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    handleRealtimePayload: async function(storeName, payload) {
        if (!payload || !payload.eventType) return;

        const { eventType, new: newRecord, old: oldRecord } = payload;

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (newRecord && newRecord.id) {
                await this.upsertRecord(storeName, newRecord);
            }
        } else if (eventType === 'DELETE') {
            const targetId = (oldRecord && oldRecord.id) ? oldRecord.id : (payload.id || null);
            if (targetId) {
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
        } catch (cacheErr) {
            console.warn(`[CacheService] Gagal membaca cache bagi jadual ${tableName}:`, cacheErr);
        }

        try {
            const { data, error } = await window._supabase
                .from(tableName)
                .select('*')
                .order(orderCol, { ascending: ascending });

            if (error) throw error;

            const freshData = data || [];

            await this.setAll(tableName, freshData).catch(e =>
                console.warn(`[CacheService] Gagal menyegerak cache bagi jadual ${tableName}:`, e)
            );

            callback(freshData, false);

        } catch (networkErr) {
            console.error(`[CacheService] Ralat rangkaian Supabase bagi jadual ${tableName}:`, networkErr);
        }
    }
};

window.CacheService = CacheService;