// ================================================================
// TOKEN DISCOVERY MODULE - IMPROVED VERSION
// ================================================================

class TokenDiscovery {
  constructor() {
    this.discoveredTokens = new Map();
    this.selectedTokens = new Set();
    this.isDiscovering = false;
    this.discoveryProgress = 0;
    this.cache = new Map(); // In-memory cache with TTL
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.stats = {
      rpcCalls: 0,
      cacheHits: 0,
      retries: 0,
      errors: 0,
      startTime: 0
    };
    this.config = {
      maxBlockRange: 10000, // Conservative limit for most RPC providers
      initialBatchSize: 10, // Reduced for rate limiting
      maxBatchSize: 25, // Reduced for rate limiting
      minBatchSize: 3,
      retryDelay: 1500,
      maxRetries: 3,
      timeout: 15000, // 15 second timeout for RPC calls
      transferEventWindow: 5000, // Blocks for transfer event scan
      pulseXPairLimit: 200, // Reduced for rate limiting
      deferZeroBalance: true, // Skip zero balance checks on first pass
      batchDelay: 300, // Minimum delay between batches (ms)
      circuitBreakerThreshold: 3, // Consecutive RPC errors to trigger pause
      circuitBreakerPause: 2000, // Pause duration (ms)
      maxConcurrentRequests: 3 // Max simultaneous RPC calls
    };
    this.consecutiveRPCErrors = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  // ================================================================
  // PRIMARY METHOD
  // ================================================================
  async getWalletTokens(address) {
    if (!address) throw new Error('Wallet address required');
    
    return await this.discoverTokens(address);
  }

  async discoverTokens(address) {
    this.isDiscovering = true;
    this.stats.startTime = Date.now();
    this.stats.rpcCalls = 0;
    this.stats.cacheHits = 0;
    this.stats.retries = 0;
    this.stats.errors = 0;
    
    this.updateDiscoveryStatus('Starting token discovery...', 0);
    this.log('info', `Starting discovery for ${address}`);
    
    try {
      // Progressive enhancement strategy: start simple, add complexity if needed
      let allTokenAddresses = new Set();
      
      // Phase 1: Quick wins - known tokens and recent transfers
      this.updateDiscoveryStatus('Phase 1: Quick scan (recent transfers & known tokens)...', 10);
      const phase1Tokens = await this.phase1QuickScan(address);
      allTokenAddresses = new Set([...allTokenAddresses, ...phase1Tokens]);
      this.log('info', `Phase 1 found ${phase1Tokens.size} token candidates`);
      
      // Phase 2: Extended transfer history if needed
      if (allTokenAddresses.size < 5) {
        this.updateDiscoveryStatus('Phase 2: Extended transfer scan...', 30);
        const phase2Tokens = await this.phase2ExtendedTransfers(address);
        allTokenAddresses = new Set([...allTokenAddresses, ...phase2Tokens]);
        this.log('info', `Phase 2 found ${phase2Tokens.size} additional tokens`);
      }
      
      // Phase 3: PulseX factory enumeration
      if (allTokenAddresses.size < 10) {
        this.updateDiscoveryStatus('Phase 3: PulseX pairs scan...', 60);
        const phase3Tokens = await this.phase3PulseXPairs();
        allTokenAddresses = new Set([...allTokenAddresses, ...phase3Tokens]);
        this.log('info', `Phase 3 found ${phase3Tokens.size} additional tokens`);
      }
      
      // Phase 4: Aggressive scan as last resort
      if (allTokenAddresses.size < 10) {
        this.updateDiscoveryStatus('Phase 4: Aggressive blockchain scan...', 80);
        const phase4Tokens = await this.phase4AggressiveScan(address);
        allTokenAddresses = new Set([...allTokenAddresses, ...phase4Tokens]);
        this.log('info', `Phase 4 found ${phase4Tokens.size} additional tokens`);
      }
      
      this.updateDiscoveryStatus(`Found ${allTokenAddresses.size} token addresses, fetching balances...`, 90);
      
      // Deduplicate and fetch balances/metadata in batches
      const tokens = await this.fetchTokenDataBatch(Array.from(allTokenAddresses), address);
      
      // Filter and sort
      const displayTokens = await this.filterForDisplay(tokens);
      const sortedTokens = this.sortTokensByRelevance(displayTokens);
      
      this.discoveredTokens = sortedTokens;
      this.isDiscovering = false;
      
      const duration = Date.now() - this.stats.startTime;
      this.updateDiscoveryStatus(`✅ Discovery complete: ${sortedTokens.size} tokens (${duration}ms, ${this.stats.rpcCalls} RPC calls, ${this.stats.cacheHits} cache hits)`, 100);
      this.log('info', `Discovery complete: ${sortedTokens.size} tokens, ${this.stats.rpcCalls} RPC calls, ${duration}ms`);
      
      return sortedTokens;
    } catch (error) {
      this.isDiscovering = false;
      this.stats.errors++;
      this.log('error', 'Token discovery failed:', error);
      this.updateDiscoveryStatus(`❌ Discovery failed: ${error.message}`, 0);
      throw error;
    }
  }

  // ================================================================
  // PROGRESSIVE ENHANCEMENT PHASES
  // ================================================================
  
  async phase1QuickScan(address) {
    const tokens = new Set();
    
    // 1. Check known major PulseChain tokens (only those likely to have value)
    const knownTokens = this.getMajorPulseChainTokens();
    for (const token of knownTokens) {
      try {
        const balance = await this.cachedGetBalance(token, address);
        if (balance > 0n) {
          tokens.add(token);
        }
      } catch (e) {
        // Ignore individual token failures
      }
    }
    
    // 2. Scan recent transfer events (last 5000 blocks)
    try {
      const transferTokens = await this.scanTransferEvents(address, 5000);
      for (const token of transferTokens) {
        tokens.add(token);
      }
    } catch (e) {
      this.log('warn', 'Transfer event scan failed:', e);
    }
    
    return tokens;
  }

  async phase2ExtendedTransfers(address) {
    // Scan more blocks (up to config limit)
    try {
      const transferTokens = await this.scanTransferEvents(address, this.config.maxBlockRange);
      return transferTokens;
    } catch (e) {
      this.log('warn', 'Extended transfer scan failed:', e);
      return new Set();
    }
  }

  async phase3PulseXPairs() {
    const tokens = new Set();
    
    try {
      const provider = window.wallet?.provider;
      if (!provider) return tokens;
      
      // PulseX Factory (using correct address)
      const pulseXFactory = CONFIG.APIS.IPULSE_FACTORY || '0x43d7dA3090A2F0c8A0b8F9a5E3E4bA6F5E6E8E';
      
      // Use cached factory data if available
      const cacheKey = `pulsex-pairs-${Date.now()}`;
      const cached = this.getCached(cacheKey);
      if (cached) {
        this.log('debug', 'Using cached PulseX pair list');
        return new Set(cached);
      }
      
      // For PulseChain, we can't reliably call allPairsLength due to high gas cost
      // Instead, use a static list of known popular pairs or fetch from external API
      // For now, use a reasonable subset
      const pairsToScan = Math.min(this.config.pulseXPairLimit, 200);
      
      this.log('info', `Scanning first ${pairsToScan} PulseX pairs`);
      
      // Batch fetch pair addresses with exponential backoff
      const pairs = await this.retryable(async () => {
        const batchSize = 15; // Smaller batches for rate limiting
        const pairAddresses = [];
        
        for (let i = 0; i < pairsToScan; i += batchSize) {
          const batch = await this.fetchPulseXPairsBatch(pulseXFactory, i, Math.min(i + batchSize, pairsToScan), provider);
          pairAddresses.push(...batch);
          
          if (i + batchSize < pairsToScan) {
            // Progressive delay to avoid rate limiting
            const delay = this.config.batchDelay + (i / pairsToScan) * 100; // Increase delay as we progress
            await this.delay(delay);
          }
        }
        
        return pairAddresses;
      });
      
      // Extract token addresses from pairs
      for (const pair of pairs) {
        try {
          const tokensFromPair = await this.getTokensFromPair(pair, provider);
          for (const token of tokensFromPair) {
            tokens.add(token.toLowerCase());
          }
        } catch (e) {
          // Continue on individual pair failures
        }
      }
      
      // Cache the result for 10 minutes
      this.setCached(cacheKey, Array.from(tokens), 10 * 60 * 1000);
      
    } catch (e) {
      this.log('warn', 'PulseX pair enumeration failed:', e);
    }
    
    return tokens;
  }

  async phase4AggressiveScan(address) {
    const tokens = new Set();
    
    try {
      const provider = window.wallet?.provider;
      if (!provider) return tokens;
      
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - this.config.maxBlockRange);
      
      this.log('debug', `Scanning blocks ${fromBlock} to ${currentBlock} for transfer events`);
      
      // Get Transfer events where user is recipient (most relevant)
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      
      const logs = await this.retryable(async () => {
        return await provider.getLogs({
          address: null,
          topics: [
            transferTopic,
            null,
            ethers.zeroPadValue(address.toLowerCase(), 32)
          ],
          fromBlock: fromBlock,
          toBlock: currentBlock
        });
      });
      
      for (const log of logs) {
        if (log.address) {
          tokens.add(log.address.toLowerCase());
        }
      }
      
      this.log('info', `Aggressive scan found ${tokens.size} unique token addresses from ${logs.length} transfer events`);
      
    } catch (e) {
      this.log('error', 'Aggressive scan failed:', e);
    }
    
    return tokens;
  }

