// ================================================================
// APP INITIALIZATION — Main app entry point
// ================================================================

class App {
  constructor() {
    this.isInitialized = false;
    this.modules = new Map();
  }

  // ================================================================
  // INITIALIZE APPLICATION
  // ================================================================
  async init() {
    if (this.isInitialized) return;
    
    try {
      console.log('🚀 Initializing PurgeX application...');
      
      // 1. Initialize router first
      this.modules.set('router', window.router);
      window.router.init();
      
      // 2. Initialize price oracle and start price fetching
      this.modules.set('priceOracle', window.priceOracle);
      window.priceOracle.startAutoRefresh();
      
      // 3. Initialize wallet and attempt auto-reconnect
      this.modules.set('wallet', window.wallet);
      await this.initializeWallet();
      
      // 4. Setup global wallet event listeners
      this.setupWalletEventListeners();
      
      // 5. Setup global UI event listeners
      this.setupUIEventListeners();
      
      // 6. Setup global error handler
      this.setupGlobalErrorHandler();
      
      // 7. Setup toast container
      this.setupToastContainer();
      
      this.isInitialized = true;
      console.log('✅ PurgeX application initialized successfully');
      
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      this.showCriticalError(error.message);
    }
  }

  // ================================================================
  // INITIALIZE WALLET
  // ================================================================
  async initializeWallet() {
    try {
      // Attempt auto-reconnect
      const reconnected = await window.wallet.autoReconnect();
      
      if (reconnected) {
        console.log('✅ Wallet auto-reconnected');
      } else {
        console.log('ℹ️ No wallet auto-reconnection available');
      }
      
      // Setup wallet listeners
      window.wallet.addListener((event, data) => {
        this.handleWalletEvent(event, data);
      });
      
    } catch (error) {
      console.warn('Wallet initialization warning:', error);
    }
  }

