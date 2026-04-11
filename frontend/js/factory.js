// ================================================================
// FACTORY PAGE — PulseChain Token Pair Discovery (Vanilla JS)
// Data via https://api.scan.pulsechain.com/api (BlockScout)
// ================================================================

const API_BASE = "https://api.scan.pulsechain.com/api";
const PULSECOINLIST_API = "https://pulsecoinlist.com/api";
const PAGE_SIZE = 10;
const PULSEX_FACTORY = "0x1715a3E4a142d8b698131108995174F37aEBA10D";

// Known PulseChain tokens — real tokens with WPLS pairs on PulseX
// Data fetched in real-time from BlockScout API
const KNOWN_TOKENS = [
  { symbol: "WPLS",  addr: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27" },
  { symbol: "PLSX",  addr: "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab" },
  { symbol: "HEX",   addr: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" },
  { symbol: "INC",   addr: "0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d" },
  { symbol: "DAI",   addr: "0xefD766cCb38EaF1dfd701853BFCe31359239F305" },
  { symbol: "USDC",  addr: "0x15D38573d2feeb82e7ad5187aB8c1D52810B880" },
  { symbol: "USDT",  addr: "0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f" },
  { symbol: "WETH",  addr: "0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C" },
  { symbol: "eHEX",  addr: "0x57fde0a71132198BBeC939B98976993d8D89D225" },
  { symbol: "PRGC",  addr: "0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0" }, // PRGX token
  // Additional verified PulseChain tokens
  { symbol: "HDRN",  addr: "0x3819f6E91F4e4c749cE37386CeCBf480C5f3a5f" }, // Hedron
  { symbol: "MAXI",  addr: "0x0d86EB9f7c27d3DF9EebDA5E5a292a08C0f2E18E" },
  { symbol: "TEAM",  addr: "0x6007e7e2cefcb4e98a95f17d8855d9e7f1e8e3c5" },
  { symbol: "FENIX", addr: "0x6d79B6D40dE561bD6200C8d903D80D924b89e03a" },
  { symbol: "TYRH",  addr: "0x6b0C28C1eF788c38E3FcC6370d0c4343b0920c70" },
];

class FactoryPage {
  constructor() {
    this.pairs = [];
    this.filtered = [];
    this.loading = false;
    this.filter = "all";
    this.search = "";
    this.sortBy = "transfers";
    this.page = 1;
    this.blockNum = null;
    this.plsPrice = null;
    this.lastUpdated = null;
    this.refreshInterval = null;
    this.walletBalances = new Map(); // Store wallet token balances
  }

  async init() {
    console.log('🏭 Initializing Factory page...');

    this.setupEventListeners();
    await this.load();
    this.startLiveUpdates();

    // Load wallet balances if connected
    if (window.wallet?.isConnected) {
      await this.loadWalletBalances();
    }

    // Try to load additional tokens from DEXScreener
    await this.loadAdditionalTokens();
  }

  // Load wallet balances for displayed tokens
  async loadWalletBalances() {
    if (!window.wallet?.isConnected || !window.wallet?.address) {
      return;
    }

    try {
      console.log('💰 Loading wallet balances for factory tokens...');
      const provider = window.wallet.provider;
      const userAddress = window.wallet.address;

      // Load balance for each token in the pairs list
      for (const pair of this.pairs) {
        try {
          const tokenContract = new ethers.Contract(
            pair.addr,
            CONFIG.ABIS.ERC20,
            provider
          );
          const balance = await tokenContract.balanceOf(userAddress);
          this.walletBalances.set(pair.addr.toLowerCase(), balance.toString());
        } catch (err) {
          // Token might not be a standard ERC20, skip
          this.walletBalances.set(pair.addr.toLowerCase(), '0');
        }
      }

      // Also get PLS balance
      const plsBalance = await provider.getBalance(userAddress);
      this.walletBalances.set('pls', plsBalance.toString());

      // Update PLS balance display
      const plsCard = document.getElementById('plsBalanceCard');
      const plsValue = document.getElementById('statPLSBalance');
      if (plsCard && plsValue) {
        const plsFormatted = Number(ethers.formatEther(plsBalance)).toFixed(4);
        plsValue.textContent = `${plsFormatted} PLS`;
        plsCard.style.display = 'block';
      }

      console.log('✅ Wallet balances loaded');
      this.renderTable(); // Re-render to show balances

    } catch (error) {
      console.error('Failed to load wallet balances:', error);
    }
  }

  // Fetch additional tokens from external sources (DEXScreener trending)
  async loadAdditionalTokens() {
    try {
      console.log('🔍 Fetching additional tokens from DEXScreener...');
      
      // DEXScreener trending/boosted tokens on PulseChain
      const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      
      if (!response.ok) {
        console.log('DEXScreener boosts API not available');
        return;
      }
      
      const data = await response.json();
      
      if (data && Array.isArray(data)) {
        // Filter for PulseChain tokens only (chainId: 369)
        const pulseChainTokens = data.filter(t => t.chainId === 'pulsechain' || t.chainId === '369');
        
        console.log(`✅ Found ${pulseChainTokens.length} trending tokens on PulseChain`);
        
        // Merge with existing tokens, avoiding duplicates
        const existingAddrs = new Set(KNOWN_TOKENS.map(t => t.addr.toLowerCase()));
        let added = 0;
        
        for (const token of pulseChainTokens) {
          if (token.tokenAddress && !existingAddrs.has(token.tokenAddress.toLowerCase())) {
            KNOWN_TOKENS.push({
              symbol: token.tokenSymbol || 'UNKNOWN',
              addr: token.tokenAddress,
              name: token.tokenName || token.tokenSymbol,
              source: 'dexscreener-trending'
            });
            existingAddrs.add(token.tokenAddress.toLowerCase());
            added++;
          }
        }
        
        if (added > 0) {
          console.log(`✅ Added ${added} trending tokens from DEXScreener`);
          // Reload with new tokens
          await this.load();
        }
      }
    } catch (err) {
      console.log('DEXScreener trending API error:', err.message);
    }
  }

  // Search for token on external sites
  async searchExternal(query) {
    if (!query || query.length < 3) return;
    
    const results = [];
    
    // Search on PulseCoinList
    try {
      const pclUrl = `https://pulsecoinlist.com/?search=${encodeURIComponent(query)}`;
      results.push({
        name: 'PulseCoinList',
        url: pclUrl,
        icon: '🔍'
      });
    } catch (e) {}
    
    // Search on PulseScan
    if (query.startsWith('0x') && query.length === 42) {
      results.push({
        name: 'PulseScan',
        url: `https://scan.pulsechain.com/address/${query}`,
        icon: '🔎'
      });
      
      // DEXScreener
      results.push({
        name: 'DEXScreener',
        url: `https://dexscreener.com/pulsechain/${query}`,
        icon: '📊'
      });
      
      // PulseX Info
      results.push({
        name: 'PulseX Info',
        url: `https://pulsex.mypinata.cloud/#/tokens/${query}`,
        icon: '💱'
      });
    }
    
    // Render external search results
    this.renderExternalResults(results, query);
  }

  renderExternalResults(results, query) {
    const tbody = document.getElementById('factoryTableBody');
    if (!tbody || results.length === 0) return;
    
    const html = `
      <div style="padding: 20px; border-bottom: 1px solid var(--border-1); background: rgba(124, 58, 237, 0.05);">
        <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-2); margin-bottom: 12px;">
          🔎 External search results for "${query}":
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${results.map(r => `
            <a href="${r.url}" target="_blank" rel="noopener" 
               style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-2); background: var(--bg-card); font-family: var(--font-mono); font-size: 0.75rem; color: var(--primary-light); text-decoration: none; transition: all 0.2s;"
               onmouseover="this.style.background='rgba(124, 58, 237, 0.1)'" 
               onmouseout="this.style.background='var(--bg-card)'">
              ${r.icon} ${r.name}
            </a>
          `).join('')}
        </div>
      </div>
    `;
    
    // Prepend to table
    tbody.insertAdjacentHTML('afterbegin', html);
  }

  setupEventListeners() {
    // Search
    const searchInput = document.getElementById('factorySearch');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', async (e) => {
        const value = e.target.value.trim();
        this.search = value;
        this.page = 1;
        this.applyFilters();
        
        // If it's a valid 0x address (42 chars), could be token or wallet
        if (value.startsWith('0x') && value.length === 42) {
          console.log('Address detected:', value);
          
          // First try as token
          const tokenResult = await this.lookupTokenByAddress(value);
          
          // If not a token (no metadata), try as wallet
          if (!tokenResult) {
            console.log('Not a token, trying wallet search...');
            await this.searchWalletAddress(value);
          }
        }
        
        // Debounced external search for non-address queries
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (value.length >= 3 && !value.startsWith('0x')) {
            this.searchExternal(value);
          }
        }, 500);
      });
    }

    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        this.page = 1;
        
        // Update active state
        filterBtns.forEach(b => {
          b.style.borderColor = 'var(--border-1)';
          b.style.color = 'var(--text-2)';
          b.style.background = 'var(--bg-card)';
        });
        btn.style.borderColor = 'var(--pink)';
        btn.style.color = 'var(--pink)';
        btn.style.background = 'rgba(255, 45, 120, 0.1)';
        
        this.applyFilters();
      });
    });

    // Set initial active filter
    const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allBtn) {
      allBtn.style.borderColor = 'var(--pink)';
      allBtn.style.color = 'var(--pink)';
      allBtn.style.background = 'rgba(255, 45, 120, 0.1)';
    }

    // Sort
    const sortSelect = document.getElementById('factorySort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.page = 1;
        this.applyFilters();
      });
    }

    // Refresh
    const refreshBtn = document.getElementById('refreshFactory');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.load());
    }
  }

  startLiveUpdates() {
    // Update block number every 5 seconds
    this.refreshInterval = setInterval(() => this.fetchBlock(), 5000);
  }

  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  // API helper
  async callAPI(params) {
    const url = `${API_BASE}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }

  // Fetch current block number
  async fetchBlock() {
    try {
      const res = await this.callAPI({ module: "block", action: "eth_block_number" });
      if (res.result) {
        this.blockNum = parseInt(res.result, 16).toLocaleString();
        const blockEl = document.getElementById('blockNumber');
        if (blockEl) blockEl.textContent = this.blockNum;
      }
    } catch (e) {
      console.warn('Failed to fetch block:', e);
    }
  }

  // Fetch PLS/USD price
  async fetchPrice() {
    try {
      const res = await this.callAPI({ module: "stats", action: "coinprice" });
      if (res.result?.coin_usd) {
        this.plsPrice = Number(res.result.coin_usd);
        const priceEl = document.getElementById('plsPrice');
        const badgeEl = document.getElementById('plsPriceBadge');
        if (priceEl) priceEl.textContent = this.plsPrice.toFixed(5);
        if (badgeEl) badgeEl.style.display = 'flex';
      }
    } catch (e) {
      console.warn('Failed to fetch PLS price:', e);
    }
  }

  // Fetch token metadata
  async fetchTokenMeta(address) {
    try {
      const res = await this.callAPI({ module: "token", action: "getToken", contractaddress: address });
      return res.result || null;
    } catch { return null; }
  }

  // Fetch token supply
  async fetchSupply(address) {
    try {
      const res = await this.callAPI({ module: "stats", action: "tokensupply", contractaddress: address });
      return res.result || "0";
    } catch { return "0"; }
  }

  // Fetch token transfers (activity proxy)
  async fetchTransfers(address) {
    try {
      const res = await this.callAPI({ module: "account", action: "tokentx", address });
      return Array.isArray(res.result) ? res.result.length : 0;
    } catch { return 0; }
  }

  // Fetch token holders
  async fetchHolderCount(address) {
    try {
      const res = await this.callAPI({ module: "token", action: "getTokenHolders", contractaddress: address });
      return Array.isArray(res.result) ? res.result.length : 0;
    } catch { return 0; }
  }

  // Discover tokens from DEXScreener (gets top pairs with activity)
  async discoverTokens() {
    try {
      console.log('🔍 Discovering tokens from DEXScreener...');
      
      // Fetch top pairs from PulseChain on DEXScreener
      const res = await fetch('https://api.dexscreener.com/latest/dex/pulsechain');
      
      if (!res.ok) {
        console.log('DEXScreener API not available, using known tokens');
        return KNOWN_TOKENS;
      }
      
      const data = await res.json();
      
      if (data && data.pairs && Array.isArray(data.pairs)) {
        console.log(`✅ Found ${data.pairs.length} pairs from DEXScreener`);
        
        // Extract unique tokens from pairs
        const tokens = new Map();
        
        for (const pair of data.pairs) {
          // Add base token
          if (pair.baseToken && pair.baseToken.address) {
            tokens.set(pair.baseToken.address.toLowerCase(), {
              symbol: pair.baseToken.symbol || 'UNKNOWN',
              addr: pair.baseToken.address,
              name: pair.baseToken.name,
              decimals: '18',
              source: 'dexscreener'
            });
          }
          
          // Add quote token (usually WPLS)
          if (pair.quoteToken && pair.quoteToken.address) {
            tokens.set(pair.quoteToken.address.toLowerCase(), {
              symbol: pair.quoteToken.symbol || 'UNKNOWN',
              addr: pair.quoteToken.address,
              name: pair.quoteToken.name,
              decimals: '18',
              source: 'dexscreener'
            });
          }
        }
        
        // Merge with known tokens, avoiding duplicates
        const existingAddrs = new Set(KNOWN_TOKENS.map(t => t.addr.toLowerCase()));
        const discoveredTokens = Array.from(tokens.values()).filter(t => !existingAddrs.has(t.addr.toLowerCase()));
        
        console.log(`✅ Discovered ${discoveredTokens.length} new tokens`);
        
        return [...KNOWN_TOKENS, ...discoveredTokens];
      }
    } catch (err) {
      console.log('DEXScreener token discovery failed:', err.message);
    }
    
    // Fallback: return known tokens
    return KNOWN_TOKENS;
  }

  // Lookup a specific token by address (for user searches)
  async lookupTokenByAddress(address) {
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      console.log('Invalid address format:', address);
      return null;
    }
    
    // Check if already in KNOWN_TOKENS (persisted)
    const knownExisting = KNOWN_TOKENS.find(t => t.addr.toLowerCase() === address.toLowerCase());
    if (knownExisting) {
      console.log('Token already in KNOWN_TOKENS:', knownExisting);
      // Still check if it's in current pairs
      const pairExisting = this.pairs.find(p => p.addr.toLowerCase() === address.toLowerCase());
      if (pairExisting) return pairExisting;
    }
    
    // Check if already in current pairs list
    const existing = this.pairs.find(p => p.addr.toLowerCase() === address.toLowerCase());
    if (existing) {
      console.log('Token already in current pairs:', existing);
      return existing;
    }
    
    try {
      console.log('🔍 Looking up token:', address);
      
      const [meta, supply, transfers, holders] = await Promise.all([
        this.fetchTokenMeta(address),
        this.fetchSupply(address),
        this.fetchTransfers(address),
        this.fetchHolderCount(address),
      ]);
      
      if (!meta) {
        console.log('No metadata found for address:', address);
        return null;
      }
      
      // Create token object
      const token = {
        symbol: meta.symbol || 'UNKNOWN',
        addr: address,
        name: meta.name || meta.symbol || 'Unknown Token',
        decimals: meta.decimals || "18",
        tokenType: meta.type || "ERC-20",
        meta,
        supply,
        transfers,
        holders,
        source: 'lookup'
      };
      
      // Add to KNOWN_TOKENS for persistence (avoid duplicates)
      if (!KNOWN_TOKENS.find(t => t.addr.toLowerCase() === address.toLowerCase())) {
        KNOWN_TOKENS.push({
          symbol: token.symbol,
          addr: token.addr,
          name: token.name,
          source: 'discovered'
        });
        console.log('✅ Added to KNOWN_TOKENS:', token.symbol);
      }
      
      // Add to pairs
      const pair = {
        id: this.pairs.length + 1,
        t0: token.symbol,
        t1: "WPLS",
        type: this.classifyPair(token.symbol, "WPLS"),
        addr: token.addr,
        name: token.name,
        decimals: token.decimals,
        tokenType: token.tokenType,
        supply: token.supply,
        transfers: token.transfers,
        holders: token.holders,
        source: 'lookup'
      };
      
      this.pairs.push(pair);
      this.applyFilters();
      this.updateStats();
      
      console.log('✅ Added new token:', pair);
      
      // Show toast
      if (window.wallet?.showToast) {
        window.wallet.showToast(`Discovered ${token.symbol}! Added to list.`, 'success');
      }
      
      return pair;
      
    } catch (err) {
      console.error('Token lookup failed:', err);
      return null;
    }
  }

  // Search wallet address to find tokens held by that wallet
  async searchWalletAddress(address) {
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      console.log('Invalid wallet address format:', address);
      return null;
    }
    
    console.log('🔍 Searching wallet for tokens:', address);
    
    try {
      // Fetch token transfers for this address (shows tokens the wallet has interacted with)
      const res = await this.callAPI({ 
        module: "account", 
        action: "tokentx",
        address: address,
        page: 1,
        offset: 100
      });
      
      if (!res.result || !Array.isArray(res.result)) {
        console.log('No token transactions found for wallet:', address);
        return null;
      }
      
      // Extract unique token addresses
      const tokenAddrs = new Set();
      res.result.forEach(tx => {
        if (tx.contractAddress) {
          tokenAddrs.add(tx.contractAddress.toLowerCase());
        }
      });
      
      console.log(`Found ${tokenAddrs.size} unique tokens in wallet`);
      
      // Look up each token
      const discovered = [];
      for (const tokenAddr of tokenAddrs) {
        const pair = await this.lookupTokenByAddress(tokenAddr);
        if (pair) discovered.push(pair);
      }
      
      console.log(`✅ Discovered ${discovered.length} tokens from wallet`);
      
      // Show results UI
      this.renderWalletResults(address, discovered);
      
      return discovered;
      
    } catch (err) {
      console.error('Wallet search failed:', err);
      return null;
    }
  }

  renderWalletResults(walletAddr, tokens) {
    const tbody = document.getElementById('factoryTableBody');
    if (!tbody) return;
    
    const shortAddr = (addr) => addr.slice(0, 6) + '...' + addr.slice(-4);
    
    const html = `
      <div style="padding: 16px 20px; border-bottom: 2px solid var(--pink); background: rgba(255, 45, 120, 0.05);">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <span style="font-size: 1.2rem;">👛</span>
          <div>
            <div style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600; color: var(--text-1);">
              Wallet: ${shortAddr(walletAddr)}
            </div>
            <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-3);">
              Found ${tokens.length} tokens
            </div>
          </div>
          <a href="https://scan.pulsechain.com/address/${walletAddr}" target="_blank" rel="noopener"
             style="margin-left: auto; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-2); background: var(--bg-card); font-family: var(--font-mono); font-size: 0.7rem; color: var(--primary-light); text-decoration: none;">
            View on PulseScan →
          </a>
        </div>
        ${tokens.length > 0 ? `
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${tokens.map(t => `
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border-2); background: var(--bg-card); font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-2);">
                <span style="color: var(--pink); font-weight: 600;">${t.t0}</span>
                <span style="opacity: 0.5;">•</span>
                <span>${t.transfers.toLocaleString()} tx</span>
              </span>
            `).join('')}
          </div>
        ` : '<div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-3);">No tokens with activity found</div>'}
      </div>
    `;
    
    // Prepend to table
    tbody.insertAdjacentHTML('afterbegin', html);
    
    // Show toast
    if (window.wallet?.showToast && tokens.length > 0) {
      window.wallet.showToast(`Found ${tokens.length} tokens in wallet ${shortAddr(walletAddr)}`, 'success');
    }
  }

  // Main data loader
  async load() {
    this.loading = true;
    this.showLoading(true);
    this.showError(false);

    try {
      // Fetch price
      await this.fetchPrice();

      // Try to discover tokens dynamically, fallback to known tokens
      let tokensToFetch = await this.discoverTokens();
      
      // If discovery returned empty or failed, use known tokens
      if (!tokensToFetch || tokensToFetch.length === 0) {
        tokensToFetch = KNOWN_TOKENS;
      }

      // Fetch all token data in parallel (batch in groups of 5 to avoid rate limits)
      const tokenData = [];
      const batchSize = 5;
      
      for (let i = 0; i < tokensToFetch.length; i += batchSize) {
        const batch = tokensToFetch.slice(i, i + batchSize);
        const batchData = await Promise.all(
          batch.map(async (tok) => {
            try {
              const [meta, supply, transfers, holders] = await Promise.all([
                this.fetchTokenMeta(tok.addr),
                this.fetchSupply(tok.addr),
                this.fetchTransfers(tok.addr),
                this.fetchHolderCount(tok.addr),
              ]);
              return { ...tok, meta, supply, transfers, holders };
            } catch (err) {
              console.warn('Failed to fetch token:', tok.addr, err.message);
              return { ...tok, meta: null, supply: "0", transfers: 0, holders: 0 };
            }
          })
        );
        tokenData.push(...batchData);
      }

      // Build pair rows
      const rows = [];
      let idx = 1;

      for (const tok of tokenData) {
        const decimals = tok.meta?.decimals || "18";
        const name = tok.meta?.name || tok.symbol;
        const type_val = tok.meta?.type || "ERC-20";

        if (tok.symbol === "WPLS") continue;

        // Only create Token/WPLS pairs (real PulseX pairs)
        rows.push({
          id: idx++,
          t0: tok.symbol,
          t1: "WPLS",
          type: this.classifyPair(tok.symbol, "WPLS"),
          addr: tok.addr,
          name,
          decimals,
          tokenType: type_val,
          supply: tok.supply,
          transfers: tok.transfers,
          holders: tok.holders,
        });
      }

      // Sort by transfer activity
      rows.sort((a, b) => b.transfers - a.transfers);
      rows.forEach((r, i) => (r.id = i + 1));

      this.pairs = rows;
      this.lastUpdated = new Date().toLocaleTimeString();
      
      this.applyFilters();
      this.updateStats();
      this.fetchBlock();
      
    } catch (err) {
      console.error("Factory load error:", err);
      this.showError(true);
    } finally {
      this.loading = false;
      this.showLoading(false);
    }
  }

  classifyPair(t0, t1) {
    const STABLE_SYMBOLS = ["DAI", "USDC", "USDT", "BUSD", "eUSDC", "eDAI", "eUSDT"];
    if (STABLE_SYMBOLS.includes(t0) && STABLE_SYMBOLS.includes(t1)) return "stable";
    return "lp";
  }

  applyFilters() {
    let list = [...this.pairs];

    if (this.filter !== "all") {
      list = list.filter((p) => p.type === this.filter);
    }

    if (this.search.trim()) {
      const q = this.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.t0.toLowerCase().includes(q) ||
          p.t1.toLowerCase().includes(q) ||
          p.addr.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
      );
    }

    if (this.sortBy === "transfers") list.sort((a, b) => b.transfers - a.transfers);
    if (this.sortBy === "holders") list.sort((a, b) => b.holders - a.holders);
    if (this.sortBy === "supply") list.sort((a, b) => Number(b.supply) - Number(a.supply));

    this.filtered = list;
    this.renderTable();
    this.renderPagination();
    this.updateFooter();
  }

  updateStats() {
    const lpCount = this.pairs.filter((p) => p.type === "lp").length;
    const stableCount = this.pairs.filter((p) => p.type === "stable").length;
    const totalTx = this.pairs.reduce((s, p) => s + p.transfers, 0);

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('statTotalPairs', this.pairs.length.toLocaleString());
    setVal('statLpPairs', lpCount.toLocaleString());
    setVal('statStablePairs', stableCount.toLocaleString());
    setVal('statTotalTx', totalTx.toLocaleString());
  }

  renderTable() {
    const tbody = document.getElementById('factoryTableBody');
    if (!tbody) return;

    if (this.filtered.length === 0) {
      tbody.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 4rem; color: var(--text-2); font-family: var(--font-mono);">
          No pairs found.
        </div>
      `;
      return;
    }

    const start = (this.page - 1) * PAGE_SIZE;
    const paginated = this.filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paginated.map((p, i) => this.renderRow(p, start + i + 1)).join('');
  }

  renderRow(pair, index) {
    const typeColors = {
      stable: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa' },
      lp: { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)', color: '#a78bfa' },
    };
    const typeStyle = typeColors[pair.type] || typeColors.lp;
    const typeLabel = pair.type === "stable" ? "STABLE" : "LP";

    const shortAddr = (addr) => addr.length < 10 ? addr : addr.slice(0, 6) + "..." + addr.slice(-4);

    const fmtBalance = (raw, decimals = 18) => {
      if (!raw || raw === "0") return "0";
      const val = Number(raw) / Math.pow(10, Number(decimals));
      if (val >= 1e9) return (val / 1e9).toFixed(2) + "B";
      if (val >= 1e6) return (val / 1e6).toFixed(2) + "M";
      if (val >= 1e3) return (val / 1e3).toFixed(1) + "K";
      return val.toFixed(4);
    };

    // Get wallet balance for this token
    const walletBalance = this.walletBalances.get(pair.addr.toLowerCase());
    const hasBalance = walletBalance && walletBalance !== "0";
    const balanceFormatted = walletBalance ? fmtBalance(walletBalance, pair.decimals) : null;

    return `
      <div style="display: grid; grid-template-columns: 50px 1.5fr 140px 100px 120px 100px 90px 80px 100px; padding: 14px 20px; border-bottom: 1px solid var(--border-1); align-items: center; transition: background 0.15s;" onmouseover="this.style.background='rgba(124, 58, 237, 0.05)'" onmouseout="this.style.background='transparent'">
        <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-3);">${index}</div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="display: inline-flex; align-items: center; background: rgba(255, 45, 120, 0.1); border: 1px solid rgba(255, 45, 120, 0.3); border-radius: 20px; padding: 3px 10px; font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; color: var(--pink);">
              ${pair.t0}
            </span>
            <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-3);">/</span>
            <span style="display: inline-flex; align-items: center; background: rgba(128, 128, 128, 0.08); border: 1px solid rgba(128, 128, 128, 0.25); border-radius: 20px; padding: 3px 10px; font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; color: var(--text-2);">
              ${pair.t1}
            </span>
            ${hasBalance ? `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 12px; font-family: var(--font-mono); font-size: 0.65rem; font-weight: 600; background: rgba(0, 209, 140, 0.15); border: 1px solid rgba(0, 209, 140, 0.4); color: var(--green);">
              💰 ${balanceFormatted}
            </span>` : ''}
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-3);">${pair.name}</div>
        </div>

        <div>
          <a href="https://scan.pulsechain.com/address/${pair.addr}" target="_blank" rel="noopener" style="color: #60a5fa; text-decoration: none; font-family: var(--font-mono); font-size: 0.8rem;">
            ${shortAddr(pair.addr)}
          </a>
          <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-3); margin-top: 2px;">${pair.tokenType}</div>
        </div>

        <div style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600; ${hasBalance ? 'color: var(--green);' : 'color: var(--text-1);'}">
          ${balanceFormatted || '-'}
        </div>

        <div style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;">${fmtBalance(pair.supply, pair.decimals)}</div>
        <div style="font-family: var(--font-mono); font-size: 0.85rem;">${pair.transfers.toLocaleString()}</div>
        <div style="font-family: var(--font-mono); font-size: 0.85rem;">${pair.holders}</div>

        <div>
          <span style="display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-family: var(--font-mono); font-size: 0.7rem; font-weight: 700; background: ${typeStyle.bg}; border: 1px solid ${typeStyle.border}; color: ${typeStyle.color};">
            ${typeLabel}
          </span>
        </div>

        <div>
          <button onclick="factoryPage.handlePurge('${pair.t0}', '${pair.t1}', '${pair.addr}', '${pair.name}')" style="padding: 6px 14px; border-radius: 8px; border: 1px solid var(--pink); background: rgba(255, 45, 120, 0.1); font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; color: var(--pink); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255, 45, 120, 0.2)'" onmouseout="this.style.background='rgba(255, 45, 120, 0.1)'">
            Purge →
          </button>
        </div>
      </div>
    `;
  }

  handlePurge(from, to, pairAddr, tokenName) {
    console.log('Purge triggered:', { from, to, pairAddr, tokenName });

    // Check if wallet is connected
    if (!window.wallet?.isConnected) {
      window.wallet.showToast('Please connect your wallet first', 'error');
      window.wallet.connect();
      return;
    }

    // Navigate to sweep page with pre-filled token using router
    window.location.hash = `#/sweep?token=${encodeURIComponent(from)}&contract=${pairAddr}`;

    // Show toast
    if (window.wallet?.showToast) {
      window.wallet.showToast(`Selected ${from} for purging. Redirecting to Sweep page...`, 'info');
    }
  }

  renderPagination() {
    const totalPages = Math.ceil(this.filtered.length / PAGE_SIZE);
    const container = document.getElementById('factoryPagination');
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    const maxButtons = 8;
    let pages = [];
    
    if (totalPages <= maxButtons) {
      pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      if (this.page <= 4) {
        pages = [1, 2, 3, 4, 5, '...', totalPages];
      } else if (this.page >= totalPages - 3) {
        pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
      } else {
        pages = [1, '...', this.page - 1, this.page, this.page + 1, '...', totalPages];
      }
    }

    container.innerHTML = pages.map(pg => {
      if (pg === '...') {
        return `<span style="padding: 8px; color: var(--text-3);">...</span>`;
      }
      const isActive = pg === this.page;
      return `
        <button onclick="factoryPage.goToPage(${pg})" style="width: 36px; height: 36px; border-radius: 8px; border: 1px solid ${isActive ? 'var(--pink)' : 'var(--border-1)'}; background: ${isActive ? 'rgba(255, 45, 120, 0.1)' : 'transparent'}; font-family: var(--font-mono); font-size: 0.8rem; color: ${isActive ? 'var(--pink)' : 'var(--text-2)'}; cursor: pointer;">
          ${pg}
        </button>
      `;
    }).join('');
  }

  goToPage(pg) {
    this.page = pg;
    this.renderTable();
    this.renderPagination();
    this.updateFooter();
  }

  updateFooter() {
    const footer = document.getElementById('factoryFooterInfo');
    if (!footer) return;

    if (this.filtered.length === 0) {
      footer.textContent = '';
      return;
    }

    const start = (this.page - 1) * PAGE_SIZE + 1;
    const end = Math.min(this.page * PAGE_SIZE, this.filtered.length);
    footer.innerHTML = `Showing ${start}–${end} of ${this.filtered.length.toLocaleString()} pairs${this.lastUpdated ? ` · Updated ${this.lastUpdated}` : ''}`;
  }

  showLoading(show) {
    const el = document.getElementById('factoryLoading');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  showError(show) {
    const el = document.getElementById('factoryError');
    if (el) el.classList.toggle('hidden', !show);
  }
}

// Global instance
window.factoryPage = new FactoryPage();
