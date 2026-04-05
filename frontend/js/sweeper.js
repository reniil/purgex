// PurgeX Frontend - Dust Sweeper Logic
// Token discovery, selection, and sweeping functionality

class DustSweeper {
  constructor(app) {
    this.app = app;
    this.tokens = [];
    this.selectedTokens = new Map(); // Changed from Set to Map
    this.loading = false;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadTokenList();
  }

  setupEventListeners() {
    // Token selection
    document.addEventListener('change', (e) => {
      if (e.target.matches('.token-checkbox')) {
        this.handleTokenSelection(e.target);
      }
    });

    // Select all toggle
    document.addEventListener('click', (e) => {
      if (e.target.matches('.select-all-btn, [data-action="select-all"]')) {
        this.toggleSelectAll();
      }
    });

    // Add custom token
    document.addEventListener('click', (e) => {
      if (e.target.matches('.add-token-btn, [data-action="add-custom-token"]')) {
        this.showAddTokenDialog();
      }
    });

    // Sweep button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.sweep-btn, [data-action="sweep"]')) {
        this.executeSweep();
      }
    });

    // Refresh tokens
    document.addEventListener('click', (e) => {
      if (e.target.matches('.refresh-btn, [data-action="refresh"]')) {
        this.loadTokenList();
      }
    });
  }

  // Load token list from wallet
  async loadTokenList() {
    try {
      this.showLoading();
      
      const tokens = await this.discoverTokens();
      this.tokens = tokens;
      
      this.hideLoading();
      this.renderTokenList();
      
      // Show token section and sweep section if tokens found
      if (tokens.length > 0) {
        const sweepSection = document.getElementById('sweep-section');
        const tokenSection = document.getElementById('token-section');
        const sweepConnectPrompt = document.getElementById('sweep-connect-prompt');
        const walletConnected = document.getElementById('wallet-connected');
        const emptyState = document.getElementById('empty-state');
        
        if (sweepSection) {
          sweepSection.classList.remove('hidden');
        }
        if (tokenSection) {
          tokenSection.classList.remove('hidden');
        }
        if (sweepConnectPrompt) {
          sweepConnectPrompt.classList.add('hidden');
        }
        if (walletConnected) {
          walletConnected.classList.remove('hidden');
        }
        if (emptyState) {
          emptyState.classList.add('hidden');
        }
      } else {
        // Show empty state
        const tokenSection = document.getElementById('token-section');
        const emptyState = document.getElementById('empty-state');
        const sweepSection = document.getElementById('sweep-section');
        
        if (tokenSection) {
          tokenSection.classList.remove('hidden');
        }
        if (emptyState) {
          emptyState.classList.remove('hidden');
        }
        if (sweepSection) {
          sweepSection.classList.add('hidden');
        }
      }
      
      this.app.showToast(`Found ${tokens.length} tokens`, 'success');
    } catch (error) {
      console.error('Error loading tokens:', error);
      this.app.showToast('Failed to load tokens', 'error');
    }
  }

  // Discover tokens in wallet
  async discoverTokens() {
    const account = this.app.account;
    const tokens = [];
    const seenAddresses = new Set(); // Track addresses to avoid duplicates
    
    // Common PulseChain tokens (PRGX + major tokens) - with proper checksums
    const knownTokens = [
      {
        address: CONFIG.CONTRACTS.PRGX_TOKEN,
        symbol: 'PRGX',
        name: 'PurgeX Token',
        decimals: 18,
        logoURI: 'https://raw.githubusercontent.com/reniil/purgex/main/assets/logo.png'
      },
      {
        address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: 18
      },
      {
        address: '0x15fd4D5E63D94A5a74C5486814Ab7a6C3d6aA4d3',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
      },
      {
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        symbol: 'DAI',
        name: 'Dai Stablecoin',
        decimals: 18
      },
      {
        address: '0x2b8889546191c421724024524663916F9a487d0d',
        symbol: 'HEX',
        name: 'HEX',
        decimals: 8
      }
    ];

    // Method 1: Check known tokens
    for (const token of knownTokens) {
      try {
        // Fix address checksum
        const checksumAddress = ethers.getAddress(token.address);
        
        // Skip if already seen
        if (seenAddresses.has(checksumAddress.toLowerCase())) {
          continue;
        }
        
        const balance = await this.getTokenBalance(checksumAddress, account);
        if (balance && balance > 0) {
          seenAddresses.add(checksumAddress.toLowerCase());
          tokens.push({
            address: checksumAddress,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            balance: balance,
            logoURI: token.logoURI,
            value: await this.getTokenValue(checksumAddress, balance)
          });
          console.log(`Found ${token.symbol}: ${ethers.formatUnits(balance, token.decimals)}`);
        }
      } catch (error) {
        console.warn(`Error checking ${token.symbol}:`, error.message);
      }
    }

    // Try to discover additional tokens using a more comprehensive approach
    await this.discoverAdditionalTokens(account, tokens, seenAddresses);

    // Sort by value (descending) - dust tokens will appear at the end
    tokens.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    return tokens;
  }

  // Discover additional tokens using block explorer API or other methods
  async discoverAdditionalTokens(account, tokens, seenAddresses) {
    try {
      // Method 1: Use PulseScan API to get token transfers
      const apiUrl = 'https://api.scan.pulsechain.com/api';
      const response = await fetch(`${apiUrl}?module=account&action=tokentx&address=${account}&sort=asc`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === '1' && data.result) {
          
          for (const tx of data.result) {
            const tokenAddress = tx.contractAddress.toLowerCase();
            
            // Skip if we already have this token or if it's the zero address
            if (seenAddresses.has(tokenAddress) || tokenAddress === '0x0000000000000000000000000000000000000000') {
              continue;
            }
            
            try {
              const balance = await this.getTokenBalance(tx.contractAddress, account);
              if (balance && balance > 0) {
                const tokenInfo = await this.getTokenInfo(tx.contractAddress);
                seenAddresses.add(tokenAddress);
                tokens.push({
                  address: tx.contractAddress,
                  symbol: tokenInfo.symbol || 'UNKNOWN',
                  name: tokenInfo.name || 'Unknown Token',
                  decimals: tokenInfo.decimals || 18,
                  balance: balance,
                  value: await this.getTokenValue(tx.contractAddress, balance)
                });
                console.log(`Discovered ${tokenInfo.symbol || 'UNKNOWN'}: ${ethers.formatUnits(balance, tokenInfo.decimals || 18)}`);
              }
            } catch (error) {
              console.warn(`Failed to get token info for ${tx.contractAddress}:`, error.message);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to discover additional tokens:', error.message);
    }

    // Method 2: Try some common dust token addresses on PulseChain
    const commonDustTokens = [
      '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
      '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB',
      '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      '0x4F96Fe3b7A6cf9725f59d353F723c1bDb64CA6Aa'
    ].filter(addr => {
      // Filter out obviously invalid addresses
      return addr && addr.length === 42 && addr.startsWith('0x');
    });

    for (const address of commonDustTokens) {
      // Skip if we already have this token
      if (seenAddresses.has(address.toLowerCase())) {
        continue;
      }

      try {
        // Fix address checksum
        const checksumAddress = ethers.getAddress(address);
        const balance = await this.getTokenBalance(checksumAddress, account);
        if (balance && balance > 0) {
          const tokenInfo = await this.getTokenInfo(checksumAddress);
          seenAddresses.add(address.toLowerCase());
          tokens.push({
            address: checksumAddress,
            symbol: tokenInfo.symbol || 'UNKNOWN',
            name: tokenInfo.name || 'Unknown Token',
            decimals: tokenInfo.decimals || 18,
            balance: balance,
            value: await this.getTokenValue(checksumAddress, balance)
          });
          console.log(`Found dust token ${tokenInfo.symbol || 'UNKNOWN'}: ${ethers.formatUnits(balance, tokenInfo.decimals || 18)}`);
        }
      } catch (error) {
        // Expected for most tokens - continue
      }
    }
  }

  // Get token information (symbol, name, decimals)
  async getTokenInfo(tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        'function symbol() view returns (string)',
        'function name() view returns (string)',
        'function decimals() view returns (uint8)'
      ], this.app.provider);

      const [symbol, name, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.name(),
        tokenContract.decimals()
      ]);

      return { symbol, name, decimals: Number(decimals) };
    } catch (error) {
      return { symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 18 };
    }
  }

  // Get token balance
  async getTokenBalance(tokenAddress, account) {
    // Fix address checksum
    try {
      tokenAddress = ethers.getAddress(tokenAddress);
    } catch (error) {
      console.warn(`Invalid address format: ${tokenAddress}`);
      return 0;
    }

    // Check if provider is available
    if (!this.app.provider) {
      console.warn('Provider not available');
      return 0;
    }

    if (tokenAddress === '0xA1077a294dDE1B09bB078844df40758a5D0f9a27') {
      // PLS (native token)
      try {
        const balance = await this.app.provider.getBalance(account);
        return balance;
      } catch (error) {
        console.warn(`Failed to get native balance: ${error.message}`);
        return 0;
      }
    }

    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)'
      ], this.app.provider);

      const balance = await tokenContract.balanceOf(account);
      // Return balance even if it's very small (dust)
      return balance;
    } catch (error) {
      console.warn(`Balance check failed for ${tokenAddress}: ${error.message}`);
      return 0;
    }
  }

  // Get token value in USD (mock implementation with safe formatting)
  async getTokenValue(tokenAddress, balance) {
    // This would normally fetch from a price API
    // For now, return 0 for most tokens
    if (tokenAddress === CONFIG.CONTRACTS.PRGX_TOKEN) {
      // Mock PRGX price of $0.15
      try {
        return parseFloat(ethers.formatUnits(balance, 18)) * 0.15;
      } catch (error) {
        console.warn('Token value calculation error:', error.message);
        return 0;
      }
    }
    return 0;
  }

  // Render token list
  renderTokenList() {
    const container = document.querySelector('.token-list');
    if (!container) return;

    if (this.tokens.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No tokens found</h3>
          <p>Your wallet doesn't contain any tokens with balance</p>
          <button class="btn btn-primary" data-action="add-custom-token">
            Add Custom Token
          </button>
        </div>
      `;
      return;
    }

    const html = this.tokens.map((token, index) => {
      const balance = ethers.formatUnits(token.balance, token.decimals || 18);
      const balanceNum = parseFloat(balance);
      const isDust = balanceNum < 0.01 && balanceNum > 0;
      const isZero = balanceNum === 0;
      
      return `
        <div class="token-row ${isDust ? 'dust-token' : ''} ${isZero ? 'zero-token' : ''}" data-token="${token.address}">
          <div class="token-checkbox-wrapper">
            <input type="checkbox" 
                   id="token-${index}" 
                   class="token-checkbox" 
                   data-address="${token.address}"
                   data-balance="${token.balance}"
                   data-symbol="${token.symbol}"
                   data-decimals="${token.decimals || 18}">
            <label for="token-${index}"></label>
          </div>
          
          <div class="token-info">
            <div class="token-logo">
              ${token.logoURI ? 
                `<img src="${token.logoURI}" alt="${token.symbol}" onerror="this.style.display='none'">` : 
                `<div class="token-logo-placeholder">${token.symbol.slice(0, 2)}</div>`
              }
            </div>
            <div class="token-details">
              <div class="token-name">${token.name}</div>
              <div class="token-address">${this.app.formatAddress(token.address)}</div>
            </div>
          </div>
          
          <div class="token-balance">
            <div class="balance-amount">${this.formatBalance(balance, isDust)}</div>
            <div class="balance-symbol">${token.symbol}</div>
            ${token.value ? 
              `<div class="balance-value">$${token.value.toFixed(4)}</div>` : 
              ''
            }
          </div>
          
          <div class="token-status">
            <span class="status-badge status-${isDust ? 'dust' : isZero ? 'zero' : token.value > 1 ? 'valuable' : 'dust'}">
              ${isDust ? '🧹 Dust' : isZero ? '⚪ Zero' : token.value > 1 ? '💎 Valuable' : '🧹 Dust'}
            </span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    
    // Add event listeners for checkboxes
    container.querySelectorAll('.token-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.handleTokenSelection(e.target));
    });
    
    // Reset select all button state
    const selectAllBtn = document.querySelector('.select-all-btn');
    if (selectAllBtn) {
      selectAllBtn.textContent = 'Select All';
    }
  }

  // Format balance display for dust tokens
  formatBalance(balance, isDust) {
    const num = parseFloat(balance);
    
    if (num === 0) return '0';
    if (isDust) {
      // Show more precision for dust tokens
      if (num < 0.000001) return '< 0.000001';
      if (num < 0.0001) return num.toExponential(2);
      return num.toFixed(6);
    }
    
    // Normal formatting for larger amounts
    if (num < 0.01) return '< 0.01';
    return num.toLocaleString(undefined, { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 4 
    });
  }

  // Handle token selection
  handleTokenSelection(checkbox) {
    const address = checkbox.dataset.address;
    const symbol = checkbox.dataset.symbol;
    const balance = checkbox.dataset.balance;

    if (checkbox.checked) {
      // Use address as key to avoid duplicates
      this.selectedTokens.set(address, {
        address,
        symbol,
        balance
      });
    } else {
      // Remove by address key
      this.selectedTokens.delete(address);
    }

    this.updateSummary();
    
    // Update select all button text
    const allCheckboxes = document.querySelectorAll('.token-checkbox');
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
    const selectAllBtn = document.querySelector('.select-all-btn');
    if (selectAllBtn) {
      selectAllBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
    }
  }

  // Toggle select all
  toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.token-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = !allChecked;
      if (!allChecked) {
        // Select token
        const address = checkbox.dataset.address;
        const symbol = checkbox.dataset.symbol;
        const balance = checkbox.dataset.balance;
        
        this.selectedTokens.set(address, {
          address,
          symbol,
          balance
        });
      } else {
        // Deselect token
        const address = checkbox.dataset.address;
        this.selectedTokens.delete(address);
      }
    });

    // Update button text
    const btn = document.querySelector('.select-all-btn');
    if (btn) {
      btn.textContent = allChecked ? 'Select All' : 'Deselect All';
    }

    // Update summary
    this.updateSummary();
  }

  // Update selection summary
  updateSummary() {
    const summaryEl = document.getElementById('sweep-summary');
    if (!summaryEl) return;

    const selectedCount = this.selectedTokens.size; // Map size
    const estimatedValue = this.calculateEstimatedPRGX();

    // Calculate USD value and get PRGX price
    Promise.all([
      this.calculateUSDValue(estimatedValue),
      DustSweeper.computePRGXPrice()
    ]).then(([usdValue, prgxPrice]) => {
      summaryEl.innerHTML = `
        <div class="summary-item">
          <span>Selected:</span>
          <span class="highlight">${selectedCount} tokens</span>
        </div>
        <div class="summary-item">
          <span>Estimated PRGX out:</span>
          <span class="highlight">${this.app.formatAmount(estimatedValue, 18, 4)} PRGX</span>
        </div>
        <div class="summary-item">
          <span>PRGX Price (USD):</span>
          <span class="highlight" id="prgxPrice">$${prgxPrice.toFixed(6)}</span>
        </div>
        <div class="summary-item">
          <span>Estimated USD:</span>
          <span class="highlight" id="estimatedUsdOut">$${usdValue}</span>
        </div>
        <div class="summary-item">
          <span>Protocol fee:</span>
          <span class="highlight fee">5%</span>
        </div>
      `;

      // Update sweep button state
      const sweepBtn = document.querySelector('.sweep-btn');
      if (sweepBtn) {
        sweepBtn.disabled = selectedCount === 0;
        sweepBtn.textContent = selectedCount === 0 ? 
          'Select Tokens to Sweep' : 
          `PURGE ${selectedCount} TOKENS`;
      }
    });
  }

  // Pool price calculation constants
  static POOL_ADDRESS = '0xc76f9b605a929a35f1a6d8b200630e84e27caaeb'; // LP token address from deployment
  static POOL_ABI = [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)'
  ];
  static RPC = 'https://rpc.pulsechain.com';

  // Fetch pool reserves to calculate PRGX price
  static async getPoolReserves() {
    try {
      const provider = new ethers.JsonRpcProvider(DustSweeper.RPC);
      const pool = new ethers.Contract(DustSweeper.POOL_ADDRESS, DustSweeper.POOL_ABI, provider);

      const [res0, res1] = await pool.getReserves();
      const token0 = await pool.token0();
      const token1 = await pool.token1();

      // The pool is PRGX/WPLS, determine which is which
      const reserves = {
        prgx: token0.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase() ? res0 : res1,
        wpls: token0.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase() ? res1 : res0
      };

      console.log('Pool reserves:', {
        prgx: ethers.formatUnits(reserves.prgx, 18),
        wpls: ethers.formatUnits(reserves.wpls, 18),
        prgxRaw: reserves.prgx.toString(),
        wplsRaw: reserves.wpls.toString(),
        ratio: Number(reserves.wpls) / Number(reserves.prgx)
      });

      return reserves;
    } catch (error) {
      console.error('Error fetching pool reserves:', error);
      return { prgx: 0n, wpls: 0n }; // Return BigInt zeros
    }
  }

  // Fetch WPLS price in USD (fallback to hardcoded price)
  static async fetchWPLSPrice() {
    try {
      // For now, use a reasonable WPLS price estimate
      // Based on the pool ratio of ~1000 PRGX per WPLS, if PRGX should be ~$0.04, then WPLS should be ~$40
      return 0.04; // $0.04 per WPLS (more realistic for proper pricing)
    } catch (error) {
      console.warn('WPLS price fetch failed, using fallback:', error);
      return 0.04;
    }
  }

  // Compute PRGX price from pool reserves and WPLS price
  static async computePRGXPrice() {
    const [reserves, wplsPrice] = await Promise.all([
      DustSweeper.getPoolReserves(),
      DustSweeper.fetchWPLSPrice()
    ]);

    if (!reserves.prgx || !reserves.wpls || wplsPrice === 0) {
      console.warn('Missing data for PRGX price calculation');
      return 0.00004; // Fallback price
    }

    try {
      // Convert BigInt to Number for calculation
      const prgxReserve = Number(reserves.prgx);
      const wplsReserve = Number(reserves.wpls);
      
      // PRGX price = WPLS price * (reserveWPLS / reservePRGX)
      const price = wplsPrice * (wplsReserve / prgxReserve);
      console.log(`PRGX price calculation: $${wplsPrice} * (${wplsReserve} / ${prgxReserve}) = $${price}`);
      return price;
    } catch (error) {
      console.error('Error in PRGX price calculation:', error);
      return 0.00004; // Fallback price
    }
  }

  // Calculate USD value for estimated PRGX
  async calculateUSDValue(estimatedPRGX) {
    try {
      const prgxPrice = await DustSweeper.computePRGXPrice();
      
      // Convert estimatedPRGX to string for ethers.formatUnits
      const prgxAmount = parseFloat(ethers.formatUnits(estimatedPRGX.toString(), 18));
      
      if (prgxPrice > 0 && !isNaN(prgxAmount) && prgxAmount > 0) {
        const usdValue = (prgxAmount * prgxPrice).toFixed(2);
        console.log(`USD calculation: ${prgxAmount} PRGX × $${prgxPrice} = $${usdValue}`);
        return usdValue;
      } else {
        return '0.00';
      }
    } catch (error) {
      console.error('Error calculating USD value:', error);
      return '0.00';
    }
  }

  // Calculate estimated PRGX output (with safe formatting)
  calculateEstimatedPRGX() {
    // This is a simplified calculation
    // In reality, this would depend on DEX prices and liquidity
    let totalValue = 0n;
    
    this.selectedTokens.forEach((token, address) => {
      // Mock conversion rate - would need real DEX integration
      const prgxRate = 0.1; // 1 token = 0.1 PRGX
      try {
        const tokenValue = BigInt(Math.floor(parseFloat(ethers.formatUnits(token.balance, 18)) * prgxRate * 1e18));
        totalValue += tokenValue;
        console.log(`Token ${token.symbol}: ${ethers.formatUnits(token.balance, 18)} tokens = ${ethers.formatUnits(tokenValue, 18)} PRGX`);
      } catch (error) {
        console.warn('Token value calculation error:', error.message);
      }
    });

    // Apply 5% fee (updated from 1%)
    const afterFee = totalValue * 95n / 100n;
    console.log(`Total before fee: ${ethers.formatUnits(totalValue, 18)} PRGX, after 5% fee: ${ethers.formatUnits(afterFee, 18)} PRGX`);
    return afterFee;
  }

  // Execute sweep
  async executeSweep() {
    if (!this.app.signer) {
      this.app.showToast('Please connect your wallet first', 'error');
      return;
    }

    if (this.selectedTokens.size === 0) {
      this.app.showToast('Please select tokens to sweep', 'error');
      return;
    }

    const sweepBtn = document.querySelector('.sweep-btn');
    this.app.setLoading(sweepBtn, true);

    try {
      // Get selected token addresses
      const tokenAddresses = Array.from(this.selectedTokens.values()).map(token => token.address);
      
      this.app.showToast('Approving tokens...', 'info');
      
      // Approve tokens for sweeper contract
      await this.approveTokens(tokenAddresses);
      
      this.app.showToast('Executing sweep...', 'info');
      
      // Execute actual sweep contract
      await this.executeSweepContract(tokenAddresses);
      
      this.app.showToast('Sweep completed successfully!', 'success');
      
      // Clear selection and refresh tokens
      this.selectedTokens.clear();
      this.loadTokenList();
      
    } catch (error) {
      console.error('Sweep failed:', error);
      this.app.showToast(`Sweep failed: ${error.message}`, 'error');
    } finally {
      this.app.setLoading(sweepBtn, false);
    }
  }

  // Approve tokens for sweeper contract
  async approveTokens(tokenAddresses) {
    const signer = this.app.signer;
    const sweeperAddress = CONFIG.CONTRACTS.SWEEPER;
    
    // ERC20 ABI for approval
    const erc20Abi = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function balanceOf(address account) view returns (uint256)'
    ];

    for (const tokenAddress of tokenAddresses) {
      try {
        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
        
        // Check current allowance
        const allowance = await tokenContract.allowance(await signer.getAddress(), sweeperAddress);
        
        // Get token balance
        const balance = await tokenContract.balanceOf(await signer.getAddress());
        
        // Only approve if allowance is less than balance
        if (allowance < balance) {
          console.log(`Approving ${tokenAddress} for sweeper contract...`);
          const approveTx = await tokenContract.approve(sweeperAddress, balance);
          await approveTx.wait();
          console.log(`Approval confirmed for ${tokenAddress}`);
        } else {
          console.log(`Sufficient allowance already exists for ${tokenAddress}`);
        }
      } catch (error) {
        console.error(`Failed to approve token ${tokenAddress}:`, error);
        throw error;
      }
    }
  }

  // Execute sweep contract
  async executeSweepContract(tokenAddresses) {
    const signer = this.app.signer;
    const sweeperAddress = CONFIG.CONTRACTS.SWEEPER;
    
    // Sweeper contract ABI
    const sweeperAbi = [
      'function sweepTokens(address[] calldata tokens) external',
      'function getSweptAmount(address token) external view returns (uint256)',
      'function owner() external view returns (address)'
    ];

    const sweeperContract = new ethers.Contract(sweeperAddress, sweeperAbi, signer);
    
    try {
      console.log('Executing sweep contract...');
      const sweepTx = await sweeperContract.sweepTokens(tokenAddresses);
      
      console.log('Transaction submitted:', sweepTx.hash);
      this.app.showToast(`Transaction submitted: ${sweepTx.hash}`, 'info');
      
      // Wait for confirmation
      const receipt = await sweepTx.wait();
      console.log('Transaction confirmed:', receipt);
      
      return receipt;
    } catch (error) {
      console.error('Contract execution failed:', error);
      throw error;
    }
  }

  // Simulate token approvals
  async simulateApprovals(tokenAddresses) {
    for (const address of tokenAddresses) {
      // Simulate approval delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Simulate sweep execution
  async simulateSweep(tokenAddresses) {
    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Show add token dialog
  showAddTokenDialog() {
    // This would show a modal for adding custom tokens
    this.app.showToast('Custom token addition coming soon', 'info');
  }

  // Show loading state
  showLoading() {
    const loadingEl = document.querySelector('.loading');
    if (loadingEl) loadingEl.classList.remove('hidden');
  }

  // Hide loading state
  hideLoading() {
    const loadingEl = document.querySelector('.loading');
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

// Initialize sweeper when app is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.purgeXApp) {
      window.dustSweeper = new DustSweeper(window.purgeXApp);
    }
  }, 100);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DustSweeper;
} else {
  window.DustSweeper = DustSweeper;
}
