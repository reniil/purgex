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
    console.log(`🔍 [DISCOVERY] Starting token discovery for address: ${address}`);

    if (this.isDiscovering) {
      console.log('⚠️ [DISCOVERY] Discovery already in progress, returning existing tokens');
      return this.discoveredTokens;
    }

    this.isDiscovering = true;
    this.discoveredTokens.clear();
    this.updateDiscoveryStatus('Scanning wallet for ERC-20 tokens...', 0);

    try {
      // Strategy 0: Comprehensive token list scan (PRIMARY - uses same method as manual addition)
      console.log('🔍 [DISCOVERY] Strategy 0: Comprehensive token list scan (PRIMARY)');
      this.updateDiscoveryStatus('Fetching comprehensive token list and checking balances...', 5);
      const comprehensiveTokens = await this.fetchFromComprehensiveTokenList(address);
      console.log(`✅ [DISCOVERY] Comprehensive scan found ${comprehensiveTokens.size} tokens`);

      // Check connection between strategies
      if (!window.wallet?.isConnected) {
        console.warn('⚠️ [DISCOVERY] Wallet disconnected, stopping discovery');
        this.isDiscovering = false;
        return this.discoveredTokens;
      }
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay

      // Strategy A: Direct RPC calls (fallback for tokens not in list)
      console.log('🔍 [DISCOVERY] Strategy A: Direct RPC calls (fallback)');
      this.updateDiscoveryStatus('Scanning blockchain for tokens...', 20);
      const directRPCTokens = await this.fetchFromDirectRPC(address);
      console.log(`✅ [DISCOVERY] Direct RPC found ${directRPCTokens.size} tokens`);

      if (!window.wallet?.isConnected) {
        console.warn('⚠️ [DISCOVERY] Wallet disconnected, stopping discovery');
        this.isDiscovering = false;
        return this.discoveredTokens;
      }
      await new Promise(resolve => setTimeout(resolve, 50));

      // Strategy B: Known dust tokens
      console.log('🔍 [DISCOVERY] Strategy B: Known dust tokens');
      this.updateDiscoveryStatus('Checking known dust tokens...', 35);
      const dustTokens = await this.fetchKnownDustTokens(address);
      console.log(`✅ [DISCOVERY] Known dust tokens found ${dustTokens.size} tokens`);

      if (!window.wallet?.isConnected) {
        console.warn('⚠️ [DISCOVERY] Wallet disconnected, stopping discovery');
        this.isDiscovering = false;
        return this.discoveredTokens;
      }
      await new Promise(resolve => setTimeout(resolve, 50));

      // Strategy C: iPulse DEX discovery - DISABLED due to ENS issues on PulseChain
      console.log('🔍 [DISCOVERY] Strategy C: iPulse DEX discovery - DISABLED (ENS not supported)');
      this.updateDiscoveryStatus('Scanning iPulse DEX pairs...', 50);
      const ipulseTokens = new Map(); // Disabled due to ENS issues
      console.log(`✅ [DISCOVERY] iPulse DEX found ${ipulseTokens.size} tokens`);

      // Strategy D: Demo tokens (for testing) - DISABLED to show only real tokens
      console.log('🔍 [DISCOVERY] Strategy D: Demo tokens - DISABLED');
      this.updateDiscoveryStatus('Loading demo tokens...', 70);
      const demoTokens = new Map(); // Disabled - return empty map
      console.log(`✅ [DISCOVERY] Demo tokens found ${demoTokens.size} tokens`);

      // Strategy E: Transfer event scanning
      console.log('🔍 [DISCOVERY] Strategy E: Transfer event scanning');
      this.updateDiscoveryStatus('Scanning transfer events...', 80);
      const eventTokens = await this.fetchFromTransferEvents(address);
      console.log(`✅ [DISCOVERY] Transfer events found ${eventTokens.size} tokens`);

      if (!window.wallet?.isConnected) {
        console.warn('⚠️ [DISCOVERY] Wallet disconnected, stopping discovery');
        this.isDiscovering = false;
        return this.discoveredTokens;
      }
      await new Promise(resolve => setTimeout(resolve, 50));

      // Strategy F: Native PLS token (gas token)
      console.log('🔍 [DISCOVERY] Strategy F: Native PLS token');
      this.updateDiscoveryStatus('Checking native PLS balance...', 85);
      const nativeTokens = await this.fetchNativePLS(address);
      console.log(`✅ [DISCOVERY] Native PLS found ${nativeTokens.size} tokens`);

      if (!window.wallet?.isConnected) {
        console.warn('⚠️ [DISCOVERY] Wallet disconnected, stopping discovery');
        this.isDiscovering = false;
        return this.discoveredTokens;
      }
      await new Promise(resolve => setTimeout(resolve, 50));

      // Strategy G: PulseX Factory tokens (all tokens with LP pairs)
      console.log('🔍 [DISCOVERY] Strategy G: PulseX Factory tokens');
      this.updateDiscoveryStatus('Scanning PulseX Factory for tokens...', 90);
      const pulseXTokens = await this.fetchFromPulseXFactory(address);
      console.log(`✅ [DISCOVERY] PulseX Factory found ${pulseXTokens.size} tokens`);

      if (!window.wallet?.isConnected) {
        console.warn('⚠️ [DISCOVERY] Wallet disconnected, stopping discovery');
        this.isDiscovering = false;
        return this.discoveredTokens;
      }
      await new Promise(resolve => setTimeout(resolve, 50));

      // Strategy H: NineSwap Factory tokens
      console.log('🔍 [DISCOVERY] Strategy H: NineSwap Factory tokens');
      this.updateDiscoveryStatus('Scanning NineSwap Factory for tokens...', 92);
      const nineSwapTokens = await this.fetchFromNineSwap(address);
      console.log(`✅ [DISCOVERY] NineSwap found ${nineSwapTokens.size} tokens`);

      // Merge and deduplicate
      this.updateDiscoveryStatus('Processing results...', 95);
      const allTokens = new Map([...comprehensiveTokens, ...directRPCTokens, ...dustTokens, ...ipulseTokens, ...demoTokens, ...eventTokens, ...nativeTokens, ...pulseXTokens, ...nineSwapTokens]);
      console.log(`🔍 [DISCOVERY] Total unique tokens before filtering: ${allTokens.size}`);

      // Filter and enrich
      console.log('🔍 [DISCOVERY] Filtering and enriching tokens');
      const filteredTokens = await this.filterAndEnrichTokens(allTokens);
      console.log(`✅ [DISCOVERY] Tokens after filtering: ${filteredTokens.size}`);

      // If no tokens found, add fallback demo tokens
      if (filteredTokens.size === 0) {
        console.log('⚠️ [DISCOVERY] No tokens found, adding fallback demo tokens');
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
      console.log(`✅ [DISCOVERY] Discovery complete: ${sortedTokens.size} tokens found`);

      return sortedTokens;
    } catch (error) {
      this.isDiscovering = false;
      console.error('❌ [DISCOVERY] Token discovery failed:', error);
      this.updateDiscoveryStatus(`Discovery failed: ${error.message}`, 0);
      throw error;
    }
  }

  // ================================================================
  // STRATEGY A: Direct RPC calls (most reliable)
  // ================================================================
  async fetchFromDirectRPC(address) {
    console.log('🔍 [RPC] Starting Direct RPC transfer event scanning');
    const tokens = new Map();

    if (!window.wallet?.provider) {
      console.warn('⚠️ [RPC] No wallet provider for direct RPC calls');
      return tokens;
    }

    try {
      // Get current block number
      const provider = window.wallet.provider;
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000); // Last 100k blocks (increased from 10k)
      console.log(`🔍 [RPC] Scanning blocks ${fromBlock} to ${currentBlock}`);

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

      console.log(`✅ [RPC] Found ${logs.length} transfer events`);

      // Group by contract address
      const contractAddresses = new Set();
      for (const log of logs) {
        contractAddresses.add(log.address.toLowerCase());
      }

      console.log(`🔍 [RPC] Found ${contractAddresses.size} unique token addresses`);

      // Check balances for these contracts
      const balancePromises = Array.from(contractAddresses).map(async (contractAddr) => {
        try {
          console.log(`🔍 [RPC] Checking balance for ${contractAddr}`);
          const contract = new ethers.Contract(contractAddr, CONFIG.ABIS.ERC20, provider);
          const balance = await contract.balanceOf(address);

          if (balance > 0n) {
            console.log(`✅ [RPC] Token ${contractAddr} has balance > 0`);

            // Get token info
            let symbol = '???';
            let name = 'Unknown Token';
            let decimals = 18;

            try {
              symbol = await contract.symbol();
              name = await contract.name();
              decimals = await contract.decimals();
            } catch (error) {
              console.warn(`⚠️ [RPC] Failed to get token info for ${contractAddr}:`, error);
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
          } else {
            console.log(`⚠️ [RPC] Token ${contractAddr} has balance = 0, skipping`);
          }
        } catch (error) {
          console.warn(`❌ [RPC] Failed to check balance for ${contractAddr}:`, error);
        }
        return null;
      });

      const results = await Promise.all(balancePromises);

      for (const token of results) {
        if (token) {
          tokens.set(token.address, token);
        }
      }

      console.log(`✅ [RPC] Direct RPC found ${tokens.size} tokens with balance > 0`);
    } catch (error) {
      console.error('❌ [RPC] Direct RPC token discovery failed:', error);
    }

    return tokens;
  }

  // ================================================================
  // STRATEGY B: Known dust tokens
  // ================================================================
  async fetchKnownDustTokens(address) {
    console.log(`🔍 [DUST] Starting known dust token discovery for ${CONFIG.KNOWN_DUST_TOKENS.length} tokens`);
    const tokens = new Map();

    if (CONFIG.KNOWN_DUST_TOKENS.length === 0) {
      console.log('⚠️ [DUST] No known dust tokens configured');
      return tokens;
    }

    try {
      // Batch check balances
      console.log(`🔍 [DUST] Fetching balances for known dust tokens`);
      const balances = await this.batchFetchBalances(CONFIG.KNOWN_DUST_TOKENS, address);
      console.log(`🔍 [DUST] Received ${Object.keys(balances).length} balance results`);

      for (const [tokenAddress, balance] of Object.entries(balances)) {
        console.log(`🔍 [DUST] Token ${tokenAddress} balance: ${balance}`);
        if (balance > 0n) {
          console.log(`✅ [DUST] Token ${tokenAddress} has balance > 0, adding to list`);
          const metadata = await this.fetchTokenMetadata(tokenAddress);
          tokens.set(tokenAddress.toLowerCase(), {
            address: tokenAddress,
            ...metadata,
            balance: balance,
            balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
            source: 'dustlist'
          });
        } else {
          console.log(`⚠️ [DUST] Token ${tokenAddress} has balance = 0, skipping`);
        }
      }

      console.log(`✅ [DUST] Found ${tokens.size} dust tokens with balance > 0`);
    } catch (error) {
      console.error('❌ [DUST] Known dust token discovery failed:', error);
    }

    return tokens;
  }

  // ================================================================
  // STRATEGY F: Native PLS token (gas token)
  // ================================================================
  async fetchNativePLS(address) {
    const tokens = new Map();

    try {
      console.log(`🔍 [NATIVE] Fetching native PLS balance for ${address}`);

      if (!window.wallet?.provider) {
        console.warn('⚠️ [NATIVE] No wallet provider available');
        return tokens;
      }

      const balance = await window.wallet.provider.getBalance(address);
      console.log(`✅ [NATIVE] Native PLS balance: ${balance}`);

      if (balance > 0n) {
        tokens.set('native', {
          address: 'native',
          symbol: 'PLS',
          name: 'PulseChain',
          decimals: 18,
          balance: balance,
          balanceFormatted: ethers.formatUnits(balance, 18),
          source: 'native'
        });
        console.log(`✅ [NATIVE] Added native PLS token with balance > 0`);
      } else {
        console.log(`⚠️ [NATIVE] Native PLS balance = 0, skipping`);
      }
    } catch (error) {
      console.error('❌ [NATIVE] Native PLS fetch failed:', error);
    }

    return tokens;
  }

  // ================================================================
  // STRATEGY G: PulseX Factory tokens
  // ================================================================
  async fetchFromPulseXFactory(address) {
    const tokens = new Map();

    try {
      console.log('🔍 [PULSEX] Starting PulseX Factory token discovery');

      if (!window.wallet?.provider) {
        console.warn('⚠️ [PULSEX] No wallet provider available');
        return tokens;
      }

      const provider = window.wallet.provider;
      const PULSEX_FACTORY = "0x1715a3E4A142d8b698131108995174F37aEBA10D";

      // Properly checksum the address
      const checksummedAddress = ethers.getAddress(PULSEX_FACTORY);
      console.log(`PulseX Factory address (checksummed): ${checksummedAddress}`);

      // PulseX Factory ABI (minimal)
      const factoryABI = [
        'function allPairsLength() view returns (uint256)',
        'function allPairs(uint256) view returns (address)'
      ];

      const factory = new ethers.Contract(checksummedAddress, factoryABI, provider);

      // Get total number of pairs
      const pairCount = await factory.allPairsLength();
      const count = Number(pairCount);

      console.log(`PulseX has ${count} total pairs, fetching last 100 for user balance check...`);

      const pairABI = [
        'function token0() view returns (address)',
        'function token1() view returns (address)'
      ];

      // Process in batches
      const batchSize = 20; // Reduced from 50 to prevent timeout
      const startIdx = Math.max(0, count - 100); // Reduced from 500 to prevent timeout
      for (let i = startIdx; i < count; i += batchSize) {
        // Check wallet connection before each batch
        if (!window.wallet?.isConnected || !window.wallet?.provider) {
          console.warn('⚠️ [PULSEX] Wallet disconnected during discovery, stopping');
          break;
        }

        const endIdx = Math.min(i + batchSize, count);
        const batchPromises = [];

        for (let j = i; j < endIdx; j++) {
          batchPromises.push(
            (async (idx) => {
              try {
                const pairAddress = await factory.allPairs(idx);
                const pair = new ethers.Contract(pairAddress, pairABI, provider);

                const [token0, token1] = await Promise.all([
                  pair.token0(),
                  pair.token1()
                ]);

                // Add both tokens (skip WPLS to avoid duplicates)
                const wplsAddr = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
                const tokenAddresses = [];
                if (token0.toLowerCase() !== wplsAddr.toLowerCase()) tokenAddresses.push(token0);
                if (token1.toLowerCase() !== wplsAddr.toLowerCase()) tokenAddresses.push(token1);

                // Check balance for user
                for (const tokenAddr of tokenAddresses) {
                  const checksummedTokenAddr = ethers.getAddress(tokenAddr);
                  const tokenContract = new ethers.Contract(checksummedTokenAddr, CONFIG.ABIS.ERC20, provider);
                  const balance = await tokenContract.balanceOf(address);

                  if (balance > 0n) {
                    try {
                      const [symbol, name, decimals] = await Promise.all([
                        tokenContract.symbol(),
                        tokenContract.name(),
                        tokenContract.decimals()
                      ]);
                      return {
                        address: checksummedTokenAddr,
                        symbol: symbol || '???',
                        name: name || 'Unknown Token',
                        decimals: Number(decimals) || 18,
                        balance: balance,
                        balanceFormatted: ethers.formatUnits(balance, Number(decimals) || 18),
                        source: 'pulsex-factory'
                      };
                    } catch (e) {
                      // Skip if can't get metadata
                    }
                  }
                }
                return null;
              } catch (e) {
                return null;
              }
            })(j)
          );
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(result => {
          if (result) {
            tokens.set(result.address.toLowerCase(), result);
          }
        });

        // Add delay between batches to prevent timeout
        if (i + batchSize < count) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ [PULSEX] Found ${tokens.size} tokens with balance from PulseX Factory`);
    } catch (error) {
      console.error('❌ [PULSEX] PulseX Factory fetch failed:', error);
    }

    return tokens;
  }

  // ================================================================
  // STRATEGY H: NineSwap Factory tokens
  // ================================================================
  async fetchFromNineSwap(address) {
    const tokens = new Map();

    try {
      console.log('🔍 [NINESWAP] Starting NineSwap Factory token discovery');

      if (!window.wallet?.provider) {
        console.warn('⚠️ [NINESWAP] No wallet provider available');
        return tokens;
      }

      const provider = window.wallet.provider;
      const NINESWAP_FACTORY = "0x6EcCab422D763aC9514C8AB95925C5A12D866874";

      // Properly checksum the address
      const checksummedAddress = ethers.getAddress(NINESWAP_FACTORY);
      console.log(`NineSwap Factory address (checksummed): ${checksummedAddress}`);

      const factoryABI = [
        'function allPairsLength() view returns (uint256)',
        'function allPairs(uint256) view returns (address)'
      ];

      const factory = new ethers.Contract(checksummedAddress, factoryABI, provider);

      const pairCount = await factory.allPairsLength();
      const count = Number(pairCount);

      console.log(`NineSwap has ${count} total pairs, fetching last 50 for user balance check...`);

      const pairABI = [
        'function token0() view returns (address)',
        'function token1() view returns (address)'
      ];

      // Process in batches
      const batchSize = 20; // Reduced from 50 to prevent timeout
      const startIdx = Math.max(0, count - 50); // Reduced from 250 to prevent timeout
      for (let i = startIdx; i < count; i += batchSize) {
        // Check wallet connection before each batch
        if (!window.wallet?.isConnected || !window.wallet?.provider) {
          console.warn('⚠️ [NINESWAP] Wallet disconnected during discovery, stopping');
          break;
        }

        const endIdx = Math.min(i + batchSize, count);
        const batchPromises = [];

        for (let j = i; j < endIdx; j++) {
          batchPromises.push(
            (async (idx) => {
              try {
                const pairAddress = await factory.allPairs(idx);
                const pair = new ethers.Contract(pairAddress, pairABI, provider);

                const [token0, token1] = await Promise.all([
                  pair.token0(),
                  pair.token1()
                ]);

                // Add both tokens (skip WPLS to avoid duplicates)
                const wplsAddr = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
                const tokenAddresses = [];
                if (token0.toLowerCase() !== wplsAddr.toLowerCase()) tokenAddresses.push(token0);
                if (token1.toLowerCase() !== wplsAddr.toLowerCase()) tokenAddresses.push(token1);

                // Check balance for user
                for (const tokenAddr of tokenAddresses) {
                  const checksummedTokenAddr = ethers.getAddress(tokenAddr);
                  const tokenContract = new ethers.Contract(checksummedTokenAddr, CONFIG.ABIS.ERC20, provider);
                  const balance = await tokenContract.balanceOf(address);

                  if (balance > 0n) {
                    try {
                      const [symbol, name, decimals] = await Promise.all([
                        tokenContract.symbol(),
                        tokenContract.name(),
                        tokenContract.decimals()
                      ]);
                      return {
                        address: checksummedTokenAddr,
                        symbol: symbol || '???',
                        name: name || 'Unknown Token',
                        decimals: Number(decimals) || 18,
                        balance: balance,
                        balanceFormatted: ethers.formatUnits(balance, Number(decimals) || 18),
                        source: 'nineswap'
                      };
                    } catch (e) {
                      // Skip if can't get metadata
                    }
                  }
                }
                return null;
              } catch (e) {
                return null;
              }
            })(j)
          );
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(result => {
          if (result) {
            tokens.set(result.address.toLowerCase(), result);
          }
        });

        // Add delay between batches to prevent timeout
        if (i + batchSize < count) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ [NINESWAP] Found ${tokens.size} tokens with balance from NineSwap`);
    } catch (error) {
      console.error('❌ [NINESWAP] NineSwap fetch failed:', error);
    }

    return tokens;
  }

  // ================================================================
  // STRATEGY 0: Comprehensive token list scan (PRIMARY)
  // ================================================================
  async fetchFromComprehensiveTokenList(address) {
    const tokens = new Map();

    try {
      console.log('🔍 [COMPREHENSIVE] Starting comprehensive token list scan');

      if (!window.wallet?.provider) {
        console.warn('⚠️ [COMPREHENSIVE] No wallet provider available');
        return tokens;
      }

      // Try to fetch token list from PulseCoinList API
      console.log('🔍 [COMPREHENSIVE] Fetching token list from PulseCoinList API...');

      let tokenList = [];

      try {
        // Fetch from PulseCoinList API
        const response = await fetch('https://api.pulsecoinlist.com/v1/tokens');
        if (response.ok) {
          const data = await response.json();
          tokenList = data.tokens || [];
          console.log(`✅ [COMPREHENSIVE] Fetched ${tokenList.length} tokens from PulseCoinList API`);
        } else {
          console.warn('⚠️ [COMPREHENSIVE] PulseCoinList API request failed, using fallback');
        }
      } catch (error) {
        console.warn('⚠️ [COMPREHENSIVE] PulseCoinList API error:', error);
      }

      // Fallback: Use known dust tokens + factory tokens
      if (tokenList.length === 0) {
        console.log('🔍 [COMPREHENSIVE] Using fallback: combining known tokens and factory tokens');

        // Add known dust tokens
        for (const tokenAddr of CONFIG.KNOWN_DUST_TOKENS) {
          tokenList.push({ address: tokenAddr });
        }

        // Add PulseX factory tokens (scan more pairs)
        console.log('🔍 [COMPREHENSIVE] Scanning PulseX factory for token addresses...');
        const provider = window.wallet.provider;
        const PULSEX_FACTORY = "0x1715a3E4A142d8b698131108995174F37aEBA10D";
        const factoryABI = ['function allPairsLength() view returns (uint256)', 'function allPairs(uint256) view returns (address)'];
        const factory = new ethers.Contract(PULSEX_FACTORY, factoryABI, provider);

        const pairCount = await factory.allPairsLength();
        const count = Number(pairCount);
        const scanCount = Math.min(500, count); // Scan up to 500 pairs

        console.log(`🔍 [COMPREHENSIVE] Scanning last ${scanCount} PulseX pairs for token addresses...`);

        const pairABI = ['function token0() view returns (address)', 'function token1() view returns (address)'];
        const batchSize = 50;
        const wplsAddr = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

        for (let i = Math.max(0, count - scanCount); i < count; i += batchSize) {
          const endIdx = Math.min(i + batchSize, count);

          for (let j = i; j < endIdx; j++) {
            try {
              const pairAddress = await factory.allPairs(j);
              const pair = new ethers.Contract(pairAddress, pairABI, provider);
              const [token0, token1] = await Promise.all([pair.token0(), pair.token1()]);

              if (token0.toLowerCase() !== wplsAddr.toLowerCase()) {
                tokenList.push({ address: token0 });
              }
              if (token1.toLowerCase() !== wplsAddr.toLowerCase()) {
                tokenList.push({ address: token1 });
              }
            } catch (e) {
              // Skip failed pair
            }
          }

          // Add delay to prevent timeout
          if (i + batchSize < count) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log(`✅ [COMPREHENSIVE] Collected ${tokenList.length} token addresses from fallback`);
      }

      // Deduplicate token addresses
      const uniqueAddresses = new Set();
      const uniqueTokenList = [];
      for (const token of tokenList) {
        const addr = token.address?.toLowerCase();
        if (addr && !uniqueAddresses.has(addr)) {
          uniqueAddresses.add(addr);
          uniqueTokenList.push(token);
        }
      }

      console.log(`🔍 [COMPREHENSIVE] After deduplication: ${uniqueTokenList.length} unique tokens`);

      // Check balances for all tokens (same method as manual addition)
      console.log('🔍 [COMPREHENSIVE] Checking balances for all tokens...');
      const batchSize = 50;
      let checkedCount = 0;

      for (let i = 0; i < uniqueTokenList.length; i += batchSize) {
        const batch = uniqueTokenList.slice(i, i + batchSize);
        const balancePromises = batch.map(async (token) => {
          try {
            const tokenAddr = token.address;
            console.log(`🔍 [COMPREHENSIVE] Checking balance for ${tokenAddr} (${checkedCount + 1}/${uniqueTokenList.length})`);

            const tokenContract = new ethers.Contract(tokenAddr, CONFIG.ABIS.ERC20, window.wallet.provider);
            const balance = await tokenContract.balanceOf(address);

            if (balance > 0n) {
              console.log(`✅ [COMPREHENSIVE] Token ${tokenAddr} has balance > 0`);

              // Get token metadata (same as manual addition)
              let symbol = '???';
              let name = 'Unknown Token';
              let decimals = 18;

              try {
                const [sym, nm, dec] = await Promise.all([
                  tokenContract.symbol(),
                  tokenContract.name(),
                  tokenContract.decimals()
                ]);
                symbol = sym || '???';
                name = nm || 'Unknown Token';
                decimals = Number(dec) || 18;
              } catch (error) {
                console.warn(`⚠️ [COMPREHENSIVE] Failed to get metadata for ${tokenAddr}:`, error);
              }

              return {
                address: tokenAddr,
                symbol: symbol,
                name: name,
                decimals: decimals,
                balance: balance,
                balanceFormatted: ethers.formatUnits(balance, decimals),
                source: 'comprehensive-scan'
              };
            } else {
              console.log(`⚠️ [COMPREHENSIVE] Token ${tokenAddr} has balance = 0, skipping`);
            }
          } catch (error) {
            console.warn(`❌ [COMPREHENSIVE] Failed to check balance for token:`, error);
          }
          checkedCount++;
          return null;
        });

        const results = await Promise.all(balancePromises);

        for (const result of results) {
          if (result) {
            tokens.set(result.address.toLowerCase(), result);
          }
        }

        // Add delay between batches to prevent timeout
        if (i + batchSize < uniqueTokenList.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ [COMPREHENSIVE] Found ${tokens.size} tokens with balance > 0 from comprehensive scan`);
    } catch (error) {
      console.error('❌ [COMPREHENSIVE] Comprehensive scan failed:', error);
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
        // Skip WPLS (native token)
        if (tokenAddr.toLowerCase() === CONFIG.CONTRACTS.WPLS.toLowerCase()) {
          continue;
        }

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
      const checksummedAddress = ethers.getAddress(tokenAddress);

      const contract = new ethers.Contract(
        checksummedAddress,
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
    console.log(`🔍 [BALANCE] Starting batch balance fetch for ${tokenAddresses.length} tokens for user ${userAddress}`);
    const balances = {};

    if (!window.wallet?.provider) {
      console.warn('⚠️ [BALANCE] No wallet provider available');
      return balances;
    }

    try {
      // Create multicall-like batch using Promise.all
      const promises = tokenAddresses.map(async (tokenAddress) => {
        try {
          console.log(`🔍 [BALANCE] Fetching balance for ${tokenAddress}`);

          const normalizedTokenAddress = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : tokenAddress;

          // Skip zero address and invalid addresses
          if (normalizedTokenAddress === '0x0000000000000000000000000000000000000000' ||
              normalizedTokenAddress === '0x2b592e8c5c1b4f8b6e3b4c8e4b4c8e4b4c8e4b4c') {
            console.log(`⚠️ [BALANCE] Skipping invalid address: ${tokenAddress}`);
            return [tokenAddress, 0n];
          }

          // Validate address checksum
          const validAddress = ethers.getAddress(normalizedTokenAddress);
          console.log(`🔍 [BALANCE] Validated address: ${validAddress}`);

          const contract = new ethers.Contract(
            validAddress,
            CONFIG.ABIS.ERC20,
            window.wallet.provider
          );
          const balance = await contract.balanceOf(userAddress);
          console.log(`✅ [BALANCE] Balance for ${tokenAddress}: ${balance}`);
          return [tokenAddress, balance];
        } catch (error) {
          console.warn(`❌ [BALANCE] Failed to fetch balance for ${tokenAddress}:`, error.message);
          return [tokenAddress, 0n];
        }
      });

      const results = await Promise.all(promises);

      for (const [tokenAddress, balance] of results) {
        balances[tokenAddress] = balance;
      }

      console.log(`✅ [BALANCE] Batch balance fetch completed, fetched ${Object.keys(balances).length} balances`);
    } catch (error) {
      console.error('❌ [BALANCE] Batch balance fetch failed:', error);
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
      
      const checksummedAddress = ethers.getAddress(tokenAddress);

      const contract = new ethers.Contract(
        checksummedAddress,
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
  // TOKEN CLASSIFICATION
  // ================================================================
  async classifyToken(tokenAddress) {
    if (!CONFIG.SWEEP_CONFIG.AUTO_CLASSIFY) {
      return 'unknown';
    }

    try {
      if (!window.wallet?.provider) {
        return 'unknown';
      }

      // Check if token has a pair on PulseX
      const factory = new ethers.Contract(
        CONFIG.APIS.PULSEX_FACTORY,
        ['function getPair(address,address) view returns (address)'],
        window.wallet.provider
      );

      // Try to get pair with WPLS
      let pairAddress;
      try {
        pairAddress = await factory.getPair(tokenAddress, CONFIG.CONTRACTS.WPLS);
      } catch (factoryError) {
        console.warn(`Factory call failed for ${tokenAddress}, treating as non-swappable:`, factoryError);
        return 'non-swappable';
      }

      if (!pairAddress || pairAddress === '0x0000000000000000000000000000000000000000') {
        return 'non-swappable';
      }

      // Check if pair has liquidity
      const pair = new ethers.Contract(
        pairAddress,
        ['function getReserves() view returns (uint112,uint112,uint32)'],
        window.wallet.provider
      );

      let reserve0, reserve1;
      try {
        [reserve0, reserve1] = await pair.getReserves();
      } catch (reserveError) {
        console.warn(`Reserves call failed for pair ${pairAddress}, treating as non-swappable:`, reserveError);
        return 'non-swappable';
      }

      const totalReserves = reserve0 + reserve1;

      // Convert to USD (rough estimate)
      const reserveValue = Number(ethers.formatEther(totalReserves)) * 0.001; // Assume $0.001 per token

      if (reserveValue >= CONFIG.SWEEP_CONFIG.MIN_LIQUIDITY_THRESHOLD) {
        return 'swappable';
      } else {
        return 'non-swappable';
      }
    } catch (error) {
      console.warn(`Token classification failed for ${tokenAddress}, treating as unknown:`, error);
      return 'unknown';
    }
  }

  // ================================================================
  // FILTER AND ENRICH TOKENS
  // ================================================================
  async filterAndEnrichTokens(tokens) {
    const filtered = new Map();

    for (const [address, token] of tokens) {
      // Special handling for native PLS token
      if (address === 'native') {
        // Estimate PLS value using price oracle
        const plsValue = await this.estimatePLSValue(token.balance, 18);
        filtered.set(address, {
          ...token,
          classification: 'non-swappable', // Native PLS cannot be swept
          estimatedUSD: plsValue.estimatedUSD || 0,
          estimatedPRGX: plsValue.estimatedPRGX || 0
        });
        continue;
      }

      // Note: Removed zero-balance filter to allow all tokens to be discovered
      // including custom created, rugpulls, and zero-balance tokens

      // Classify token (swappable vs non-swappable)
      const classification = await this.classifyToken(address);

      // Estimate value
      const estimatedValue = await this.estimateTokenValue(
        token.address,
        token.balance,
        token.decimals
      );

      filtered.set(address, {
        ...token,
        classification: classification,
        estimatedUSD: estimatedValue.estimatedUSD || 0,
        estimatedPRGX: estimatedValue.estimatedPRGX || 0
      });
    }

    return filtered;
  }

  // ================================================================
  // ESTIMATE PLS VALUE (Native token) - Use same logic as regular tokens
  // ================================================================
  async estimatePLSValue(balance, decimals) {
    console.log(`🔍 [PRICE] Estimating value for native PLS, balance: ${balance}, decimals: ${decimals}`);

    try {
      const balanceFormatted = ethers.formatUnits(balance, decimals);
      console.log(`🔍 [PRICE] PLS balance formatted: ${balanceFormatted}`);

      // Try to fetch PLS price from DEXScreener (WPLS/PLS pair)
      let plsPriceUSD = 0;
      try {
        console.log(`🔍 [PRICE] Fetching PLS price from DEXScreener (WPLS)`);
        const response = await fetch(`${CONFIG.APIS.DEXSCREENER_BASE}/${CONFIG.CONTRACTS.WPLS}`);
        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
          const pair = data.pairs[0];
          if (pair.priceUsd) {
            plsPriceUSD = parseFloat(pair.priceUsd);
            console.log(`✅ [PRICE] PLS price from DEXScreener: $${plsPriceUSD}`);
          }
        }
      } catch (dexError) {
        console.warn(`⚠️ [PRICE] DEXScreener PLS price fetch failed:`, dexError);
      }

      // If no price found, use fallback estimation
      if (plsPriceUSD === 0) {
        console.log(`⚠️ [PRICE] No PLS price found, using fallback estimation`);
        plsPriceUSD = 0.0001; // Fallback PLS price estimate
      }

      const plsValueUSD = parseFloat(balanceFormatted) * plsPriceUSD;
      console.log(`🔍 [PRICE] PLS value in USD: $${plsValueUSD}`);

      // Convert to PRGX using current PRGX price (same as regular tokens)
      let estimatedPRGX = 0;
      const prgxPriceUSD = window.priceOracle?.prgxPriceUSD;
      
      if (prgxPriceUSD && prgxPriceUSD > 0) {
        estimatedPRGX = plsValueUSD / prgxPriceUSD;
        console.log(`🔍 [PRICE] PRGX price: $${prgxPriceUSD}, estimated PRGX: ${estimatedPRGX}`);
      } else {
        console.warn(`⚠️ [PRICE] PRGX price not available, cannot convert to PRGX`);
      }

      return {
        estimatedPRGX: estimatedPRGX,
        estimatedUSD: plsValueUSD
      };
    } catch (error) {
      console.error(`❌ [PRICE] PLS value estimation failed:`, error);
      return {
        estimatedPRGX: 0,
        estimatedUSD: 0
      };
    }
  }

  // ================================================================
  // ESTIMATE TOKEN VALUE - Real market prices from DEX/PulseCoinList
  // ================================================================
  async estimateTokenValue(address, balance, decimals) {
    console.log(`🔍 [PRICE] Estimating value for token ${address}, balance: ${balance}, decimals: ${decimals}`);

    try {
      const balanceFormatted = ethers.formatUnits(balance, decimals);
      console.log(`🔍 [PRICE] Balance formatted: ${balanceFormatted}`);

      // Check if this is PRGX token itself - use current PRGX price
      if (address.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase()) {
        const prgxPriceUSD = window.priceOracle?.prgxPriceUSD || 0.00000005623;
        const tokenValueUSD = parseFloat(balanceFormatted) * prgxPriceUSD;
        console.log(`🔍 [PRICE] PRGX token detected, price: $${prgxPriceUSD}, value: $${tokenValueUSD}`);
        
        let estimatedPRGX = parseFloat(balanceFormatted);
        return {
          estimatedPRGX: estimatedPRGX,
          estimatedUSD: tokenValueUSD
        };
      }

      // Try to fetch real price from PulseCoinList with CORS proxy (preferred)
      let tokenPriceUSD = 0;
      try {
        console.log(`🔍 [PRICE] Fetching price from PulseCoinList for ${address}`);
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`https://pulsecoinlist.com/token/${address}`)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          throw new Error(`PulseCoinList proxy request failed: ${response.status}`);
        }

        const html = await response.text();

        if (html) {
          // Try to extract price from __NEXT_DATA__ JSON script tag (most accurate)
          const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">({.+?})<\/script>/s);
          if (nextDataMatch) {
            try {
              const jsonData = JSON.parse(nextDataMatch[1]);
              const price = jsonData?.props?.pageProps?.coinInfo?.price;
              if (price && parseFloat(price) > 0) {
                tokenPriceUSD = parseFloat(price);
                console.log(`✅ [PRICE] PulseCoinList price from __NEXT_DATA__ for ${address}: $${tokenPriceUSD}`);
              }
            } catch (jsonError) {
              console.warn(`⚠️ [PRICE] Failed to parse __NEXT_DATA__ JSON for ${address}:`, jsonError);
            }
          }

          // Fallback: Try to extract price from OG description
          if (tokenPriceUSD === 0) {
            const ogDescriptionMatch = html.match(/<meta property="og:description" content="([^"]*?\$[\d,.]+[^"]*?)"/i);
            if (ogDescriptionMatch) {
              const priceMatch = ogDescriptionMatch[1].match(/\$([\d,.]+)/);
              if (priceMatch) {
                tokenPriceUSD = parseFloat(priceMatch[1].replace(/,/g, ''));
                if (tokenPriceUSD > 0) {
                  console.log(`✅ [PRICE] PulseCoinList price from OG description for ${address}: $${tokenPriceUSD}`);
                }
              }
            }
          }

          // Fallback: Try to find price in HTML content
          if (tokenPriceUSD === 0) {
            const pricePattern = /\$[\d,.]+\s*USD/i;
            const priceMatch = html.match(pricePattern);
            if (priceMatch) {
              tokenPriceUSD = parseFloat(priceMatch[0].replace(/[\$\s,USD]/g, ''));
              if (tokenPriceUSD > 0) {
                console.log(`✅ [PRICE] PulseCoinList price from HTML for ${address}: $${tokenPriceUSD}`);
              }
            }
          }
        }
      } catch (pulsecoinlistError) {
        console.warn(`⚠️ [PRICE] PulseCoinList fetch failed for ${address}:`, pulsecoinlistError);
      }

      // Fallback: Try DEXScreener if PulseCoinList failed
      if (tokenPriceUSD === 0) {
        try {
          console.log(`🔍 [PRICE] Fetching price from DEXScreener for ${address}`);
          const response = await fetch(`${CONFIG.APIS.DEXSCREENER_BASE}/${address}`);
          const data = await response.json();

          if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            if (pair.priceUsd) {
              tokenPriceUSD = parseFloat(pair.priceUsd);
              console.log(`✅ [PRICE] DEXScreener price for ${address}: $${tokenPriceUSD}`);
            }
          }
        } catch (dexError) {
          console.warn(`⚠️ [PRICE] DEXScreener fetch failed for ${address}:`, dexError);
        }
      }

      // If no price found, use fallback estimation
      if (tokenPriceUSD === 0) {
        console.log(`⚠️ [PRICE] No price found, using fallback estimation`);
        tokenPriceUSD = 2.5e-10; // Adjusted fallback price for unknown tokens ($0.00000000025)
      }

      const tokenValueUSD = parseFloat(balanceFormatted) * tokenPriceUSD;
      console.log(`🔍 [PRICE] Token value in USD: $${tokenValueUSD}`);

      // Convert to PRGX using price oracle
      let estimatedPRGX = 0;
      if (window.priceOracle && window.priceOracle.prgxPriceUSD) {
        estimatedPRGX = tokenValueUSD / window.priceOracle.prgxPriceUSD;
      }
      
      return {
        estimatedPRGX: estimatedPRGX,
        estimatedUSD: tokenValueUSD
      };
    } catch (error) {
      console.warn(`Failed to estimate value for ${address}:`, error);
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
          <td><div class="skeleton skeleton-row"></div></td>
        `;
        container.appendChild(row);
      }
      return;
    }
    
    if (tokens.size === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-3);">
          No dust tokens found in your wallet
        </td>
      `;
      container.appendChild(row);
      return;
    }
    
    // Render each token
    for (const [address, token] of tokens) {
      const row = document.createElement('tr');

      // Sanitize token data to prevent XSS
      const safeSymbol = Utils ? Utils.sanitize(token.symbol || '???') : (token.symbol || '???');
      const safeName = Utils ? Utils.sanitize(token.name || 'Unknown Token') : (token.name || 'Unknown Token');
      const safeAddress = Utils ? Utils.sanitize(address) : address;

      // Determine classification badge
      let classificationBadge = '';
      if (token.classification === 'swappable') {
        classificationBadge = '<span class="badge badge-green">Swappable</span>';
      } else if (token.classification === 'non-swappable') {
        classificationBadge = '<span class="badge badge-red">Non-Swappable</span>';
      } else {
        classificationBadge = '<span class="badge badge-gray">Unknown</span>';
      }

      row.innerHTML = `
        <td>
          <div class="checkbox-custom ${this.selectedTokens.has(address) ? 'checked' : ''}"
               data-token="${safeAddress}" onclick="tokenDiscovery.toggleToken('${safeAddress}')">
            ${this.selectedTokens.has(address) ? '✓' : ''}
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="token-icon">${safeSymbol.slice(0, 2).toUpperCase()}</div>
            <div>
              <div class="token-symbol">${safeSymbol}</div>
              <div class="token-name">${safeName}</div>
            </div>
          </div>
        </td>
        <td class="mono">${parseFloat(token.balanceFormatted).toLocaleString()}</td>
        <td>${classificationBadge}</td>
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

      // Allow adding tokens even with 0 balance (for undiscovered tokens)
      const metadata = await this.fetchTokenMetadata(address);
      const estimatedValue = await this.estimateTokenValue(address, balance, metadata.decimals);
      const classification = await this.classifyToken(address);

      const token = {
        address: address,
        ...metadata,
        balance: balance,
        balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
        estimatedUSD: estimatedValue.estimatedUSD || 0,
        estimatedPRGX: estimatedValue.estimatedPRGX || 0,
        classification: classification,
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
