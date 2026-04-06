// ================================================================
// TOKEN DISCOVERY MODULE - COMPREHENSIVE VERSION
// ================================================================

class TokenDiscovery {
  constructor() {
    this.discoveredTokens = new Map();
    this.isDiscovering = false;
    this.discoveryProgress = 0;
  }

  // ================================================================
  // PRIMARY METHOD: Get wallet tokens
  // ================================================================
  async getWalletTokens(address) {
    if (!address) throw new Error('Wallet address required');
    
    return await this.discoverTokens(address);
  }

  async discoverTokens(address) {
    this.isDiscovering = true;
    this.updateDiscoveryStatus('Starting comprehensive token discovery...', 0);
    
    try {
      // Strategy A: Aggressive blockchain scanning - ALL tokens
      this.updateDiscoveryStatus('Scanning ALL tokens in wallet...', 20);
      const allTokens = await this.fetchAllTokens(address);
      
      // Strategy B: PulseX factory enumeration - ALL pairs
      this.updateDiscoveryStatus('Enumerating PulseX liquidity pairs...', 40);
      const pulseXTokens = await this.fetchAllPulseXPairs(address);
      
      // Strategy C: Popular token addresses - comprehensive list
      this.updateDiscoveryStatus('Checking known PulseChain tokens...', 60);
      const knownTokens = await this.fetchKnownPulseChainTokens(address);
      
      // Strategy D: Transfer events - extended range
      this.updateDiscoveryStatus('Scanning transfer history...', 80);
      const eventTokens = await this.fetchFromTransferEvents(address);
      
      // Merge all discovered tokens
      this.updateDiscoveryStatus('Processing results...', 95);
      const mergedTokens = new Map([...allTokens, ...pulseXTokens, ...knownTokens, ...eventTokens]);
      
      // Filter for display (keep ALL tokens, just filter out excluded ones)
      const displayTokens = await this.filterForDisplay(mergedTokens);
      
      // Sort by relevance
      const sortedTokens = this.sortTokensByRelevance(displayTokens);
      
      this.discoveredTokens = sortedTokens;
      this.isDiscovering = false;
      this.updateDiscoveryStatus(`Found ${sortedTokens.size} tokens`, 100);
      
      return sortedTokens;
    } catch (error) {
      this.isDiscovering = false;
      console.error('Token discovery failed:', error);
      this.updateDiscoveryStatus(`Discovery failed: ${error.message}`, 0);
      throw error;
    }
  }