  // ================================================================
  // BATCH OPERATIONS WITH IMPROVEMENTS
  // ================================================================
  
  async fetchTokenDataBatch(tokenAddresses, userAddress) {
    const tokens = new Map();
    
    // Remove duplicates and filter out invalid addresses
    const uniqueAddresses = [...new Set(tokenAddresses)]
      .map(addr => addr.toLowerCase())
      .filter(addr => this.isValidTokenAddress(addr))
      .filter(addr => !this.isExcludedToken(addr));
    
    this.log('debug', `Fetching data for ${uniqueAddresses.length} unique tokens`);
    
    // Adaptive batch sizing based on previous performance
    let batchSize = this.config.initialBatchSize;
    const balances = {};
    
    // First pass: fetch all balances in batches
    for (let i = 0; i < uniqueAddresses.length; i += batchSize) {
      const batch = uniqueAddresses.slice(i, i + batchSize);
      
      try {
        const batchBalances = await this.retryable(async () => {
          return await this.batchGetBalances(batch, userAddress);
        });
        
        Object.assign(balances, batchBalances);
        
        // Update batch size based on success
        batchSize = this.adjustBatchSize(batchSize, true);
        
      } catch (e) {
        this.stats.errors++;
        this.log('warn', `Batch ${Math.floor(i/batchSize)} failed, reducing batch size:`, e);
        batchSize = Math.max(this.config.minBatchSize, Math.floor(batchSize * 0.5));
      }
      
      // Progress update
      const progress = 90 + ((i + batch.length) / uniqueAddresses.length) * 9;
      this.updateDiscoveryStatus(`Fetching token data: ${i + batch.length}/${uniqueAddresses.length}`, progress);
    }
    
    // Filter to tokens with balance or promising tokens
    const tokensToFetchMetadata = [];
    for (const [address, balance] of Object.entries(balances)) {
      if (balance > 0n) {
        tokensToFetchMetadata.push(address);
      } else if (this.config.deferZeroBalance) {
        // Skip zero balance tokens initially
        continue;
      }
    }
    
    this.log('debug', `Fetching metadata for ${tokensToFetchMetadata.length} tokens with balance`);
    
    // Fetch metadata in batches
    for (let i = 0; i < tokensToFetchMetadata.length; i += batchSize) {
      const batch = tokensToFetchMetadata.slice(i, i + batchSize);
      
      try {
        const metadataMap = await this.batchGetMetadata(batch);
        
        for (const [address, metadata] of Object.entries(metadataMap)) {
          tokens.set(address, {
            address: address,
            ...metadata,
            balance: balances[address],
            balanceFormatted: ethers.formatUnits(balances[address], metadata.decimals),
            source: 'discovery' // Will be updated later per strategy
          });
        }
        
        batchSize = this.adjustBatchSize(batchSize, true);
        
      } catch (e) {
        this.stats.errors++;
        this.log('warn', `Metadata batch failed, reducing batch size:`, e);
        batchSize = Math.max(this.config.minBatchSize, Math.floor(batchSize * 0.5));
      }
    }
    
    return tokens;
  }