  // ================================================================
  // SETUP WALLET EVENT LISTENERS
  // ================================================================
  setupWalletEventListeners() {
    // Wallet button in navigation
    const navWalletBtn = document.getElementById('navWalletBtn');
    if (navWalletBtn) {
      navWalletBtn.addEventListener('click', () => {
        if (window.wallet.isConnected) {
          window.wallet.disconnect();
        } else {
          window.wallet.connect();
        }
      });
    }

    // Mobile menu toggle
    const hamburger = document.getElementById('hamburger');
    const navbarLinks = document.getElementById('navbarLinks');
    
    if (hamburger && navbarLinks) {
      hamburger.addEventListener('click', () => {
        navbarLinks.classList.toggle('active');
      });
      
      // Close mobile menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!navbarLinks.contains(e.target) && !hamburger.contains(e.target)) {
          navbarLinks.classList.remove('active');
        }
      });
      
      // Close mobile menu when link is clicked
      const navLinks = navbarLinks.querySelectorAll('.nav-link');
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          navbarLinks.classList.remove('active');
        });
      });
    }
  }

  // ================================================================
  // SETUP UI EVENT LISTENERS
  // ================================================================
  setupUIEventListeners() {
    // Modal overlay click to close
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.classList.add('hidden');
        }
      });
    }

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
          modalOverlay.classList.add('hidden');
        }
        // Also close mobile menu on escape
        const navbarLinks = document.getElementById('navbarLinks');
        if (navbarLinks) {
          navbarLinks.classList.remove('active');
        }
      }
    });

    // Copy to clipboard functionality
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('copy-btn')) {
        this.copyToClipboard(e.target);
      }
    });
  }

  // ================================================================
  // SETUP GLOBAL ERROR HANDLER
  // ================================================================
  setupGlobalErrorHandler() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.showToast('An unexpected error occurred', 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.showToast('An unexpected error occurred', 'error');
    });
  }

  // ================================================================
  // SETUP TOAST CONTAINER
  // ================================================================
  setupToastContainer() {
    const container = document.getElementById('toastContainer');
    if (!container) {
      console.warn('Toast container not found');
    }
  }

  // ================================================================
  // WALLET EVENT HANDLER
  // ================================================================
  handleWalletEvent(event, data) {
    switch (event) {
      case 'connected':
        console.log('Wallet connected:', data);
        this.onWalletConnected(data);
        break;
      case 'disconnected':
        console.log('Wallet disconnected');
        this.onWalletDisconnected();
        break;
      case 'accountChanged':
        console.log('Account changed:', data);
        this.onAccountChanged(data);
        break;
      case 'chainChanged':
        console.log('Chain changed:', data);
        this.onChainChanged(data);
        break;
    }
  }

  // ================================================================
  // WALLET EVENT CALLBACKS
  // ================================================================
  async onWalletConnected(data) {
    // Update wallet UI immediately
    window.wallet.updateAllWalletUI();
    
    // Refresh current page if it requires wallet
    const currentRoute = window.router.getCurrentRoute();
    if (currentRoute && currentRoute.requiresWallet) {
      await window.router.handleRoute();
    }
    
    this.showToast('Wallet connected successfully', 'success');
  }

  async onWalletDisconnected() {
    // Navigate to home if on wallet-required page
    const currentRoute = window.router.getCurrentRoute();
    if (currentRoute && currentRoute.requiresWallet) {
      window.router.navigate('/');
    }
    
    this.showToast('Wallet disconnected', 'info');
  }

  async onAccountChanged(data) {
    // Refresh current page to update with new account
    await window.router.handleRoute();
    this.showToast('Account changed', 'info');
  }

  async onChainChanged(data) {
    // Refresh current page to update with new chain
    await window.router.handleRoute();
    
    if (data.chainId === CONFIG.NETWORK.chainId) {
      this.showToast('Switched to PulseChain', 'success');
    } else {
      this.showToast('Wrong network detected', 'warning');
    }
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================
  showToast(message, type = 'info') {
    if (window.wallet && window.wallet.showToast) {
      window.wallet.showToast(message, type);
    } else {
      console.log(`Toast (${type}): ${message}`);
    }
  }

  async copyToClipboard(element) {
    const textToCopy = element.dataset.copy || element.textContent;
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      
      // Show feedback
      const originalText = element.textContent;
      element.textContent = 'Copied!';
      element.classList.add('success');
      
      setTimeout(() => {
        element.textContent = originalText;
        element.classList.remove('success');
      }, 2000);
      
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      this.showToast('Failed to copy to clipboard', 'error');
    }
  }

  showCriticalError(message) {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;
    
    appContainer.innerHTML = `
      <div class="section">
        <div class="container">
          <div class="card" style="text-align: center; padding: 3rem; border-color: var(--red);">
            <h3 style="color: var(--red); margin-bottom: 1rem;">Critical Error</h3>
            <p style="color: var(--text-2); margin-bottom: 2rem;">
              The application failed to initialize properly.
            </p>
            <p style="color: var(--text-3); font-family: var(--font-mono); margin-bottom: 2rem;">
              ${message}
            </p>
            <button class="btn-primary" onclick="location.reload()">
              Reload Application
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ================================================================
  // GET MODULE
  // ================================================================
  getModule(name) {
    return this.modules.get(name);
  }

  // ================================================================
  // CLEANUP
  // ================================================================
  cleanup() {
    // Stop price oracle
    if (window.priceOracle) {
      window.priceOracle.cleanup();
    }
    
    // Stop staking manager
    if (window.stakingManager) {
      window.stakingManager.cleanup();
    }
    
    this.isInitialized = false;
  }
}

// ================================================================
// PAGE INITIALIZERS
// ================================================================

// Home page
window.homePage = {
  async init() {
    console.log('Home page initialized');
    
    // Update wallet UI
    if (window.wallet) {
      window.wallet.updateAllWalletUI();
    }
    
    // Load recent activity
    this.loadRecentActivity();
    
    // Load live stats, setup animations, etc.
  },
  
  async loadRecentActivity() {
    const activityFeed = document.getElementById('activityFeed');
    if (!activityFeed) return;
    
    try {
      // Fetch recent transactions from PulseScan API
      const prgxToken = CONFIG.CONTRACTS.PRGX_TOKEN;
      const apiUrl = `${CONFIG.APIS.PULSESCAN_BASE}/api?module=account&action=tokentx&contractaddress=${prgxToken}&page=1&offset=10&sort=desc`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (data.status === '1' && data.result && data.result.length > 0) {
        this.renderActivityFeed(data.result);
      } else {
        activityFeed.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-3);">
            <p>No recent activity found</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to load recent activity:', error);
      activityFeed.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-3);">
          <p>Failed to load activity</p>
        </div>
      `;
    }
  },
  
  renderActivityFeed(transactions) {
    const activityFeed = document.getElementById('activityFeed');
    if (!activityFeed) return;
    
    activityFeed.innerHTML = '';
    
    transactions.forEach(tx => {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 1rem; border-bottom: 1px solid var(--border-1); display: flex; align-items: center; gap: 1rem; transition: background 0.2s;';
      item.onmouseover = () => item.style.background = 'var(--bg-card)';
      item.onmouseout = () => item.style.background = 'transparent';
      
      const type = tx.to.toLowerCase() === CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase() ? 'Buy' : 'Sell';
      const typeColor = type === 'Buy' ? 'var(--green)' : 'var(--red)';
      const value = (parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal))).toFixed(2);
      const timeAgo = this.getTimeAgo(parseInt(tx.timeStamp) * 1000);
      
      item.innerHTML = `
        <div style="font-size: 1.5rem;">${type === 'Buy' ? '📈' : '📉'}</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--text-1); margin-bottom: 0.25rem;">
            ${type} ${value} PRGX
          </div>
          <div style="font-size: 0.85rem; color: var(--text-3);">
            ${this.shortenAddress(tx.from)} → ${this.shortenAddress(tx.to)}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600; color: ${typeColor};">${type}</div>
          <div style="font-size: 0.8rem; color: var(--text-3);">${timeAgo}</div>
        </div>
      `;
      
      item.addEventListener('click', () => {
        window.open(`${CONFIG.NETWORK.explorer}/tx/${tx.hash}`, '_blank');
      });
      item.style.cursor = 'pointer';
      
      activityFeed.appendChild(item);
    });
  },
  
  shortenAddress(address) {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  },
  
  getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  }
};