  // ================================================================
  // STRATEGY A: Aggressive blockchain scanning - ALL tokens
  // ================================================================
  async fetchAllTokens(address) {
    const tokens = new Map();
    
    if (!window.wallet?.provider) {
      console.warn('No wallet provider for aggressive scanning');
      return tokens;
    }
    
    try {
      const provider = window.wallet.provider;
      
      // Scan much larger block range for comprehensive discovery
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000); // Reduced to 50k blocks to avoid RPC limits
      
      // Get all Transfer events (not just to user, but from user too)
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      
      try {
        const logs = await provider.getLogs({
          address: null,
          topics: [
            transferTopic,
            [
              ethers.zeroPadValue(address.toLowerCase(), 32), // From: user
              null
            ],
            null
          ],
          fromBlock: fromBlock,
          toBlock: 'latest'
        });
        
        // Also get Transfer events TO user
        const logsTo = await provider.getLogs({
          address: null,
          topics: [
            transferTopic,
            null,
            ethers.zeroPadValue(address.toLowerCase(), 32) // To: user
          ],
          fromBlock: fromBlock,
          toBlock: 'latest'
        });
        
        // Combine all logs
        const allLogs = [...logs, ...logsTo];
        const tokenAddresses = new Set();
        
        for (const log of allLogs) {
          if (log.address) {
            tokenAddresses.add(log.address.toLowerCase());
          }
        }
        
        console.log(`Found ${tokenAddresses.size} unique token addresses in ${allLogs.length} transfer events`);
        
        // Check ALL these tokens for balance (even if 0)
        const addresses = Array.from(tokenAddresses);
        const balances = await this.batchFetchBalances(addresses, address);
        
        for (const [tokenAddress, balance] of Object.entries(balances)) {
          const metadata = await this.fetchTokenMetadata(tokenAddress);
          tokens.set(tokenAddress, {
            address: tokenAddress,
            ...metadata,
            balance: balance,
            balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
            source: 'aggressive-scan'
          });
        }
      } catch (rpcError) {
        console.warn('RPC error in aggressive scanning, falling back to limited scan:', rpcError);
        // Fallback: just scan recent blocks
        const recentFromBlock = Math.max(0, currentBlock - 10000);
        
        const logs = await provider.getLogs({
          address: null,
          topics: [
            transferTopic,
            null,
            ethers.zeroPadValue(address.toLowerCase(), 32)
          ],
          fromBlock: recentFromBlock,
          toBlock: 'latest'
        });
        
        const tokenAddresses = new Set();
        for (const log of logs) {
          if (log.address) {
            tokenAddresses.add(log.address.toLowerCase());
          }
        }
        
        const addresses = Array.from(tokenAddresses);
        const balances = await this.batchFetchBalances(addresses, address);
        
        for (const [tokenAddress, balance] of Object.entries(balances)) {
          const metadata = await this.fetchTokenMetadata(tokenAddress);
          tokens.set(tokenAddress, {
            address: tokenAddress,
            ...metadata,
            balance: balance,
            balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
            source: 'limited-scan'
          });
        }
      }
      
      return tokens;
    } catch (error) {
      console.warn('Aggressive token scanning failed:', error);
      return tokens;
    }
  }

  // ================================================================
  // STRATEGY B: PulseX factory enumeration - ALL pairs
  // ================================================================
  async fetchAllPulseXPairs(address) {
    const tokens = new Map();
    
    if (!window.wallet?.provider) {
      console.warn('No wallet provider for PulseX scanning');
      return tokens;
    }
    
    try {
      const provider = window.wallet.provider;
      
      // PulseX Factory address
      const pulseXFactory = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02';
      
      const factory = new ethers.Contract(
        pulseXFactory,
        [
          'function allPairs(uint256) view returns (address)',
          'function allPairsLength() view returns (uint256)',
          'function getPair(address tokenA, address tokenB) view returns (address)'
        ],
        provider
      );
      
      try {
        // Get total number of pairs
        const totalPairs = await factory.allPairsLength();
        console.log(`PulseX has ${totalPairs.toString()} pairs to scan`);
        
        // Limit to first 1000 pairs to avoid RPC timeouts
        const pairsToScan = Math.min(Number(totalPairs), 1000);
        
        // Scan pairs (with batching to avoid RPC limits)
        const batchSize = 50; // Smaller batch size
        const allTokenAddresses = new Set();
        
        for (let i = 0; i < pairsToScan; i += batchSize) {
          const endIndex = Math.min(i + batchSize, pairsToScan);
          const batchPromises = [];
          
          for (let j = i; j < endIndex; j++) {
            batchPromises.push(factory.allPairs(j));
          }
          
          try {
            const pairAddresses = await Promise.all(batchPromises);
            
            for (const pairAddress of pairAddresses) {
              try {
                const pair = new ethers.Contract(
                  pairAddress,
                  [
                    'function token0() view returns (address)',
                    'function token1() view returns (address)'
                  ],
                  provider
                );
                
                const [token0Addr, token1Addr] = await Promise.all([
                  pair.token0(),
                  pair.token1()
                ]);
                
                allTokenAddresses.add(token0Addr.toLowerCase());
                allTokenAddresses.add(token1Addr.toLowerCase());
              } catch (error) {
                console.warn(`Failed to get tokens for pair ${pairAddress}:`, error);
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch batch ${i}-${endIndex}:`, error);
          }
          
          // Add delay to avoid rate limiting
          if (i + batchSize < pairsToScan) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        console.log(`Found ${allTokenAddresses.size} unique tokens from PulseX pairs`);
        
        // Check balances for all these tokens
        const addresses = Array.from(allTokenAddresses);
        const balances = await this.batchFetchBalances(addresses, address);
        
        for (const [tokenAddress, balance] of Object.entries(balances)) {
          const metadata = await this.fetchTokenMetadata(tokenAddress);
          tokens.set(tokenAddress, {
            address: tokenAddress,
            ...metadata,
            balance: balance,
            balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
            source: 'pulsex-pairs'
          });
        }
      } catch (factoryError) {
        console.warn('PulseX factory call failed, skipping PulseX scanning:', factoryError);
      }
      
      return tokens;
    } catch (error) {
      console.warn('PulseX pair enumeration failed:', error);
      return tokens;
    }
  }

  // ================================================================
  // STRATEGY C: Known PulseChain tokens - comprehensive list
  // ================================================================
  async fetchKnownPulseChainTokens(address) {
    const tokens = new Map();
    
    if (!window.wallet?.provider) {
      console.warn('No wallet provider for known PulseChain tokens');
      return tokens;
    }
    
    try {
      // Common PulseChain tokens to check (excluding native and major tokens)
      const knownTokenAddresses = [
        '0x95a77ee61e7444c3a3c2a3570d3e4d7a3c3c3c', // Example token 1
        '0x1234567890123456789012345678901234567890', // Example token 2
        '0xabcdef1234567890abcdef1234567890abcdef123456', // Example token 3
        // Add more real PulseChain token addresses as needed
      ];
      
      for (const tokenAddress of knownTokenAddresses) {
        try {
          const balance = await this.getTokenBalance(tokenAddress, address);
          if (balance > 0n) {
            const tokenInfo = await this.getTokenInfo(tokenAddress);
            if (tokenInfo) {
              tokens.set(tokenAddress, {
                address: tokenAddress,
                ...tokenInfo,
                balance: balance,
                balanceFormatted: ethers.formatUnits(balance, tokenInfo.decimals),
                source: 'known-pulsechain'
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to check known PulseChain token ${tokenAddress}:`, error);
        }
      }
      
      return tokens;
    } catch (error) {
      console.warn('Known PulseChain tokens discovery failed:', error);
      return tokens;
    }
  }

  // ================================================================
  // STRATEGY D: Transfer event scanning
  // ================================================================
  async fetchFromTransferEvents(address) {
    const tokens = new Map();
    
    if (!window.wallet?.provider) {
      console.warn('No wallet provider for transfer event scanning');
      return tokens;
    }
    
    try {
      const provider = window.wallet.provider;
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000); // Extended range
      
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      
      const logs = await provider.getLogs({
        address: null,
        topics: [
          transferTopic,
          null,
          ethers.zeroPadValue(address.toLowerCase(), 32)
        ],
        fromBlock: fromBlock,
        toBlock: 'latest'
      });
      
      const tokenAddresses = new Set();
      
      for (const log of logs) {
        if (log.address) {
          tokenAddresses.add(log.address.toLowerCase());
        }
      }
      
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
            source: 'transfer-events'
          });
        }
      }
      
      return tokens;
    } catch (error) {
      console.warn('Transfer event scanning failed:', error);
      return tokens;
    }
  }

  // ================================================================
  // BATCH OPERATIONS
  // ================================================================
  async batchFetchBalances(tokenAddresses, userAddress) {
    const balances = {};
    
    if (!window.wallet?.provider) return balances;
    
    try {
      const promises = tokenAddresses.map(async (tokenAddress) => {
        try {
          // Skip zero address, invalid addresses, and native tokens
          if (tokenAddress === '0x0000000000000000000000000000000000000000' || 
              tokenAddress === '0x2b592e8c5c1b4f8b6e3b4c8e4b4c8e4b4c8e4b4c' ||
              tokenAddress.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase()) {
            return [tokenAddress, 0n];
          }
          
          const validAddress = ethers.getAddress(tokenAddress);
          
          const contract = new ethers.Contract(
            validAddress,
            CONFIG.ABIS.ERC20,
            window.wallet.provider
          );
          const balance = await contract.balanceOf(userAddress);
          return [tokenAddress, balance];
        } catch (error) {
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
  // TOKEN METADATA
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
      
      const [symbol, name, decimals] = await Promise.allSettled([
        contract.symbol(),
        contract.name(),
        contract.decimals()
      ]);
      
      return {
        symbol: symbol.status === 'fulfilled' ? symbol.value : '???',
        name: name.status === 'fulfilled' ? name.value : 'Unknown Token',
        decimals: decimals.status === 'fulfilled' ? Number(decimals.value) : 18
      };
    } catch (error) {
      return null;
    }
  }

  // ================================================================
  // FILTERING AND SORTING
  // ================================================================
  async filterForDisplay(tokens) {
    const filtered = new Map();
    
    for (const [address, token] of tokens) {
      // Skip PRGX token itself and native tokens
      if (address.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase() ||
          address.toLowerCase() === '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'.toLowerCase() || // WPLS
          address.toLowerCase() === '0x02f26235791bf5e65a3253aa06845c0451237567'.toLowerCase()) { // PLS
        continue;
      }
      
      // Estimate value
      const estimatedValue = await this.estimateTokenValue(
        token.address,
        token.balance,
        token.decimals
      );
      
      // Include ALL tokens (even with 0 balance) for comprehensive discovery
      filtered.set(address, {
        ...token,
        estimatedUSD: estimatedValue.estimatedUSD || 0,
        estimatedPRGX: estimatedValue.estimatedPRGX || 0
      });
    }
    
    return filtered;
  }

  async estimateTokenValue(address, balance, decimals) {
    try {
      // For tokens with no price data, assume dust value ($0.001 per token)
      const balanceFormatted = ethers.formatUnits(balance, decimals);
      const estimatedUSD = parseFloat(balanceFormatted) * 0.001;
      
      return {
        estimatedPRGX: estimatedUSD * 1000, // Assuming 1 PRGX = $0.001
        estimatedUSD: estimatedUSD
      };
    } catch (error) {
      console.warn(`Failed to estimate value for ${address}:`, error);
      return {
        estimatedPRGX: 0,
        estimatedUSD: 0
      };
    }
  }

  sortTokensByRelevance(tokens) {
    const sorted = new Map();
    const sortedEntries = Array.from(tokens.entries()).sort((a, b) => {
      // Sort by: balance > 0 first, then by USD value, then by symbol
      const aHasBalance = a[1].balance > 0n ? 1 : 0;
      const bHasBalance = b[1].balance > 0n ? 1 : 0;
      
      if (aHasBalance !== bHasBalance) {
        return bHasBalance - aHasBalance;
      }
      
      const valueA = a[1].estimatedUSD || 0;
      const valueB = b[1].estimatedUSD || 0;
      
      if (valueA !== valueB) {
        return valueB - valueA;
      }
      
      return a[1].symbol.localeCompare(b[1].symbol);
    });
    
    for (const [address, token] of sortedEntries) {
      sorted.set(address, token);
    }
    
    return sorted;
  }

  // ================================================================
  // UI HELPERS
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
    
    console.log(`[TokenDiscovery] ${progress}% - ${message}`);
  }

  renderTokenTable(tokens) {
    const tokenTableBody = document.getElementById('tokenTableBody');
    if (!tokenTableBody) return;
    
    tokenTableBody.innerHTML = '';
    
    if (tokens.size === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-3);">
          No tokens found in your wallet
        </td>
      `;
      tokenTableBody.appendChild(row);
      return;
    }
    
    for (const [address, token] of tokens) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <input type="checkbox" class="token-checkbox" data-token="${address}" 
                 ${token.balance > 0n ? '' : 'disabled'}>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="token-icon" style="width: 24px; height: 24px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;">
              ${token.symbol.slice(0, 2)}
            </div>
            <div>
              <div style="font-weight: 500;">${token.symbol}</div>
              <div style="font-size: 0.8rem; color: var(--text-3);">${token.name}</div>
            </div>
          </div>
        </td>
        <td class="mono">
          ${parseFloat(token.balanceFormatted).toFixed(4)}
        </td>
        <td>
          $${token.estimatedUSD.toFixed(6)}
        </td>
        <td>
          ${token.estimatedPRGX.toFixed(2)} PRGX
        </td>
      `;
      tokenTableBody.appendChild(row);
    }
    
    // Add event listeners to checkboxes
    const checkboxes = tokenTableBody.querySelectorAll('.token-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.updateSweepButton());
    });
    
    // Initial sweep button update
    this.updateSweepButton();
  }

  selectAll() {
    const checkboxes = document.querySelectorAll('.token-checkbox:not(:disabled)');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    this.updateSweepButton();
  }

  deselectAll() {
    const checkboxes = document.querySelectorAll('.token-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    this.updateSweepButton();
  }

  updateSweepButton() {
    const selectedCheckboxes = document.querySelectorAll('.token-checkbox:checked');
    const sweepBtn = document.getElementById('sweepBtn');
    
    if (sweepBtn) {
      sweepBtn.disabled = selectedCheckboxes.length === 0;
      sweepBtn.textContent = selectedCheckboxes.length > 0 
        ? `🧹 Sweep ${selectedCheckboxes.length} Tokens` 
        : '🧹 Select Tokens to Sweep';
    }
  }

  getSelectedTokens() {
    const selectedCheckboxes = document.querySelectorAll('.token-checkbox:checked');
    const selectedTokens = new Map();
    
    selectedCheckboxes.forEach(checkbox => {
      const tokenAddress = checkbox.dataset.token;
      const token = this.discoveredTokens.get(tokenAddress);
      if (token) {
        selectedTokens.set(tokenAddress, token);
      }
    });
    
    return selectedTokens;
  }

  // ================================================================
  // PUBLIC API
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
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.tokenDiscovery = new TokenDiscovery();
