/**
 * PurgeX DEX - Main Application
 * Client-side token indexer and DEX interface
 */

import { storage } from './storage.js';
import { api } from './api.js';
import { search } from './search.js';
import { ui } from './ui.js';

class App {
  constructor() {
    this.initialized = false;
    this.refreshInterval = null;
    this.REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  }

  async init() {
    console.log('🚀 Initializing PurgeX DEX...');

    try {
      // 1. Initialize IndexedDB
      await storage.init();
      console.log('✅ Storage initialized');

      // 2. Load initial token data
      const tokenCount = await this.loadOrFetchTokens();
      
      // 3. Initialize UI
      ui.loadTokens();
      ui.updateStorageUsed();
      
      // 4. Set up periodic refresh (every 5 minutes)
      this.startPeriodicRefresh();
      
      // 5. Register service worker (optional)
      this.registerServiceWorker();
      
      this.initialized = true;
      console.log(`✅ Ready! ${tokenCount} tokens indexed`);
      
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      ui.showNotification('Failed to initialize app. Please refresh.', 'error');
    }
  }

  async loadOrFetchTokens() {
    // Check if we already have tokens in storage
    const existingTokens = await storage.getAllTokens();
    
    if (existingTokens.length > 0) {
      console.log(`📦 Loaded ${existingTokens.length} tokens from local storage`);
      return existingTokens.length;
    }

    // No tokens yet, fetch from API
    console.log('📥 Fetching initial token list...');
    try {
      const tokens = await api.fetchTokenList();
      
      if (tokens.length === 0) {
        throw new Error('No tokens fetched from API');
      }
      
      // Save to IndexedDB
      await storage.saveTokensBatch(tokens);
      console.log(`✅ Saved ${tokens.length} tokens to local storage`);
      return tokens.length;
      
    } catch (error) {
      console.error('❌ Failed to fetch tokens:', error);
      ui.showNotification('Failed to load tokens. Using sample data.', 'error');
      
      // Load sample data as fallback
      await this.loadSampleData();
      return 0;
    }
  }

  async loadSampleData() {
    // Minimal sample data for demo purposes
    const sampleTokens = [
      {
        address: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0',
        name: 'PurgeX',
        symbol: 'PRGX',
        decimals: 18,
        price: 8.75e-8,
        volume24h: 0,
        liquidity: 44600000,
        lastUpdated: Date.now()
      }
    ];
    
    await storage.saveTokensBatch(sampleTokens);
  }

  startPeriodicRefresh() {
    // Refresh token list every 5 minutes
    this.refreshInterval = setInterval(async () => {
      try {
        const count = await api.refreshTokenList();
        console.log(`🔄 Background refresh: ${count} tokens updated`);
      } catch (error) {
        console.error('Background refresh failed:', error);
      }
    }, this.REFRESH_INTERVAL_MS);
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered');
      } catch (error) {
        console.log('ℹ️ Service Worker registration skipped:', error.message);
      }
    }
  }

  stopPeriodicRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
    // Make app globally accessible for debugging
    window.purgexApp = app;
  });
} else {
  const app = new App();
  app.init();
  window.purgexApp = app;
}

export default App;
