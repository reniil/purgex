// ================================================================
// TOKEN DISCOVERY - OPTIMIZED WITH BLOCKSCOUT
// ================================================================
// Strategy:
// 1. Load cached token list (or fetch from Blockscout /api/v2/tokens)
// 2. Use transfer events to identify tokens wallet has interacted with
// 3. Batch check balances via RPC for those tokens
// 4. Enrich metadata from Blockscout token details
// ================================================================

class TokenDiscovery {
  constructor() {
    this.discoveredTokens = new Map();
    this.isDiscovering = false;
    this.discoveryProgress = 0;
    this.cache = new Map();
    this.tokenCache = new Map(); // Token metadata cache
    this.cacheTTL = 60 * 60 * 1000; // 1 hour for token list
    this.metadataCacheTTL = 60 * 60 * 1000; // 1 hour for metadata
    this.stats = { rpcCalls: 0, apiCalls: 0, cacheHits: 0, errors: 0, startTime: 0 };
    this.discoveryErrors = [];
    
    this.config = {
      // Blockscout API
      blockscoutApi: CONFIG?.APIS?.BLOCKSCOUT_BASE || 'https://api.scan.pulsechain.com/api/v2',
      
      // Transfer scan to find relevant tokens
      transferBlockRange: 5000,
      
      // Batch settings
      batchSize: 20,
      maxBatchSize: 30,
      batchDelay: 100,
      
      // Retry
      retryDelay: 1000,
      maxRetries: 2,
      
      // Dust threshold
      dustThreshold: 0n,
      
      // Concurrency
      maxConcurrent: 3,
      
      // Known tokens to always check
      alwaysCheck: [
        CONFIG?.CONTRACTS?.PRGX_TOKEN,
        CONFIG?.CONTRACTS?.WPLS
      ].filter(addr => addr && /^0x/.test(addr)).map(addr => addr.toLowerCase())
    };
    
    this.activeRequests = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
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

  getErrors() {
    return this.discoveryErrors;
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
    
    this.updateDiscoveryStatus('Starting token discovery...', 0);
    console.log(`[TokenDiscovery] Starting discovery for ${address}`);
    
    try {
      const cacheKey = `discovery-${address}`;
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        this.discoveredTokens = new Map(cached);
        this.isDiscovering = false;
        const duration = Date.now() - this.stats.startTime;
        this.updateDiscoveryStatus(`✅ Using cached results: ${cached.size} tokens`, 100);
        return this.discoveredTokens;
      }
      
      // Step 1: Load token database (from cache or Blockscout)
      this.updateDiscoveryStatus('Loading token database...', 10);
      const tokenDatabase = await this.loadTokenDatabase();
      console.log(`[TokenDiscovery] Token database loaded: ${tokenDatabase.size} tokens`);
      
      // Step 2: Find tokens wallet has interacted with via transfers
      this.updateDiscoveryStatus('Scanning transfer events...', 30);
      const relevantTokenAddresses = await this.findRelevantTokens(address, tokenDatabase);
      console.log(`[TokenDiscovery] Found ${relevantTokenAddresses.size} relevant tokens from transfers`);
      
      // Step 3: Always include known tokens (PRGX, WPLS)
      for (const addr of this.config.alwaysCheck) {
        relevantTokenAddresses.add(addr);
      }
      
      // Step 4: Batch check balances
      this.updateDiscoveryStatus('Checking balances...', 60);
      const tokensWithBalances = await this.batchCheckBalances(Array.from(relevantTokenAddresses), address);
      console.log(`[TokenDiscovery] ${tokensWithBalances.size} tokens have balance > 0`);
      
      // Step 5: Enrich with full metadata from token database
      this.updateDiscoveryStatus('Enriching metadata...', 80);
      const enrichedTokens = await this.enrichWithMetadata(tokensWithBalances, tokenDatabase);
      
      // Step 6: Filter and sort
      const filtered = this.filterTokens(enrichedTokens);
      this.discoveredTokens = this.sortTokens(filtered);
      
      // Cache results
      this.setCached(cacheKey, this.discoveredTokens, this.cacheTTL);
      
      const duration = Date.now() - this.stats.startTime;
      this.updateDiscoveryStatus(`✅ Discovery complete: ${this.discoveredTokens.size} tokens (${Math.round(duration/1000)}s)`, 100);
      console.log(`[TokenDiscovery] Complete: ${this.discoveredTokens.size} tokens, ${this.stats.apiCalls} API calls, ${this.stats.rpcCalls} RPC calls`);
      
      this.isDiscovering = false;
      return this.discoveredTokens;
      
    } catch (error) {
      this.isDiscovering = false;
      this.stats.errors++;
      this.logError('Discovery failed', error);
      this.updateDiscoveryStatus(`❌ Discovery failed: ${error.message}`, 0);
      throw error;
    }
  }