// Sweep page
window.sweepPage = {
  async init() {
    console.log('Sweep page initialized');
    
    // Update wallet UI first
    if (window.wallet) {
      window.wallet.updateAllWalletUI();
    }
    
    if (window.wallet?.isConnected) {
      // Start token discovery
      try {
        await window.tokenDiscovery.getWalletTokens(window.wallet.address);
        window.tokenDiscovery.renderTokenTable(
          window.tokenDiscovery.discoveredTokens, 
          'tokenTableBody'
        );
      } catch (error) {
        console.error('Token discovery failed:', error);
      }
    }
    
    // Setup select all checkbox
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        if (e.target.checked) {
          window.tokenDiscovery.selectAll();
        } else {
          window.tokenDiscovery.deselectAll();
        }
      });
    }
  }
};

// Staking page
window.stakingPage = {
  async init() {
    console.log('Staking page initialized');
    
    // Update wallet UI first
    if (window.wallet) {
      window.wallet.updateAllWalletUI();
    }
    
    if (window.wallet?.isConnected) {
      await window.stakingManager.loadDashboard();
    }
  }
};

// Tokenomics page
window.tokenomicsPage = {
  async init() {
    console.log('Tokenomics page initialized');
    
    // Update wallet UI
    if (window.wallet) {
      window.wallet.updateAllWalletUI();
    }
    
    // Setup charts, animations, etc.
  }
};

