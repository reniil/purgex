/**
 * API Layer - Fetch token data from PulseChain sources
 * Uses multiple APIs with fallbacks and caching
 */

import { storage } from './storage.js';

// API endpoints
const APIS = {
  // DEXTools - most reliable, free
  DEXTOOLS_BASE: 'https://api.dexscreener.com/latest/dex/tokens',
  
  // PulseX router (for price quotes)
  PULSEX_ROUTER: '0x165C3410fC91EF562C50559f7d2289fEbed552d9',
  
  // WPLS address
  WPLS: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
  
  // PRGX token address
  PRGX: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0'
};

// Token metadata interface
class TokenMetadata {
  constructor(data) {
    this.address = data.address || data.tokenAddress || data.id;
    this.name = data.name || 'Unknown';
    this.symbol = data.symbol || 'UNKNOWN';
    this.decimals = data.decimals || 18;
    this.price = data.price || data.priceUsd || 0;
    this.volume24h = data.volume24h || data.volume?.usd || 0;
    this.liquidity = data.liquidity?.usd || data.liquidityUsd || 0;
    this.pairAddress = data.pairAddress || data.pair?.pairAddress || null;
    this.lastUpdated = Date.now();
  }
}

class ApiService {
  constructor() {
    this.priceCache = new Map(); // in-memory cache
    this.CACHE_TTL = 30000; // 30 seconds
  }

  /**
   * Fetch token list from DEXTools (pulsechain)
   * Returns array of token metadata
   */
  async fetchTokenList() {
    try {
      const response = await fetch(`${APIS.DEXTOOLS_BASE}/pulse`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      // Transform DEXTools format to our TokenMetadata
      const tokens = (data.pairs || []).map(pair => ({
        address: pair.pairAddress,
        name: pair.baseToken?.name || 'Unknown',
        symbol: pair.baseToken?.symbol || 'UNKNOWN',
        decimals: pair.baseToken?.decimals || 18,
        price: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
        volume24h: pair.volume24h ? parseFloat(pair.volume24h) : 0,
        liquidity: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : 0,
        pairAddress: pair.pairAddress,
        chainId: 'pulse'
      }));
      
      return tokens;
    } catch (error) {
      console.error('Failed to fetch token list:', error);
      return [];
    }
  }

  /**
   * Fetch detailed token info by address
   * Uses DEXTools pair endpoint for most accurate data
   */
  async fetchTokenDetails(tokenAddress) {
    // Check IndexedDB cache first
    const cached = await storage.getToken(tokenAddress);
    if (cached && (Date.now() - cached.lastUpdated) < 60000) {
      return cached;
    }

    try {
      // Search DEXTools for this token
      const response = await fetch(
        `${APIS.DEXTOOLS_BASE}/${tokenAddress}?chain=pulse`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
          const pair = data.pairs[0]; // Get first pair (most liquid)
          const token = new TokenMetadata({
            address: tokenAddress,
            name: pair.baseToken?.name,
            symbol: pair.baseToken?.symbol,
            decimals: pair.baseToken?.decimals,
            price: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
            volume24h: pair.volume24h ? parseFloat(pair.volume24h) : 0,
            liquidity: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : 0,
            pairAddress: pair.pairAddress
          });
          
          // Cache in IndexedDB
          await storage.saveToken(token);
          return token;
        }
      }
    } catch (error) {
      console.error('Failed to fetch token details:', error);
    }

    // Fallback: return minimal token from address
    return new TokenMetadata({ address: tokenAddress });
  }

  /**
   * Get price for token in terms of PRGX
   * Uses PulseX router if possible, falls back to USD price
   */
  async getTokenPriceInPRGX(tokenAddress, amount = 1e18) {
    const cacheKey = `price:${tokenAddress}:${amount}`;
    
    // Check in-memory cache
    const cached = this.priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.price;
    }

    try {
      // For now, use USD price and convert via PRGX price
      // In full implementation, would call PulseX router directly
      const token = await this.fetchTokenDetails(tokenAddress);
      const prgxDetails = await this.fetchTokenDetails(APIS.PRGX);
      
      if (token.price > 0 && prgxDetails.price > 0) {
        const priceInPRGX = token.price / prgxDetails.price;
        this.priceCache.set(cacheKey, {
          price: priceInPRGX,
          timestamp: Date.now()
        });
        return priceInPRGX;
      }
    } catch (error) {
      console.error('Failed to calculate PRGX price:', error);
    }

    return 0;
  }

  /**
   * Bulk fetch and cache token list
   * Call this periodically to refresh token database
   */
  async refreshTokenList() {
    console.log('Refreshing token list...');
    const tokens = await this.fetchTokenList();
    
    // Batch save to IndexedDB
    const batchSize = 100;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      await Promise.all(batch.map(token => storage.saveToken(token)));
    }
    
    console.log(`Refreshed ${tokens.length} tokens`);
    return tokens;
  }

  /**
   * Search tokens by query (uses IndexedDB for speed)
   */
  async searchTokens(query) {
    // Save search to history
    await storage.saveSearchQuery(query);
    
    // Search in IndexedDB
    const results = await storage.searchTokens(query);
    
    // Also fetch fresh data for top results
    const topResults = results.slice(0, 20);
    await Promise.all(
      topResults.map(token => this.fetchTokenDetails(token.address))
    );
    
    return results;
  }

  /**
   * Get recent token list (for suggestions)
   */
  async getRecentTokens(limit = 50) {
    const allTokens = await storage.getAllTokens();
    // Sort by lastUpdated descending
    return allTokens
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
      .slice(0, limit);
  }
}

// Export singleton
export const api = new ApiService();

export default api;
