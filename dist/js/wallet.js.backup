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
          else wallets.push({ name: 'Web3 Wallet', provider });
        });
      } else {
        // Single provider
        let name = 'Web3 Wallet';
        if (window.ethereum.isMetaMask) name = 'MetaMask';
        else if (window.ethereum.isRabby) name = 'Rabby';
        wallets.push({ name, provider: window.ethereum });
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
    
    if (!savedAddress || wasConnected !== 'true' || this.autoReconnectAttempts >= this.maxReconnectAttempts) {
      return false;
    }
    
    try {
      this.updateStatusLog('Attempting auto-reconnect...', 'info');
      
      const wallets = this.detectWallets();
      if (wallets.length === 0) return false;
      
      const wallet = wallets[0];
      this.provider = new ethers.BrowserProvider(wallet.provider);
      
      // Check if we still have access to the account
      const accounts = await this.provider.send('eth_accounts', []);
      if (!accounts.includes(savedAddress)) {
        localStorage.removeItem('prgx_wallet_address');
        localStorage.removeItem('prgx_wallet_connected');
        return false;
      }
      
      this.address = savedAddress;
      this.signer = await this.provider.getSigner();
      
      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);
      
      if (this.chainId !== CONFIG.NETWORK.chainId) {
        // Don't auto-switch network, just show warning
        this.showWrongNetworkBanner();
        return false;
      }
      
      this.isConnected = true;
      this.autoReconnectAttempts = 0;
      
      this.setupEventListeners();
      this.updateAllWalletUI();
      this.emitEvent('connected', { address: this.address, chainId: this.chainId });
      
      this.updateStatusLog('✅ Auto-reconnected', 'success');
      return true;
    } catch (error) {
      this.autoReconnectAttempts++;
      console.error('Auto-reconnect failed:', error);
      return false;
    }
  }

  // ================================================================
  // SWITCH OR ADD PULSECHAIN NETWORK
  // ================================================================
  async switchOrAddNetwork() {
    try {
      this.updateStatusLog('Switching to PulseChain...', 'info');
      
      // Try switching first
      try {
        await this.provider.send('wallet_switchEthereumChain', [
          { chainId: CONFIG.NETWORK.chainIdHex }
        ]);
        this.chainId = CONFIG.NETWORK.chainId;
        this.hideWrongNetworkBanner();
        this.updateStatusLog('✅ Switched to PulseChain', 'success');
        return true;
      } catch (switchError) {
        // Chain not found, add it
        if (switchError.code === 4902) {
          await this.provider.send('wallet_addEthereumChain', [
            {
              chainId: CONFIG.NETWORK.chainIdHex,
              chainName: CONFIG.NETWORK.name,
              rpcUrls: [CONFIG.NETWORK.rpc],
              blockExplorerUrls: [CONFIG.NETWORK.explorer],
              nativeCurrency: CONFIG.NETWORK.currency
            }
          ]);
          this.chainId = CONFIG.NETWORK.chainId;
          this.hideWrongNetworkBanner();
          this.updateStatusLog('✅ Added PulseChain network', 'success');
          return true;
        } else {
          throw switchError;
        }
      }
    } catch (error) {
      console.error('Network switch failed:', error);
      this.updateStatusLog(`❌ Network switch failed: ${error.message}`, 'error');
      this.showWrongNetworkBanner();
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
    // Accounts changed
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.disconnect();
      } else if (accounts[0] !== this.address) {
        this.address = accounts[0];
        this.updateAllWalletUI();
        this.emitEvent('accountChanged', { address: this.address });
      }
    });
    
    // Chain changed
    window.ethereum.on('chainChanged', (chainId) => {
      this.chainId = parseInt(chainId, 16);
      if (this.chainId !== CONFIG.NETWORK.chainId) {
        this.showWrongNetworkBanner();
      } else {
        this.hideWrongNetworkBanner();
      }
      this.emitEvent('chainChanged', { chainId: this.chainId });
    });
    
    // Disconnect
    window.ethereum.on('disconnect', () => {
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
    const badges = document.querySelectorAll('.network-badge');
    badges.forEach(badge => {
      if (this.isConnected) {
        if (this.chainId === CONFIG.NETWORK.chainId) {
          badge.textContent = CONFIG.NETWORK.name;
          badge.className = 'badge badge-green';
        } else {
          badge.textContent = `Wrong Network (${this.chainId})`;
          badge.className = 'badge badge-red';
        }
      } else {
        badge.textContent = 'Not Connected';
        badge.className = 'badge badge-red';
      }
    });
  }

  // ================================================================
  // HELPERS
  // ================================================================
  formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

  // ================================================================
  // UI HELPERS
  // ================================================================
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  updateStatusLog(message, type = 'info') {
    const log = document.getElementById('statusLog');
    if (!log) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.wallet = new WalletManager();