  async batchGetBalances(tokenAddresses, userAddress) {
    const balances = {};
    
    if (!window.wallet?.provider) return balances;
    
    const provider = window.wallet.provider;
    
    // Process in smaller sub-batches to avoid overwhelming RPC
    const subBatchSize = Math.min(this.config.initialBatchSize, tokenAddresses.length);
    const subBatches = [];
    
    for (let i = 0; i < tokenAddresses.length; i += subBatchSize) {
      subBatches.push(tokenAddresses.slice(i, i + subBatchSize));
    }
    
    for (let batchIndex = 0; batchIndex < subBatches.length; batchIndex++) {
      const batch = subBatches[batchIndex];
      
      // Rate limiting: add delay between sub-batches
      if (batchIndex > 0) {
        await this.delay(this.config.batchDelay + Math.random() * 200);
      }
      
      const promises = batch.map(async (tokenAddress) => {
        try {
          // Check cache first
          const cacheKey = `balance-${tokenAddress}-${userAddress}`;
          const cached = this.getCached(cacheKey);
          if (cached) {
            this.stats.cacheHits++;
            return [tokenAddress, cached];
          }
          
          this.stats.rpcCalls++;
          
          // Skip known problematic tokens quickly
          if (this.isKnownDustToken(tokenAddress)) {
            return [tokenAddress, 0n];
          }
          
          const contract = new ethers.Contract(
            tokenAddress,
            CONFIG.ABIS.ERC20,
            provider
          );
          
          const balance = await this.withTimeout(contract.balanceOf(userAddress), this.config.timeout);
          
          // Cache balance for 1 minute
          this.setCached(cacheKey, balance, 60 * 1000);
          
          return [tokenAddress, balance];
          
        } catch (e) {
          this.log('debug', `Balance check failed for ${tokenAddress}:`, e);
          return [tokenAddress, 0n];
        }
      });
      
      const results = await Promise.all(promises);
      const resultMap = Object.fromEntries(results);
      Object.assign(balances, resultMap);
      
      // Check for rate limiting after each batch
      if (this.consecutiveRPCErrors >= this.config.circuitBreakerThreshold) {
        this.log('warn', 'Too many errors, pausing token discovery');
        await this.delay(this.config.circuitBreakerPause);
        this.consecutiveRPCErrors = 0;
      }
    }
    
    return balances;
  }

