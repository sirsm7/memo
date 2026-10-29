/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/cache-service.js
 * Tujuan: IndexedDB Cache Engine implementing Stale-While-Revalidate (SWR) pattern,
 *         granular record mutations, and realtime synchronization bridge.
 * ==============================================================================
 */

const DB_NAME = 'MemoAG_CacheDB';
const DB_VERSION = 1;
const STORES = ['memo_rekod', 'memo_pegawai', 'memo_admin'];

const CacheService = {
    db: null,

    /**
     * Inisialisasi pangkalan data IndexedDB dan cipta object store sekiranya belum wujud.
     */
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

    /**
     * Memasukkan atau mengemaskini keseluruhan senarai rekod ke dalam stor tertentu.
     * Mengosongkan stor sedia ada terlebih dahulu bagi memastikan integriti data tepat.
     */
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

    /**
     * Mengambil semua rekod dari stor dan melaksanakan susunan tempatan (in-memory sorting).
     */
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

    /**
     * Mengemaskini atau menyuntik rekod tunggal ke dalam IndexedDB secara granular tanpa memadam keseluruhan stor.
     */
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

    /**
     * Memadam rekod tunggal dari IndexedDB berasaskan ID primer.
     */
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

    /**
     * Mengosongkan keseluruhan stor data (digunakan untuk invalidasi penuh apabila perlu).
     */
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

    /**
     * Menangani mutasi perubahan data secara masa nyata (Realtime Payload Bridge).
     * Mengemaskini stor cache tempatan secara serta-merta tanpa perlu menarik semula (full fetch) semua rekod.
     */
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

    /**
     * Stale-While-Revalidate (SWR) Fetch Strategy.
     * 1. Mengembalikan data cache tempatan serta merta jika wujud.
     * 2. Menarik data terkini daripada Supabase di latar belakang secara senyap.
     * 3. Mengemaskini stor IndexedDB dan memanggil semula fungsi panggilan (callback) untuk data segar.
     *
     * @param {string} tableName - Nama jadual Supabase
     * @param {string} orderCol - Kolum susunan data
     * @param {boolean} ascending - Arah susunan (menaik/menurun)
     * @param {function} callback - Fungsi penerima (data, isCached)
     */
    fetchSWR: async function(tableName, orderCol, ascending, callback) {
        // Langkah 1: Hidangkan data cache sedia ada dengan serta-merta
        try {
            const cachedData = await this.getAll(tableName, orderCol, ascending);
            if (cachedData && cachedData.length > 0) {
                callback(cachedData, true);
            }
        } catch (cacheErr) {
            console.warn(`[CacheService] Gagal membaca cache bagi jadual ${tableName}:`, cacheErr);
        }

        // Langkah 2: Dapatkan data terkini dari pelayan Supabase di latar belakang
        try {
            const { data, error } = await window._supabase
                .from(tableName)
                .select('*')
                .order(orderCol, { ascending: ascending });

            if (error) throw error;

            const freshData = data || [];

            // Langkah 3: Kemaskini stor IndexedDB tempatan secara senyap
            await this.setAll(tableName, freshData).catch(e =>
                console.warn(`[CacheService] Gagal menyegerak cache bagi jadual ${tableName}:`, e)
            );

            // Langkah 4: Hidangkan data segar dari pelayan
            callback(freshData, false);

        } catch (networkErr) {
            console.error(`[CacheService] Ralat rangkaian Supabase bagi jadual ${tableName}:`, networkErr);
        }
    }
};

// Pendedahan kepada skop global
window.CacheService = CacheService;