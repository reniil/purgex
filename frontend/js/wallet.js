// ================================================================
// WALLET MANAGER — Full wallet connection with network switching
// ================================================================

class WalletManager {
  constructor() {
    this.wallet = null;
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.listeners = [];
    this.autoReconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  // ================================================================
  // DETECT AVAILABLE WALLETS
  // ================================================================
  detectWallets() {
    const wallets = [];
    
    if (typeof window.ethereum !== 'undefined') {
      // Check for multiple providers (MetaMask, Rabby, etc.)
      if (window.ethereum.providers?.length) {
        window.ethereum.providers.forEach(provider => {
          if (provider.isMetaMask) wallets.push({ name: 'MetaMask', provider });
          else if (provider.isRabby) wallets.push({ name: 'Rabby', provider });
        });
      } else {
        // Single provider
        if (window.ethereum.isMetaMask) wallets.push({ name: 'MetaMask', provider: window.ethereum });
        else if (window.ethereum.isRabby) wallets.push({ name: 'Rabby', provider: window.ethereum });
        else wallets.push({ name: 'Unknown', provider: window.ethereum });
      }
    }
    
    return wallets;
  }

  // ================================================================
  // CONNECT WALLET
  // ================================================================
  async connect() {
    // Prevent multiple connection attempts
    if (this.isConnecting) {
      console.log('Connection already in progress');
      return;
    }
    
    if (this.isConnected) {
      console.log('Wallet already connected');
      return;
    }
    
    this.isConnecting = true;
    
    try {
      // Detect available wallets
      const wallets = this.detectWallets();
      if (wallets.length === 0) {
        throw new Error('No wallet detected. Please install MetaMask or Rabby.');
      }
      
      // Use the first available wallet
      const wallet = wallets[0];
      
      // Request account access
      const accounts = await wallet.provider.request({
        method: 'eth_requestAccounts'
      });
      
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }
      
      // Setup provider
      this.provider = new ethers.BrowserProvider(wallet.provider);
      const signer = await this.provider.getSigner();
      
      // Get network info
      const network = await this.provider.getNetwork();
      
      // Store connection info
      this.wallet = wallet;
      this.address = signer.address;
      this.signer = signer;
      this.chainId = Number(network.chainId);
      this.isConnected = true;
      
      // Check network
      if (this.chainId !== CONFIG.NETWORK.chainId) {
        await this.switchOrAddNetwork();
      }
      
      // Save connection info
      localStorage.setItem('prgx_wallet_address', this.address);
      localStorage.setItem('prgx_wallet_connected', 'true');
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Update UI
      this.updateAllWalletUI();
      
      // Emit event
      this.emitEvent('connected', {
        address: this.address,
        chainId: this.chainId
      });
      
      console.log('Wallet connected:', this.address);
      
    } catch (error) {
      console.error('Wallet connection failed:', error);
      this.showToast('Failed to connect wallet: ' + error.message, 'error');
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  // ================================================================
  // AUTO-RECONNECT
  // ================================================================
  async autoReconnect() {
    const savedAddress = localStorage.getItem('prgx_wallet_address');
    const wasConnected = localStorage.getItem('prgx_wallet_connected');
    
    if (!savedAddress || !wasConnected) return false;
    
    try {
      // Detect available wallets
      const wallets = this.detectWallets();
      if (wallets.length === 0) return false;
      
      const wallet = wallets[0];
      
      // Check if wallet is still connected to the same account
      const accounts = await wallet.provider.request({
        method: 'eth_accounts'
      });
      
      if (!accounts || !accounts.includes(savedAddress)) {
        // Clear saved connection info
        localStorage.removeItem('prgx_wallet_address');
        localStorage.removeItem('prgx_wallet_connected');
        return false;
      }
      
      // Setup provider
      this.provider = new ethers.BrowserProvider(wallet.provider);
      const signer = await this.provider.getSigner();
      const network = await this.provider.getNetwork();
      
      // Store connection info
      this.wallet = wallet;
      this.address = signer.address;
      this.signer = signer;
      this.chainId = Number(network.chainId);
      this.isConnected = true;
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Update UI
      this.updateAllWalletUI();
      
      // Emit event
      this.emitEvent('connected', {
        address: this.address,
        chainId: this.chainId
      });
      
      console.log('Wallet auto-reconnected:', this.address);
      return true;
      
    } catch (error) {
      console.warn('Auto-reconnect failed:', error);
      // Clear saved connection info
      localStorage.removeItem('prgx_wallet_address');
      localStorage.removeItem('prgx_wallet_connected');
      return false;
    }
  }

  // ================================================================
  // SWITCH OR ADD NETWORK
  // ================================================================
  async switchOrAddNetwork() {
    try {
      // Try to switch to the network
      await this.wallet.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CONFIG.NETWORK.chainIdHex }]
      });
      
