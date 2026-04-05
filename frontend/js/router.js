// Simple hash-based router for PurgeX frontend

class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    this.init();
  }

  init() {
    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
    
    // Handle initial route
    this.handleRoute();
  }

  // Register a route
  addRoute(path, handler) {
    this.routes[path] = handler;
  }

  // Navigate to a route
  navigate(path) {
    window.location.hash = path;
  }

  // Handle current route
  handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const route = this.routes[hash] || this.routes['/'];
    
    if (route && route !== this.currentRoute) {
      this.currentRoute = route;
      route();
    }

    // Update active navigation
    this.updateNavigation(hash);
  }

  // Update navigation active states
  updateNavigation(activeHash) {
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href').slice(1);
      if (href === activeHash || (activeHash === '/' && href === '')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Get current route
  getCurrentRoute() {
    return window.location.hash.slice(1) || '/';
  }
}

// Create global router instance
const router = new Router();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Router;
} else {
  window.Router = Router;
  window.router = router;
}
