/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/cache-service.js
 * Tujuan: IndexedDB Cache Engine implementing Stale-While-Revalidate (SWR) pattern.
 * ==============================================================================
 */

const DB_NAME = 'MemoAG_CacheDB';
const DB_VERSION = 1;
const STORES = ['memo_rekod', 'memo_pegawai', 'memo_admin'];

const CacheService = {
    db: null,

    /**
     * Initializes the IndexedDB database and creates object stores if they don't exist.
     */
    init: function() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                resolve();
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
                resolve();
            };

            request.onerror = (event) => {
                console.error("IndexedDB initialization error:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Bulk inserts or updates an array of records into a specific object store.
     * Clears the existing store first to ensure exact synchronization.
     */
    setAll: async function(storeName, dataArray) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            
            // Clear existing data
            store.clear();
            
            // Put new data
            dataArray.forEach(item => {
                store.put(item);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    /**
     * Retrieves all records from a specific object store and applies basic local sorting.
     */
    getAll: async function(storeName, orderCol = 'id', ascending = true) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                let data = request.result || [];
                
                // Perform local sorting to match expected Supabase order
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
     * Clears a specific object store (used for targeted invalidation).
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
     * Stale-While-Revalidate (SWR) Fetch Strategy.
     * 1. Yields locally cached data immediately if available.
     * 2. Fetches fresh data from Supabase in the background.
     * 3. Yields fresh data and updates the local cache.
     * 
     * @param {string} tableName - Supabase table name
     * @param {string} orderCol - Column to order by
     * @param {boolean} ascending - Order direction
     * @param {function} callback - Callback function (data, isCached)
     */
    fetchSWR: async function(tableName, orderCol, ascending, callback) {
        // Step 1: Attempt to serve from local cache immediately
        try {
            const cachedData = await this.getAll(tableName, orderCol, ascending);
            if (cachedData && cachedData.length > 0) {
                callback(cachedData, true); // true indicates this is stale/cached data
            }
        } catch (cacheErr) {
            console.warn(`[CacheService] Failed to read cache for ${tableName}:`, cacheErr);
        }

        // Step 2: Fetch fresh data from Supabase
        try {
            const { data, error } = await window._supabase
                .from(tableName)
                .select('*')
                .order(orderCol, { ascending: ascending });

            if (error) throw error;

            const freshData = data || [];

            // Step 3: Update local cache silently
            await this.setAll(tableName, freshData).catch(e => 
                console.warn(`[CacheService] Failed to update cache for ${tableName}:`, e)
            );

            // Step 4: Yield fresh data
            callback(freshData, false); // false indicates this is fresh server data

        } catch (networkErr) {
            console.error(`[CacheService] Supabase network error for ${tableName}:`, networkErr);
            // Optional: We do not call callback with error here because if cache succeeded, 
            // the user at least has stale data. We let the caller handle global error states if needed.
        }
    }
};

// Export to global scope
window.CacheService = CacheService;