      this.chainId = CONFIG.NETWORK.chainId;
      this.emitEvent('chainChanged', { chainId: this.chainId });
      
    } catch (switchError) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await this.wallet.provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CONFIG.NETWORK.chainIdHex,
              chainName: CONFIG.NETWORK.name,
              rpcUrls: [CONFIG.NETWORK.rpc],
              blockExplorerUrls: [CONFIG.NETWORK.explorer],
              nativeCurrency: CONFIG.NETWORK.currency
            }]
          });
          
          this.chainId = CONFIG.NETWORK.chainId;
          this.emitEvent('chainChanged', { chainId: this.chainId });
          
        } catch (addError) {
          console.error('Failed to add network:', addError);
          throw new Error('Failed to add PulseChain network to wallet');
        }
      } else {
        throw switchError;
      }
    }
  }

  // ================================================================
  // DISCONNECT WALLET
  // ================================================================
  async disconnect() {
    // Prevent multiple disconnect attempts
    if (!this.isConnected) {
      console.log('Wallet already disconnected');
      return;
    }
    
    try {
      // Clear connection info
      this.wallet = null;
      this.provider = null;
      this.signer = null;
      this.address = null;
      this.chainId = null;
      this.isConnected = false;
      this.isConnecting = false;
      
      // Clear saved connection info
      localStorage.removeItem('prgx_wallet_address');
      localStorage.removeItem('prgx_wallet_connected');
      
      // Remove event listeners
      this.removeAllListeners();
      
      // Update UI
      this.updateAllWalletUI();
      
      // Emit event
      this.emitEvent('disconnected', null);
      
      console.log('Wallet disconnected');
      
    } catch (error) {
      console.error('Wallet disconnect failed:', error);
      this.showToast('Failed to disconnect wallet', 'error');
    }
  }

  // ================================================================
  // SETUP EVENT LISTENERS
  // ================================================================
  setupEventListeners() {
    if (!this.wallet?.provider) return;
    
    // Remove existing listeners to prevent duplicates
    this.removeAllListeners();
    
    // Accounts changed
    this.wallet.provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.disconnect();
      } else if (accounts[0] !== this.address) {
        this.address = accounts[0];
        this.updateAllWalletUI();
        this.emitEvent('accountChanged', { address: this.address });
      }
    });
    
    // Chain changed
    this.wallet.provider.on('chainChanged', (chainId) => {
      this.chainId = Number(chainId);
      this.updateAllWalletUI();
      this.emitEvent('chainChanged', { chainId: this.chainId });
    });
    
    // Connect
    this.wallet.provider.on('connect', (connectInfo) => {
      console.log('Wallet connected event:', connectInfo);
    });
    
    // Disconnect
    this.wallet.provider.on('disconnect', (error) => {
      console.log('Wallet disconnected event:', error);
      this.disconnect();
    });
  }

  // ================================================================
  // GLOBAL UI UPDATER
  // ================================================================
  updateAllWalletUI() {
    // Update wallet buttons
    const walletBtns = document.querySelectorAll('.wallet-btn');
    walletBtns.forEach(btn => {
      if (this.isConnected) {
        btn.textContent = this.formatAddress(this.address);
        btn.classList.add('connected');
        btn.onclick = () => this.disconnect();
      } else {
        btn.textContent = 'Connect Wallet';
        btn.classList.remove('connected');
        btn.onclick = () => this.connect();
      }
    });
    
    // Update address displays
    const addressEls = document.querySelectorAll('.wallet-address');
    addressEls.forEach(el => {
      el.textContent = this.isConnected ? this.formatAddress(this.address) : 'Not connected';
    });
    
    // Show/hide wallet-required elements
    const requiresWallet = document.querySelectorAll('.requires-wallet');
    requiresWallet.forEach(el => {
      if (this.isConnected) {
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
    
    // Update network badge
    this.updateNetworkBadge();
    
    // Update sweep page specifically
    this.updateSweepPageUI();
  }

  // ================================================================
  // UPDATE SWEEP PAGE UI
  // ================================================================
  updateSweepPageUI() {
    const connectPanel = document.getElementById('connectPanel');
    const discoveryPanel = document.getElementById('discoveryPanel');
    
    if (!connectPanel || !discoveryPanel) return;
    
    if (this.isConnected) {
      connectPanel.classList.add('hidden');
      discoveryPanel.classList.remove('hidden');
    } else {
      connectPanel.classList.remove('hidden');
      discoveryPanel.classList.add('hidden');
    }
  }

  // ================================================================
  // NETWORK BANNER
  // ================================================================
  showWrongNetworkBanner() {
    const banner = document.getElementById('wrongNetworkBanner');
    if (banner) banner.classList.remove('hidden');
  }

  hideWrongNetworkBanner() {
    const banner = document.getElementById('wrongNetworkBanner');
    if (banner) banner.classList.add('hidden');
  }

  updateNetworkBadge() {
    const badge = document.getElementById('networkBadge');
    if (!badge) return;
    
    if (this.isConnected) {
      if (this.chainId === CONFIG.NETWORK.chainId) {
        badge.textContent = CONFIG.NETWORK.name;
        badge.className = 'badge badge-green';
        this.hideWrongNetworkBanner();
      } else {
        badge.textContent = 'Wrong Network';
        badge.className = 'badge badge-red';
        this.showWrongNetworkBanner();
      }
    } else {
      badge.textContent = 'Not Connected';
      badge.className = 'badge badge-red';
    }
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================
  formatAddress(address) {
    if (!address) return '';
    return address.slice(0, 6) + '...' + address.slice(-4);
  }

  formatBalance(balance, decimals = 4) {
    if (!balance) return '0';
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    return num.toFixed(decimals);
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 5000);
  }

  async getPRGXBalance() {
    if (!this.isConnected || !this.provider) return '0';
    
    try {
      const contract = new ethers.Contract(
        CONFIG.CONTRACTS.PRGX_TOKEN,
        CONFIG.ABIS.ERC20,
        this.provider
      );
      const balance = await contract.balanceOf(this.address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Failed to get PRGX balance:', error);
      return '0';
    }
  }

  // ================================================================
  // EVENT SYSTEM
  // ================================================================
  addListener(callback) {
    // Remove existing listeners to prevent duplicates
    this.removeAllListeners();
    
    // Add new listener
    this.listeners.push(callback);
    
    // Setup event listeners
    this.setupEventListeners();
  }

  removeAllListeners() {
    this.listeners = [];
    
    // Remove existing event listeners
    if (window.ethereum) {
      window.ethereum.removeAllListeners('accountsChanged');
      window.ethereum.removeAllListeners('chainChanged');
      window.ethereum.removeAllListeners('connect');
      window.ethereum.removeAllListeners('disconnect');
    }
  }

  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  emitEvent(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    });
  }
}

// ================================================================
// GLOBAL WALLET INSTANCE
// ================================================================

window.wallet = new WalletManager();