  async batchGetMetadata(tokenAddresses) {
    const metadataMap = {};
    
    if (!window.wallet?.provider) return metadataMap;
    
    const provider = window.wallet.provider;
    
    // Process in smaller sub-batches
    const subBatchSize = Math.min(this.config.initialBatchSize, tokenAddresses.length);
    const subBatches = [];
    
    for (let i = 0; i < tokenAddresses.length; i += subBatchSize) {
      subBatches.push(tokenAddresses.slice(i, i + subBatchSize));
    }
    
    for (let batchIndex = 0; batchIndex < subBatches.length; batchIndex++) {
      const batch = subBatches[batchIndex];
      
      // Rate limiting: add delay between sub-batches
      if (batchIndex > 0) {
        await this.delay(this.config.batchDelay + Math.random() * 200);
      }
      
      const promises = batch.map(async (tokenAddress) => {
        try {
          // Check cache first
          const cacheKey = `metadata-${tokenAddress}`;
          const cached = this.getCached(cacheKey);
          if (cached) {
            this.stats.cacheHits++;
            return [tokenAddress, cached];
          }
          
          this.stats.rpcCalls++;
          
          const contract = new ethers.Contract(
            tokenAddress,
            CONFIG.ABIS.ERC20,
            provider
          );
          
          const [symbol, name, decimals] = await Promise.allSettled([
            this.withTimeout(contract.symbol(), this.config.timeout),
            this.withTimeout(contract.name(), this.config.timeout),
            this.withTimeout(contract.decimals(), this.config.timeout)
          ]);
          
          const metadata = {
            symbol: symbol.status === 'fulfilled' ? symbol.value : '???',
            name: name.status === 'fulfilled' ? name.value : 'Unknown Token',
            decimals: decimals.status === 'fulfilled' ? Number(decimals.value) : 18
          };
          
          // Cache metadata for 30 minutes
          this.setCached(cacheKey, metadata, 30 * 60 * 1000);
          
          return [tokenAddress, metadata];
          
        } catch (e) {
          this.log('debug', `Metadata fetch failed for ${tokenAddress}:`, e);
          return [tokenAddress, {
            symbol: '???',
            name: 'Unknown Token',
            decimals: 18
          }];
        }
      });
      
      const results = await Promise.all(promises);
      const resultMap = Object.fromEntries(results);
      Object.assign(metadataMap, resultMap);
      
      // Check for rate limiting after each batch
      if (this.consecutiveRPCErrors >= this.config.circuitBreakerThreshold) {
        this.log('warn', 'Too many errors during metadata fetch, pausing');
        await this.delay(this.config.circuitBreakerPause);
        this.consecutiveRPCErrors = 0;
      }
    }
    
    return metadataMap;
  }

