// ================================================================
// TOKEN DISCOVERY - PRODUCTION READY
// ================================================================
// Fixed: Proper method ordering, native PLS balance, WPLS support
// ================================================================

class TokenDiscovery {
  constructor() {
    this.discoveredTokens = new Map();
    this.isDiscovering = false;
    this.discoveryProgress = 0;
    this.cache = new Map();
    this.tokenCache = new Map();
    this.cacheTTL = 60 * 60 * 1000;
    this.stats = { rpcCalls: 0, apiCalls: 0, cacheHits: 0, errors: 0, startTime: 0 };
    this.discoveryErrors = [];
    
    this.config = {
      blockscoutApi: 'https://api.scan.pulsechain.com/api/v2',
      transferBlockRange: 5000,
      batchSize: 50, // Increased for faster balance checks
      batchDelay: 50, // Reduced delay
      retryDelay: 1000,
      maxRetries: 2,
      dustThreshold: 0n,
      maxConcurrent: 5,
      alwaysCheck: [
        CONFIG?.CONTRACTS?.PRGX_TOKEN,
        CONFIG?.CONTRACTS?.WPLS
      ].filter(addr => addr && /^0x[a-fA-F0-9]{40}$/.test(addr)).map(addr => addr.toLowerCase()),
      // Token database caching
      tokenDbCacheKey: 'purgex_token_db_v2',
      tokenDbCacheTTL: 24 * 60 * 60 * 1000, // 24 hours
      // Discovery cache
      discoveryCacheKey: (addr) => `purgex_discovery_${addr}`,
      discoveryCacheTTL: 10 * 60 * 1000, // 10 minutes
      // Metadata cache
      metadataCacheKey: (addr) => `purgex_meta_${addr}`,
      metadataCacheTTL: 1 * 60 * 60 * 1000, // 1 hour
      // Price cache (local memory only)
      priceCacheTTL: 10 * 60 * 1000 // 10 minutes
    };
    
    this.activeRequests = 0;
    this.requestQueue = [];
    
    // Load token database from localStorage on startup
    this.loadTokenDbFromStorage();
  }

  // ================================================================
  // UTILITY METHODS (defined first to avoid "not a function" errors)
  // ================================================================
  
  // ================================================================
  // LOCALSTORAGE PERSISTENCE
  // ================================================================
  
