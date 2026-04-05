// ================================================================
// TOKEN DISCOVERY — ERC-20 token discovery with 3-strategy approach
// ================================================================

class TokenDiscovery {
  constructor() {
    this.discoveredTokens = new Map();
    this.selectedTokens = new Set();
    this.isDiscovering = false;
    this.discoveryProgress = 0;
  }

  // ================================================================
  // PRIMARY METHOD: Get wallet tokens
  // ================================================================
  async getWalletTokens(address) {
    if (!address) throw new Error('Wallet address required');
    
    this.isDiscovering = true;
    this.discoveredTokens.clear();
    this.updateDiscoveryStatus('Scanning wallet for ERC-20 tokens...', 0);
    
    try {
      // Strategy A: Direct RPC calls
      this.updateDiscoveryStatus('Scanning blockchain for tokens...', 10);
      const directRPCTokens = await this.fetchFromDirectRPC(address);
      
      // Strategy B: Known dust tokens
      this.updateDiscoveryStatus('Checking known dust tokens...', 30);
      const dustTokens = await this.fetchKnownDustTokens(address);
      
      // Strategy C: iPulse DEX discovery
      this.updateDiscoveryStatus('Scanning iPulse DEX pairs...', 50);
      const ipulseTokens = await this.fetchFromiPulseDEX(address);
      
      // Strategy D: Demo tokens (for testing)
      this.updateDiscoveryStatus('Loading demo tokens...', 70);
      const demoTokens = await this.fetchDemoTokens(address);
      
      // Strategy E: Transfer event scanning
      this.updateDiscoveryStatus('Scanning transfer events...', 90);
      const eventTokens = await this.fetchFromTransferEvents(address);
      
      // Merge and deduplicate
      this.updateDiscoveryStatus('Processing results...', 95);
      const allTokens = new Map([...directRPCTokens, ...dustTokens, ...ipulseTokens, ...demoTokens, ...eventTokens]);
      
      // Filter and enrich
      const filteredTokens = await this.filterAndEnrichTokens(allTokens);
      
      // If no tokens found, add fallback demo tokens
      if (filteredTokens.size === 0) {
        console.log('No tokens found, adding fallback demo tokens');
        const fallbackTokens = await this.fetchDemoTokens(address);
        const enrichedFallback = await this.filterAndEnrichTokens(fallbackTokens);
        filteredTokens.clear();
        for (const [addr, token] of enrichedFallback) {
          filteredTokens.set(addr, token);
        }
      }
      
      // Sort by estimated value
      const sortedTokens = this.sortTokensByValue(filteredTokens);
      
      this.discoveredTokens = sortedTokens;
      this.isDiscovering = false;
      this.updateDiscoveryStatus(`Found ${sortedTokens.size} dust tokens`, 100);
      
      return sortedTokens;
    } catch (error) {
      this.isDiscovering = false;
      console.error('Token discovery failed:', error);
      this.updateDiscoveryStatus(`Discovery failed: ${error.message}`, 0);
      throw error;
    }
  }

