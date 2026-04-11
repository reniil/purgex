// ================================================================
// ROUTER — Hash-based SPA routing system
// ================================================================

class Router {
  constructor() {
    this.routes = new Map();
    this.currentPage = null;
    this.currentPath = null;
    this.isNavigating = false;
  }

  // ================================================================
  // REGISTER ROUTES
  // ================================================================
  registerRoutes() {
    // Define all routes with their corresponding page files and init functions
    this.routes.set('/', {
      path: '/',
      file: 'pages/home.html',
      title: 'PurgeX — Sweep Dust, Earn PRGX',
      init: 'homePage.init',
      requiresWallet: false
    });

    this.routes.set('/sweep', {
      path: '/sweep',
      file: 'pages/sweep.html',
      title: 'Sweep Dust — PurgeX',
      init: 'sweepPage.init',
      requiresWallet: true
    });

    this.routes.set('/staking', {
      path: '/staking',
      file: 'pages/staking.html',
      title: 'Staking — PurgeX',
      init: 'stakingPage.init',
      requiresWallet: true
    });

    this.routes.set('/factory', {
      path: '/factory',
      file: 'pages/factory.html',
      title: 'Factory — PurgeX',
      init: 'factoryPage.init',
      requiresWallet: false
    });

    this.routes.set('/tokenomics', {
      path: '/tokenomics',
      file: 'pages/tokenomics.html',
      title: 'Tokenomics — PurgeX',
      init: 'tokenomicsPage.init',
      requiresWallet: false
    });

    this.routes.set('/contracts', {
      path: '/contracts',
      file: 'pages/contracts.html',
      title: 'Contracts — PurgeX',
      init: 'contractsPage.init',
      requiresWallet: false
    });

    this.routes.set('/about', {
      path: '/about',
      file: 'pages/about.html',
      title: 'About — PurgeX',
      init: 'aboutPage.init',
      requiresWallet: false
    });
  }