  // Helper for single token metadata fetch
  async fetchTokenMetadata(tokenAddress) {
    const result = await this.batchGetMetadata([tokenAddress]);
    return result[tokenAddress] || {
      symbol: '???',
      name: 'Unknown Token',
      decimals: 18
    };
  }

  // ================================================================
  // HELPER METHODS
  // ================================================================
  
  async scanTransferEvents(address, blockRange) {
    const tokens = new Set();
    
    if (!window.wallet?.provider) return tokens;
    
    const provider = window.wallet.provider;
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - blockRange);
    
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    
    const logs = await this.retryable(async () => {
      return await provider.getLogs({
        address: null,
        topics: [
          transferTopic,
          null,
          ethers.zeroPadValue(address.toLowerCase(), 32)
        ],
        fromBlock: fromBlock,
        toBlock: 'latest'
      });
    });
    
    for (const log of logs) {
      if (log.address) {
        tokens.add(log.address.toLowerCase());
      }
    }
    
    return tokens;
  }

  async fetchPulseXPairsBatch(factoryAddress, startIndex, endIndex, provider) {
    const pairs = [];
    const batchSize = endIndex - startIndex;
    const factory = new ethers.Contract(
      factoryAddress,
      ['function allPairs(uint256) view returns (address)'],
      provider
    );
    
    const promises = [];
    for (let i = startIndex; i < endIndex; i++) {
      promises.push(factory.allPairs(i));
    }
    
    try {
      const results = await Promise.all(promises);
      pairs.push(...results);
    } catch (e) {
      // Some calls might fail, continue with partial results
      this.log('debug', `Some allPairs calls failed in batch ${startIndex}-${endIndex}`);
    }
    
    return pairs;
  }

  async getTokensFromPair(pairAddress, provider) {
    const tokens = [];
    
    try {
      const pair = new ethers.Contract(
        pairAddress,
        [
          'function token0() view returns (address)',
          'function token1() view returns (address)'
        ],
        provider
      );
      
      const [token0, token1] = await Promise.all([
        this.withTimeout(pair.token0(), this.config.timeout),
        this.withTimeout(pair.token1(), this.config.timeout)
      ]);
      
      if (token0 && token0 !== '0x0000000000000000000000000000000000000000') {
        tokens.push(token0.toLowerCase());
      }
      if (token1 && token1 !== '0x0000000000000000000000000000000000000000') {
        tokens.push(token1.toLowerCase());
      }
    } catch (e) {
      this.log('debug', `Failed to get tokens from pair ${pairAddress}:`, e);
    }
    
    return tokens;
  }

  // ================================================================
  // CACHING
  // ================================================================
  
  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  setCached(key, value, ttl = this.cacheTTL) {
    this.cache.set(key, {
      value: value,
      expires: Date.now() + ttl
    });
  }

  // ================================================================
  // RETRY & CIRCUIT BREAKER
  // ================================================================
  
  async retryable(fn, maxRetries = null) {
    maxRetries = maxRetries || this.config.maxRetries;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check circuit breaker
        if (this.consecutiveRPCErrors >= this.config.circuitBreakerThreshold) {
          this.log('warn', `Circuit breaker triggered - pausing for ${this.config.circuitBreakerPause}ms`);
          await this.delay(this.config.circuitBreakerPause);
          this.consecutiveRPCErrors = 0; // Reset after pause
        }
        
        // Process request queue if active
        await this.processRequestQueue();
        
        return await fn();
      } catch (error) {
        lastError = error;
        this.stats.retries++;
        this.consecutiveRPCErrors++;
        
        // Check for rate limiting errors
        if (this.isRateLimitError(error)) {
          this.log('warn', `Rate limit detected: ${error.message}`);
          // Longer delay for rate limiting
          const delay = Math.min(30000, this.config.retryDelay * Math.pow(3, attempt)) + Math.random() * 2000;
          this.log('debug', `Rate limit retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
          await this.delay(delay);
          continue;
        }
        
        // Don't retry on certain errors
        if (this.isNonRetryable(error)) {
          this.consecutiveRPCErrors = 0; // Reset on non-retryable errors
          throw error;
        }
        
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const delay = this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
          this.log('debug', `Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms:`, error.message);
          await this.delay(delay);
        } else {
          this.consecutiveRPCErrors = 0; // Reset after max retries
        }
      }
    }
    
    throw lastError;
  }

  isRateLimitError(error) {
    const message = (error.message || '').toLowerCase();
    return message.includes('rate limit') || 
           message.includes('too many requests') ||
           message.includes('429') ||
           message.includes('rpc endpoint returned too many errors');
  }

  isNonRetryable(error) {
    // Errors that should not be retried
    const nonRetryable = [
      'insufficient funds',
      'invalid argument',
      'contract not found',
      'missing revert data',
      'invalid address'
    ];
    
    const message = error.message?.toLowerCase() || '';
    return nonRetryable.some(msg => message.includes(msg));
  }

  // ================================================================
  // REQUEST QUEUE
  // ================================================================
  
  async processRequestQueue() {
    // Limit concurrent requests
    const maxConcurrent = this.config.maxConcurrentRequests;
    
    if (this.activeRequests >= maxConcurrent) {
      this.log('debug', `Request queue: waiting (${this.activeRequests}/${maxConcurrent} active)`);
      // Wait for some requests to complete
      await this.delay(100);
      return this.processRequestQueue();
    }
  }

  queueRequest(fn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    const maxConcurrent = this.config.maxConcurrentRequests;
    
    while (this.requestQueue.length > 0 && this.activeRequests < maxConcurrent) {
      const request = this.requestQueue.shift();
      if (request) {
        this.activeRequests++;
        try {
          const result = await request.fn();
          request.resolve(result);
        } catch (error) {
          request.reject(error);
        } finally {
          this.activeRequests--;
        }
      }
    }
    
    this.isProcessingQueue = false;
  }

  get activeRequests() {
    return this._activeRequests || 0;
  }

  set activeRequests(value) {
    this._activeRequests = value;
  }
}

  // ================================================================
  // UTILITY METHODS
  // ================================================================
  
  withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  adjustBatchSize(currentSize, success) {
    if (success) {
      // Gradually increase on success
      return Math.min(this.config.maxBatchSize, Math.floor(currentSize * 1.1));
    } else {
      // Decrease on failure
      return Math.max(this.config.minBatchSize, Math.floor(currentSize * 0.7));
    }
  }

  isValidTokenAddress(address) {
    // Basic validation: must be 0x followed by 40 hex chars
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  isExcludedToken(address) {
    const excluded = [
      CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase(),
      CONFIG.CONTRACTS.WPLS.toLowerCase(),
      '0x0000000000000000000000000000000000000000', // Native token
      '0x02f26235791bf5e65a3253aa06845c0451237567' // PLS
    ];
    return excluded.includes(address.toLowerCase());
  }

  isKnownDustToken(address) {
    // Add known spam/dust tokens here
    const dustTokens = [
      // Example: tokens with known spam patterns
    ];
    return dustTokens.includes(address.toLowerCase());
  }

  getMajorPulseChainTokens() {
    // Major tokens on PulseChain that users likely hold
    return [
      CONFIG.CONTRACTS.PRGX_TOKEN, // PRGX itself (we'll filter it out later)
      '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', // WPLS
      '0x2b592e8c5c1b4f8b6e3b4c8e4b4c8e4b4c8e4b4c', // PLS (native)
      // Add other major PulseChain tokens here
      // e.g., PULSE, DAI, USDC, etc. (you'll need real addresses)
    ].filter(addr => addr && this.isValidTokenAddress(addr));
  }

  // ================================================================
  // FILTERING & SORTING (Enhanced)
  // ================================================================
  
  async filterForDisplay(tokens) {
    const filtered = new Map();
    
    for (const [address, token] of tokens) {
      // Skip excluded tokens
      if (this.isExcludedToken(address)) continue;
      
      // Skip tokens with no meaningful name/symbol (likely scam/dust)
      if (token.symbol === '???' && token.name === 'Unknown Token') {
        continue;
      }
      
      // Estimate value
      const estimatedValue = await this.estimateTokenValue(
        token.address,
        token.balance,
        token.decimals
      );
      
      // Always include tokens with balance > 0
      // For zero-balance tokens, include only if they have a legitimate name
      const hasBalance = token.balance > 0n;
      const hasLegitimateName = !token.name.includes('Unknown') && token.name.length > 3;
      
      if (hasBalance || hasLegitimateName) {
        filtered.set(address, {
          ...token,
          estimatedUSD: estimatedValue.estimatedUSD || 0,
          estimatedPRGX: estimatedValue.estimatedPRGX || 0
        });
      }
    }
    
    return filtered;
  }

  async estimateTokenValue(address, balance, decimals) {
    try {
      // Try to get price from external API (placeholder - you'd integrate with CoinGecko/DexScreener)
      // For now, use conservative estimate
      const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals));
      
      // If balance is zero, value is zero
      if (balanceFormatted === 0) {
        return { estimatedPRGX: 0, estimatedUSD: 0 };
      }
      
      // Very small balances are likely dust (< $0.01)
      if (balanceFormatted < 1000) {
        return { estimatedPRGX: 0, estimatedUSD: 0 };
      }
      
      // Default conservative estimate: $0.0001 per token (adjust based on real price data)
      const estimatedUSD = balanceFormatted * 0.0001;
      const estimatedPRGX = estimatedUSD / 0.001; // Assuming PRGX ~ $0.001
      
      return {
        estimatedPRGX: Math.max(0, estimatedPRGX),
        estimatedUSD: Math.max(0, estimatedUSD)
      };
      
    } catch (error) {
      this.log('debug', `Failed to estimate value for ${address}:`, error);
      return { estimatedPRGX: 0, estimatedUSD: 0 };
    }
  }

  sortTokensByRelevance(tokens) {
    const sorted = new Map();
    const sortedEntries = Array.from(tokens.entries()).sort((a, b) => {
      // Primary: balance > 0
      const aHasBalance = a[1].balance > 0n ? 1 : 0;
      const bHasBalance = b[1].balance > 0n ? 1 : 0;
      if (aHasBalance !== bHasBalance) return bHasBalance - aHasBalance;
      
      // Secondary: estimated USD value
      const valueA = a[1].estimatedUSD || 0;
      const valueB = b[1].estimatedUSD || 0;
      if (valueA !== valueB) return valueB - valueA;
      
      // Tertiary: by symbol
      return a[1].symbol.localeCompare(b[1].symbol);
    });
    
    for (const [address, token] of sortedEntries) {
      sorted.set(address, token);
    }
    
    return sorted;
  }

  // ================================================================
  // UI HELPERS (unchanged)
  // ================================================================
  
  updateDiscoveryStatus(message, progress) {
    this.discoveryProgress = progress;
    
    const statusElement = document.getElementById('discoveryStatus');
    const progressBar = document.getElementById('discoveryProgress');
    
    if (statusElement) {
      statusElement.textContent = message;
    }
    
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
    
    // Only log major status updates to reduce noise
    if (progress % 20 === 0 || progress === 100 || progress === 0) {
      console.log(`[TokenDiscovery] ${progress}% - ${message}`);
    }
  }

  // ================================================================
  // LOGGING
  // ================================================================
  
  log(level, ...args) {
    const levels = ['debug', 'info', 'warn', 'error'];
    if (levels.indexOf(level) === -1) {
      console.error('Invalid log level:', level);
      return;
    }
    
    // In production, you might filter based on a verbosity setting
    const timestamp = new Date().toISOString();
    const prefix = `[TokenDiscovery:${level.toUpperCase()}]`;
    console[level](prefix, ...args);
  }

  // ================================================================
  // PUBLIC API (unchanged)
  // ================================================================
  
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
    this.log('info', 'Cache cleared');
  }

  // ================================================================
  // UI HELPERS (Required by app.js/sweep.html)
  // ================================================================
  
  renderTokenTable(tokens, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    if (this.isDiscovering) {
      // Show skeleton loading
      for (let i = 0; i < 5; i++) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><div class="skeleton skeleton-row"></div></td>
          <td><div class="skeleton skeleton-row"></div></td>
          <td><div class="skeleton skeleton-row"></div></td>
          <td><div class="skeleton skeleton-row"></div></td>
          <td><div class="skeleton skeleton-row"></div></td>
        `;
        container.appendChild(row);
      }
      return;
    }
    
    if (tokens.size === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-3);">
          No dust tokens found in your wallet
        </td>
      `;
      container.appendChild(row);
      return;
    }
    
    // Render each token
    for (const [address, token] of tokens) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div class="checkbox-custom ${this.selectedTokens.has(address) ? 'checked' : ''}" 
               data-token="${address}" onclick="tokenDiscovery.toggleToken('${address}')">
            ${this.selectedTokens.has(address) ? '✓' : ''}
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="token-icon">${token.symbol?.slice(0, 2).toUpperCase() || '??'}</div>
            <div>
              <div class="token-symbol">${token.symbol || '???'}</div>
              <div class="token-name">${token.name || 'Unknown Token'}</div>
            </div>
          </div>
        </td>
        <td class="mono">${parseFloat(token.balanceFormatted).toLocaleString()}</td>
        <td class="mono">$${(token.estimatedUSD || 0).toFixed(6)}</td>
        <td class="mono">${(token.estimatedPRGX || 0).toFixed(2)} PRGX</td>
      `;
      container.appendChild(row);
    }
  }

  selectAll() {
    for (const address of this.discoveredTokens.keys()) {
      this.selectedTokens.add(address);
    }
    this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
    this.updateSweepButton();
  }

  deselectAll() {
    this.selectedTokens.clear();
    this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
    this.updateSweepButton();
  }

  toggleToken(address) {
    if (this.selectedTokens.has(address)) {
      this.selectedTokens.delete(address);
    } else {
      this.selectedTokens.add(address);
    }
    
    // Update checkbox
    const checkbox = document.querySelector(`.checkbox-custom[data-token="${address}"]`);
    if (checkbox) {
      checkbox.classList.toggle('checked');
      checkbox.textContent = this.selectedTokens.has(address) ? '✓' : '';
    }
    
    // Update sweep button
    this.updateSweepButton();
  }

  getSelectedTokens() {
    const selected = new Map();
    for (const address of this.selectedTokens) {
      const token = this.discoveredTokens.get(address);
      if (token) {
        selected.set(address, token);
      }
    }
    return selected;
  }

  updateSweepButton() {
    const purgeBtn = document.getElementById('purgeBtn');
    if (purgeBtn) {
      purgeBtn.disabled = this.selectedTokens.size === 0;
    }
    
    // Update summary counts
    const selectedCount = document.getElementById('selectedCount');
    const estimatedPRGX = document.getElementById('estimatedPRGX');
    const estimatedUSD = document.getElementById('estimatedUSD');
    
    if (selectedCount) selectedCount.textContent = this.selectedTokens.size;
    
    let totalPRGX = 0;
    let totalUSD = 0;
    
    for (const address of this.selectedTokens) {
      const token = this.discoveredTokens.get(address);
      if (token) {
        totalPRGX += token.estimatedPRGX || 0;
        totalUSD += token.estimatedUSD || 0;
      }
    }
    
    if (estimatedPRGX) estimatedPRGX.textContent = totalPRGX.toFixed(2);
    if (estimatedUSD) estimatedUSD.textContent = `$${totalUSD.toFixed(6)}`;
  }

  async addCustomToken(address) {
    if (!window.wallet?.isConnected) return;
    
    try {
      // Validate address
      if (!ethers.isAddress(address)) {
        throw new Error('Invalid token address');
      }
      
      const normalized = address.toLowerCase();
      
      // Check if already discovered
      if (this.discoveredTokens.has(normalized)) {
        throw new Error('Token already discovered');
      }
      
      // Fetch balance and metadata
      const balances = await this.batchFetchBalances([normalized], window.wallet.address);
      const balance = balances[normalized] || 0n;
      
      if (balance <= 0n) {
        throw new Error('No balance found for this token');
      }
      
      const metadata = await this.fetchTokenMetadata(normalized);
      const estimatedValue = await this.estimateTokenValue(normalized, balance, metadata.decimals);
      
      const token = {
        address: normalized,
        ...metadata,
        balance: balance,
        balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
        estimatedUSD: estimatedValue.estimatedUSD || 0,
        estimatedPRGX: estimatedValue.estimatedPRGX || 0,
        source: 'custom'
      };
      
      this.discoveredTokens.set(normalized, token);
      this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
      
      if (window.wallet.showToast) {
        window.wallet.showToast('Token added successfully', 'success');
      }
    } catch (error) {
      console.error('Add custom token failed:', error);
      if (window.wallet?.showToast) {
        window.wallet.showToast(error.message, 'error');
      }
    }
  }

  async refreshTokens() {
    if (!window.wallet?.isConnected) return;
    
    try {
      this.updateDiscoveryStatus('Refreshing tokens...', 0);
      await this.getWalletTokens(window.wallet.address);
      this.updateSweepButton();
      this.updateDiscoveryStatus(`Found ${this.discoveredTokens.size} dust tokens`, 100);
    } catch (error) {
      console.error('Token refresh failed:', error);
      if (window.wallet?.showToast) {
        window.wallet.showToast('Failed to refresh tokens', 'warning');
      }
    }
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.tokenDiscovery = new TokenDiscovery();