  // ================================================================
  // STEP 1: Load Token Database (Blockscout)
  // ================================================================
  
  async loadTokenDatabase() {
    const cacheKey = 'token-database';
    
    // Check cache first
    const cached = this.getTokenDatabaseCached(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      console.log(`[TokenDiscovery] Using cached token database (${cached.size} tokens)`);
      return cached;
    }
    
    // Fetch from Blockscout
    console.log(`[TokenDiscovery] Fetching token database from Blockscout...`);
    const tokens = new Map();
    
    try {
      const allTokens = await this.fetchAllTokensFromBlockscout();
      
      for (const token of allTokens) {
        if (token.address && token.symbol) {
          tokens.set(token.address.toLowerCase(), {
            address: token.address.toLowerCase(),
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            type: token.type,
            total_supply: token.total_supply,
            holders: token.holders,
            icon_url: token.icon_url
          });
        }
      }
      
      console.log(`[TokenDiscovery] Fetched ${tokens.size} tokens from Blockscout`);
      
      // Cache the token database
      this.setTokenDatabaseCached(cacheKey, tokens, this.cacheTTL);
      
      return tokens;
      
    } catch (error) {
      this.logError('Token database fetch', error);
      console.warn('[TokenDiscovery] Falling back to empty token database');
      return new Map();
    }
  }

  async fetchAllTokensFromBlockscout() {
    const tokens = [];
    let nextParams = { page: 1, per_page: 100 };
    const maxPages = 100; // Safety limit
    
    while (nextParams && tokens.length < maxPages * 100) {
      try {
        const query = new URLSearchParams(nextParams).toString();
        const url = `${this.config.blockscoutApi}/tokens?${query}`;
        
        const data = await this.fetchBlockscout(url);
        this.stats.apiCalls++;
        
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          // Filter to ERC-20 tokens only (skip NFTs)
          const erc20 = data.items.filter(t => t.type === 'ERC-20');
          tokens.push(...erc20);
          console.log(`[TokenDiscovery] Fetched ${erc20.length} ERC-20 tokens (page ${nextParams.page}, total: ${tokens.length})`);
        }
        
        nextParams = data.next_page_params || null;
        
        // Rate limiting
        await this.delay(200);
        
      } catch (error) {
        this.logError('Blockscout pagination', error);
        break;
      }
    }
    
