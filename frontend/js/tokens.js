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
      batchSize: 20,
      batchDelay: 100,
      retryDelay: 1000,
      maxRetries: 2,
      dustThreshold: 0n,
      maxConcurrent: 3,
      alwaysCheck: [
        CONFIG?.CONTRACTS?.PRGX_TOKEN,
        CONFIG?.CONTRACTS?.WPLS
      ].filter(addr => addr && /^0x[a-fA-F0-9]{40}$/.test(addr)).map(addr => addr.toLowerCase())
    };
    
    this.activeRequests = 0;
    this.requestQueue = [];
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
      const cacheKey = `discovery-${address}`;
      const cached = this.getCached(cacheKey);
      if (cached) {
        this.discoveredTokens = new Map(cached);
        this.isDiscovering = false;
        this.updateDiscoveryStatus(`✅ Using cached: ${cached.size} tokens`, 100);
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
      
      // STEP 2: Load token database
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
    const cacheKey = 'token-db';
    const cached = this.getTokenDbCache(cacheKey);
    if (cached) return cached;
    
    console.log('[TokenDiscovery] Fetching token database...');
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
      this.setTokenDbCache(cacheKey, tokens, this.cacheTTL);
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
    
    if (statusEl) statusEl.textContent = message;
    if (progressBar) progressBar.style.width = `${progress}%`;
    
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
        <td>$${(balance * 0.0001).toFixed(6)}</td>
        <td>${(balance * 0.1).toFixed(2)} PRGX</td>
        <td style="font-size:0.8rem;font-family:monospace">${token.address.slice(0,8)}...${token.address.slice(-6)}</td>
      `;
      tbody.appendChild(row);
    }
    
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
    if (btn) {
      btn.disabled = selected === 0;
      btn.textContent = selected > 0 ? `🧹 Sweep ${selected} Tokens` : '🧹 Select Tokens';
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

  refreshTokens() {
    if (!window.wallet?.isConnected) return;
    this.clearCache();
    this.discoverTokens(window.wallet.address).then(() => {
      this.renderTokenTable(this.discoveredTokens);
    });
  }
}

// Global instance
window.tokenDiscovery = new TokenDiscovery();
