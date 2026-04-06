/**
 * Storage Layer - IndexedDB Wrapper
 * Pure client-side storage for token data, imports, search history
 */

const DB_NAME = 'purgex-indexer';
const DB_VERSION = 1;

// Database object store names
const STORES = {
  TOKENS: 'tokens',           // token metadata by address
  SEARCH_HISTORY: 'search-history',  // user search queries
  IMPORT_HISTORY: 'import-history',  // tokens user has swept
  PRICE_CACHE: 'price-cache', // cached prices (TTL enforced)
  SETTINGS: 'settings'        // user preferences
};

class Storage {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(STORES.TOKENS)) {
          const tokenStore = db.createObjectStore(STORES.TOKENS, { keyPath: 'address' });
          tokenStore.createIndex('symbol', 'symbol', { unique: false });
          tokenStore.createIndex('name', 'name', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.SEARCH_HISTORY)) {
          const searchStore = db.createObjectStore(STORES.SEARCH_HISTORY, { keyPath: 'query' });
          searchStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.IMPORT_HISTORY)) {
          db.createObjectStore(STORES.IMPORT_HISTORY, { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(STORES.PRICE_CACHE)) {
          const priceStore = db.createObjectStore(STORES.PRICE_CACHE, { keyPath: 'key' });
          priceStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }
      };
    });
  }

  // Token operations
  async saveToken(token) {
    const tx = this.db.transaction(STORES.TOKENS, 'readwrite');
    const store = tx.objectStore(STORES.TOKENS);
    token.lastUpdated = Date.now();
    return store.put(token);
  }

  async saveTokensBatch(tokens) {
    const tx = this.db.transaction(STORES.TOKENS, 'readwrite');
    const store = tx.objectStore(STORES.TOKENS);
    const now = Date.now();
    
    tokens.forEach(token => {
      token.lastUpdated = now;
      store.put(token);
    });
    
    return tx.complete;
  }

  async getToken(address) {
    const tx = this.db.transaction(STORES.TOKENS, 'readonly');
    const store = tx.objectStore(STORES.TOKENS);
    return new Promise((resolve) => {
      const request = store.get(address);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllTokens() {
    const tx = this.db.transaction(STORES.TOKENS, 'readonly');
    const store = tx.objectStore(STORES.TOKENS);
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async searchTokens(query) {
    const tokens = await this.getAllTokens();
    const lowerQuery = query.toLowerCase();
    return tokens.filter(t =>
      (t.name && t.name.toLowerCase().includes(lowerQuery)) ||
      (t.symbol && t.symbol.toLowerCase().includes(lowerQuery)) ||
      (t.address && t.address.toLowerCase().includes(lowerQuery))
    );
  }

  // Search history
  async saveSearchQuery(query) {
    const tx = this.db.transaction(STORES.SEARCH_HISTORY, 'readwrite');
    const store = tx.objectStore(STORES.SEARCH_HISTORY);
    const record = {
      query,
      timestamp: Date.now()
    };
    return store.put(record);
  }

  async getRecentSearches(limit = 10) {
    const tx = this.db.transaction(STORES.SEARCH_HISTORY, 'readonly');
    const store = tx.objectStore(STORES.SEARCH_HISTORY);
    const index = store.index('timestamp');
    return new Promise((resolve) => {
      const results = [];
      const request = index.openCursor(null, 'prev'); // newest first
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  }

  // Import history
  async saveImport(importData) {
    const tx = this.db.transaction(STORES.IMPORT_HISTORY, 'readwrite');
    const store = tx.objectStore(STORES.IMPORT_HISTORY);
    const record = {
      ...importData,
      timestamp: Date.now()
    };
    return store.add(record);
  }

  async getImportHistory(limit = 50) {
    const tx = this.db.transaction(STORES.IMPORT_HISTORY, 'readonly');
    const store = tx.objectStore(STORES.IMPORT_HISTORY);
    return new Promise((resolve) => {
      const results = [];
      const request = store.openCursor(null, 'prev'); // newest first
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  }

  // Price cache (with TTL)
  async cachePrice(key, priceData, ttlMs = 60000) {
    const tx = this.db.transaction(STORES.PRICE_CACHE, 'readwrite');
    const store = tx.objectStore(STORES.PRICE_CACHE);
    const record = {
      key,
      priceData,
      timestamp: Date.now(),
      expires: Date.now() + ttlMs
    };
    return store.put(record);
  }

  async getCachedPrice(key) {
    const tx = this.db.transaction(STORES.PRICE_CACHE, 'readonly');
    const store = tx.objectStore(STORES.PRICE_CACHE);
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result;
        if (record && record.expires > Date.now()) {
          resolve(record.priceData);
        } else {
          resolve(null); // expired or not found
        }
      };
    });
  }

  async clearCache() {
    const tx = this.db.transaction(STORES.PRICE_CACHE, 'readwrite');
    tx.objectStore(STORES.PRICE_CACHE).clear();
  }

  // Settings
  async getSetting(key) {
    const tx = this.db.transaction(STORES.SETTINGS, 'readonly');
    const store = tx.objectStore(STORES.SETTINGS);
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.value : null);
      };
    });
  }

  async setSetting(key, value) {
    const tx = this.db.transaction(STORES.SETTINGS, 'readwrite');
    const store = tx.objectStore(STORES.SETTINGS);
    return store.put({ key, value });
  }
}

// Export singleton instance
export const storage = new Storage();

export default storage;
