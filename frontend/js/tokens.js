// ================================================================
// TOKEN DISCOVERY - MULTI-RPC WITH FACTORY DISCOVERY
// ================================================================
// Based on PulseChain DEX research (April 2026)
// Strategy: Multi-RPC + Factory allPairs() + Transfer fallback
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
      // RPC endpoints (try in order, with fallback)
      rpcEndpoints: [
        'https://rpc.pulsechain.com',
        // Add backup RPCs here if needed
      ],
      currentRpcIndex: 0,
      
      // Transfer scan range (fallback only)
      transferBlockRange: 5000,
      
      // Batch sizes
      batchSize: 20,
      maxBatchSize: 30,
      
      // Delays
      batchDelay: 100,
      rpcswitchDelay: 2000, // Wait before trying next RPC
      
      // Timeouts
      timeout: 15000,
      retryDelay: 1000,
      maxRetries: 2,
      
      // Circuit breaker
      circuitBreakerThreshold: 3,
      circuitBreakerPause: 3000,
      
      // Dust threshold
      dustThreshold: 0n,
      
      // Concurrency
      maxConcurrent: 3
    };
    
    this.consecutiveErrors = 0;
    this.activeRequests = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    // Factory contracts for DEXs (to be verified/updated)
    this.factories = [
      { name: 'PulseX', address: CONFIG?.APIS?.IPULSE_FACTORY || '0x43d7dA3090A2F0c8A0b8F9a5E3E4bA6F5E6E8E' },
      // Add other DEX factories: 9inch, 9mm, Phux
    ];
  }

  // ================================================================
  // UTILITY LOGGING METHODS
  // ================================================================
  
  log(level, ...args) {
    const prefix = `[TokenDiscovery:${level.toUpperCase()}]`;
    if (level === 'error' || level === 'warn') {
      console[level](prefix, ...args);
    } else if (level === 'info' || level === 'debug') {
      if (window.DEBUG_TOKEN_DISCOVERY) {
        console[level](prefix, ...args);
      }
    }
  }

  logError(context, error) {
    this.stats.errors++;
    this.discoveryErrors.push({ phase: context, error, message: error.message, stack: error.stack });
    console.error(`[TokenDiscovery] ${context}:`, error.message);
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
      errors: this.discoveryErrors.length,
      rpcEndpoint: this.config.rpcEndpoints[this.config.currentRpcIndex]
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
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        this.discoveredTokens = new Map(cached);
        this.isDiscovering = false;
        const duration = Date.now() - this.stats.startTime;
        this.updateDiscoveryStatus(`✅ Using cached results: ${cached.size} tokens`, 100);
        return this.discoveredTokens;
      }
      
      // PHASE 1: Check known major tokens (fast)
      this.updateDiscoveryStatus('Phase 1/3: Checking known tokens...', 10);
      try {
        const phase1Tokens = await this.phase1CheckKnownTokens(address);
        for (const [tokenAddr, token] of phase1Tokens) {
          tokens.set(tokenAddr, token);
        }
        console.log(`[TokenDiscovery] Phase 1: ${phase1Tokens.size} tokens`);
      } catch (error) {
        this.logError('Phase 1 (known tokens)', error);
      }
      
      // PHASE 2: Factory-based discovery (comprehensive & fast)
      if (tokens.size < 10) {
        this.updateDiscoveryStatus('Phase 2/3: Querying DEX factories...', 40);
        try {
          const phase2Tokens = await this.phase2FactoryDiscovery(address);
          for (const [tokenAddr, token] of phase2Tokens) {
            if (!tokens.has(tokenAddr)) {
              tokens.set(tokenAddr, token);
            }
          }
          console.log(`[TokenDiscovery] Phase 2: ${phase2Tokens.size} tokens (total: ${tokens.size})`);
        } catch (error) {
          this.logError('Phase 2 (factory discovery)', error);
        }
      }
      
      // PHASE 3: Transfer event scan (fallback for non-DEX tokens)
      if (tokens.size < 5) {
        this.updateDiscoveryStatus('Phase 3/3: Scanning transfer events...', 70);
        try {
          const phase3Tokens = await this.phase3TransferScan(address);
          for (const [tokenAddr, token] of phase3Tokens) {
            if (!tokens.has(tokenAddr)) {
              tokens.set(tokenAddr, token);
            }
          }
          console.log(`[TokenDiscovery] Phase 3: ${phase3Tokens.size} tokens (total: ${tokens.size})`);
        } catch (error) {
          this.logError('Phase 3 (transfer scan)', error);
        }
      }
      
      // Fetch metadata for all discovered tokens
      if (tokens.size > 0) {
        this.updateDiscoveryStatus('Fetching token metadata...', 90);
        try {
          const tokensWithMetadata = await this.enrichTokensWithMetadata(tokens);
          // Filter and sort
          const filtered = this.filterTokens(tokensWithMetadata);
          this.discoveredTokens = this.sortTokens(filtered);
          
          // Cache results
          this.setCached(cacheKey, this.discoveredTokens, this.cacheTTL);
          
          const duration = Date.now() - this.stats.startTime;
          this.updateDiscoveryStatus(`✅ Discovery complete: ${this.discoveredTokens.size} tokens (${Math.round(duration/1000)}s)`, 100);
          console.log(`[TokenDiscovery] Complete: ${this.discoveredTokens.size} tokens, ${this.stats.rpcCalls} RPC calls, ${this.stats.cacheHits} cache hits`);
        } catch (error) {
          this.logError('Metadata enrichment', error);
          // Still return raw tokens
          this.discoveredTokens = this.sortTokens(tokens);
          const duration = Date.now() - this.stats.startTime;
          this.updateDiscoveryStatus(`⚠️ Partial: ${this.discoveredTokens.size} tokens (metadata failed)`, 100);
        }
      } else {
        this.updateDiscoveryStatus('❌ No tokens found. Check wallet connection and RPC.', 100);
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

  // ================================================================
  // PHASE 1: Known Major Tokens
  // ================================================================
  
  async phase1CheckKnownTokens(address) {
    const tokens = new Map();
    const knownTokens = this.getMajorPulseChainTokens();
    
    console.log(`[TokenDiscovery] Phase 1: Checking ${knownTokens.length} known tokens`);
    
    for (const tokenAddr of knownTokens) {
      try {
        const provider = await this.getProvider();
        const balance = await this.getERC20Balance(tokenAddr, address, provider);
        if (balance > this.config.dustThreshold) {
          tokens.set(tokenAddr, {
            address: tokenAddr,
            balance: balance,
            symbol: '???',
            name: 'Unknown Token',
            decimals: 18
          });
        }
      } catch (error) {
        // Ignore individual failures
      }
    }
    
    return tokens;
  }

  getMajorPulseChainTokens() {
    return [
      CONFIG?.CONTRACTS?.PRGX_TOKEN, // PurgeX
      CONFIG?.CONTRACTS?.WPLS, // Wrapped PLS
      // Add more as needed: USDC, USDT, DAI equivalents on PulseChain
    ].filter(addr => addr && this.isValidAddress(addr))
     .map(addr => addr.toLowerCase());
  }

  // ================================================================
  // PHASE 2: Factory-Based Token Discovery (FAST & COMPREHENSIVE)
  // ================================================================
  
  async phase2FactoryDiscovery(address) {
    const tokens = new Map();
    
    for (const factory of this.factories) {
      try {
        const pairAddresses = await this.getAllPairsFromFactory(factory.address);
        console.log(`[TokenDiscovery] Factory ${factory.name}: ${pairAddresses.length} pairs`);
        
        // Extract token addresses from pairs
        const tokenAddresses = new Set();
        const provider = await this.getProvider();
        
        for (const pairAddr of pairAddresses) {
          try {
            const tokensFromPair = await this.getTokensFromPair(pairAddr, provider);
            tokensFromPair.forEach(addr => tokenAddresses.add(addr));
          } catch (e) {
            // Skip problematic pairs
          }
        }
        
        console.log(`[TokenDiscovery] Factory ${factory.name}: ${tokenAddresses.size} unique tokens`);
        
        // Check balances for all tokens (batch)
        const addressesArray = Array.from(tokenAddresses);
        if (addressesArray.length > 0) {
          const balances = await this.batchCheckTokens(addressesArray, address, provider);
          for (const [addr, token] of balances) {
            tokens.set(addr, token);
          }
        }
        
      } catch (error) {
        this.log('warn', `Factory ${factory.name} failed:`, error.message);
        // Continue with other factories
      }
    }
    
    return tokens;
  }

  async getAllPairsFromFactory(factoryAddress) {
    const pairs = [];
    const provider = await this.getProvider();
    
    try {
      // Try allPairs() first (Uniswap V2 pattern)
      const result = await this.retryable(() => provider.call({
        to: factoryAddress,
        data: '0x0d0d30a2' // allPairs() signature
      }), provider);
      
      // Decode result: array of addresses (each 32 bytes)
      const addresses = this.decodeAddressArray(result);
      console.log(`[TokenDiscovery] allPairs returned ${addresses.length} pairs`);
      return addresses;
      
    } catch (error) {
      this.log('warn', `allPairs() failed for ${factoryAddress}:`, error.message);
      return [];
    }
  }

  decodeAddressArray(hexData) {
    const addresses = [];
    if (!hexData || hexData === '0x') return addresses;
    
    const data = hexData.replace('0x', '');
    // Each address is 32 bytes (64 hex chars) with 0-padding
    for (let i = 0; i < data.length; i += 64) {
      const addrHex = data.substr(i, 64);
      // Strip leading zeros to get address
      const stripped = addrHex.replace(/^0+/, '');
      if (stripped.length >= 40) { // Valid address has 40 hex chars
        addresses.push('0x' + stripped.slice(0, 40));
      }
    }
    return addresses;
  }

  async getTokensFromPair(pairAddress, provider) {
    const tokens = new Set();
    
    try {
      const [token0, token1] = await Promise.all([
        this.callContract(pairAddress, '0x0dfe1681', provider), // token0()
        this.callContract(pairAddress, '0xd21220a7', provider)  // token1()
      ]);
      
      if (token0 && this.isValidAddress(token0)) tokens.add(token0.toLowerCase());
      if (token1 && this.isValidAddress(token1)) tokens.add(token1.toLowerCase());
    } catch (error) {
      // Silently skip problematic pairs
    }
    
    return tokens;
  }

  async callContract(to, data, provider) {
    const result = await this.retryable(() => provider.call({
      to: to,
      data: data
    }), provider);
    
    // Return raw hex result (to be decoded by caller)
    return result;
  }

  // ================================================================
  // PHASE 3: Transfer Event Scan (FALLBACK)
  // ================================================================
  
  async phase3TransferScan(address) {
    const tokens = new Map();
    
    try {
      const provider = await this.getProvider();
      const currentBlock = await this.retryable(() => provider.getBlockNumber(), provider);
      const fromBlock = Math.max(0, currentBlock - this.config.transferBlockRange);
      
      this.log('info', `Scanning transfers from block ${fromBlock} to ${currentBlock}`);
      
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const paddedTopic = this.padTopic(address);
      
      // Get transfers TO user
      const logsTo = await this.retryable(() => provider.getLogs({
        address: null,
        topics: [transferTopic, null, paddedTopic],
        fromBlock: this.toHex(fromBlock),
        toBlock: this.toHex(currentBlock)
      }), provider);
      
      const tokenAddresses = new Set();
      for (const log of logsTo) {
        if (log.address) tokenAddresses.add(log.address.toLowerCase());
      }
      
      // If few tokens, also check FROM transfers
      if (tokenAddresses.size < 20) {
        const logsFrom = await this.retryable(() => provider.getLogs({
          address: null,
          topics: [transferTopic, paddedTopic, null],
          fromBlock: this.toHex(fromBlock),
          toBlock: this.toHex(currentBlock)
        }), provider);
        
        for (const log of logsFrom) {
          if (log.address) tokenAddresses.add(log.address.toLowerCase());
        }
      }
      
      if (tokenAddresses.size > 0) {
        const balances = await this.batchCheckTokens(Array.from(tokenAddresses), address, provider);
        for (const [addr, token] of balances) {
          tokens.set(addr, token);
        }
      }
      
    } catch (error) {
      this.logError('Transfer scan', error);
    }
    
    return tokens;
  }

  // ================================================================
  // MULTI-RPC SUPPORT
  // ================================================================
  
  async getProvider() {
    // Get provider from wallet (MetaMask, etc.)
    if (window.wallet?.provider) {
      return window.wallet.provider;
    }
    throw new Error('Wallet provider not available');
  }

  switchRpcEndpoint() {
    // Cycle through RPC endpoints (could also implement health checks)
    this.config.currentRpcIndex = (this.config.currentRpcIndex + 1) % this.config.rpcEndpoints.length;
    const newEndpoint = this.config.rpcEndpoints[this.config.currentRpcIndex];
    console.log(`[TokenDiscovery] Switching RPC to: ${newEndpoint}`);
    // Note: wallet provider may not allow endpoint switching without reconnecting
    return newEndpoint;
  }

  // ================================================================
  // BATCH OPERATIONS (SAME AS BEFORE)
  // ================================================================
  
  async batchCheckTokens(tokenAddresses, userAddress, provider) {
    const tokens = new Map();
    const addresses = [...new Set(tokenAddresses.map(addr => addr.toLowerCase()))]
      .filter(addr => this.isValidAddress(addr))
      .filter(addr => !this.isExcludedToken(addr));
    
    if (addresses.length === 0) return tokens;
    
    let batchSize = this.config.batchSize;
    let batchIndex = 0;
    
    while (batchIndex < addresses.length) {
      await this.processRequestQueue();
      
      const batch = addresses.slice(batchIndex, batchIndex + batchSize);
      
      try {
        const batchResults = await this.batchBalanceCalls(batch, userAddress, provider);
        
        let batchSuccessCount = 0;
        for (const result of batchResults) {
          if (result && result.balance > this.config.dustThreshold) {
            tokens.set(result.address, result);
            batchSuccessCount++;
          }
        }
        
        this.log('debug', `Batch ${Math.floor(batchIndex/batchSize)+1}: ${batchSuccessCount}/${batch.length}`);
        
        if (batchSuccessCount > 0) {
          batchSize = Math.min(this.config.maxBatchSize, batchSize + 2);
        }
        this.consecutiveErrors = 0;
        
      } catch (error) {
        this.consecutiveErrors++;
        this.stats.errors++;
        console.error(`[TokenDiscovery] Batch error: ${error.message}`);
        
        batchSize = Math.max(5, Math.floor(batchSize * 0.6));
        
        if (this.consecutiveErrors >= this.config.circuitBreakerThreshold) {
          console.warn(`[TokenDiscovery] Circuit breaker - pausing ${this.config.circuitBreakerPause}ms`);
          await this.delay(this.config.circuitBreakerPause);
          this.consecutiveErrors = 0;
          // Could switch RPC here
          // this.switchRpcEndpoint();
        }
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
          // Silent on individual failures
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
  // METADATA ENRICHMENT (SAME AS BEFORE)
  // ================================================================
  
  async enrichTokensWithMetadata(tokensMap) {
    const enriched = new Map();
    const tokenList = Array.from(tokensMap.values());
    
    const batchSize = 10;
    for (let i = 0; i < tokenList.length; i += batchSize) {
      await this.processRequestQueue();
      
      const batch = tokenList.slice(i, i + batchSize);
      const batchPromises = batch.map(async (token) => {
        try {
          const provider = await this.getProvider();
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
      
      this.setCached(cacheKey, metadata, 30 * 60 * 1000);
      this.stats.rpcCalls++;
      return metadata;
      
    } catch (error) {
      this.log('warn', `Metadata failed for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  // ================================================================
  // FILTERING & SORTING (SAME)
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
  // CACHING & UTILITIES (SAME AS BEFORE)
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
  // UI METHODS (unchanged)
  // ================================================================
  
  renderTokenTable(tokens) {
    const tokenTableBody = document.getElementById('tokenTableBody');
    if (!tokenTableBody) return;
    
    tokenTableBody.innerHTML = '';
    
    const sortedTokens = Array.from(tokens.values()).sort((a, b) => {
      if (b.balance > 0n && a.balance === 0n) return 1;
      if (a.balance > 0n && b.balance === 0n) return -1;
      if (b.balance !== a.balance) return b.balance > a.balance ? 1 : -1;
      return a.symbol.localeCompare(b.symbol);
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
    return balance * 0.0001; // Placeholder - integrate real price feed
  }

  estimatePRGX(token) {
    const usd = this.estimateUSD(token);
    return usd / 0.001; // Assuming PRGX ~ $0.001
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================
  
  isValidAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  isExcludedToken(addr) {
    return false; // No exclusions
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
        this.stats.rpcCalls++;
        return await fn();
      } catch (error) {
        lastError = error;
        this.consecutiveErrors++;
        
        if (this.isRateLimitError(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt) * 3 + Math.random() * 2000;
          this.log('warn', `Rate limited, retrying in ${Math.round(delay)}ms`);
          await this.delay(delay);
        } else if (this.isNonRetryable(error)) {
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
    return msg.includes('rate limit') || msg.includes('too many requests') || 
           msg.includes('429') || msg.includes('too many errors') || msg.includes('exceeded');
  }

  isNonRetryable(error) {
    const nonRetryable = ['invalid argument', 'contract not found', 'missing revert data', 'invalid address'];
    const msg = (error.message || '').toLowerCase();
    return nonRetryable.some(err => msg.includes(err));
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.tokenDiscovery = new TokenDiscovery();
