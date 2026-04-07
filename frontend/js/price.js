// ================================================================
// PRICE ORACLE — Price fetching with 3 fallback sources
// ================================================================

class PriceOracle {
  constructor() {
    this.prgxPriceUSD = null;
    this.plsPriceUSD = null;
    this.lastFetch = null;
    this.intervalId = null;
    this.fetchPromise = null;
  }

  // ================================================================
  // FETCH PRGX PRICE — Multi-source approach
  // ================================================================
  async fetchPRGXPrice() {
    // Return existing promise if already fetching
    if (this.fetchPromise) {
      return this.fetchPromise;
    }
    
    this.fetchPromise = this._fetchPRGXPriceInternal();
    
    try {
      const price = await this.fetchPromise;
      this.prgxPriceUSD = price;
      this.lastFetch = new Date();
      this.updatePriceDisplays();
      return price;
    } catch (error) {
      console.error('PRGX price fetch failed:', error);
      throw error;
    } finally {
      this.fetchPromise = null;
    }
  }

  async _fetchPRGXPriceInternal() {
    // SOURCE 1: RouteScan API
    try {
      const price = await this.fetchFromRouteScan();
      if (price > 0) {
        console.log('PRGX price from RouteScan:', price);
        return price;
      }
    } catch (error) {
      console.warn('RouteScan price fetch failed:', error);
    }
    
    // SOURCE 2: DEXScreener API
    try {
      const price = await this.fetchFromDexScreener();
      if (price > 0) {
        console.log('PRGX price from DEXScreener:', price);
        return price;
      }
    } catch (error) {
      console.warn('DEXScreener price fetch failed:', error);
    }
    
    // SOURCE 3: Calculate from LP reserves
    try {
      const price = await this.calculateFromLP();
      if (price > 0) {
        console.log('PRGX price from LP calculation:', price);
        return price;
      }
    } catch (error) {
      console.warn('LP calculation failed:', error);
    }
    
    // All sources failed
    throw new Error('Unable to fetch PRGX price from any source');
  }

  // ================================================================
  // SOURCE 1: RouteScan API (CORS-friendly alternative)
  // ================================================================
  async fetchFromRouteScan() {
    const response = await fetch(
      `${CONFIG.APIS.PULSESCAN_BASE}?module=stats&action=tokenprice&contractaddress=${CONFIG.CONTRACTS.PRGX_TOKEN}`
    );
    
    if (!response.ok) {
      throw new Error('RouteScan API request failed');
    }
    
    const data = await response.json();
    
    if (data.status === '1' && data.result && data.result.usdPrice) {
      return parseFloat(data.result.usdPrice);
    }
    
    throw new Error('No price data in RouteScan response');
  }

  // ================================================================
  // SOURCE 2: DEXScreener API
  // ================================================================
  async fetchFromDexScreener() {
    const response = await fetch(
      `${CONFIG.APIS.DEXSCREENER_BASE}/${CONFIG.CONTRACTS.PRGX_TOKEN}`
    );
    
    if (!response.ok) {
      throw new Error('DEXScreener API request failed');
    }
    
    const data = await response.json();
    
    if (data.pairs && data.pairs.length > 0) {
      // Find the pair with WPLS (most liquid)
      const wplsPair = data.pairs.find(pair => 
        pair.baseToken.address.toLowerCase() === CONFIG.CONTRACTS.WPLS.toLowerCase() ||
        pair.quoteToken.address.toLowerCase() === CONFIG.CONTRACTS.WPLS.toLowerCase()
      );
      
      const targetPair = wplsPair || data.pairs[0];
      
      if (targetPair.priceUsd) {
        return parseFloat(targetPair.priceUsd);
      }
    }
    
    throw new Error('No price data in DEXScreener response');
  }