    return tokens;
  }

  async fetchBlockscout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
      
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  getTokenDatabaseCached(key) {
    const entry = this.tokenCache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      this.stats.cacheHits++;
      return entry.value;
    }
    if (entry) this.tokenCache.delete(key);
    return null;
  }

  setTokenDatabaseCached(key, value, ttl) {
    this.tokenCache.set(key, { value, timestamp: Date.now(), ttl: ttl || this.cacheTTL });
  }

  // ================================================================
  // STEP 2: Find Relevant Tokens via Transfer Events
  // ================================================================
  
  async findRelevantTokens(address, tokenDatabase) {
    const tokenAddresses = new Set();
    const provider = window.wallet?.provider;
    
    if (!provider) {
      throw new Error('Wallet provider not available');
    }
    
    try {
      const currentBlock = await this.retryable(() => provider.getBlockNumber(), provider);
      const fromBlock = Math.max(0, currentBlock - this.config.transferBlockRange);
      
      this.log('info', `Scanning transfers from block ${fromBlock} to ${currentBlock}`);
      
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const paddedTopic = this.padTopic(address);
      
      // Get transfers TO the user
      const logsTo = await this.retryable(() => provider.getLogs({
        address: null,
        topics: [transferTopic, null, paddedTopic],
        fromBlock: this.toHex(fromBlock),
        toBlock: this.toHex(currentBlock)
      }), provider);
      
      for (const log of logsTo) {
        if (log.address) {
          tokenAddresses.add(log.address.toLowerCase());
        }
      }
      
      this.log('info', `Found ${tokenAddresses.size} unique tokens from transfer events`);
      
      // If few tokens found, also scan FROM transfers
      if (tokenAddresses.size < 20) {
        const logsFrom = await this.retryable(() => provider.getLogs({
          address: null,
          topics: [transferTopic, paddedTopic, null],
          fromBlock: this.toHex(fromBlock),
          toBlock: this.toHex(currentBlock)
        }), provider);
        
        for (const log of logsFrom) {
          if (log.address) {
            tokenAddresses.add(log.address.toLowerCase());
          }
        }
        
        this.log('info', `Total unique tokens after FROM scan: ${tokenAddresses.size}`);
      }
      
    } catch (error) {
      this.logError('Transfer scan', error);
    }
    
    return tokenAddresses;
  }

  // ================================================================
  // STEP 3: Batch Check Balances
  // ================================================================
  
  async batchCheckBalances(tokenAddresses, userAddress) {
    const tokens = new Map();
    const provider = window.wallet?.provider;
    
    if (!provider) return tokens;
    
    const addresses = [...new Set(tokenAddresses)]
      .filter(addr => this.isValidAddress(addr));
    
    if (addresses.length === 0) return tokens;
    
    let batchSize = this.config.batchSize;
    let batchIndex = 0;
    
    while (batchIndex < addresses.length) {
      await this.processRequestQueue();
      
      const batch = addresses.slice(batchIndex, batchIndex + batchSize);
      
      try {
        const batchResults = await this.batchBalanceCalls(batch, userAddress, provider);
        
        let successCount = 0;
        for (const result of batchResults) {
          if (result && result.balance > this.config.dustThreshold) {
            tokens.set(result.address, result);
            successCount++;
          }
        }
        
        this.log('debug', `Batch ${Math.floor(batchIndex/batchSize)+1}: ${successCount}/${batch.length} with balance`);
        
        if (successCount > 0) {
          batchSize = Math.min(this.config.maxBatchSize, batchSize + 2);
        }
        
      } catch (error) {
        console.error('[TokenDiscovery] Batch error:', error.message);
        batchSize = Math.max(5, Math.floor(batchSize * 0.6));
      }
      
      batchIndex += batchSize;
      
      if (batchIndex < addresses.length) {
        await this.delay(this.config.batchDelay);
      }
    }
    
    return tokens;
  }

  async batchBalanceCalls(tokenAddresses, userAddress, provider) {
    const results = [];
    const userAddr = userAddress.toLowerCase();
    const chunkSize = this.config.maxConcurrent;
    
    for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
      const chunk = tokenAddresses.slice(i, i + chunkSize);
      
      const chunkPromises = chunk.map(async (tokenAddr) => {
        try {
          const balance = await this.retryable(() => provider.call({
            to: tokenAddr,
            data: '0x70a08231' + this.padAddress(userAddr)
          }), provider);
          
          this.stats.rpcCalls++;
          const balanceBigInt = BigInt(balance);
          
          if (balanceBigInt > this.config.dustThreshold) {
            return {
              address: tokenAddr,
              balance: balanceBigInt,
              symbol: '???',
              name: 'Unknown Token',
              decimals: 18
            };
          }
        } catch (error) {
          // Silent failure for individual tokens
        }
        return null;
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults.filter(r => r !== null));
      
      if (i + chunkSize < tokenAddresses.length) {
        await this.delay(this.config.batchDelay);
      }
    }
    
    return results.filter(r => r !== null);
  }

  // ================================================================
  // STEP 4: Enrich Metadata from Token Database
  // ================================================================
  
  async enrichWithMetadata(tokensMap, tokenDatabase) {
    const enriched = new Map();
    
    for (const [addr, token] of tokensMap) {
      const dbToken = tokenDatabase.get(addr);
      
      if (dbToken) {
        enriched.set(addr, {
          ...token,
          symbol: dbToken.symbol || token.symbol,
          name: dbToken.name || token.name,
          decimals: dbToken.decimals || token.decimals
        });
      } else {
        // Try to fetch individual token metadata
        try {
          const metadata = await this.fetchTokenMetadataFromBlockscout(addr);
          enriched.set(addr, {
            ...token,
            symbol: metadata?.symbol || token.symbol,
            name: metadata?.name || token.name,
            decimals: metadata?.decimals || token.decimals
          });
        } catch (error) {
          enriched.set(addr, token);
        }
      }
    }
    
    return enriched;
  }

  async fetchTokenMetadataFromBlockscout(tokenAddress) {
    const cacheKey = `metadata-${tokenAddress}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.metadataCacheTTL) {
      this.stats.cacheHits++;
      return cached.value;
    }
    
    try {
      const url = `${this.config.blockscoutApi}/tokens/${tokenAddress}`;
      const data = await this.fetchBlockscout(url);
      this.stats.apiCalls++;
      
      const metadata = {
        symbol: data.symbol || null,
        name: data.name || null,
        decimals: data.decimals ? parseInt(data.decimals, 10) : null
      };
      
      this.tokenCache.set(cacheKey, { value: metadata, timestamp: Date.now() });
      return metadata;
      
    } catch (error) {
      this.log('warn', `Metadata fetch failed for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  // ================================================================
  // FILTERING & SORTING
  // ================================================================
  
  filterTokens(tokensMap) {
    const filtered = new Map();
    
    for (const [addr, token] of tokensMap) {
      if (this.isExcludedToken(addr)) continue;
      if (token.balance > 0n) {
        filtered.set(addr, token);
      }
    }
    
    return filtered;
  }

  sortTokens(tokensMap) {
    const sorted = new Map();
    const sortedEntries = Array.from(tokensMap.entries()).sort((a, b) => {
      if (b[1].balance > 0n && a[1].balance === 0n) return 1;
      if (a[1].balance > 0n && b[1].balance === 0n) return -1;
      return b[1].balance > a[1].balance ? 1 : -1;
    });
    
    for (const [addr, token] of sortedEntries) {
      sorted.set(addr, token);
    }
    
    return sorted;
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
    if (entry) this.cache.delete(key);
    return null;
  }

  setCached(key, value, ttl) {
    this.cache.set(key, { value, timestamp: Date.now(), ttl: ttl || this.cacheTTL });
  }

  updateDiscoveryStatus(message, progress) {
    this.discoveryProgress = progress;
    const statusEl = document.getElementById('discoveryStatus');
    const progressBar = document.getElementById('discoveryProgress');
    
    if (statusEl) statusEl.textContent = message;
    if (progressBar) progressBar.style.width = `${progress}%`;
    
    if (progress === 0 || progress === 100 || progress % 25 === 0) {
      console.log(`[TokenDiscovery] ${progress}% - ${message}`);
    }
  }

  logError(context, error) {
    this.stats.errors++;
    this.discoveryErrors.push({ phase: context, error, message: error.message, stack: error.stack });
    console.error(`[TokenDiscovery] ${context}:`, error.message);
  }

  async processRequestQueue() {
    const maxConcurrent = this.config.maxConcurrent;
    
    if (this.activeRequests >= maxConcurrent) {
      await this.delay(100);
      return this.processRequestQueue();
    }
    
    while (this.requestQueue.length > 0 && this.activeRequests < maxConcurrent) {
      const request = this.requestQueue.shift();
      if (request) {
        this.activeRequests++;
        (async () => {
          try {
            const result = await request.fn();
            request.resolve(result);
          } catch (error) {
            request.reject(error);
          } finally {
            this.activeRequests--;
          }
        })();
      }
    }
  }

  queueRequest(fn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ fn, resolve, reject });
      this.processRequestQueue();
    });
  }

  // ================================================================
  // HELPERS
  // ================================================================
  
  isValidAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  isExcludedToken(addr) {
    return false;
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

  async retryable(fn, context) {
    let lastError;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await this.processRequestQueue();
        return await fn();
      } catch (error) {
        lastError = error;
        if (this.isRateLimitError(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt) * 3 + Math.random() * 2000;
          this.log('warn', `Rate limited, retrying in ${Math.round(delay)}ms`);
          await this.delay(delay);
        } else if (this.isNonRetryable(error)) {
          throw error;
        } else if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 500;
          await this.delay(delay);
        }
      }
    }
    throw lastError;
  }

  isRateLimitError(error) {
    const msg = (error.message || '').toLowerCase();
    return msg.includes('rate limit') || msg.includes('too many requests') || 
           msg.includes('429') || msg.includes('exceeded');
  }

  isNonRetryable(error) {
    const nonRetryable = ['invalid argument', 'contract not found', 'missing revert data', 'invalid address'];
    const msg = (error.message || '').toLowerCase();
    return nonRetryable.some(err => msg.includes(err));
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ================================================================
  // UI METHODS
  // ================================================================
  
  renderTokenTable(tokens) {
    const tokenTableBody = document.getElementById('tokenTableBody');
    if (!tokenTableBody) return;
    
    tokenTableBody.innerHTML = '';
    
    const sortedTokens = Array.from(tokens.values()).sort((a, b) => {
      if (b.balance > 0n && a.balance === 0n) return 1;
      if (a.balance > 0n && b.balance === 0n) return -1;
      return b.balance > a.balance ? 1 : -1;
    });
    
    if (sortedTokens.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-3);">No tokens discovered</td>`;
      tokenTableBody.appendChild(row);
      return;
    }
    
    for (const token of sortedTokens) {
      const row = document.createElement('tr');
      const balanceFormatted = parseFloat(ethers.formatUnits(token.balance, token.decimals || 18));
      
      row.innerHTML = `
        <td><input type="checkbox" class="token-checkbox" data-token="${token.address}" ${token.balance > 0n ? '' : 'disabled'}></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="token-icon">${(token.symbol || '?').slice(0, 2).toUpperCase()}</div>
            <div>
              <div style="font-weight: 500;">${token.symbol || '???'}</div>
              <div style="font-size: 0.8rem; color: var(--text-3);">${token.name || 'Unknown Token'}</div>
            </div>
          </div>
        </td>
        <td class="mono">${balanceFormatted.toFixed(4)}</td>
        <td>$${this.estimateUSD(token).toFixed(6)}</td>
        <td>${this.estimatePRGX(token).toFixed(2)} PRGX</td>
        <td style="font-size: 0.8rem; color: var(--text-3); font-family: monospace;">${token.address.slice(0, 8)}...${token.address.slice(-6)}</td>
      `;
      tokenTableBody.appendChild(row);
    }
    
    tokenTableBody.querySelectorAll('.token-checkbox').forEach(cb => {
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
    const sweepBtn = document.getElementById('sweepBtn');
    const sweepSummary = document.getElementById('sweepSummary');
    
    if (sweepBtn) {
      sweepBtn.disabled = selected === 0;
      sweepBtn.textContent = selected > 0 ? `🧹 Sweep ${selected} Tokens` : '🧹 Select Tokens to Sweep';
    }
    
    if (sweepSummary) {
      const selectedCheckboxes = document.querySelectorAll('.token-checkbox:checked');
      let totalUSD = 0, totalPRGX = 0;
      
      selectedCheckboxes.forEach(cb => {
        const token = this.discoveredTokens.get(cb.dataset.token);
        if (token) {
          totalUSD += this.estimateUSD(token);
          totalPRGX += this.estimatePRGX(token);
        }
      });
      
      sweepSummary.innerHTML = `
        <div style="display: flex; gap: 1.5rem; justify-content: center; margin-top: 1rem;">
          <div>
            <span style="color: var(--text-3);">Estimated Value:</span>
            <span style="font-weight: 600; margin-left: 0.5rem;">$${totalUSD.toFixed(6)}</span>
          </div>
          <div>
            <span style="color: var(--text-3);">PRGX Rewards:</span>
            <span style="font-weight: 600; margin-left: 0.5rem;">${totalPRGX.toFixed(2)} PRGX</span>
          </div>
        </div>
      `;
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

  toggleToken(address) {
    const cb = document.querySelector(`.token-checkbox[data-token="${address}"]`);
    if (cb) {
      cb.checked = !cb.checked;
      this.updateSweepButton();
    }
  }

  refreshTokens() {
    if (!window.wallet?.isConnected) {
      window.wallet?.showToast?.('Connect wallet first', 'error');
      return;
    }
    const address = window.wallet.address;
    if (address) {
      this.clearCache();
      this.discoverTokens(address).then(() => {
        this.renderTokenTable(this.discoveredTokens);
        window.wallet?.showToast?.('Refreshed', 'success');
      }).catch(err => {
        window.wallet?.showToast?.(`Refresh failed: ${err.message}`, 'error');
      });
    }
  }

  estimateUSD(token) {
    const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals || 18));
    if (balance === 0) return 0;
    return balance * 0.0001;
  }

  estimatePRGX(token) {
    const usd = this.estimateUSD(token);
    return usd / 0.001;
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.tokenDiscovery = new TokenDiscovery();