  // ================================================================
  // INITIALIZE ROUTER
  // ================================================================
  init() {
    this.registerRoutes();
    
    // Handle initial route
    this.handleRoute();
    
    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      this.handleRoute();
    });
    
    // Handle popstate (back/forward buttons)
    window.addEventListener('popstate', () => {
      this.handleRoute();
    });
  }

  // ================================================================
  // HANDLE ROUTE
  // ================================================================
  async handleRoute() {
    if (this.isNavigating) return;
    
    this.isNavigating = true;
    
    try {
      const hash = window.location.hash || '#/';  
      let path = hash.slice(1); // Remove #
      
      // Strip query parameters for route lookup but preserve them for later use
      const queryIndex = path.indexOf('?');
      const queryString = queryIndex !== -1 ? path.slice(queryIndex + 1) : '';
      const routePath = queryIndex !== -1 ? path.slice(0, queryIndex) : path;
      
      console.log('Handling route:', routePath, 'query:', queryString);
      
      const route = this.routes.get(routePath);
      
      if (!route) {
        console.log('Route not found:', path, 'redirecting to home');
        // Route not found, redirect to home
        window.location.hash = '#/';
        return;
      }
      
      console.log('Route found:', route);
      
      // Check if wallet is required
      if (route.requiresWallet && !window.wallet?.isConnected) {
        console.log('Wallet required, but loading page without injected prompt');
        await this.loadPage(route.file, route.title, route.init, false, queryString);
      } else {
        console.log('Loading page normally');
        // Load page normally
        await this.loadPage(route.file, route.title, route.init, false, queryString);
      }
      
      this.currentPath = routePath;
      this.updateActiveNavLink(routePath);
      
    } catch (error) {
      console.error('Route handling failed:', error);
      this.showErrorPage(error.message);
    } finally {
      this.isNavigating = false;
    }
  }

  // ================================================================
  // LOAD PAGE
  // ================================================================
  async loadPage(pageFile, title, initFunction, showWalletPrompt = false, queryString = '') {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
      throw new Error('App container not found');
    }
    
    try {
      console.log('Loading page:', pageFile);
      
      // Show loading state
      appContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;">
          <div style="text-align: center;">
            <div class="glow-dot" style="margin: 0 auto 1rem;"></div>
            <p style="color: var(--text-2);">Loading...</p>
          </div>
        </div>
      `;
      
      // Update page title
      document.title = title;
      
      // Fetch page content
      const response = await fetch(pageFile);
      console.log('Fetch response:', response.status, response.url);
      
      if (!response.ok) {
        throw new Error(`Failed to load page: ${pageFile} (${response.status})`);
      }
      
      let pageContent = await response.text();
      console.log('Page content length:', pageContent.length);
      console.log('Page content preview:', pageContent.substring(0, 200));
      
      // Check if the response is actually HTML (not a redirect or error page)
      if (!pageContent.includes('<') || pageContent.includes('Cannot GET')) {
        throw new Error(`Invalid page content for: ${pageFile}`);
      }
      
      // If wallet prompt is needed, inject it
      if (showWalletPrompt) {
        pageContent = this.injectWalletPrompt(pageContent);
      }
      
      // Inject page content
      appContainer.innerHTML = pageContent;
      console.log('Page content injected');
      
      // Scroll to top
      window.scrollTo(0, 0);
      
      // Initialize page
      if (initFunction) {
        // Store query params globally for page to access
        window.currentRouteQuery = this.parseQueryString(queryString);
        await this.runPageInit(initFunction);
      }
      
      console.log('Page loaded successfully:', pageFile);
      
    } catch (error) {
      console.error('Page load failed:', error);
      appContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;">
          <div style="text-align: center;">
            <h3 style="color: var(--red); margin-bottom: 1rem;">Failed to load page</h3>
            <p style="color: var(--text-2); margin-bottom: 2rem;">${error.message}</p>
            <button class="btn-primary" onclick="location.reload()">Reload</button>
          </div>
        </div>
      `;
    }
  }

  // ================================================================
  // INJECT WALLET PROMPT
  // ================================================================
  injectWalletPrompt(pageContent) {
    const walletPrompt = `
      <div class="section">
        <div class="container">
          <div class="card card-glow" style="text-align: center; padding: 3rem;">
            <h3 style="margin-bottom: 1rem;">Connect Your Wallet</h3>
            <p style="color: var(--text-2); margin-bottom: 2rem;">
              This page requires a connected wallet on PulseChain to continue.
            </p>
            <button class="btn-primary" onclick="wallet.connect()">
              Connect Wallet
            </button>
            <p style="color: var(--text-3); margin-top: 1rem; font-size: 0.9rem;">
              Don't have a wallet? Install <a href="https://metamask.io" target="_blank">MetaMask</a> 
              or <a href="https://rabby.io" target="_blank">Rabby</a>
            </p>
          </div>
        </div>
      </div>
    `;
    
    // Insert the prompt at the beginning of the page content
    return walletPrompt + pageContent;
  }

  // ================================================================
  // RUN PAGE INIT FUNCTION
  // ================================================================
  async runPageInit(initFunction) {
    try {
      // Parse the init function string (e.g., "homePage.init")
      const [objectName, methodName] = initFunction.split('.');
      
      // Check if the object exists
      if (!window[objectName]) {
        console.warn(`Page object ${objectName} not found, creating default`);
        window[objectName] = {};
      }
      
      // Check if the method exists
      if (!window[objectName][methodName]) {
        console.warn(`Init method ${initFunction} not found, creating default`);
        window[objectName][methodName] = () => {
          console.log(`Default init for ${initFunction}`);
        };
      }
      
      // Call the init function
      await window[objectName][methodName]();
      
    } catch (error) {
      console.error('Page init failed:', error);
    }
  }

  // ================================================================
  // NAVIGATION METHODS
  // ================================================================
  navigate(path) {
    if (typeof path === 'string') {
      window.location.hash = '#' + path;
    }
  }

  back() {
    window.history.back();
  }

  forward() {
    window.history.forward();
  }

  // ================================================================
  // UPDATE ACTIVE NAV LINK
  // ================================================================
  updateActiveNavLink(currentPath) {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === `#${currentPath}`) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // ================================================================
  // ERROR PAGE
  // ================================================================
  showErrorPage(message) {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;
    
    appContainer.innerHTML = `
      <div class="section">
        <div class="container">
          <div class="card" style="text-align: center; padding: 3rem;">
            <h3 style="color: var(--red); margin-bottom: 1rem;">Something went wrong</h3>
            <p style="color: var(--text-2); margin-bottom: 2rem;">${message}</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
              <button class="btn-secondary" onclick="router.back()">Go Back</button>
              <button class="btn-primary" onclick="router.navigate('/')">Go Home</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ================================================================
  // GETTERS
  // ================================================================
  getCurrentRoute() {
    return this.routes.get(this.currentPath);
  }

  getCurrentPath() {
    return this.currentPath;
  }

  isCurrentPage(path) {
    return this.currentPath === path;
  }
}

// ================================================================
// GLOBAL ROUTER INSTANCE
// ================================================================

window.router = new Router();
