// PurgeX Frontend - Main Application Logic
// Shared utilities, wallet connection, UI updates

class PurgeXApp {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.account = null;
    this.contracts = {};
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.checkWalletConnection();
    this.loadTheme();
  }

  // Setup global event listeners
  setupEventListeners() {
    // Wallet connect button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.connect-wallet-btn, [data-action="connect-wallet"]')) {
        e.preventDefault();
        this.connectWallet();
      }
      
      if (e.target.matches('.disconnect-wallet-btn, [data-action="disconnect-wallet"]')) {
        e.preventDefault();
        this.disconnectWallet();
      }
    });

    // Copy address functionality
    document.addEventListener('click', (e) => {
      if (e.target.matches('.copy-address, [data-action="copy"]')) {
        e.preventDefault();
        const address = e.target.dataset.address || this.account;
        this.copyToClipboard(address);
        this.showToast('Address copied to clipboard!', 'success');
      }
    });

    // Add token to wallet
    document.addEventListener('click', (e) => {
      if (e.target.matches('.add-token-btn, [data-action="add-token"]')) {
        e.preventDefault();
        this.addTokenToWallet();
      }
    });

    // Handle sweep actions
    document.addEventListener('click', (e) => {
      if (e.target.matches('.sweep-btn, [data-action="sweep"]')) {
        e.preventDefault();
        if (window.dustSweeper) {
          window.dustSweeper.executeSweep();
        } else {
          this.showToast('Sweeper not loaded', 'error');
        }
      }
    });

    // Handle select all
    document.addEventListener('click', (e) => {
      if (e.target.matches('.select-all-btn, [data-action="select-all"]')) {
        e.preventDefault();
        if (window.dustSweeper) {
          window.dustSweeper.toggleSelectAll();
        }
      }
    });

    // Handle add custom token
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-action="add-custom-token"]')) {
        e.preventDefault();
        if (window.dustSweeper) {
          window.dustSweeper.showAddTokenDialog();
        }
      }
    });

    // Handle staking actions
    document.addEventListener('click', (e) => {
      if (e.target.matches('.stake-btn, [data-action="stake"]')) {
        e.preventDefault();
        if (window.stakingDashboard) {
          window.stakingDashboard.handleStake();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('.unstake-btn, [data-action="unstake"]')) {
        e.preventDefault();
        if (window.stakingDashboard) {
          window.stakingDashboard.handleUnstake();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('.claim-btn, [data-action="claim"]')) {
        e.preventDefault();
        if (window.stakingDashboard) {
          window.stakingDashboard.handleClaim();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('.stake-all-btn, [data-action="stake-all"]')) {
        e.preventDefault();
        if (window.stakingDashboard) {
          window.stakingDashboard.stakeAll();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('.unstake-all-btn, [data-action="unstake-all"]')) {
        e.preventDefault();
        if (window.stakingDashboard) {
          window.stakingDashboard.unstakeAll();
        }
      }
    });
  }

  // Check if wallet is already connected
  async checkWalletConnection() {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ 
          method: 'eth_accounts' 
        });
        
        if (accounts.length > 0) {
          await this.handleAccountsChanged(accounts);
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
      }
    }
  }

  // Connect wallet
  async connectWallet() {
    if (typeof window.ethereum === 'undefined') {
      this.showToast('Please install MetaMask or another Web3 wallet', 'error');
      return;
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      await this.handleAccountsChanged(accounts);
      
      // Check network
      await this.checkNetwork();
      
      this.showToast('Wallet connected successfully!', 'success');
      
    } catch (error) {
      console.error('Error connecting wallet:', error);
      this.showToast('Failed to connect wallet', 'error');
    }
  }

  // Handle account changes
  async handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      this.disconnectWallet();
      return;
    }

    this.account = accounts[0];
    
    // Setup provider and signer (ethers v6 syntax)
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    
    // Initialize contracts
    this.initContracts();
    
    // Update UI
    this.updateWalletUI();
    
    // Save to localStorage
    localStorage.setItem('purgeX_connected', 'true');
  }

  // Initialize contract instances
  initContracts() {
    const { CONTRACTS } = CONFIG;
    
    // ERC20 ABI (minimal)
    const erc20Abi = [
      'function balanceOf(address) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)'
    ];

    this.contracts.PRGX = new ethers.Contract(CONTRACTS.PRGX_TOKEN, erc20Abi, this.signer);
    
    // Staking contract ABI
    const stakingAbi = [
      'function stake(uint256 amount)',
      'function withdraw(uint256 amount)',
      'function claimReward()',
      'function getStakedBalance(address) view returns (uint256)',
      'function pendingRewardsOf(address) view returns (uint256)',
      'function getTotalStaked() view returns (uint256)',
      'function getRewardRate() view returns (uint256)'
    ];
    
    this.contracts.Staking = new ethers.Contract(CONTRACTS.STAKING, stakingAbi, this.signer);
  }

  // Check if on correct network
  async checkNetwork() {
    try {
      const chainId = await window.ethereum.request({
        method: 'eth_chainId'
      });

      if (chainId !== CONFIG.NETWORK.chainId) {
        // Try to switch network
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CONFIG.NETWORK.chainId }]
          });
        } catch (switchError) {
          // Network doesn't exist, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [CONFIG.NETWORK]
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking network:', error);
      this.showToast('Please switch to PulseChain network', 'error');
    }
  }

  // Disconnect wallet
  disconnectWallet() {
    this.provider = null;
    this.signer = null;
    this.account = null;
    this.contracts = {};
    
    localStorage.removeItem('purgeX_connected');
    this.updateWalletUI();
    this.showToast('Wallet disconnected', 'info');
  }

  // Update wallet UI
  updateWalletUI() {
    const connectBtns = document.querySelectorAll('.connect-wallet-btn');
    const accountInfo = document.querySelectorAll('.account-info');
    const addressElements = document.querySelectorAll('.wallet-address');

    if (this.account) {
      // Show account info, hide connect buttons
      connectBtns.forEach(btn => btn.style.display = 'none');
      accountInfo.forEach(info => info.style.display = 'block');
      
      // Update address displays
      const shortAddress = this.formatAddress(this.account);
      addressElements.forEach(el => {
        el.textContent = shortAddress;
        el.setAttribute('title', this.account);
      });

      // Update sweep page specific elements
      const sweepConnectPrompt = document.getElementById('sweep-connect-prompt');
      const sweepWalletConnected = document.getElementById('wallet-connected');
      const sweepAddress = document.querySelector('#wallet-connected .wallet-address');
      
      if (sweepConnectPrompt) sweepConnectPrompt.classList.add('hidden');
      if (sweepWalletConnected) sweepWalletConnected.classList.remove('hidden');
      if (sweepAddress) sweepAddress.textContent = shortAddress;
      
    } else {
      // Show connect buttons, hide account info
      connectBtns.forEach(btn => btn.style.display = 'block');
      accountInfo.forEach(info => info.style.display = 'none');
      
      // Update sweep page specific elements
      const sweepConnectPrompt = document.getElementById('sweep-connect-prompt');
      const sweepWalletConnected = document.getElementById('wallet-connected');
      
      if (sweepConnectPrompt) sweepConnectPrompt.classList.remove('hidden');
      if (sweepWalletConnected) sweepWalletConnected.classList.add('hidden');
    }
  }

  // Format address for display
  formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Copy to clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  // Add PRGX token to wallet
  async addTokenToWallet() {
    if (!this.signer) {
      this.showToast('Please connect your wallet first', 'error');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: CONFIG.CONTRACTS.PRGX_TOKEN,
            symbol: 'PRGX',
            decimals: 18,
            image: 'https://raw.githubusercontent.com/reniil/purgex/main/assets/logo.png'
          }
        }
      });
      
      this.showToast('PRGX token added to wallet!', 'success');
    } catch (error) {
      console.error('Error adding token:', error);
      this.showToast('Failed to add token to wallet', 'error');
    }
  }

  // Show toast notification
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, CONFIG.UI.TOAST_DURATION);
  }

  // Format token amount safely (ethers v6 syntax)
  formatAmount(amount, decimals = 18, displayDecimals = 2) {
    try {
      if (!amount) return '0';
      
      // Handle very small numbers
      const num = parseFloat(ethers.formatUnits(amount, decimals));
      
      if (num === 0) return '0';
      if (num < 0.000001) return '< 0.000001';
      if (num < 0.01) return '< 0.01';
      if (num < 0.1) return num.toFixed(4);
      if (num < 1) return num.toFixed(3);
      
      return num.toLocaleString(undefined, { 
        minimumFractionDigits: displayDecimals,
        maximumFractionDigits: displayDecimals 
      });
    } catch (error) {
      console.warn('Format error:', error.message);
      return '0';
    }
  }

  // Load theme preference
  loadTheme() {
    const theme = localStorage.getItem('purgeX_theme') || 'dark';
    document.body.setAttribute('data-theme', theme);
  }

  // Loading state helper
  setLoading(element, loading = true) {
    if (loading) {
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = 'Loading...';
    } else {
      element.disabled = false;
      element.textContent = element.dataset.originalText || element.textContent;
    }
  }

  // Format currency
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.purgeXApp = new PurgeXApp();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PurgeXApp;
} else {
  window.PurgeXApp = PurgeXApp;
}
