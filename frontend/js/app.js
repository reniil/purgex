// PurgeX Frontend - Unified Application Logic
// Complete SPA with routing, wallet connection, and all functionality

class PurgeXApp {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.account = null;
    this.contracts = {};
    this.currentPage = 'home';
    this.dustSweeper = null;
    this.stakingManager = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupRouting();
    await this.checkWalletConnection();
    this.loadTheme();
  }

  // Setup SPA routing
  setupRouting() {
    // Handle navigation
    document.addEventListener('click', (e) => {
      if (e.target.matches('.nav-link[data-page]')) {
        e.preventDefault();
        const page = e.target.dataset.page;
        this.navigateToPage(page);
      }
    });

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      const page = e.state?.page || 'home';
      this.navigateToPage(page, false);
    });

    // Initial page load
    const hash = window.location.hash.slice(1) || 'home';
    this.navigateToPage(hash, false);
  }

  // Navigate to specific page
  navigateToPage(page, updateHash = true) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Show target page
    const targetPage = document.getElementById(`${page}-page`);
    if (targetPage) {
      targetPage.classList.add('active');
    }

    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.page === page) {
        link.classList.add('active');
      }
    });

    // Update browser history
    if (updateHash) {
      window.history.pushState({ page }, '', `#${page}`);
    }

    this.currentPage = page;

    // Initialize page-specific functionality
    this.initializePage(page);
  }

  // Initialize page-specific functionality
  initializePage(page) {
    switch (page) {
      case 'home':
        // Home page initialization (charts, stats already loaded via HTML)
        break;
      case 'sweep':
        this.initializeSweep();
        break;
      case 'stake':
        this.initializeStaking();
        break;
      case 'about':
        // About page content is static, no initialization needed
        break;
    }
  }

  // Initialize sweep functionality
  initializeSweep() {
    if (!this.dustSweeper) {
      this.dustSweeper = new DustSweeper(this);
      console.log('🧹 Dust Sweeper initialized');
    }
  }

  // Initialize staking functionality
  initializeStaking() {
    if (!this.stakingManager) {
      this.stakingManager = new StakingManager(this);
      console.log('🔒 Staking Manager initialized');
    }
  }

  // Setup global event listeners
  setupEventListeners() {
    // Wallet connect/disconnect
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

    // Add token functionality
    document.addEventListener('click', (e) => {
      if (e.target.matches('.add-custom-token-btn')) {
        e.preventDefault();
        this.addCustomToken();
      }
    });

    // Select all functionality
    document.addEventListener('change', (e) => {
      if (e.target.matches('#select-all, #select-all-header')) {
        const selectAll = e.target.checked;
        document.querySelectorAll('.token-checkbox').forEach(checkbox => {
          checkbox.checked = selectAll;
          checkbox.dispatchEvent(new Event('change'));
        });
      }
    });

    // Sweep functionality
    document.addEventListener('click', (e) => {
      if (e.target.matches('#execute-sweep-btn')) {
        e.preventDefault();
        this.executeSweep();
      }
    });

    // Staking functionality
    document.addEventListener('click', (e) => {
      if (e.target.matches('#stake-btn')) {
        e.preventDefault();
        this.stakePRGX();
      }
      
      if (e.target.matches('#unstake-btn')) {
        e.preventDefault();
        this.unstakePRGX();
      }
      
      if (e.target.matches('#claim-rewards-btn')) {
        e.preventDefault();
        this.claimRewards();
      }
    });

    // Approve staking functionality
    document.addEventListener('click', (e) => {
      if (e.target.matches('#approve-stake-btn')) {
        e.preventDefault();
        this.approveStaking();
      }
    });
  }

  // Execute sweep
  async executeSweep() {
    if (this.dustSweeper) {
      await this.dustSweeper.executeSweep();
    }
  }

  // Staking functions
  async stakePRGX() {
    if (this.stakingManager) {
      await this.stakingManager.stake();
    }
  }

  async unstakePRGX() {
    if (this.stakingManager) {
      await this.stakingManager.unstake();
    }
  }

  async claimRewards() {
    if (this.stakingManager) {
      await this.stakingManager.claimRewards();
    }
  }

  async approveStaking() {
    if (this.stakingManager) {
      await this.stakingManager.approve();
    }
  }

  // Wallet connection
  async connectWallet() {
    try {
      if (!window.ethereum) {
        this.showToast('Please install MetaMask or another Web3 wallet', 'error');
        return;
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts.length === 0) {
        this.showToast('No accounts found', 'error');
        return;
      }

      // Switch to PulseChain if needed
      await this.switchToPulseChain();
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts');
      
      this.provider = provider;
      this.signer = await provider.getSigner();
      this.account = accounts[0];
      
      this.updateUI();
      this.showToast('Wallet connected successfully!', 'success');
      
      // Initialize page functionality after connection
      this.initializePage(this.currentPage);
      
    } catch (error) {
      console.error('Wallet connection failed:', error);
      this.showToast('Failed to connect wallet', 'error');
    }
  }

  // Disconnect wallet
  disconnectWallet() {
    this.provider = null;
    this.signer = null;
    this.account = null;
    this.updateUI();
    this.showToast('Wallet disconnected', 'info');
  }

  // Switch to PulseChain
  async switchToPulseChain() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x171' }], // 369 in hex
      });
    } catch (error) {
      if (error.code === 4902) {
        // Chain not added, try to add it
        await this.addPulseChain();
      } else {
        console.error('Failed to switch network:', error);
        this.showToast('Failed to switch to PulseChain', 'error');
      }
    }
  }

  // Add PulseChain to MetaMask
  async addPulseChain() {
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x171',
          chainName: 'PulseChain',
          nativeCurrency: {
            name: 'Pulse',
            symbol: 'PLS',
            decimals: 18
          },
          rpcUrls: ['https://rpc.pulsechain.com'],
          blockExplorerUrls: ['https://scan.pulsechain.com']
        }]
      });
    } catch (error) {
      console.error('Failed to add PulseChain:', error);
      this.showToast('Failed to add PulseChain', 'error');
    }
  }

  // Check wallet connection
  async checkWalletConnection() {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          this.account = accounts[0];
          const provider = new ethers.BrowserProvider(window.ethereum);
          this.provider = provider;
          this.signer = await provider.getSigner();
        }
      } catch (error) {
        console.error('Failed to check wallet connection:', error);
      }
    }
    this.updateUI();
  }

  // Update UI based on connection state
  updateUI() {
    const connectBtns = document.querySelectorAll('.connect-wallet-btn');
    const accountInfo = document.querySelectorAll('.account-info');
    const walletAddresses = document.querySelectorAll('.wallet-address');
    
    // Sweep page elements
    const sweepConnectPrompt = document.getElementById('sweep-connect-prompt');
    const sweepPanel = document.getElementById('sweep-panel');
    const prgxCard = document.getElementById('prgx-card');
    const dustPanel = document.getElementById('dust-panel');
    
    // Staking page elements
    const stakeConnectPrompt = document.getElementById('stake-connect-prompt');
    const stakingPanel = document.getElementById('staking-panel');
    
    if (this.account) {
      // Show connected state
      connectBtns.forEach(btn => btn.style.display = 'none');
      accountInfo.forEach(info => info.style.display = 'flex');
      walletAddresses.forEach(addr => {
        addr.textContent = this.formatAddress(this.account);
        addr.dataset.address = this.account;
      });
      
      // Show sweep panels, hide connect prompts
      if (sweepConnectPrompt) sweepConnectPrompt.style.display = 'none';
      if (sweepPanel) sweepPanel.style.display = 'none';
      if (prgxCard) prgxCard.style.display = 'block';
      if (dustPanel) dustPanel.style.display = 'block';
      
      // Show staking panels, hide connect prompts
      if (stakeConnectPrompt) stakeConnectPrompt.style.display = 'none';
      if (stakingPanel) stakingPanel.style.display = 'block';
      
    } else {
      // Show disconnected state
      connectBtns.forEach(btn => btn.style.display = 'inline-flex');
      accountInfo.forEach(info => info.style.display = 'none');
      
      // Hide all panels, show connect prompts
      if (sweepConnectPrompt) sweepConnectPrompt.style.display = 'block';
      if (sweepPanel) sweepPanel.style.display = 'none';
      if (prgxCard) prgxCard.style.display = 'none';
      if (dustPanel) dustPanel.style.display = 'none';
      
      if (stakeConnectPrompt) stakeConnectPrompt.style.display = 'block';
      if (stakingPanel) stakingPanel.style.display = 'none';
    }
  }

  // Format address
  formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Copy to clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }

  // Show toast notification
  showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Add to page
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // Load theme preference
  loadTheme() {
    const theme = localStorage.getItem('purgeX_theme') || 'dark';
    document.body.setAttribute('data-theme', theme);
  }

  // Add custom token
  async addCustomToken() {
    const input = document.getElementById('custom-token-address');
    const address = input.value.trim();
    
    if (!address) {
      this.showToast('Please enter a token address', 'error');
      return;
    }
    
    if (!ethers.isAddress(address)) {
      this.showToast('Invalid token address', 'error');
      return;
    }
    
    try {
      if (this.dustSweeper) {
        await this.dustSweeper.addCustomToken(address);
        this.showToast('Token added successfully!', 'success');
        input.value = '';
      }
    } catch (error) {
      console.error('Failed to add token:', error);
      this.showToast('Failed to add token', 'error');
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PurgeXApp;
} else {
  window.PurgeXApp = PurgeXApp;
}
