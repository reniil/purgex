// ================================================================
// TOKEN DISCOVERY - SIMPLE & FAST (Blockscout API)
// ================================================================
// Uses PulseChain Blockscout API: /api/v2/addresses/{address}/token-balances
// Returns all ERC-20 balances in one request - FAST & COMPREHENSIVE
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
      // Blockscout API endpoint
      blockscoutApi: CONFIG?.APIS?.BLOCKSCOUT_BASE || 'https://api.scan.pulsechain.com/api/v2',
      
      // Fallback: Transfer scan range (if API fails)
      transferBlockRange: 5000,
      
      // Delays
      batchDelay: 100,
      
      // Timeouts
      timeout: 15000,
      retryDelay: 1000,
      maxRetries: 2,
      
      // Dust threshold
      dustThreshold: 0n,
      
      // Concurrency
      maxConcurrent: 3
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
      
      // PHASE 1: Blockscout API (fastest & most comprehensive)
      this.updateDiscoveryStatus('Fetching token balances from Blockscout...', 20);
      let tokens = new Map();
      
      try {
        tokens = await this.phase1BlockscoutApi(address);
        console.log(`[TokenDiscovery] Phase 1 (Blockscout): ${tokens.size} tokens`);
      } catch (error) {
        this.logError('Blockscout API', error);
      }
      
      // PHASE 2: If API failed or returned few tokens, try transfer scan as fallback
      if (tokens.size < 5) {
        this.updateDiscoveryStatus('Fallback: scanning transfer events...', 60);
        try {
          const fallbackTokens = await this.phase2TransferScan(address);
          for (const [addr, token] of fallbackTokens) {
            if (!tokens.has(addr)) tokens.set(addr, token);
          }
          console.log(`[TokenDiscovery] Phase 2 (transfer scan): ${fallbackTokens.size} tokens (total: ${tokens.size})`);
        } catch (error) {
          this.logError('Transfer scan fallback', error);
        }
      }
      
      // Filter and sort
      if (tokens.size > 0) {
        const filtered = this.filterTokens(tokens);
        this.discoveredTokens = this.sortTokens(filtered);
        
        // Cache results
        this.setCached(cacheKey, this.discoveredTokens, this.cacheTTL);
        
        const duration = Date.now() - this.stats.startTime;
        this.updateDiscoveryStatus(`✅ Discovery complete: ${this.discoveredTokens.size} tokens (${Math.round(duration/1000)}s)`, 100);
        console.log(`[TokenDiscovery] Complete: ${this.discoveredTokens.size} tokens in ${Math.round(duration/1000)}s`);
      } else {
        this.updateDiscoveryStatus('❌ No tokens found. Check wallet connection.', 100);
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
  // PHASE 1: Blockscout API (Primary)
  // ================================================================
  
  async phase1BlockscoutApi(address) {
    const tokens = new Map();
    const url = `${this.config.blockscoutApi}/addresses/${address}/token-balances`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json'
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });
      
      if (!response.ok) {
        throw new Error(`Blockscout API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      // The API returns an array of token balance objects
      const balanceArray = Array.isArray(data) ? data : data.balances || data.token_balances || data;
      
      console.log(`[TokenDiscovery] Blockscout API returned ${balanceArray.length} token entries`);
      
      for (const item of balanceArray) {
        try {
          // Extract token info from Blockscout response format
          // The response has two possible structures based on the example:
          // 1. { token: {...}, value: "10000", token_id: "..." }
          // 2. { token_instance: {...}, value: "...", token: {...} }
          
          let tokenInfo, balanceStr;
          
          if (item.token) {
            // Format 1: { token: {...}, value: "10000", ... }
            tokenInfo = item.token;
            balanceStr = item.value;
          } else if (item.token_instance && item.token) {
            // Format 2: { token_instance: {...}, token: {...}, value: "..." }
            tokenInfo = item.token;
            balanceStr = item.value;
          } else {
            // Unknown format, skip
            continue;
          }
          
          if (!tokenInfo?.address_hash) continue;
          
          const tokenAddress = tokenInfo.address_hash.toLowerCase();
          const balance = BigInt(balanceStr || '0');
          
          if (balance <= this.config.dustThreshold) continue;
          
          // Get decimals
          let decimals = 18;
          if (tokenInfo.decimals) {
            decimals = parseInt(tokenInfo.decimals, 10);
          } else if (tokenInfo.token?.decimals) {
            decimals = parseInt(tokenInfo.token.decimals, 10);
          }
          
          tokens.set(tokenAddress, {
            address: tokenAddress,
            balance: balance,
            symbol: tokenInfo.symbol || '???',
            name: tokenInfo.name || 'Unknown Token',
            decimals: decimals
          });
          
        } catch (e) {
          // Skip individual token errors
          console.warn('[TokenDiscovery] Failed to parse token from Blockscout:', e);
        }
      }
      
      return tokens;
      
    } catch (error) {
      this.stats.errors++;
      console.error('[TokenDiscovery] Blockscout API error:', error);
      throw error;
    }
  }

  // ================================================================
  // PHASE 2: Transfer Event Scan (Fallback)
  // ================================================================
  
  async phase2TransferScan(address) {
    const tokens = new Map();
    
    try {
      const provider = window.wallet?.provider;
      if (!provider) throw new Error('Wallet provider not available');
      
      const currentBlock = await this.retryable(() => provider.getBlockNumber(), provider);
      const fromBlock = Math.max(0, currentBlock - this.config.transferBlockRange);
      
      this.log('info', `Scanning transfers from block ${fromBlock} to ${currentBlock}`);
      
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const paddedTopic = this.padTopic(address);
      
      const logs = await this.retryable(() => provider.getLogs({
        address: null,
        topics: [transferTopic, null, paddedTopic],
        fromBlock: this.toHex(fromBlock),
        toBlock: this.toHex(currentBlock)
      }), provider);
      
      const tokenAddresses = new Set();
      for (const log of logs) {
        if (log.address) tokenAddresses.add(log.address.toLowerCase());
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
  // BATCH OPERATIONS (for fallback)
  // ================================================================
  
  async batchCheckTokens(tokenAddresses, userAddress, provider) {
    const tokens = new Map();
    const addresses = [...new Set(tokenAddresses.map(addr => addr.toLowerCase()))]
      .filter(addr => this.isValidAddress(addr))
      .filter(addr => !this.isExcludedToken(addr));
    
    if (addresses.length === 0) return tokens;
    
    let batchSize = this.config.maxConcurrent;
    let batchIndex = 0;
    
    while (batchIndex < addresses.length) {
      await this.processRequestQueue();
      
      const batch = addresses.slice(batchIndex, batchIndex + batchSize);
      
      try {
        const batchResults = await this.batchBalanceCalls(batch, userAddress, provider);
        
        for (const result of batchResults) {
          if (result && result.balance > this.config.dustThreshold) {
            tokens.set(result.address, result);
          }
        }
        
      } catch (error) {
        console.error('[TokenDiscovery] Batch error:', error.message);
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
    
    const chunkPromises = tokenAddresses.map(async (tokenAddr) => {
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
    return chunkResults.filter(r => r !== null);
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
           msg.includes('429') || msg.includes('too many errors');
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
  // UI INTEGRATION METHODS
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
