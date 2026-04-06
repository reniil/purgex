// ================================================================
// TOKEN DISCOVERY - CLEAN PRODUCTION VERSION
// ================================================================
// Based on proven patterns from DustSweeper, Rabby, and MetaMask
// Strategy: Known tokens + recent Transfer events + caching
// ================================================================

class TokenDiscovery {
  constructor() {
    this.discoveredTokens = new Map();
    this.isDiscovering = false;
    this.discoveryProgress = 0;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.stats = { rpcCalls: 0, cacheHits: 0, startTime: 0 };
    this.config = {
      // Transfer scan range (last N blocks)
      transferBlockRange: 2000,
      // Batch sizes
      batchSize: 20,
      // Delays
      batchDelay: 100,
      // Timeouts
      timeout: 10000,
      retryDelay: 1000,
      maxRetries: 2,
      // Circuit breaker
      circuitBreakerThreshold: 3,
      circuitBreakerPause: 2000,
      // Dust threshold (tokens with balance < this are ignored)
      dustThreshold: 1000n, // 1000 tokens (adjust as needed)
      // Concurrency
      maxConcurrent: 3
    };
    this.consecutiveErrors = 0;
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
      cachedEntries: this.cache.size
    };
  }

  clearCache() {
    this.cache.clear();
  }

  // ================================================================
  // MAIN DISCOVERY FLOW
  // ================================================================
  
  async discoverTokens(address) {
    this.isDiscovering = true;
    this.stats.startTime = Date.now();
    this.stats.rpcCalls = 0;
    this.stats.cacheHits = 0;
    
    this.updateDiscoveryStatus('Starting token discovery...', 0);
    console.log(`[TokenDiscovery] Starting discovery for ${address}`);
    
    try {
      const tokens = new Map();
      const cacheKey = `tokens-${address}`;
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        this.discoveredTokens = new Map(cached);
        this.isDiscovering = false;
        const duration = Date.now() - this.stats.startTime;
        this.updateDiscoveryStatus(`✅ Using cached results: ${cached.size} tokens`, 100);
        return this.discoveredTokens;
      }
      
      // Get provider
      const provider = window.wallet?.provider;
      if (!provider) throw new Error('Wallet provider not available');
      
      // PHASE 1: Check known PulseChain tokens
      this.updateDiscoveryStatus('Phase 1: Checking common tokens...', 20);
      const phase1Tokens = await this.phase1CheckKnownTokens(address, provider);
      for (const [tokenAddr, token] of phase1Tokens) {
        tokens.set(tokenAddr, token);
      }
      console.log(`[TokenDiscovery] Phase 1: ${phase1Tokens.size} tokens`);
      
      // PHASE 2: Scan recent Transfer events
      if (tokens.size < 5) {
        this.updateDiscoveryStatus('Phase 2: Scanning transfer events...', 50);
        const phase2Tokens = await this.phase2ScanTransfers(address, provider);
        for (const [tokenAddr, token] of phase2Tokens) {
          if (!tokens.has(tokenAddr)) {
            tokens.set(tokenAddr, token);
          }
        }
        console.log(`[TokenDiscovery] Phase 2: ${phase2Tokens.size} tokens (total: ${tokens.size})`);
      }
      
      // PHASE 3: PulseX LP tokens (if needed)
      if (tokens.size < 3) {
        this.updateDiscoveryStatus('Phase 3: Checking PulseX pools...', 80);
        const phase3Tokens = await this.phase3CheckPulseXLP(address, provider);
        for (const [tokenAddr, token] of phase3Tokens) {
          if (!tokens.has(tokenAddr)) {
            tokens.set(tokenAddr, token);
          }
        }
        console.log(`[TokenDiscovery] Phase 3: ${phase3Tokens.size} tokens (total: ${tokens.size})`);
      }
      
      // Fetch metadata for all discovered tokens
      this.updateDiscoveryStatus('Fetching token metadata...', 90);
      const tokensWithMetadata = await this.enrichTokensWithMetadata(tokens, provider);
      
      // Filter and sort
      const filtered = this.filterTokens(tokensWithMetadata);
      this.discoveredTokens = this.sortTokens(filtered);
      
      // Cache results
      this.setCached(cacheKey, this.discoveredTokens, this.cacheTTL);
      
      this.isDiscovering = false;
      const duration = Date.now() - this.stats.startTime;
      this.updateDiscoveryStatus(`✅ Discovery complete: ${this.discoveredTokens.size} tokens (${duration}ms)`, 100);
      console.log(`[TokenDiscovery] Complete: ${this.discoveredTokens.size} tokens, ${this.stats.rpcCalls} RPC calls, ${this.stats.cacheHits} cache hits`);
      
      return this.discoveredTokens;
      
    } catch (error) {
      this.isDiscovering = false;
      console.error('[TokenDiscovery] Discovery failed:', error);
      this.updateDiscoveryStatus(`❌ Discovery failed: ${error.message}`, 0);
      throw error;
    }
  }

  // ================================================================
  // PHASE 1: Known Tokens
  // ================================================================
  
  phase1CheckKnownTokens(address, provider) {
    const tokens = new Map();
    const knownTokens = this.getPulseChainTokenList();
    
    // Check PRGX first (most important)
    const prgxAddr = CONFIG.CONTRACTS?.PRGX_TOKEN?.toLowerCase();
    if (prgxAddr) {
      knownTokens.unshift(prgxAddr);
    }
    
    // Batch check balances
    return this.batchCheckTokens(knownTokens, address, provider);
  }

  getPulseChainTokenList() {
    // Common tokens on PulseChain - this list should be maintained
    // Sources: PulseChain official, PulseX, DeFi protocols
    return [
      // Native & wrapped
      // (we'll skip these in filtering)
      
      // Major DeFi tokens
      '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0', // PRGX (PurgeX)
      '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', // WPLS
      
      // TODO: Add more PulseChain tokens as they emerge
      // USDC, USDT, DAI equivalents on PulseChain
    ].filter(addr => addr && this.isValidAddress(addr));
  }

  // ================================================================
  // PHASE 2: Transfer Event Scan
  // ================================================================
  
  async phase2ScanTransfers(address, provider) {
    const tokens = new Map();
    try {
      const currentBlock = await this.retryable(() => provider.getBlockNumber(), provider);
      const fromBlock = Math.max(0, currentBlock - this.config.transferBlockRange);
      
      this.log('debug', `Scanning transfers from block ${fromBlock} to ${currentBlock}`);
      
      // Get Transfer events TO the user
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      
      const logsTo = await this.retryable(() => provider.getLogs({
        address: null,
        topics: [transferTopic, null, this.padAddress(address)],
        fromBlock: this.toHex(fromBlock),
        toBlock: this.toHex(currentBlock)
      }), provider);
      
      // Extract token addresses
      const tokenAddresses = new Set();
      for (const log of logsTo) {
        if (log.address) {
          tokenAddresses.add(log.address.toLowerCase());
        }
      }
      
      // Check balances for discovered tokens
      if (tokenAddresses.size > 0) {
        const balances = await this.batchCheckTokens(Array.from(tokenAddresses), address, provider);
        for (const [addr, token] of balances) {
          tokens.set(addr, token);
        }
      }
      
    } catch (error) {
      this.log('warn', 'Transfer scan failed:', error);
    }
    
    return tokens;
  }

  // ================================================================
  // PHASE 3: PulseX LP Tokens
  // ================================================================
  
  async phase3CheckPulseXLP(address, provider) {
    const tokens = new Map();
    
    try {
      // PulseX factory address
      const factory = CONFIG.APIS?.IPULSE_FACTORY || '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02';
      
      // Get a few known PulseX pairs that include major tokens
      const knownPairs = [
        // PRGX/WPLS pair
        // WPLS/USDC (if exists)
        // We'll use a simple approach: check if user has LP tokens from common pairs
      ];
      
      // For now, skip this phase - it's complex and LP tokens are rare
      // Can be added later if needed
      
    } catch (error) {
      this.log('warn', 'PulseX LP check failed:', error);
    }
    
    return tokens;
  }

  // ================================================================
  // BATCH OPERATIONS
  // ================================================================
  
  async batchCheckTokens(tokenAddresses, userAddress, provider) {
    const tokens = new Map();
    const uniqueAddresses = [...new Set(tokenAddresses.map(addr => addr.toLowerCase()))]
      .filter(addr => this.isValidAddress(addr))
      .filter(addr => !this.isExcludedToken(addr));
    
    // Process in batches with delays
    let batchSize = this.config.batchSize;
    
    for (let i = 0; i < uniqueAddresses.length; i += batchSize) {
      await this.processQueue(); // Respect rate limits
      
      const batch = uniqueAddresses.slice(i, i + batchSize);
      
      try {
        const batchResults = await Promise.all(
          batch.map(addr => this.checkTokenBalance(addr, userAddress, provider))
        );
        
        for (const result of batchResults) {
          if (result && result.balance > this.config.dustThreshold) {
            tokens.set(result.address, result);
          }
        }
        
        // Success - slightly increase batch size (with cap)
        batchSize = Math.min(50, batchSize + 2);
        
      } catch (error) {
        this.consecutiveErrors++;
        this.log('warn', `Batch failed, reducing batch size: ${error.message}`);
        batchSize = Math.max(5, Math.floor(batchSize * 0.5));
        
        if (this.consecutiveErrors >= this.config.circuitBreakerThreshold) {
          this.log('warn', `Circuit breaker triggered - pausing ${this.config.circuitBreakerPause}ms`);
          await this.delay(this.config.circuitBreakerPause);
          this.consecutiveErrors = 0;
        }
      }
      
      // Delay between batches to avoid rate limiting
      if (i + batchSize < uniqueAddresses.length) {
        await this.delay(this.config.batchDelay);
      }
    }
    
    return tokens;
  }

  async checkTokenBalance(tokenAddress, userAddress, provider) {
    try {
      const balance = await this.retryable(() => provider.getBalance({
        to: tokenAddress,
        from: userAddress,
        data: '0x70a08231' + this.padAddress(userAddress) // balanceOf(address)
      }), provider);
      
      if (balance && balance > this.config.dustThreshold) {
        return {
          address: tokenAddress,
          balance: balance,
          symbol: '???',
          name: 'Unknown Token',
          decimals: 18
        };
      }
    } catch (error) {
      // Silently ignore individual token failures
    }
    return null;
  }

  // ================================================================
  // METADATA ENRICHMENT
  // ================================================================
  
  async enrichTokensWithMetadata(tokensMap, provider) {
    const enriched = new Map();
    const tokenList = Array.from(tokensMap.values());
    
    // Batch fetch metadata
    const batchSize = 10;
    for (let i = 0; i < tokenList.length; i += batchSize) {
      await this.processQueue();
      
      const batch = tokenList.slice(i, i + batchSize);
      
      for (const token of batch) {
        try {
          const metadata = await this.fetchTokenMetadata(token.address, provider);
          enriched.set(token.address, {
            ...token,
            symbol: metadata.symbol || token.symbol,
            name: metadata.name || token.name,
            decimals: metadata.decimals || token.decimals
          });
        } catch (error) {
          enriched.set(token.address, token);
        }
        
        if (i + batchSize < tokenList.length) {
          await this.delay(50);
        }
      }
    }
    
    return enriched;
  }

  async fetchTokenMetadata(tokenAddress, provider) {
    const cacheKey = `metadata-${tokenAddress}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }
    
    try {
      const contract = new ethers.Contract(
        tokenAddress,
        ['function symbol() view returns (string)', 'function name() view returns (string)', 'function decimals() view returns (uint8)'],
        provider
      );
      
      const [symbol, name, decimals] = await Promise.allSettled([
        contract.symbol(),
        contract.name(),
        contract.decimals()
      ]);
      
      const metadata = {
        symbol: symbol.status === 'fulfilled' ? symbol.value : '???',
        name: name.status === 'fulfilled' ? name.value : 'Unknown Token',
        decimals: decimals.status === 'fulfilled' ? Number(decimals.value) : 18
      };
      
      this.setCached(cacheKey, metadata, 30 * 60 * 1000); // 30 minutes
      return metadata;
      
    } catch (error) {
      this.log('warn', `Failed to fetch metadata for ${tokenAddress}:`, error);
      return { symbol: '???', name: 'Unknown Token', decimals: 18 };
    }
  }

  // ================================================================
  // FILTERING & SORTING
  // ================================================================
  
  filterTokens(tokensMap) {
    const filtered = new Map();
    
    for (const [addr, token] of tokensMap) {
      // Exclude native tokens
      if (this.isExcludedToken(addr)) continue;
      
      // Skip tokens with no meaningful info unless they have balance
      if (token.balance > 0n) {
        filtered.set(addr, token);
      }
    }
    
    return filtered;
  }

  sortTokens(tokensMap) {
    const sorted = new Map();
    const sortedEntries = Array.from(tokensMap.entries()).sort((a, b) => {
      // Sort by balance (desc)
      const balanceDiff = (b[1].balance > 0n ? 1 : 0) - (a[1].balance > 0n ? 1 : 0);
      if (balanceDiff !== 0) return balanceDiff;
      
      // Then by symbol
      return a[1].symbol.localeCompare(b[1].symbol);
    });
    
    for (const [addr, token] of sortedEntries) {
      sorted.set(addr, token);
    }
    
    return sorted;
  }

  // ================================================================
  // CACHING
  // ================================================================
  
  getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.value;
    }
    if (entry) this.cache.delete(key);
    return null;
  }

  setCached(key, value, ttl) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.cacheTTL
    });
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================
  
  updateDiscoveryStatus(message, progress) {
    this.discoveryProgress = progress;
    const statusEl = document.getElementById('discoveryStatus');
    const progressBar = document.getElementById('discoveryProgress');
    
    if (statusEl) statusEl.textContent = message;
    if (progressBar) progressBar.style.width = `${progress}%`;
    
    console.log(`[TokenDiscovery] ${progress}% - ${message}`);
  }

  log(level, ...args) {
    const prefix = `[TokenDiscovery:${level.toUpperCase()}]`;
    console[level](prefix, ...args);
  }

  isValidAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  isExcludedToken(addr) {
    const excluded = [
      CONFIG?.CONTRACTS?.PRGX_TOKEN?.toLowerCase(),
      CONFIG?.CONTRACTS?.WPLS?.toLowerCase(),
      '0x0000000000000000000000000000000000000000'
    ].filter(x => x);
    return excluded.includes(addr.toLowerCase());
  }

  padAddress(addr) {
    return ethers.zeroPadValue(addr.toLowerCase(), 32);
  }

  toHex(num) {
    return '0x' + num.toString(16);
  }

  async retryable(fn, context) {
    let lastError;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await this.processQueue();
        return await fn();
      } catch (error) {
        lastError = error;
        if (this.isRateLimitError(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt) * 2 + Math.random() * 1000;
          this.log('warn', `Rate limited, retrying in ${Math.round(delay)}ms`);
          await this.delay(delay);
        } else if (attempt < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 500);
        }
      }
    }
    throw lastError;
  }

  isRateLimitError(error) {
    const msg = (error.message || '').toLowerCase();
    return msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429') || msg.includes('too many errors');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ================================================================
  // REQUEST QUEUE
  // ================================================================
  
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
  // UI INTEGRATION METHODS (required by app.js)
  // ================================================================
  
  renderTokenTable(tokens) {
    const tokenTableBody = document.getElementById('tokenTableBody');
    if (!tokenTableBody) return;
    
    tokenTableBody.innerHTML = '';
    
    const sortedTokens = Array.from(tokens.values()).sort((a, b) => {
      if (b.balance > 0n && a.balance === 0n) return 1;
      if (a.balance > 0n && b.balance === 0n) return -1;
      return parseFloat(b.estimatedUSD || 0) - parseFloat(a.estimatedUSD || 0);
    });
    
    if (sortedTokens.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-3);">No tokens found in your wallet</td>`;
      tokenTableBody.appendChild(row);
      return;
    }
    
    for (const token of sortedTokens) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input type="checkbox" class="token-checkbox" data-token="${token.address}" ${token.balance > 0n ? '' : 'disabled'}></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="token-icon" style="width: 24px; height: 24px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;">${token.symbol.slice(0, 2)}</div>
            <div>
              <div style="font-weight: 500;">${token.symbol}</div>
              <div style="font-size: 0.8rem; color: var(--text-3);">${token.name}</div>
            </div>
          </div>
        </td>
        <td class="mono">${parseFloat(ethers.formatUnits(token.balance, token.decimals)).toFixed(4)}</td>
        <td>$${this.estimateUSD(token).toFixed(6)}</td>
        <td>${this.estimatePRGX(token).toFixed(2)} PRGX</td>
      `;
      tokenTableBody.appendChild(row);
    }
    
    // Add event listeners
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
    if (sweepBtn) {
      sweepBtn.disabled = selected === 0;
      sweepBtn.textContent = selected > 0 ? `🧹 Sweep ${selected} Tokens` : '🧹 Select Tokens to Sweep';
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
    if (!window.wallet?.isConnected) return;
    const address = window.wallet.address;
    if (address) {
      this.clearCache();
      this.discoverTokens(address).then(() => {
        this.renderTokenTable(this.discoveredTokens);
      }).catch(err => {
        console.error('Refresh failed:', err);
        window.wallet?.showToast?.('Failed to refresh tokens', 'error');
      });
    }
  }

  estimateUSD(token) {
    const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals));
    if (balance === 0) return 0;
    // Very conservative: $0.0001 per token for unknown tokens
    return balance * 0.0001;
  }

  estimatePRGX(token) {
    const usd = this.estimateUSD(token);
    return usd / 0.001; // Assuming PRGX ~ $0.001
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.tokenDiscovery = new TokenDiscovery();
