// ================================================================
// TOKEN DISCOVERY - PRODUCTION V2 (Improved)
// ================================================================
// Based on proven patterns + real-world PulseChain testing
// ================================================================

class TokenDiscovery {
  constructor() {
    this.discoveredTokens = new Map();
    this.isDiscovering = false;
    this.discoveryProgress = 0;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.stats = { rpcCalls: 0, cacheHits: 0, errors: 0, startTime: 0 };
    this.discoveryErrors = [];
    
    this.config = {
      // Transfer scan range (last N blocks) - increased for better coverage
      transferBlockRange: 10000,
      // Known token list size to check
      knownTokenLimit: 50,
      // Batch sizes
      batchSize: 15,
      maxBatchSize: 25,
      // Delays
      batchDelay: 150,
      // Timeouts
      timeout: 15000,
      retryDelay: 1500,
      maxRetries: 3,
      // Circuit breaker
      circuitBreakerThreshold: 3,
      circuitBreakerPause: 3000,
      // Dust threshold - set to 0 to include ALL tokens (filter later by UI)
      dustThreshold: 0n,
      // Concurrency
      maxConcurrent: 2 // Conservative for PulseChain
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
      cachedEntries: this.cache.size,
      errors: this.discoveryErrors.length
    };
  }

  getErrors() {
    return this.discoveryErrors;
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
    this.stats.errors = 0;
    this.discoveryErrors = [];
    
    this.updateDiscoveryStatus('Starting token discovery...', 0);
    console.log(`[TokenDiscovery] Starting discovery for ${address}`);
    
    try {
      const tokens = new Map();
      const cacheKey = `tokens-${address}`;
      
      // Check cache first (shorter TTL for testing)
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
      if (!provider) throw new Error('Wallet provider not available. Connect your wallet first.');
      
      // PHASE 1: Check known PulseChain tokens (fast)
      this.updateDiscoveryStatus('Phase 1/3: Checking known tokens...', 10);
      try {
        const phase1Tokens = await this.phase1CheckKnownTokens(address, provider);
        for (const [tokenAddr, token] of phase1Tokens) {
          tokens.set(tokenAddr, token);
        }
        console.log(`[TokenDiscovery] Phase 1: ${phase1Tokens.size} tokens found`);
      } catch (error) {
        this.logError('Phase 1 failed', error);
      }
      
      // PHASE 2: Scan recent Transfer events (comprehensive)
      if (tokens.size < 10) {
        this.updateDiscoveryStatus('Phase 2/3: Scanning transfer events (this may take a minute)...', 40);
        try {
          const phase2Tokens = await this.phase2ScanTransfers(address, provider);
          for (const [tokenAddr, token] of phase2Tokens) {
            if (!tokens.has(tokenAddr)) {
              tokens.set(tokenAddr, token);
            }
          }
          console.log(`[TokenDiscovery] Phase 2: ${phase2Tokens.size} tokens found (total: ${tokens.size})`);
        } catch (error) {
          this.logError('Phase 2 failed', error);
        }
      }
      
      // PHASE 3: If still few tokens, try extended scan
      if (tokens.size < 3) {
        this.updateDiscoveryStatus('Phase 3/3: Extended scan (patience please)...', 70);
        try {
          const phase3Tokens = await this.phase3ExtendedScan(address, provider);
          for (const [tokenAddr, token] of phase3Tokens) {
            if (!tokens.has(tokenAddr)) {
              tokens.set(tokenAddr, token);
            }
          }
          console.log(`[TokenDiscovery] Phase 3: ${phase3Tokens.size} tokens found (total: ${tokens.size})`);
        } catch (error) {
          this.logError('Phase 3 failed', error);
        }
      }
      
      // If still no tokens, we might have a connection issue
      if (tokens.size === 0) {
        const errorMsg = 'No tokens discovered. This could mean:\n' +
          '1. Your wallet has no ERC-20 tokens on PulseChain\n' +
          '2. RPC connection issues (check console for errors)\n' +
          '3. All tokens are below the dust threshold\n' +
          '\nTry:\n' +
          '- Switching to a different RPC endpoint in your wallet\n' +
          '- Increasing the block scan range in config\n' +
          '- Manually adding token addresses';
        this.updateDiscoveryStatus(`⚠️ ${errorMsg}`, 100);
        this.discoveryErrors.push({ phase: 'all', error: new Error('No tokens found'), message: errorMsg });
      } else {
        // Fetch metadata for all discovered tokens
        this.updateDiscoveryStatus('Fetching token metadata...', 90);
        try {
          const tokensWithMetadata = await this.enrichTokensWithMetadata(tokens, provider);
          // Filter and sort
          const filtered = this.filterTokens(tokensWithMetadata);
          this.discoveredTokens = this.sortTokens(filtered);
          
          // Cache results
          this.setCached(cacheKey, this.discoveredTokens, this.cacheTTL);
          
          const duration = Date.now() - this.stats.startTime;
          this.updateDiscoveryStatus(`✅ Discovery complete: ${this.discoveredTokens.size} tokens found (${Math.round(duration/1000)}s)`, 100);
          console.log(`[TokenDiscovery] Complete: ${this.discoveredTokens.size} tokens, ${this.stats.rpcCalls} RPC calls, ${this.stats.cacheHits} cache hits`);
        } catch (error) {
          this.logError('Metadata enrichment failed', error);
          // Still return raw tokens without metadata
          this.discoveredTokens = this.sortTokens(tokens);
          const duration = Date.now() - this.stats.startTime;
          this.updateDiscoveryStatus(`⚠️ Partial: ${this.discoveredTokens.size} tokens (metadata fetch failed)`, 100);
        }
      }
      
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

  logError(context, error) {
    this.stats.errors++;
    this.discoveryErrors.push({ phase: context, error, message: error.message, stack: error.stack });
    console.error(`[TokenDiscovery] ${context}:`, error);
  }

  // ================================================================
  // PHASE 1: Known Tokens
  // ================================================================
  
  async phase1CheckKnownTokens(address, provider) {
    const tokens = new Map();
    const knownTokens = this.getPulseChainTokenList();
    
    console.log(`[TokenDiscovery:DEBUG] Phase 1: Known token list (${knownTokens.length}):`, knownTokens);
    
    if (knownTokens.length === 0) {
      console.warn('[TokenDiscovery] No known tokens configured - check CONFIG.CONTRACTS.PRGX_TOKEN and WPLS');
    }
    
    // Batch check balances
    return await this.batchCheckTokens(knownTokens, address, provider);
  }

  getPulseChainTokenList() {
    // Common tokens on PulseChain - expand this list
    const tokens = [
      // PurgeX token (from config)
      CONFIG?.CONTRACTS?.PRGX_TOKEN,
      // Wrapped PLS (from config)
      CONFIG?.CONTRACTS?.WPLS,
      // Known PulseChain tokens (add real addresses)
      // USDC, USDT, DAI equivalents when available
    ].filter(addr => addr && this.isValidAddress(addr));
    
    // Deduplicate and limit
    return [...new Set(tokens.map(a => a.toLowerCase()))].slice(0, this.config.knownTokenLimit);
  }

  isValidAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  async phase2ScanTransfers(address, provider) {
    const tokens = new Map();
    
    try {
      const currentBlock = await this.retryable(() => provider.getBlockNumber(), provider);
      const fromBlock = Math.max(0, currentBlock - this.config.transferBlockRange);
      
      this.log('info', `Scanning Transfer events from block ${fromBlock} to ${currentBlock} (${currentBlock - fromBlock} blocks)`);
      
      // Get Transfer events TO the user (tokens received)
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const paddedAddress = this.padAddress(address);
      
      const logsTo = await this.retryable(() => provider.getLogs({
        address: null,
        topics: [transferTopic, null, paddedAddress],
        fromBlock: this.toHex(fromBlock),
        toBlock: this.toHex(currentBlock)
      }), provider);
      
      this.log('debug', `Found ${logsTo.length} Transfer events TO address`);
      
      // Extract unique token addresses
      const tokenAddresses = new Set();
      for (const log of logsTo) {
        if (log.address) {
          tokenAddresses.add(log.address.toLowerCase());
        }
      }
      
      // Also check if we need to scan FROM events (tokens sent)
      // This helps discover tokens that were received long ago and then partially sent
      if (tokenAddresses.size < 20) {
        this.log('debug', 'Scanning FROM transfers for additional tokens...');
        const logsFrom = await this.retryable(() => provider.getLogs({
          address: null,
          topics: [transferTopic, paddedAddress, null],
          fromBlock: this.toHex(fromBlock),
          toBlock: this.toHex(currentBlock)
        }), provider);
        
        for (const log of logsFrom) {
          if (log.address) {
            tokenAddresses.add(log.address.toLowerCase());
          }
        }
        this.log('debug', `Total unique tokens from transfers: ${tokenAddresses.size}`);
      }
      
      // Check balances for discovered tokens
      if (tokenAddresses.size > 0) {
        const addressesArray = Array.from(tokenAddresses);
        this.log('debug', `Fetching balances for ${addressesArray.length} tokens`);
        const balances = await this.batchCheckTokens(addressesArray, address, provider);
        for (const [addr, token] of balances) {
          tokens.set(addr, token);
        }
      }
      
    } catch (error) {
      this.logError('Transfer event scan', error);
      throw error; // Re-throw so phase fails
    }
    
    return tokens;
  }

  // ================================================================
  // PHASE 3: Extended Scan (if needed)
  // ================================================================
  
  async phase3ExtendedScan(address, provider) {
    const tokens = new Map();
    
    try {
      // Try a much larger block range
      const originalRange = this.config.transferBlockRange;
      this.config.transferBlockRange = 50000; // 50k blocks
      
      try {
        const phase2Tokens = await this.phase2ScanTransfers(address, provider);
        for (const [addr, token] of phase2Tokens) {
          tokens.set(addr, token);
        }
      } finally {
        this.config.transferBlockRange = originalRange; // Restore
      }
      
    } catch (error) {
      this.logError('Extended scan', error);
    }
    
    return tokens;
  }

  // ================================================================
  // BATCH OPERATIONS
  // ================================================================
  
  async batchCheckTokens(tokenAddresses, userAddress, provider) {
    const tokens = new Map();
    const addresses = [...new Set(tokenAddresses.map(addr => addr.toLowerCase()))]
      .filter(addr => this.isValidAddress(addr))
      .filter(addr => !this.isExcludedToken(addr));
    
    if (addresses.length === 0) {
      console.warn('[TokenDiscovery] batchCheckTokens: No valid addresses after filtering');
      return tokens;
    }
    
    console.log(`[TokenDiscovery] batchCheckTokens: ${addresses.length} tokens to check`);
    
    // Process in batches with delays
    let batchSize = this.config.batchSize;
    let batchIndex = 0;
    let totalFound = 0;
    
    while (batchIndex < addresses.length) {
      await this.processRequestQueue();
      
      const batch = addresses.slice(batchIndex, batchIndex + batchSize);
      console.log(`[TokenDiscovery] Processing batch ${Math.floor(batchIndex/batchSize)+1}: ${batch.length} tokens (indices ${batchIndex}-${batchIndex+batchSize-1})`);
      
      try {
        // Use multicall-like pattern: batch eth_call requests
        const batchResults = await this.batchBalanceCalls(batch, userAddress, provider);
        
        let batchSuccessCount = 0;
        for (const result of batchResults) {
          if (result && result.balance > this.config.dustThreshold) {
            tokens.set(result.address, result);
            batchSuccessCount++;
            totalFound++;
          }
        }
        
        console.log(`[TokenDiscovery] Batch result: ${batchSuccessCount}/${batch.length} with balance (total found: ${totalFound})`);
        
        // Adaptive batch sizing
        if (batchSuccessCount > 0) {
          batchSize = Math.min(this.config.maxBatchSize, batchSize + 2);
        } else {
          // If no tokens found in batch, reduce size for next batch
          batchSize = Math.max(5, Math.floor(batchSize * 0.8));
        }
        this.consecutiveErrors = 0;
        
      } catch (error) {
        this.consecutiveErrors++;
        this.stats.errors++;
        console.error(`[TokenDiscovery] Batch ${Math.floor(batchIndex/batchSize)+1} failed:`, error.message);
        
        // Reduce batch size on failure
        batchSize = Math.max(5, Math.floor(batchSize * 0.6));
        
        // Circuit breaker
        if (this.consecutiveErrors >= this.config.circuitBreakerThreshold) {
          console.warn(`[TokenDiscovery] Circuit breaker - pausing ${this.config.circuitBreakerPause}ms`);
          await this.delay(this.config.circuitBreakerPause);
          this.consecutiveErrors = 0;
        }
      }
      
      batchIndex += batchSize;
      
      // Delay between batches to respect rate limits
      if (batchIndex < addresses.length) {
        await this.delay(this.config.batchDelay);
      }
    }
    
    console.log(`[TokenDiscovery] batchCheckTokens complete: ${tokens.size} tokens with balance>threshold`);
    return tokens;
  }

  async batchBalanceCalls(tokenAddresses, userAddress, provider) {
    const results = [];
    const userAddr = userAddress.toLowerCase();
    
    console.log(`[TokenDiscovery] batchBalanceCalls: ${tokenAddresses.length} tokens to check via eth_call`);
    
    // Make parallel calls with limit
    const chunkSize = this.config.maxConcurrent;
    for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
      const chunk = tokenAddresses.slice(i, i + chunkSize);
      console.log(`[TokenDiscovery] Balance chunk ${Math.floor(i/chunkSize)+1}: ${chunk.length} tokens`);
      
      const chunkPromises = chunk.map(async (tokenAddr) => {
        try {
          // ERC20 balanceOf signature: 0x70a08231 + padded address
          const callData = '0x70a08231' + this.padAddress(userAddr);
          
          // Use provider.call() for eth_call (not getBalance which is for native)
          const balance = await this.retryable(() => provider.call({
            to: tokenAddr,
            data: callData
          }), provider);
          
          this.stats.rpcCalls++;
          
          // balance is returned as hex string
          const balanceBigInt = BigInt(balance);
          
          if (balanceBigInt > this.config.dustThreshold) {
            console.log(`[TokenDiscovery] ✓ ${tokenAddr}: ${balanceBigInt.toString()}`);
            return {
              address: tokenAddr,
              balance: balanceBigInt,
              symbol: '???',
              name: 'Unknown Token',
              decimals: 18
            };
          } else if (balanceBigInt > 0n) {
            console.log(`[TokenDiscovery] - ${tokenAddr}: ${balanceBigInt.toString()} (below threshold)`);
          }
        } catch (error) {
          console.error(`[TokenDiscovery] ✗ ${tokenAddr}: ${error.message}`);
        }
        return null;
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      
      for (const result of chunkResults) {
        if (result) results.push(result);
      }
      
      if (i + chunkSize < tokenAddresses.length) {
        await this.delay(this.config.batchDelay);
      }
    }
    
    console.log(`[TokenDiscovery] batchBalanceCalls complete: ${results.length} tokens with balance>0`);
    return results;
  }

  // ================================================================
  // METADATA ENRICHMENT
  // ================================================================
  
  async enrichTokensWithMetadata(tokensMap, provider) {
    const enriched = new Map();
    const tokenList = Array.from(tokensMap.values());
    
    this.log('debug', `Fetching metadata for ${tokenList.length} tokens`);
    
    const batchSize = 10;
    for (let i = 0; i < tokenList.length; i += batchSize) {
      await this.processQueue();
      
      const batch = tokenList.slice(i, i + batchSize);
      const batchPromises = batch.map(async (token) => {
        try {
          const metadata = await this.fetchTokenMetadata(token.address, provider);
          return { address: token.address, metadata };
        } catch (error) {
          return { address: token.address, metadata: null };
        }
      });
      
      const results = await Promise.all(batchPromises);
      
      for (const { address, metadata } of results) {
        const original = tokensMap.get(address);
        if (metadata) {
          enriched.set(address, {
            ...original,
            symbol: metadata.symbol || original.symbol,
            name: metadata.name || original.name,
            decimals: metadata.decimals || original.decimals
          });
        } else {
          enriched.set(address, original);
        }
      }
      
      if (i + batchSize < tokenList.length) {
        await this.delay(50);
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
        [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)',
          'function totalSupply() view returns (uint256)'
        ],
        provider
      );
      
      const [symbol, name, decimals, totalSupply] = await Promise.allSettled([
        contract.symbol(),
        contract.name(),
        contract.decimals(),
        contract.totalSupply()
      ]);
      
      const metadata = {
        symbol: symbol.status === 'fulfilled' ? symbol.value : '???',
        name: name.status === 'fulfilled' ? name.value : 'Unknown Token',
        decimals: decimals.status === 'fulfilled' ? Number(decimals.value) : 18,
        totalSupply: totalSupply.status === 'fulfilled' ? totalSupply.value : null
      };
      
      // Cache metadata for 30 minutes
      this.setCached(cacheKey, metadata, 30 * 60 * 1000);
      this.stats.rpcCalls++;
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
    let hiddenCount = 0;
    
    for (const [addr, token] of tokensMap) {
      // Exclude native tokens
      if (this.isExcludedToken(addr)) {
        hiddenCount++;
        continue;
      }
      
      // Keep all tokens with balance
      // Additional filtering could be added (e.g., scam detection)
      filtered.set(addr, token);
    }
    
    if (hiddenCount > 0) {
      this.log('debug', `Filtered out ${hiddenCount} excluded tokens`);
    }
    
    return filtered;
  }

  sortTokens(tokensMap) {
    const sorted = new Map();
    const sortedEntries = Array.from(tokensMap.entries()).sort((a, b) => {
      // Primary: balance > 0 first
      const aHasBalance = a[1].balance > 0n ? 1 : 0;
      const bHasBalance = b[1].balance > 0n ? 1 : 0;
      if (aHasBalance !== bHasBalance) return bHasBalance - aHasBalance;
      
      // Secondary: balance amount (desc)
      if (a[1].balance !== b[1].balance) {
        return b[1].balance > a[1].balance ? 1 : -1;
      }
      
      // Tertiary: symbol name
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
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      this.stats.cacheHits++;
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
    
    // Only log at specific milestones to avoid spam
    if (progress === 0 || progress === 100 || progress === 50 || progress === 90) {
      console.log(`[TokenDiscovery] ${progress}% - ${message}`);
    }
  }

  log(level, ...args) {
    const prefix = `[TokenDiscovery:${level.toUpperCase()}]`;
    if (level === 'error' || level === 'warn') {
      console[level](prefix, ...args);
    } else if (level === 'info' || level === 'debug') {
      // Only log debug in development
      if (window.DEBUG_TOKEN_DISCOVERY) {
        console[level](prefix, ...args);
      }
    }
  }

  isValidAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  isExcludedToken(addr) {
    // No exclusions - discover all ERC-20 tokens
    return false;
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
        await this.processRequestQueue();
        this.stats.rpcCalls++;
        return await fn();
      } catch (error) {
        lastError = error;
        this.consecutiveErrors++;
        
        if (this.isRateLimitError(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt) * 3 + Math.random() * 2000;
          this.log('warn', `Rate limited (attempt ${attempt+1}/${this.config.maxRetries}), retrying in ${Math.round(delay)}ms`);
          await this.delay(delay);
        } else if (this.isNonRetryable(error)) {
          this.log('warn', `Non-retryable error: ${error.message}`);
          this.consecutiveErrors = 0;
          throw error;
        } else if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 500;
          this.log('debug', `Retry ${attempt+1}/${this.config.maxRetries} after ${Math.round(delay)}ms`);
          await this.delay(delay);
        } else {
          this.consecutiveErrors = 0;
        }
      }
    }
    throw lastError;
  }

  isRateLimitError(error) {
    const msg = (error.message || '').toLowerCase();
    return msg.includes('rate limit') || 
           msg.includes('too many requests') || 
           msg.includes('429') || 
           msg.includes('too many errors') ||
           msg.includes('exceeded');
  }

  isNonRetryable(error) {
    const nonRetryable = [
      'invalid argument',
      'contract not found',
      'missing revert data',
      'invalid address',
      'insufficient funds'
    ];
    const msg = (error.message || '').toLowerCase();
    return nonRetryable.some(err => msg.includes(err));
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
    if (!tokenTableBody) {
      console.error('Token table body not found');
      return;
    }
    
    tokenTableBody.innerHTML = '';
    
    // Convert Map to array and sort
    const sortedTokens = Array.from(tokens.values()).sort((a, b) => {
      // Tokens with balance first
      if (b.balance > 0n && a.balance === 0n) return 1;
      if (a.balance > 0n && b.balance === 0n) return -1;
      // Then by balance value
      if (b.balance !== a.balance) return b.balance > a.balance ? 1 : -1;
      // Then by symbol
      return a.symbol.localeCompare(b.symbol);
    });
    
    if (sortedTokens.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-3);">
        <div>No tokens discovered</div>
        <div style="font-size: 0.9rem; margin-top: 0.5rem;">Try refreshing or check your wallet connection</div>
      </td>`;
      tokenTableBody.appendChild(row);
      return;
    }
    
    for (const token of sortedTokens) {
      const row = document.createElement('tr');
      const balanceFormatted = parseFloat(ethers.formatUnits(token.balance, token.decimals || 18));
      const usdValue = this.estimateUSD(token);
      const prgxValue = this.estimatePRGX(token);
      
      row.innerHTML = `
        <td><input type="checkbox" class="token-checkbox" data-token="${token.address}" ${token.balance > 0n ? '' : 'disabled'}></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="token-icon" style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border: 1px solid var(--border);">${(token.symbol || '?').slice(0, 2).toUpperCase()}</div>
            <div>
              <div style="font-weight: 500;">${token.symbol || '???'}</div>
              <div style="font-size: 0.8rem; color: var(--text-3);">${token.name || 'Unknown Token'}</div>
            </div>
          </div>
        </td>
        <td class="mono" style="font-family: monospace;">${balanceFormatted.toFixed(4)}</td>
        <td class="mono">$${usdValue.toFixed(6)}</td>
        <td class="mono">${prgxValue.toFixed(2)}</td>
        <td style="font-size: 0.8rem; color: var(--text-3); font-family: monospace;">${token.address.slice(0, 8)}...${token.address.slice(-6)}</td>
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
    const sweepSummary = document.getElementById('sweepSummary');
    
    if (sweepBtn) {
      sweepBtn.disabled = selected === 0;
      sweepBtn.textContent = selected > 0 ? `🧹 Sweep ${selected} Token${selected > 1 ? 's' : ''}` : '🧹 Select Tokens to Sweep';
    }
    
    if (sweepSummary) {
      const selectedCheckboxes = document.querySelectorAll('.token-checkbox:checked');
      let totalUSD = 0;
      let totalPRGX = 0;
      
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
      window.wallet?.showToast?.('Please connect your wallet first', 'error');
      return;
    }
    const address = window.wallet.address;
    if (address) {
      this.clearCache();
      this.discoverTokens(address).then(() => {
        this.renderTokenTable(this.discoveredTokens);
        window.wallet?.showToast?.('Token list refreshed', 'success');
      }).catch(err => {
        console.error('Refresh failed:', err);
        window.wallet?.showToast?.(`Refresh failed: ${err.message}`, 'error');
      });
    }
  }

  // ================================================================
  // VALUE ESTIMATION
  // ================================================================
  
  estimateUSD(token) {
    const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals || 18));
    if (balance === 0) return 0;
    
    // Try to get price from token metadata if available
    // For now, use conservative placeholder
    // TODO: Integrate with price oracle
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