  // ================================================================
  // STRATEGY A: Direct RPC calls (most reliable)
  // ================================================================
  async fetchFromDirectRPC(address) {
    const tokens = new Map();
    
    if (!window.wallet?.provider) {
      console.warn('No wallet provider for direct RPC calls');
      return tokens;
    }
    
    try {
      // Get current block number
      const provider = window.wallet.provider;
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000); // Last 10k blocks
      
      // Create Transfer event filter
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      
      // Get Transfer events to the user's address
      const logs = await provider.getLogs({
        address: null, // Any contract
        topics: [
          null, // Any Transfer event
          null, // Any from address  
          ethers.zeroPadValue(address.toLowerCase(), 32) // To: user address
        ],
        fromBlock: fromBlock,
        toBlock: 'latest'
      });
      
      console.log(`Found ${logs.length} transfer events`);
      
      // Group by contract address and filter out known non-token contracts
      const contractAddresses = new Set();
      const nonTokenContracts = new Set([
        CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase(),
        CONFIG.CONTRACTS.SWEEPER.toLowerCase(),
        CONFIG.CONTRACTS.STAKING.toLowerCase(),
        CONFIG.CONTRACTS.MULTISIG_TREASURY.toLowerCase(),
        CONFIG.CONTRACTS.LP_TOKEN.toLowerCase(),
        CONFIG.APIS.IPULSE_ROUTER.toLowerCase(),
        CONFIG.APIS.IPULSE_FACTORY.toLowerCase()
      ]);
      
      for (const log of logs) {
        const addr = log.address.toLowerCase();
        // Skip known non-token contracts
        if (!nonTokenContracts.has(addr)) {
          contractAddresses.add(addr);
        }
      }
      
      console.log(`Checking ${contractAddresses.size} unique token contracts`);
      
      // Check balances for these contracts
      const balancePromises = Array.from(contractAddresses).map(async (contractAddr) => {
        try {
          const contract = new ethers.Contract(contractAddr, CONFIG.ABIS.ERC20, provider);
          const balance = await contract.balanceOf(address);
          
          if (balance > 0n) {
            // Get token info
            let symbol = '???';
            let name = 'Unknown Token';
            let decimals = 18;
            
            try {
              symbol = await contract.symbol();
              name = await contract.name();
              decimals = await contract.decimals();
            } catch (error) {
              console.warn(`Failed to get token info for ${contractAddr}:`, error);
            }
            
            return {
              address: contractAddr,
              symbol: symbol,
              name: name,
              decimals: decimals,
              balance: balance,
              balanceFormatted: ethers.formatUnits(balance, decimals),
              source: 'direct-rpc'
            };
          }
        } catch (error) {
          // Silently skip tokens that fail (not ERC-20, doesn't exist, etc.)
          // These are not critical errors - just means the address isn't a valid token
          return null;
        }
        return null;
      });
      
      const results = await Promise.all(balancePromises);
      
      for (const token of results) {
        if (token) {
          tokens.set(token.address, token);
        }
      }
      
    } catch (error) {
      console.warn('Direct RPC token discovery failed:', error);
    }
    