  // ================================================================
  // SOURCE 3: Calculate from LP reserves
  // ================================================================
  async calculateFromLP() {
    if (!window.wallet?.provider) {
      throw new Error('Wallet provider not available for LP calculation');
    }
    
    try {
      // Get PLS price first
      const plsPrice = await this.fetchPLSPrice();
      if (plsPrice === 0) {
        throw new Error('PLS price not available');
      }
      
      // Get LP contract
      const lpContract = new ethers.Contract(
        CONFIG.CONTRACTS.LP_TOKEN,
        CONFIG.ABIS.PAIR,
        window.wallet.provider
      );
      
      // Get pair info
      const [token0, token1] = await Promise.all([
        lpContract.token0(),
        lpContract.token1()
      ]);
      
      const [reserves] = await Promise.all([
        lpContract.getReserves()
      ]);
      
      // Determine which reserve is PRGX and which is WPLS
      let prgxReserve, wplsReserve;
      
      if (token0.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase()) {
        prgxReserve = reserves.reserve0;
        wplsReserve = reserves.reserve1;
      } else if (token1.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase()) {
        prgxReserve = reserves.reserve1;
        wplsReserve = reserves.reserve0;
      } else {
        throw new Error('PRGX not found in LP pair');
      }
      
      // Calculate PRGX price in PLS
      const prgxPriceInPLS = Number(ethers.formatUnits(wplsReserve, 18)) / 
                            Number(ethers.formatUnits(prgxReserve, 18));
      
      // Convert to USD
      const prgxPriceUSD = prgxPriceInPLS * plsPrice;
      
      return prgxPriceUSD;
    } catch (error) {
      console.error('LP calculation failed:', error);
      throw error;
    }
  }

  // ================================================================
  // FETCH PLS PRICE
  // ================================================================
  async fetchPLSPrice() {
    try {
      const response = await fetch(
        `${CONFIG.APIS.DEXSCREENER_BASE}/${CONFIG.CONTRACTS.WPLS}`
      );
      
      if (!response.ok) {
        throw new Error('WPLS price fetch failed');
      }
      
      const data = await response.json();
      
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        if (pair.priceUsd) {
          this.plsPriceUSD = parseFloat(pair.priceUsd);
          return this.plsPriceUSD;
        }
      }
      
      throw new Error('No WPLS price data found');
    } catch (error) {
      console.warn('WPLS price fetch failed:', error);
      return 0;
    }
  }

  // ================================================================
  // AUTO-REFRESH
  // ================================================================
  startAutoRefresh() {
    // Stop existing interval
    this.stopAutoRefresh();
    
    // Fetch immediately
    this.fetchPRGXPrice().catch(error => {
      console.warn('Initial price fetch failed:', error);
    });
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.fetchPRGXPrice().catch(error => {
        console.warn('Auto price refresh failed:', error);
      });
    }, CONFIG.PRICE_REFRESH_INTERVAL_MS);
  }

  stopAutoRefresh() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ================================================================
  // PRICE DISPLAY UPDATES
  // ================================================================
  updatePriceDisplays() {
    const displays = document.querySelectorAll('.prgx-price-display');
    displays.forEach(display => {
      if (this.prgxPriceUSD) {
        display.textContent = this.formatUSD(this.prgxPriceUSD);
        display.classList.remove('stale');
      } else {
        display.textContent = 'Price unavailable';
        display.classList.add('stale');
      }
    });
    
    // Update timestamp
    const timestamps = document.querySelectorAll('.price-timestamp');
    timestamps.forEach(timestamp => {
      if (this.lastFetch) {
        const ago = Math.floor((Date.now() - this.lastFetch.getTime()) / 1000);
        timestamp.textContent = `Updated ${ago}s ago`;
      } else {
        timestamp.textContent = 'Never updated';
      }
    });
  }

  // ================================================================
  // FORMATTERS
  // ================================================================
  formatUSD(amount) {
    if (!amount || amount === 0) return '$0.000000';
    
    return '$' + Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6
    });
  }

  formatPRGX(amount) {
    if (!amount || amount === 0) return '0 PRGX';
    
    return Number(amount).toLocaleString('en-US', {
      maximumFractionDigits: 2
    }) + ' PRGX';
  }

  // ================================================================
  // CONVERTERS
  // ================================================================
  prgxToUSD(prgxAmount) {
    if (!this.prgxPriceUSD) return 0;
    return prgxAmount * this.prgxPriceUSD;
  }

  usdToPRGX(usdAmount) {
    if (!this.prgxPriceUSD || this.prgxPriceUSD === 0) return 0;
    return usdAmount / this.prgxPriceUSD;
  }

  // ================================================================
  // GETTERS
  // ================================================================
  getPRGXPrice() {
    return this.prgxPriceUSD;
  }

  getPLSPrice() {
    return this.plsPriceUSD;
  }

  isPriceStale() {
    if (!this.lastFetch) return true;
    const staleThreshold = CONFIG.PRICE_REFRESH_INTERVAL_MS * 2; // 2x refresh interval
    return (Date.now() - this.lastFetch.getTime()) > staleThreshold;
  }

  // ================================================================
  // CLEANUP
  // ================================================================
  cleanup() {
    this.stopAutoRefresh();
    this.prgxPriceUSD = null;
    this.plsPriceUSD = null;
    this.lastFetch = null;
    this.fetchPromise = null;
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.priceOracle = new PriceOracle();