  loadTokenDbFromStorage() {
    try {
      const cached = localStorage.getItem(this.config.tokenDbCacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.timestamp && (Date.now() - data.timestamp < this.config.tokenDbCacheTTL)) {
          this.tokenCache.set(this.config.tokenDbCacheKey, {
            value: new Map(Object.entries(data.tokens)),
            timestamp: data.timestamp,
            ttl: this.config.tokenDbCacheTTL
          });
          console.log('[TokenDiscovery] Loaded token database from localStorage:', Object.keys(data.tokens).length, 'tokens');
        }
      }
    } catch (error) {
      console.warn('[TokenDiscovery] Failed to load token DB from storage:', error.message);
    }
  }

  saveTokenDbToStorage(tokenMap) {
    try {
      const data = {
        tokens: Object.fromEntries(tokenMap),
        timestamp: Date.now()
      };
      localStorage.setItem(this.config.tokenDbCacheKey, JSON.stringify(data));
      console.log('[TokenDiscovery] Saved token database to localStorage:', tokenMap.size, 'tokens');
    } catch (error) {
      console.warn('[TokenDiscovery] Failed to save token DB to storage:', error.message);
    }
  }

  loadDiscoveryFromStorage(walletAddress) {
    try {
      const cacheKey = this.config.discoveryCacheKey(walletAddress);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.timestamp && (Date.now() - data.timestamp < this.config.discoveryCacheTTL)) {
          const tokenMap = new Map(Object.entries(data.tokens));
          console.log('[TokenDiscovery] Loaded discovery from localStorage:', tokenMap.size, 'tokens');
          return tokenMap;
        }
      }
    } catch (error) {
      console.warn('[TokenDiscovery] Failed to load discovery from storage:', error.message);
    }
    return null;
  }

  saveDiscoveryToStorage(walletAddress, tokenMap) {
    try {
      const cacheKey = this.config.discoveryCacheKey(walletAddress);
      const data = {
        tokens: Object.fromEntries(tokenMap),
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(data));
      console.log('[TokenDiscovery] Saved discovery to localStorage:', tokenMap.size, 'tokens');
    } catch (error) {
      console.warn('[TokenDiscovery] Failed to save discovery to storage:', error.message);
    }
  }

  clearStaleDiscoveryCache(walletAddress) {
    try {
      const cacheKey = this.config.discoveryCacheKey(walletAddress);
      localStorage.removeItem(cacheKey);
      console.log('[TokenDiscovery] Cleared stale discovery cache');
    } catch (error) {
      console.warn('[TokenDiscovery] Failed to clear cache:', error.message);
    }
  }

  // ================================================================
  // UTILITY METHODS (defined first to avoid "not a function" errors)
  // ================================================================
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(level, ...args) {
    const prefix = `[TokenDiscovery:${level.toUpperCase()}]`;
    if (level === 'error' || level === 'warn') {
      console[level](prefix, ...args);
    } else if (window.DEBUG_TOKEN_DISCOVERY) {
      console[level](prefix, ...args);
    }
  }

  logError(context, error) {
    this.stats.errors++;
    this.discoveryErrors.push({ phase: context, error: error.message });
    console.error(`[TokenDiscovery:ERROR] ${context}:`, error.message);
  }

  isValidAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  padAddress(addr) {
    const padded = ethers.zeroPadValue(addr.toLowerCase(), 32);
    return padded.startsWith('0x') ? padded.slice(2) : padded;
  }

  padTopic(addr) {
    const padded = ethers.zeroPadValue(addr.toLowerCase(), 32);
    return padded.startsWith('0x') ? padded : '0x' + padded;
  }

  toHex(num) {
    return '0x' + num.toString(16);
  }

  // ================================================================
  // PUBLIC API
  // ================================================================
  
  async getWalletTokens(address) {
    if (!address) throw new Error('Wallet address required');
    return await this.discoverTokens(address);
  }

  getDiscoveredTokens() {
    return this.discoveredTokens;
  }

  isCurrentlyDiscovering() {
    return this.isDiscovering;
  }

  getDiscoveryProgress() {
    return this.discoveryProgress;
  }

  getStats() {
    return {
      ...this.stats,
      durationMs: Date.now() - this.stats.startTime,
      tokenCacheSize: this.tokenCache.size,
      errors: this.discoveryErrors.length
    };
  }

  clearCache() {
    this.cache.clear();
    this.tokenCache.clear();
  }

  // ================================================================
  // MAIN DISCOVERY FLOW
  // ================================================================
  
  async discoverTokens(address) {
    this.isDiscovering = true;
    this.stats.startTime = Date.now();
    this.stats.rpcCalls = 0;
    this.stats.apiCalls = 0;
    this.stats.cacheHits = 0;
    this.stats.errors = 0;
    this.discoveryErrors = [];
    
    this.updateDiscoveryStatus('Starting discovery...', 0);
    
    try {
      // Check localStorage cache first (fastest)
      const cachedFromStorage = this.loadDiscoveryFromStorage(address);
      if (cachedFromStorage) {
        this.discoveredTokens = cachedFromStorage;
        this.isDiscovering = false;
        this.updateDiscoveryStatus(`✅ Loaded from cache: ${cachedFromStorage.size} tokens`, 100);
        return this.discoveredTokens;
      }
      
      // Check memory cache (second fastest)
      const cacheKey = this.config.discoveryCacheKey(address);
      const cachedFromMemory = this.getCached(cacheKey);
      if (cachedFromMemory) {
        this.discoveredTokens = new Map(cachedFromMemory);
        // Also save to localStorage for next time
        this.saveDiscoveryToStorage(address, this.discoveredTokens);
        this.isDiscovering = false;
        this.updateDiscoveryStatus(`✅ Loaded from memory: ${cachedFromMemory.size} tokens`, 100);
        return this.discoveredTokens;
      }
      
      const tokens = new Map();
      
      // STEP 1: Native PLS balance
      this.updateDiscoveryStatus('Checking native PLS...', 10);
      try {
        const plsBalance = await this.getNativePLS(address);
        if (plsBalance > 0n) {
          tokens.set('native', {
            address: 'native',
            balance: plsBalance,
            symbol: 'PLS',
            name: 'PulseChain Native',
            decimals: 18,
            isNative: true
          });
          console.log(`[TokenDiscovery] Native PLS: ${ethers.formatEther(plsBalance)}`);
        }
      } catch (e) {
        console.warn('[TokenDiscovery] PLS check failed:', e.message);
      }
      
      // STEP 2: Load token database (from localStorage or API)
      this.updateDiscoveryStatus('Loading token database...', 25);
      const tokenDatabase = await this.loadTokenDatabase();
      console.log(`[TokenDiscovery] Database: ${tokenDatabase.size} tokens`);
      
      // STEP 3: Find relevant tokens from transfers
      this.updateDiscoveryStatus('Finding relevant tokens...', 40);
      const relevantTokens = await this.findRelevantTokens(address, tokenDatabase);
      console.log(`[TokenDiscovery] Relevant from transfers: ${relevantTokens.size}`);
      
      // STEP 4: Always check known tokens (PRGX, WPLS)
      for (const addr of this.config.alwaysCheck) {
        relevantTokens.add(addr);
      }
      
      // STEP 5: Check balances
      this.updateDiscoveryStatus('Checking balances...', 65);
      const withBalances = await this.batchCheckBalances(Array.from(relevantTokens), address);
      console.log(`[TokenDiscovery] With balances: ${withBalances.size}`);
      
      // Merge native + ERC-20
      for (const [k, v] of withBalances) tokens.set(k, v);
      
      // STEP 6: Enrich metadata
      this.updateDiscoveryStatus('Enriching metadata...', 85);
      const enriched = await this.enrichWithMetadata(tokens, tokenDatabase);
      
      this.discoveredTokens = enriched;
      this.setCached(cacheKey, this.discoveredTokens, this.cacheTTL);
      // Save to localStorage for instant reload next time
      this.saveDiscoveryToStorage(address, this.discoveredTokens);
      
      const duration = Date.now() - this.stats.startTime;
      this.updateDiscoveryStatus(`✅ Found ${this.discoveredTokens.size} tokens (${Math.round(duration/1000)}s)`, 100);
      console.log(`[TokenDiscovery] Complete: ${this.discoveredTokens.size} tokens`);
      
      this.isDiscovering = false;
      return this.discoveredTokens;
      
    } catch (error) {
      this.isDiscovering = false;
      this.logError('Discovery', error);
      this.updateDiscoveryStatus(`❌ Failed: ${error.message}`, 0);
      throw error;
    }
  }

  // ================================================================
  // NATIVE PLS BALANCE
  // ================================================================
  
  async getNativePLS(address) {
    const provider = window.wallet?.provider;
    if (!provider) throw new Error('No provider');
    
    const balance = await provider.getBalance(address);
    this.stats.rpcCalls++;
    return balance;
  }

  // ================================================================
  // TOKEN DATABASE (Blockscout)
  // ================================================================
  
  async loadTokenDatabase() {
    // Try localStorage first (fastest)
    try {
      const stored = localStorage.getItem(this.config.tokenDbCacheKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.timestamp && (Date.now() - data.timestamp < this.config.tokenDbCacheTTL)) {
          console.log('[TokenDiscovery] Token DB from localStorage:', Object.keys(data.tokens).length, 'tokens');
          return new Map(Object.entries(data.tokens));
        }
      }
    } catch (error) {
      console.warn('[TokenDiscovery] localStorage read failed:', error.message);
    }
    
    // Try memory cache second
    const memCached = this.getTokenDbCache(this.config.tokenDbCacheKey);
    if (memCached) {
      console.log('[TokenDiscovery] Token DB from memory:', memCached.size, 'tokens');
      return memCached;
    }
    
    // Fetch from Blockscout API
    console.log('[TokenDiscovery] Fetching token database from Blockscout...');
    const tokens = new Map();
    
    try {
      const allTokens = await this.fetchAllTokensFromBlockscout();
      for (const t of allTokens) {
        if (t.address && t.symbol) {
          tokens.set(t.address.toLowerCase(), {
            address: t.address.toLowerCase(),
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals ? parseInt(t.decimals, 10) : 18,
            type: t.type,
            total_supply: t.total_supply,
            holders: t.holders
          });
        }
      }
      
      // Cache in both memory and localStorage
      this.setTokenDbCache(this.config.tokenDbCacheKey, tokens, this.cacheTTL);
      this.saveTokenDbToStorage(tokens);
      
      return tokens;
    } catch (error) {
      console.warn('[TokenDiscovery] Token DB fetch failed:', error.message);
      return new Map();
    }
  }

  async fetchAllTokensFromBlockscout() {
    const tokens = [];
    let nextParams = { page: 1, per_page: 100 };
    let pageCount = 0;
    const maxPages = 200; // Safety limit ~20K tokens
    
    while (nextParams && pageCount < maxPages) {
      try {
        const query = new URLSearchParams(nextParams).toString();
        const url = `${this.config.blockscoutApi}/tokens?${query}`;
        
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        this.stats.apiCalls++;
        
        if (data.items) {
          const erc20 = data.items.filter(t => t.type === 'ERC-20');
          tokens.push(...erc20);
          pageCount++;
          
          if (pageCount % 10 === 0) {
            console.log(`[TokenDiscovery] Fetched ${tokens.length} tokens...`);
          }
        }
        
        nextParams = data.next_page_params;
        await this.delay(200); // Rate limit
        
      } catch (error) {
        console.warn('[TokenDiscovery] Page fetch failed:', error.message);
        break;
      }
    }
    
    console.log(`[TokenDiscovery] Total tokens fetched: ${tokens.length}`);
    return tokens;
  }

  getTokenDbCache(key) {
    const entry = this.tokenCache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      this.stats.cacheHits++;
      return entry.value;
    }
    return null;
  }

  setTokenDbCache(key, value, ttl) {
    this.tokenCache.set(key, { value, timestamp: Date.now(), ttl });
  }

  // ================================================================
  // FIND RELEVANT TOKENS (Transfer Events)
  // ================================================================
  
  async findRelevantTokens(address, tokenDatabase) {
    const addresses = new Set();
    const provider = window.wallet?.provider;
    if (!provider) return addresses;
    
    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - this.config.transferBlockRange);
      
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const padded = this.padTopic(address);
      
      // Get transfers TO address
      const logsTo = await provider.getLogs({
        address: null,
        topics: [transferTopic, null, padded],
        fromBlock: this.toHex(fromBlock),
        toBlock: 'latest'
      });
      
      for (const log of logsTo) {
        if (log.address) addresses.add(log.address.toLowerCase());
      }
      
      // Get transfers FROM address (if few found)
      if (addresses.size < 20) {
        const logsFrom = await provider.getLogs({
          address: null,
          topics: [transferTopic, padded, null],
          fromBlock: this.toHex(fromBlock),
          toBlock: 'latest'
        });
        for (const log of logsFrom) {
          if (log.address) addresses.add(log.address.toLowerCase());
        }
      }
      
      this.stats.rpcCalls += 2;
      
    } catch (error) {
      console.warn('[TokenDiscovery] Transfer scan failed:', error.message);
    }
    
    return addresses;
  }

  // ================================================================
  // BATCH BALANCE CHECKING
  // ================================================================
  
  async batchCheckBalances(tokenAddresses, userAddress) {
    const tokens = new Map();
    const provider = window.wallet?.provider;
    if (!provider) return tokens;
    
    const addresses = [...new Set(tokenAddresses)].filter(addr => this.isValidAddress(addr));
    
    for (let i = 0; i < addresses.length; i += this.config.batchSize) {
      const batch = addresses.slice(i, i + this.config.batchSize);
      
      try {
        const results = await Promise.all(
          batch.map(async addr => {
            try {
              const balance = await provider.call({
                to: addr,
                data: '0x70a08231' + this.padAddress(userAddress)
              });
              this.stats.rpcCalls++;
              
              const bal = BigInt(balance);
              if (bal > this.config.dustThreshold) {
                return { address: addr, balance: bal };
              }
            } catch (e) {
              // Skip failed tokens
            }
            return null;
          })
        );
        
        for (const r of results) {
          if (r) tokens.set(r.address, r);
        }
        
      } catch (error) {
        console.warn('[TokenDiscovery] Batch error:', error.message);
      }
      
      await this.delay(this.config.batchDelay);
    }
    
    return tokens;
  }

  // ================================================================
  // ENRICH WITH METADATA
  // ================================================================
  
  async enrichWithMetadata(tokensMap, tokenDatabase) {
    const enriched = new Map();
    
    for (const [addr, token] of tokensMap) {
      // Skip native (already has metadata)
      if (addr === 'native') {
        enriched.set(addr, token);
        continue;
      }
      
      const dbToken = tokenDatabase.get(addr);
      if (dbToken) {
        enriched.set(addr, {
          ...token,
          symbol: dbToken.symbol || token.symbol || '???',
          name: dbToken.name || token.name || 'Unknown',
          decimals: dbToken.decimals || token.decimals || 18
        });
      } else {
        // Fetch individual token metadata
        try {
          const meta = await this.fetchTokenMetadata(addr);
          enriched.set(addr, {
            ...token,
            symbol: meta?.symbol || '???',
            name: meta?.name || 'Unknown Token',
            decimals: meta?.decimals || 18
          });
        } catch (e) {
          enriched.set(addr, { ...token, symbol: '???', name: 'Unknown', decimals: 18 });
        }
      }
    }
    
    return enriched;
  }

  async fetchTokenMetadata(tokenAddress) {
    const cacheKey = `meta-${tokenAddress}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.metadataCacheTTL) {
      return cached.value;
    }
    
    try {
      const url = `${this.config.blockscoutApi}/tokens/${tokenAddress}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      
      const data = await response.json();
      this.stats.apiCalls++;
      
      const meta = {
        symbol: data.symbol,
        name: data.name,
        decimals: data.decimals ? parseInt(data.decimals, 10) : 18
      };
      
      this.tokenCache.set(cacheKey, { value: meta, timestamp: Date.now() });
      return meta;
    } catch (e) {
      return null;
    }
  }

  // ================================================================
  // CACHING & UTILITIES
  // ================================================================
  
  getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      this.stats.cacheHits++;
      return entry.value;
    }
    return null;
  }

  setCached(key, value, ttl) {
    this.cache.set(key, { value, timestamp: Date.now(), ttl });
  }

  updateDiscoveryStatus(message, progress) {
    this.discoveryProgress = progress;
    const statusEl = document.getElementById('discoveryStatus');
    const progressBar = document.getElementById('discoveryProgress');
    const cacheStatus = document.getElementById('cacheStatus');
    
    if (statusEl) statusEl.textContent = message;
    if (progressBar) progressBar.style.width = `${progress}%`;
    
    // Update cache status indicator
    if (cacheStatus) {
      if (progress === 100) {
        cacheStatus.innerHTML = `<span class="status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: var(--success-color, #00ff88);"></span><span>Cache ready</span>`;
      } else if (progress > 0) {
        cacheStatus.innerHTML = `<span class="status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: var(--warning-color, #ffaa00); animation: pulse 1s infinite;"></span><span>Scanning...</span>`;
      }
    }
    
    console.log(`[TokenDiscovery] ${progress}% - ${message}`);
  }

  // ================================================================
  // UI METHODS
  // ================================================================
  
  renderTokenTable(tokens) {
    const tbody = document.getElementById('tokenTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const sorted = Array.from(tokens.values()).sort((a, b) => {
      if (b.balance > a.balance) return 1;
      if (b.balance < a.balance) return -1;
      return 0;
    });
    
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-3)">No tokens found</td></tr>`;
      return;
    }
    
    for (const token of sorted) {
      const row = document.createElement('tr');
      const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals || 18));
      
      // Estimate values using cached prices if available
      const tokenPriceUSD = this.getCachedTokenPrice(token.symbol, token.address);
      const prgxPriceUSD = window.priceOracle?.prgxPriceUSD || 0.001;
      
      const usdValue = balance * tokenPriceUSD;
      const prgxValue = prgxPriceUSD > 0 ? usdValue / prgxPriceUSD : 0;
      
      row.innerHTML = `
        <td><input type="checkbox" class="token-checkbox" data-token="${token.address}" ${token.balance > 0n ? '' : 'disabled'}></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="token-icon">${(token.symbol || '?').slice(0,2).toUpperCase()}</div>
            <div>
              <div style="font-weight:500">${token.symbol || '???'}</div>
              <div style="font-size:0.8rem;color:var(--text-3)">${token.name || 'Unknown'}</div>
            </div>
          </div>
        </td>
        <td class="mono">${balance.toFixed(4)}</td>
        <td>$${usdValue.toFixed(6)}</td>
        <td>${prgxValue.toFixed(4)} PRGX</td>
        <td style="font-size:0.8rem;font-family:monospace">${token.address.slice(0,8)}...${token.address.slice(-6)}</td>
      `;
      tbody.appendChild(row);
    }
    
    // Trigger async price fetch to update values in background
    this.refreshTokenPrices();
    
    tbody.querySelectorAll('.token-checkbox').forEach(cb => {
      cb.addEventListener('change', () => this.updateSweepButton());
    });
    
    this.updateSweepButton();
  }

  selectAll() {
    document.querySelectorAll('.token-checkbox:not(:disabled)').forEach(cb => cb.checked = true);
    this.updateSweepButton();
  }

  deselectAll() {
    document.querySelectorAll('.token-checkbox').forEach(cb => cb.checked = false);
    this.updateSweepButton();
  }

  updateSweepButton() {
    const selected = document.querySelectorAll('.token-checkbox:checked').length;
    const btn = document.getElementById('sweepBtn');
    const purgeBtn = document.getElementById('purgeBtn');
    
    // Update sweep button
    if (btn) {
      btn.disabled = selected === 0;
      btn.textContent = selected > 0 ? `🧹 Sweep ${selected} Tokens` : '🧹 Select Tokens';
    }
    
    // Update purge button
    if (purgeBtn) {
      purgeBtn.disabled = selected === 0;
      purgeBtn.textContent = selected > 0 ? `🔥 PURGE ${selected} TOKENS` : '🔥 PURGE SELECTED';
    }
    
    // Update summary (async but fire-and-forget)
    this.updateSweepSummary();
  }

  async updateSweepSummary() {
    const selectedCheckboxes = document.querySelectorAll('.token-checkbox:checked');
    let totalTokens = 0;
    let totalPRGX = 0;
    let totalUSD = 0;
    
    // Get PRGX price from price oracle (fallback to $0.001 if not available)
    const prgxPriceUSD = window.priceOracle?.prgxPriceUSD || 0.001;
    
    // Process each selected token (may need async price fetch)
    for (const cb of selectedCheckboxes) {
      const token = this.discoveredTokens.get(cb.dataset.token);
      if (token && token.balance > 0n) {
        totalTokens++;
        
        // Get token balance in human-readable format
        const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals || 18));
        
        // Get token's actual USD price (async with cache)
        const tokenPriceUSD = await this.getTokenPriceUSD(token.symbol, token.address);
        
        // Calculate actual USD value
        const usdValue = balance * tokenPriceUSD;
        
        // Convert USD to PRGX (how much PRGX you get for this USD value)
        // Formula: PRGX = USD Value / PRGX Price
        const prgxValue = prgxPriceUSD > 0 ? usdValue / prgxPriceUSD : 0;
        
        totalPRGX += prgxValue;
        totalUSD += usdValue;
        
        // Debug log
        console.log(`[TokenDiscovery] ${token.symbol}: ${balance} × $${tokenPriceUSD} = $${usdValue.toFixed(6)} → ${prgxValue.toFixed(4)} PRGX`);
      }
    }
    
    // Update UI elements
    const selectedCountEl = document.getElementById('selectedCount');
    const estimatedPRGXEl = document.getElementById('estimatedPRGX');
    const estimatedUSDE = document.getElementById('estimatedUSD');
    
    if (selectedCountEl) selectedCountEl.textContent = totalTokens;
    if (estimatedPRGXEl) estimatedPRGXEl.textContent = totalPRGX.toFixed(4) + ' PRGX';
    if (estimatedUSDE) estimatedUSDE.textContent = '$' + totalUSD.toFixed(6);
  }

  // Get token price in USD with caching (async)
  async getTokenPriceUSD(symbol, address) {
    // Normalize address
    const normalizedAddr = address?.toLowerCase();
    
    // Check cache first (10 min TTL)
    if (normalizedAddr) {
      const cached = this.tokenCache.get(`price-${normalizedAddr}`);
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        return cached.value;
      }
    }
    
    // Known token prices (verified)
    const knownPrices = {
      'WBTC': 65000,
      'WETH': 3200,
      'USDC': 1.00,
      'USDT': 1.00,
      'DAI': 1.00,
      'PLS': 0.0001,
      'WPLS': 0.0001,
    };
    
    // Check known prices
    if (symbol && knownPrices[symbol.toUpperCase()]) {
      const price = knownPrices[symbol.toUpperCase()];
      if (normalizedAddr) {
        this.tokenCache.set(`price-${normalizedAddr}`, { value: price, timestamp: Date.now() });
      }
      return price;
    }
    
    // PRGX: get from price oracle (dynamic)
    if (symbol?.toUpperCase() === 'PRGX') {
      const prgxPrice = await this.getPRGXPrice();
      if (normalizedAddr) {
        this.tokenCache.set(`price-${normalizedAddr}`, { value: prgxPrice, timestamp: Date.now() });
      }
      return prgxPrice;
    }
    
    // Try price oracle for other tokens (DEXScreener)
    if (window.priceOracle && window.priceOracle.fetchTokenPrice) {
      try {
        const price = await window.priceOracle.fetchTokenPrice(normalizedAddr);
        if (price > 0) {
          if (normalizedAddr) {
            this.tokenCache.set(`price-${normalizedAddr}`, { value: price, timestamp: Date.now() });
          }
          return price;
        }
      } catch (error) {
        console.warn('Price oracle failed:', error.message);
      }
    }
    
    // Unknown token = $0 (safety - prevents over-rewarding)
    console.warn(`[TokenDiscovery] No price data for ${symbol}, assuming $0`);
    return 0;
  }
  
  // Get PRGX current price from oracle
  async getPRGXPrice() {
    if (window.priceOracle && window.priceOracle.prgxPriceUSD && window.priceOracle.prgxPriceUSD > 0) {
      return window.priceOracle.prgxPriceUSD;
    }
    // Fallback: fetch now
    try {
      await window.priceOracle?.fetchPRGXPrice();
      return window.priceOracle?.prgxPriceUSD || 0.001;
    } catch {
      return 0.001; // Last resort fallback
    }
  }

  // Get cached token price (sync) for table rendering
  getCachedTokenPrice(symbol, address) {
    const normalizedAddr = address?.toLowerCase();
    if (normalizedAddr) {
      const cached = this.tokenCache.get(`price-${normalizedAddr}`);
      if (cached) return cached.value;
    }
    
    // Known prices as fallback
    const knownPrices = {
      'WBTC': 65000,
      'WETH': 3200,
      'USDC': 1.00,
      'USDT': 1.00,
      'DAI': 1.00,
      'PLS': 0.0001,
      'WPLS': 0.0001,
      'PRGX': window.priceOracle?.prgxPriceUSD || 0.001,
    };
    
    if (symbol && knownPrices[symbol.toUpperCase()]) {
      return knownPrices[symbol.toUpperCase()];
    }
    
    return 0; // Unknown token = $0
  }

  // Async refresh all token prices (called after table render)
  async refreshTokenPrices() {
    const tokens = Array.from(this.discoveredTokens.values());
    
    // Fetch prices for all tokens that don't have cached prices yet
    for (const token of tokens) {
      const addr = token.address.toLowerCase();
      const cached = this.tokenCache.get(`price-${addr}`);
      if (!cached) {
        // Trigger async fetch without waiting
        this.getTokenPriceUSD(token.symbol, token.address).catch(() => {});
      }
    }
  }

  getSelectedTokens() {
    const selected = new Map();
    document.querySelectorAll('.token-checkbox:checked').forEach(cb => {
      const token = this.discoveredTokens.get(cb.dataset.token);
      if (token) selected.set(cb.dataset.token, token);
    });
    return selected;
  }

  // Property for sweeper compatibility
  get selectedTokens() {
    return this.getSelectedTokens();
  }

  refreshTokens() {
    if (!window.wallet?.isConnected) return;
    this.clearCache();
    this.discoverTokens(window.wallet.address).then(() => {
      this.renderTokenTable(this.discoveredTokens);
    });
  }

  async addCustomToken(tokenAddress) {
    if (!this.isValidAddress(tokenAddress)) {
      window.wallet?.showToast?.('Invalid token address', 'error');
      return;
    }
    
    const normalized = tokenAddress.toLowerCase();
    
    // Check if already discovered
    if (this.discoveredTokens.has(normalized)) {
      window.wallet?.showToast?.('Token already in list', 'info');
      return;
    }
    
    try {
      // Fetch metadata
      const meta = await this.fetchTokenMetadata(normalized);
      
      // Check balance
      const provider = window.wallet?.provider;
      if (provider) {
        const balance = await provider.call({
          to: normalized,
          data: '0x70a08231' + this.padAddress(window.wallet.address)
        });
        
        const bal = BigInt(balance);
        
        this.discoveredTokens.set(normalized, {
          address: normalized,
          balance: bal,
          symbol: meta?.symbol || '???',
          name: meta?.name || 'Unknown Token',
          decimals: meta?.decimals || 18
        });
        
        this.renderTokenTable(this.discoveredTokens);
        window.wallet?.showToast?.('Token added', 'success');
      }
    } catch (error) {
      console.error('Failed to add custom token:', error);
      window.wallet?.showToast?.('Failed to add token', 'error');
    }
  }
}

// Global instance
window.tokenDiscovery = new TokenDiscovery();