// Contracts page
window.contractsPage = {
  async init() {
    console.log('Contracts page initialized');
    
    // Update wallet UI
    if (window.wallet) {
      window.wallet.updateAllWalletUI();
    }
    
    // Populate contract addresses dynamically
    this.populateContractAddresses();
    
    // Setup contract verification display
  },
  
  populateContractAddresses() {
    const contracts = CONFIG.CONTRACTS;
    const explorer = CONFIG.NETWORK.explorer;
    
    // Helper to format address
    const formatAddress = (address) => {
      if (!address) return 'N/A';
      return `${address.slice(0, 8)}...${address.slice(-6)}`;
    };
    
    // Update PRGX Token
    const prgxAddress = document.getElementById('prgxTokenAddress');
    if (prgxAddress) {
      prgxAddress.textContent = formatAddress(contracts.PRGX_TOKEN);
    }
    
    // Update Sweeper
    const sweeperAddress = document.getElementById('sweeperAddress');
    if (sweeperAddress) {
      sweeperAddress.textContent = formatAddress(contracts.SWEEPER);
    }
    
    // Update Staking
    const stakingAddress = document.getElementById('stakingAddress');
    if (stakingAddress) {
      stakingAddress.textContent = formatAddress(contracts.STAKING);
    }
    
    // Update Multisig
    const multisigAddress = document.getElementById('multisigAddress');
    if (multisigAddress) {
      multisigAddress.textContent = formatAddress(contracts.MULTISIG_TREASURY);
    }
    
    // Update LP Token
    const lpTokenAddress = document.getElementById('lpTokenAddress');
    if (lpTokenAddress) {
      lpTokenAddress.textContent = formatAddress(contracts.LP_TOKEN);
    }
    
    // Update copy buttons with actual addresses
    const copyButtons = document.querySelectorAll('.copy-btn');
    copyButtons.forEach(btn => {
      const contractType = btn.dataset.contractType;
      let address;
      switch(contractType) {
        case 'prgx': address = contracts.PRGX_TOKEN; break;
        case 'sweeper': address = contracts.SWEEPER; break;
        case 'staking': address = contracts.STAKING; break;
        case 'multisig': address = contracts.MULTISIG_TREASURY; break;
        case 'lptoken': address = contracts.LP_TOKEN; break;
        default: address = btn.dataset.copy;
      }
      if (address) {
        btn.dataset.copy = address;
      }
    });
    
    // Update explorer links
    const explorerLinks = document.querySelectorAll('a[href*="address/"]');
    explorerLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href.includes('${window.CONFIG')) {
        // Replace template literal with actual explorer URL
        const contractType = link.dataset.contractType;
        let address;
        switch(contractType) {
          case 'prgx': address = contracts.PRGX_TOKEN; break;
          case 'sweeper': address = contracts.SWEEPER; break;
          case 'staking': address = contracts.STAKING; break;
          case 'multisig': address = contracts.MULTISIG_TREASURY; break;
          case 'lptoken': address = contracts.LP_TOKEN; break;
        }
        if (address) {
          link.href = `${explorer}/address/${address}`;
        }
      }
    });
    
    // Update Web3 Interfaces explorer links
    const prgxExplorerLink = document.getElementById('prgxExplorerLink');
    if (prgxExplorerLink) {
      prgxExplorerLink.href = `${explorer}/address/${contracts.PRGX_TOKEN}`;
    }
    
    const sweeperExplorerLink = document.getElementById('sweeperExplorerLink');
    if (sweeperExplorerLink) {
      sweeperExplorerLink.href = `${explorer}/address/${contracts.SWEEPER}`;
    }
    
    const stakingExplorerLink = document.getElementById('stakingExplorerLink');
    if (stakingExplorerLink) {
      stakingExplorerLink.href = `${explorer}/address/${contracts.STAKING}`;
    }
  }
};

// About page
window.aboutPage = {
  async init() {
    console.log('About page initialized');
    
    // Update wallet UI
    if (window.wallet) {
      window.wallet.updateAllWalletUI();
    }
    
    // Setup team display, roadmap, etc.
  }
};

// ================================================================
// GLOBAL APP INSTANCE
// ================================================================

window.app = new App();

// ================================================================
// DOM READY - START APPLICATION
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await window.app.init();
});

// ================================================================
// CLEANUP ON PAGE UNLOAD
// ================================================================

window.addEventListener('beforeunload', () => {
  if (window.app) {
    window.app.cleanup();
  }
});
