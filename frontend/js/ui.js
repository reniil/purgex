/**
 * UI Controller - Handle DOM updates and user interactions
 */

import { storage } from './storage.js';
import { api } from './api.js';
import { search } from './search.js';

class UIController {
  constructor() {
    this.currentTokens = [];
    this.displayedCount = 0;
    this.pageSize = 50;
    this.currentSort = 'liquidity';
    this.filteredTokens = [];
    
    this.initEventListeners();
  }

  initEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', this.handleSearch.bind(this));
      searchInput.addEventListener('focus', this.handleSearchFocus.bind(this));
    }

    // Search suggestions
    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) {
      suggestions.addEventListener('click', (e) => {
        if (e.target.classList.contains('suggestion-item')) {
          const query = e.target.dataset.query;
          document.getElementById('searchInput').value = query;
          this.handleSearch({ target: { value: query } });
          suggestions.innerHTML = '';
        }
      });
    }

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      const suggestions = document.getElementById('searchSuggestions');
      if (suggestions && !e.target.closest('.search-container')) {
        suggestions.innerHTML = '';
      }
    });

    // Sort controls
    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        this.currentSort = e.target.value;
        this.applySortAndRender();
      });
    }

    // Filter buttons
    document.getElementById('trendingBtn')?.addEventListener('click', () => {
      this.showTrending();
    });
    document.getElementById('recentBtn')?.addEventListener('click', () => {
      this.showRecent();
    });

    // Load more
    document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
      this.renderMoreTokens();
    });

    // Modal close
    document.querySelector('.close-modal')?.addEventListener('click', () => {
      this.hideTokenModal();
    });

    // Modal backdrop click
    document.getElementById('tokenModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'tokenModal') {
        this.hideTokenModal();
      }
    });

    // Import button
    document.getElementById('importBtn')?.addEventListener('click', () => {
      this.handleImportToPurgeX();
    });

    // Refresh button
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      this.refreshData();
    });

    // Clear data button
    document.getElementById('clearDataBtn')?.addEventListener('click', () => {
      if (confirm('Clear all cached data? This will remove all stored tokens and history.')) {
        this.clearAllData();
      }
    });
  }

  async handleSearch(e) {
    const query = e.target.value.trim();
    const suggestions = document.getElementById('searchSuggestions');
    
    if (query.length === 0) {
      suggestions.innerHTML = '';
      return;
    }

    // Show suggestions
    const suggestionsList = await search.getSuggestions(query);
    if (suggestionsList.length > 0) {
      suggestions.innerHTML = suggestionsList
        .map(s => `<div class="suggestion-item" data-query="${s}">${s}</div>`)
        .join('');
    } else {
      suggestions.innerHTML = '';
    }

    // Perform search if query is long enough
    if (query.length >= 2) {
      const results = await search.search(query, 100);
      this.filteredTokens = results;
      this.displayedCount = 0;
      this.applySortAndRender();
    }
  }

  async handleSearchFocus() {
    // Show recent searches on focus if input is empty
    const query = document.getElementById('searchInput').value.trim();
    if (query.length === 0) {
      const recent = await storage.getRecentSearches(5);
      const suggestions = document.getElementById('searchSuggestions');
      if (recent.length > 0) {
        suggestions.innerHTML = recent
          .map(s => `<div class="suggestion-item" data-query="${s.query}">${s.query}</div>`)
          .join('');
      }
    }
  }

  applySortAndRender() {
    let tokens = this.filteredTokens.length > 0 ? this.filteredTokens : this.currentTokens;
    
    // Apply sort
    switch (this.currentSort) {
      case 'liquidity':
        tokens.sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0));
        break;
      case 'volume':
        tokens.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
        break;
      case 'name':
        tokens.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'recent':
        tokens.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
        break;
    }

    this.filteredTokens = tokens;
    this.displayedCount = 0;
    this.renderMoreTokens();
    this.updateTokenCount();
  }

  renderMoreTokens() {
    const container = document.getElementById('tokenList');
    const start = this.displayedCount;
    const end = Math.min(start + this.pageSize, this.filteredTokens.length);
    
    if (start >= end) return;

    // Show loading if first page
    if (start === 0 && end > 0) {
      container.innerHTML = '';
    }

    // Render tokens
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const token = this.filteredTokens[i];
      const element = this.createTokenElement(token);
      fragment.appendChild(element);
    }
    container.appendChild(fragment);

    this.displayedCount = end;

    // Show/hide load more button
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (end < this.filteredTokens.length) {
      loadMoreContainer.style.display = 'block';
    } else {
      loadMoreContainer.style.display = 'none';
    }
  }

  createTokenElement(token) {
    const div = document.createElement('div');
    div.className = 'token-item';
    div.dataset.address = token.address;
    
    const formattedLiquidity = this.formatUSD(token.liquidity);
    const formattedVolume = this.formatUSD(token.volume24h);
    
    div.innerHTML = `
      <div class="token-info" style="flex: 1;">
        <div class="token-name-row">
          <strong>${this.escapeHtml(token.name)}</strong>
          <span class="token-symbol">${this.escapeHtml(token.symbol)}</span>
        </div>
        <div class="token-address" style="font-size: 0.8rem; color: var(--text-3); font-family: monospace;">
          ${this.truncateAddress(token.address)}
        </div>
        <div class="token-stats" style="display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.85rem;">
          <span>Price: <strong>$${token.price ? token.price.toFixed(8) : '0.00000000'}</strong></span>
          <span>Liq: <strong>${formattedLiquidity}</strong></span>
          <span>Vol: <strong>${formattedVolume}</strong></span>
        </div>
      </div>
      <div class="token-action">
        <button class="btn btn-primary btn-sm view-detail" data-address="${token.address}">
          View
        </button>
      </div>
    `;

    // Add click handler for view button
    div.querySelector('.view-detail')?.addEventListener('click', () => {
      this.showTokenModal(token);
    });

    return div;
  }

  async showTokenModal(token) {
    // Fetch fresh details
    const detailed = await api.fetchTokenDetails(token.address);
    const modal = document.getElementById('tokenModal');
    const content = document.getElementById('tokenDetailContent');
    
    content.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 1.5rem;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--bg-input); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
          ${detailed.symbol?.[0] || '?'}
        </div>
        <div style="flex: 1;">
          <h2 style="margin: 0 0 0.5rem 0;">${this.escapeHtml(detailed.name)}</h2>
          <div style="font-family: monospace; background: var(--bg-input); padding: 0.5rem; border-radius: 4px; font-size: 0.85rem;">
            ${detailed.address}
          </div>
        </div>
      </div>
      
      <div class="grid grid-3" style="gap: 1rem; margin-bottom: 1.5rem;">
        <div class="card">
          <div class="label">Price</div>
          <div class="value">$${detailed.price ? detailed.price.toFixed(8) : '0.00000000'}</div>
        </div>
        <div class="card">
          <div class="label">Liquidity</div>
          <div class="value">${this.formatUSD(detailed.liquidity)}</div>
        </div>
        <div class="card">
          <div class="label">24h Volume</div>
          <div class="value">${this.formatUSD(detailed.volume24h)}</div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div>
          <div class="label">Symbol</div>
          <div>${this.escapeHtml(detailed.symbol)}</div>
        </div>
        <div>
          <div class="label">Decimals</div>
          <div>${detailed.decimals}</div>
        </div>
        <div>
          <div class="label">Pair Address</div>
          <div style="font-family: monospace; font-size: 0.85rem;">
            ${detailed.pairAddress ? this.truncateAddress(detailed.pairAddress) : 'N/A'}
          </div>
        </div>
        <div>
          <div class="label">Last Updated</div>
          <div>${new Date(detailed.lastUpdated).toLocaleTimeString()}</div>
        </div>
      </div>
    `;

    // Set up action buttons
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
      importBtn.onclick = () => {
        this.handleImportToPurgeX(detailed);
      };
    }

    const viewOnDextools = document.getElementById('viewOnDextools');
    if (viewOnDextools && detailed.pairAddress) {
      viewOnDextools.href = `https://www.dextools.io/app/pulse/pair/${detailed.pairAddress}`;
    }

    modal.style.display = 'block';
  }

  hideTokenModal() {
    document.getElementById('tokenModal').style.display = 'none';
  }

  async handleImportToPurgeX(token) {
    // Save token to import history
    await storage.saveImport({
      tokenAddress: token.address,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      token Decimals: token.decimals
    });

    // Show success message
    alert(`Token ${token.symbol} marked for PurgeX sweep! You can now sweep it from the Sweep page.`);
    this.hideTokenModal();
  }

  async showTrending() {
    const tokens = await search.getTrendingTokens(500);
    this.filteredTokens = tokens;
    this.currentSort = 'liquidity';
    this.displayedCount = 0;
    this.applySortAndRender();
  }

  async showRecent() {
    const tokens = await search.getRecentTokens(500);
    this.filteredTokens = tokens;
    this.currentSort = 'recent';
    this.displayedCount = 0;
    this.applySortAndRender();
  }

  updateTokenCount() {
    const count = document.getElementById('tokenCount');
    if (count) {
      count.textContent = this.filteredTokens.length.toLocaleString();
    }
  }

  updateLastUpdated() {
    const el = document.getElementById('lastUpdated');
    if (el) {
      const last = this.filteredTokens.reduce((max, t) => 
        t.lastUpdated > max ? t.lastUpdated : max, 0
      );
      if (last > 0) {
        el.textContent = new Date(last).toLocaleTimeString();
      } else {
        el.textContent = 'Never';
      }
    }
  }

  updateStorageUsed() {
    // Estimate IndexedDB usage
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        const usedMB = estimate.usage / (1024 * 1024);
        const el = document.getElementById('storageUsed');
        if (el) {
          el.textContent = `${usedMB.toFixed(1)} MB`;
        }
      });
    }
  }

  async refreshData() {
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.textContent = 'Refreshing...';
    
    try {
      await api.refreshTokenList();
      await this.loadTokens();
      this.updateStorageUsed();
      
      // Show success notification
      this.showNotification('Data refreshed successfully!', 'success');
    } catch (error) {
      console.error('Refresh failed:', error);
      this.showNotification('Failed to refresh data', 'error');
    } finally {
      if (btn) btn.textContent = 'Refresh';
    }
  }

  async loadTokens() {
    try {
      const tokens = await storage.getAllTokens();
      this.currentTokens = tokens;
      this.filteredTokens = tokens;
      this.displayedCount = 0;
      this.renderMoreTokens();
      this.updateTokenCount();
      this.updateLastUpdated();
    } catch (error) {
      console.error('Failed to load tokens:', error);
      this.showNotification('Failed to load tokens', 'error');
    }
  }

  async clearAllData() {
    try {
      // Clear all object stores
      await storage.clearCache();
      // Re-initialize DB would need deletion - simple approach: reload
      this.currentTokens = [];
      this.filteredTokens = [];
      this.displayedCount = 0;
      this.showNotification('All data cleared', 'success');
      
      // Reload page after a moment
      setTimeout(() => location.reload(), 1000);
    } catch (error) {
      console.error('Clear failed:', error);
      this.showNotification('Failed to clear data', 'error');
    }
  }

  showNotification(message, type = 'info') {
    // Simple notification - in production use a proper library
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 1rem;
      right: 1rem;
      padding: 1rem;
      border-radius: 8px;
      background: ${type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--primary)'};
      color: white;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  formatUSD(value) {
    if (!value || value === 0) return '$0';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }

  truncateAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export singleton
export const ui = new UIController();

export default ui;
