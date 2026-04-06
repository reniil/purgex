/**
 * Search Module - Token search functionality
 * Uses IndexedDB for fast local search with history
 */

import { storage } from './storage.js';
import { api } from './api.js';

class SearchService {
  constructor() {
    this.debounceTimer = null;
    this.debounceDelay = 300; // ms
  }

  /**
   * Search tokens with debouncing
   * @param {string} query - Search query
   * @param {number} limit - Max results to return
   * @returns {Promise<Array>} Matching tokens
   */
  async search(query, limit = 50) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Debounce local search
    return new Promise((resolve) => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        const results = await this.performSearch(query.trim(), limit);
        resolve(results);
      }, this.debounceDelay);
    });
  }

  /**
   * Perform actual search
   */
  async performSearch(query, limit) {
    try {
      // Get all tokens from IndexedDB
      const allTokens = await storage.getAllTokens();
      
      // Simple search - match on name, symbol, address
      const lowerQuery = query.toLowerCase();
      const results = allTokens.filter(token => {
        const nameMatch = token.name && token.name.toLowerCase().includes(lowerQuery);
        const symbolMatch = token.symbol && token.symbol.toLowerCase().includes(lowerQuery);
        const addressMatch = token.address && token.address.toLowerCase().includes(lowerQuery);
        return nameMatch || symbolMatch || addressMatch;
      });

      // Sort by relevance (exact symbol matches first)
      results.sort((a, b) => {
        const aExact = a.symbol.toLowerCase() === lowerQuery;
        const bExact = b.symbol.toLowerCase() === lowerQuery;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then by liquidity (most liquid first)
        return (b.liquidity || 0) - (a.liquidity || 0);
      });

      // Limit results
      return results.slice(0, limit);
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  /**
   * Get search suggestions (from history + popular tokens)
   */
  async getSuggestions(query) {
    const suggestions = new Set();
    
    // Add from search history
    const history = await storage.getRecentSearches(10);
    history.forEach(item => {
      if (item.query.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(item.query);
      }
    });

    // Add matching token symbols from database
    const tokens = await storage.searchTokens(query);
    tokens.slice(0, 10).forEach(token => {
      if (token.symbol) suggestions.add(token.symbol);
    });

    return Array.from(suggestions).slice(0, 8);
  }

  /**
   * Get trending/popular tokens (based on volume)
   */
  async getTrendingTokens(limit = 20) {
    const tokens = await storage.getAllTokens();
    return tokens
      .filter(t => t.volume24h > 0)
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
      .slice(0, limit);
  }

  /**
   * Get recently updated tokens (for discovery)
   */
  async getRecentTokens(limit = 20) {
    const tokens = await storage.getAllTokens();
    return tokens
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
      .slice(0, limit);
  }

  /**
   * Clear search history
   */
  async clearHistory() {
    // We need to delete all records from search-history store
    // This requires a different approach than the storage class
    const tx = storage.db.transaction('search-history', 'readwrite');
    tx.objectStore('search-history').clear();
    return tx.complete;
  }
}

// Export singleton
export const search = new SearchService();

export default search;