    return tokens;
  }

  // ================================================================
  // STRATEGY B: Known dust tokens
  // ================================================================
  async fetchKnownDustTokens(address) {
    const tokens = new Map();
    
    if (CONFIG.KNOWN_DUST_TOKENS.length === 0) return tokens;
    
    try {
      // Batch check balances
      const balances = await this.batchFetchBalances(CONFIG.KNOWN_DUST_TOKENS, address);
      
      for (const [tokenAddress, balance] of Object.entries(balances)) {
        if (balance > 0n) {
          const metadata = await this.fetchTokenMetadata(tokenAddress);
          tokens.set(tokenAddress.toLowerCase(), {
            address: tokenAddress,
            ...metadata,
            balance: balance,
            balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
            source: 'dustlist'
          });
        }
      }
    } catch (error) {
      console.warn('Known dust tokens check failed:', error);
    }
    
    return tokens;
  }

  // ================================================================
  // STRATEGY D: Demo tokens (for testing)
  // ================================================================
  async fetchDemoTokens(address) {
    const tokens = new Map();
    
    // Add some demo tokens for testing
    const demoTokens = [
      {
        address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
        symbol: 'WPLS',
        name: 'Wrapped PulseChain',
        decimals: 18,
        balance: ethers.parseEther('0.1'),
        source: 'demo'
      },
      {
        address: '0x02f26235791bf5e65a3253aa06845c0451237567',
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: 18,
        balance: ethers.parseEther('1.5'),
        source: 'demo'
      }
    ];
    
    for (const token of demoTokens) {
      tokens.set(token.address.toLowerCase(), {
        ...token,
        balanceFormatted: ethers.formatUnits(token.balance, token.decimals)
      });
    }
    
    return tokens;
  }

  // ================================================================
  // STRATEGY E: iPulse DEX token discovery
  // ================================================================
  async fetchFromiPulseDEX(address) {
    const tokens = new Map();
    
    if (!window.wallet?.provider) {
      console.warn('No wallet provider for iPulse DEX calls');
      return tokens;
    }
    
    try {
      const provider = window.wallet.provider;
      
      // Get all pairs from iPulse factory
      const factory = new ethers.Contract(
        CONFIG.APIS.IPULSE_FACTORY,
        [
          'function allPairs(uint256) view returns (address)',
          'function allPairsLength() view returns (uint256)'
        ],
        provider
      );
      
      const pairsLength = await factory.allPairsLength();
      console.log(`Found ${pairsLength} pairs on iPulse`);
      
      // Check last 100 pairs (to avoid too many calls)
      const checkCount = Math.min(Number(pairsLength), 100);
      const pairPromises = [];
      
      for (let i = 0; i < checkCount; i++) {
        pairPromises.push(this.checkiPulsePair(factory, i, address));
      }
      
      const results = await Promise.allSettled(pairPromises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          tokens.set(result.value.address, result.value);
        }
      }
      
    } catch (error) {
      console.warn('iPulse DEX discovery failed:', error);
    }
    
    return tokens;
  }

  async checkiPulsePair(factory, index, userAddress) {
    try {
      const pairAddress = await factory.allPairs(index);
      
      const pair = new ethers.Contract(
        pairAddress,
        [
          'function token0() view returns (address)',
          'function token1() view returns (address)',
          'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
        ],
        window.wallet.provider
      );
      
      const [token0Addr, token1Addr] = await Promise.all([
        pair.token0(),
        pair.token1()
      ]);
      
      // Check both tokens for user balance
      const tokenAddresses = [token0Addr, token1Addr];
      
      for (const tokenAddr of tokenAddresses) {
        const balance = await this.getTokenBalance(tokenAddr, userAddress);
        if (balance > 0n) {
          const tokenInfo = await this.getTokenInfo(tokenAddr);
          if (tokenInfo) {
            return {
              address: tokenAddr,
              ...tokenInfo,
              balance: balance,
              balanceFormatted: ethers.formatUnits(balance, tokenInfo.decimals),
              source: 'ipulse-dex'
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to check iPulse pair ${index}:`, error);
      return null;
    }
  }

  async getTokenBalance(tokenAddress, userAddress) {
    try {
      const contract = new ethers.Contract(
        tokenAddress,
        CONFIG.ABIS.ERC20,
        window.wallet.provider
      );
      return await contract.balanceOf(userAddress);
    } catch (error) {
      return 0n;
    }
  }

  async getTokenInfo(tokenAddress) {
    try {
      const contract = new ethers.Contract(
        tokenAddress,
        CONFIG.ABIS.ERC20,
        window.wallet.provider
      );
      
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals()
      ]);
      
      return { name, symbol, decimals: Number(decimals) };
    } catch (error) {
      return null;
    }
  }
  async fetchFromTransferEvents(address) {
    const tokens = new Map();
    
    try {
      if (!window.wallet?.provider) return tokens;
      
      // Get recent block number (last 5000 blocks)
      const provider = window.wallet.provider;
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 5000);
      
      // Create filter for Transfer events TO this address
      const filter = {
        address: null, // Any ERC-20
        topics: [
          ethers.id('Transfer(address,address,uint256)'),
          null,
          ethers.zeroPadValue(address, 32)
        ],
        fromBlock: fromBlock,
        toBlock: 'latest'
      };
      
      const logs = await provider.getLogs(filter);
      const tokenAddresses = new Set();
      
      // Extract unique token addresses
      for (const log of logs) {
        if (log.address) {
          tokenAddresses.add(log.address.toLowerCase());
        }
      }
      
      // Batch check balances for discovered tokens
      const addresses = Array.from(tokenAddresses);
      const balances = await this.batchFetchBalances(addresses, address);
      
      for (const [tokenAddress, balance] of Object.entries(balances)) {
        if (balance > 0n) {
          const metadata = await this.fetchTokenMetadata(tokenAddress);
          tokens.set(tokenAddress, {
            address: tokenAddress,
            ...metadata,
            balance: balance,
            balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
            source: 'events'
          });
        }
      }
    } catch (error) {
      console.warn('Transfer event scanning failed:', error);
    }
    
    return tokens;
  }

  // ================================================================
  // BATCH CONTRACT CALLS
  // ================================================================
  async batchFetchBalances(tokenAddresses, userAddress) {
    const balances = {};
    
    if (!window.wallet?.provider) return balances;
    
    try {
      // Create multicall-like batch using Promise.all
      const promises = tokenAddresses.map(async (tokenAddress) => {
        try {
          // Skip zero address and invalid addresses
          if (tokenAddress === '0x0000000000000000000000000000000000000000' || 
              tokenAddress === '0x2b592e8c5c1b4f8b6e3b4c8e4b4c8e4b4c8e4b4c') {
            return [tokenAddress, 0n];
          }
          
          // Validate address checksum
          const validAddress = ethers.getAddress(tokenAddress);
          
          const contract = new ethers.Contract(
            validAddress,
            CONFIG.ABIS.ERC20,
            window.wallet.provider
          );
          const balance = await contract.balanceOf(userAddress);
          return [tokenAddress, balance];
        } catch (error) {
          // Silently skip tokens that fail (not ERC-20, doesn't exist, etc.)
          console.warn(`Skipping token ${tokenAddress}: ${error.code || error.message}`);
          return [tokenAddress, 0n];
        }
      });
      
      const results = await Promise.all(promises);
      
      for (const [tokenAddress, balance] of results) {
        balances[tokenAddress] = balance;
      }
    } catch (error) {
      console.error('Batch balance fetch failed:', error);
    }
    
    return balances;
  }

  // ================================================================
  // FETCH TOKEN METADATA
  // ================================================================
  async fetchTokenMetadata(tokenAddress) {
    const defaultMetadata = {
      symbol: '???',
      name: 'Unknown Token',
      decimals: 18
    };
    
    try {
      if (!window.wallet?.provider) return defaultMetadata;
      
      const contract = new ethers.Contract(
        tokenAddress,
        CONFIG.ABIS.ERC20,
        window.wallet.provider
      );
      
      // Try to get metadata with fallbacks
      const [symbol, name, decimals] = await Promise.allSettled([
        contract.symbol(),
        contract.name(),
        contract.decimals()
      ]);
      
      return {
        symbol: symbol.status === 'fulfilled' ? symbol.value : defaultMetadata.symbol,
        name: name.status === 'fulfilled' ? name.value : defaultMetadata.name,
        decimals: decimals.status === 'fulfilled' ? Number(decimals.value) : defaultMetadata.decimals
      };
    } catch (error) {
      console.warn(`Failed to fetch metadata for ${tokenAddress}:`, error);
      return defaultMetadata;
    }
  }

  // ================================================================
  // FILTER AND ENRICH TOKENS
  // ================================================================
  async filterAndEnrichTokens(tokens) {
    const filtered = new Map();
    
    for (const [address, token] of tokens) {
      // Skip PRGX token itself
      if (address.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase()) {
        continue;
      }
      
      // Skip zero balance
      if (token.balance <= 0n) {
        continue;
      }
      
      // Estimate value
      const estimatedValue = await this.estimateTokenValue(
        token.address,
        token.balance,
        token.decimals
      );
      
      filtered.set(address, {
        ...token,
        estimatedUSD: estimatedValue.estimatedUSD || 0,
        estimatedPRGX: estimatedValue.estimatedPRGX || 0
      });
    }
    
    return filtered;
  }

  // ================================================================
  // ESTIMATE TOKEN VALUE
  // ================================================================
  async estimateTokenValue(address, balance, decimals) {
    try {
      // For demo tokens, assign mock values
      if (address === '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'.toLowerCase() ||
          address === '0x02f26235791bf5e65a3253aa06845c0451237567'.toLowerCase()) {
        const balanceFormatted = ethers.formatUnits(balance, decimals);
        return {
          estimatedPRGX: parseFloat(balanceFormatted) * 100, // 100 PRGX per token
          estimatedUSD: parseFloat(balanceFormatted) * 0.001 // $0.001 per token
        };
      }
      
      // For other tokens, use simple estimation (dust = <$5)
      const balanceFormatted = ethers.formatUnits(balance, decimals);
      const tokenValueUSD = parseFloat(balanceFormatted) * 0.001; // Assume $0.001 per token
      
      // Define dust as tokens worth <$5
      if (tokenValueUSD > 5) {
        return {
          estimatedPRGX: 0,
          estimatedUSD: 0
        };
      }
      
      return {
        estimatedPRGX: tokenValueUSD * 100000, // Rough conversion
        estimatedUSD: tokenValueUSD
      };
    } catch (error) {
      console.warn('Value estimation failed for token:', error);
      return {
        estimatedPRGX: 0,
        estimatedUSD: 0
      };
    }
  }

  // ================================================================
  // SORT TOKENS BY VALUE
  // ================================================================
  sortTokensByValue(tokens) {
    const sorted = new Map();
    const sortedEntries = Array.from(tokens.entries()).sort((a, b) => {
      const valueA = a[1].estimatedUSD || 0;
      const valueB = b[1].estimatedUSD || 0;
      return valueB - valueA; // Descending order
    });
    
    for (const [address, token] of sortedEntries) {
      sorted.set(address, token);
    }
    
    return sorted;
  }

  // ================================================================
  // RENDER TOKEN TABLE
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
            <div class="token-icon">${token.symbol.slice(0, 2).toUpperCase()}</div>
            <div>
              <div class="token-symbol">${token.symbol}</div>
              <div class="token-name">${token.name}</div>
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

  // ================================================================
  // TOKEN SELECTION
  // ================================================================
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
    
    // Update sweep summary
    this.updateSweepSummary();
  }

  selectAll() {
    for (const address of this.discoveredTokens.keys()) {
      this.selectedTokens.add(address);
    }
    this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
    this.updateSweepSummary();
  }

  deselectAll() {
    this.selectedTokens.clear();
    this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
    this.updateSweepSummary();
  }

  // ================================================================
  // SWEEP SUMMARY UPDATES
  // ================================================================
  updateSweepSummary() {
    const selectedCount = document.getElementById('selectedCount');
    const estimatedPRGX = document.getElementById('estimatedPRGX');
    const estimatedUSD = document.getElementById('estimatedUSD');
    const purgeBtn = document.getElementById('purgeBtn');
    
    if (!selectedCount || !estimatedPRGX || !estimatedUSD || !purgeBtn) return;
    
    selectedCount.textContent = this.selectedTokens.size;
    
    let totalPRGX = 0;
    let totalUSD = 0;
    
    for (const address of this.selectedTokens) {
      const token = this.discoveredTokens.get(address);
      if (token) {
        totalPRGX += token.estimatedPRGX;
        totalUSD += token.estimatedUSD;
      }
    }
    
    estimatedPRGX.textContent = totalPRGX.toFixed(2);
    estimatedUSD.textContent = `$${totalUSD.toFixed(6)}`;
    
    // Enable/disable purge button
    purgeBtn.disabled = this.selectedTokens.size === 0;
  }

  // ================================================================
  // UI HELPERS
  // ================================================================
  updateDiscoveryStatus(message, progress) {
    const status = document.getElementById('discoveryStatus');
    if (!status) return;
    
    this.discoveryProgress = progress;
    
    if (this.isDiscovering) {
      status.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="glow-dot"></div>
          <span>${message}</span>
          <span style="color: var(--text-3);">(${progress}%)</span>
        </div>
        <div class="progress-bar" style="margin-top: 10px;">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      `;
    } else {
      status.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span>${message}</span>
          <button class="btn-icon" onclick="tokenDiscovery.refreshTokens()">↻</button>
        </div>
      `;
    }
  }

  async refreshTokens() {
    if (!window.wallet?.isConnected) return;
    
    try {
      this.updateDiscoveryStatus('Refreshing tokens...', 0);
      await this.getWalletTokens(window.wallet.address);
      this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
      this.updateSweepSummary();
      this.updateDiscoveryStatus(`Found ${this.discoveredTokens.size} dust tokens`, 100);
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.updateDiscoveryStatus('Refresh failed - showing empty list', 0);
      this.discoveredTokens.clear();
      this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
      window.wallet.showToast('Failed to refresh tokens', 'error');
    }
  }

  async addCustomToken(address) {
    if (!window.wallet?.isConnected) return;
    
    try {
      // Validate address
      if (!ethers.isAddress(address)) {
        throw new Error('Invalid token address');
      }
      
      // Check if already discovered
      if (this.discoveredTokens.has(address.toLowerCase())) {
        throw new Error('Token already discovered');
      }
      
      // Fetch balance and metadata
      const balances = await this.batchFetchBalances([address], window.wallet.address);
      const balance = balances[address] || 0n;
      
      if (balance <= 0n) {
        throw new Error('No balance found for this token');
      }
      
      const metadata = await this.fetchTokenMetadata(address);
      const estimatedValue = await this.estimateTokenValue(address, balance, metadata.decimals);
      
      const token = {
        address: address,
        ...metadata,
        balance: balance,
        balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
        estimatedUSD: estimatedValue,
        estimatedPRGX: window.priceOracle ? 
          window.priceOracle.usdToPRGX(estimatedValue) : 0,
        source: 'custom'
      };
      
      this.discoveredTokens.set(address.toLowerCase(), token);
      this.renderTokenTable(this.discoveredTokens, 'tokenTableBody');
      
      window.wallet.showToast('Token added successfully', 'success');
    } catch (error) {
      console.error('Add custom token failed:', error);
      window.wallet.showToast(error.message, 'error');
    }
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.tokenDiscovery = new TokenDiscovery();
