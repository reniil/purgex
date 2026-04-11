// ================================================================
// UTILITIES — Sanitization & Validation
// ================================================================

const Utils = {
  // Sanitize HTML to prevent XSS
  sanitize(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
  
  // Validate Ethereum address
  isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },
  
  // Shorten address for display
  shortenAddress(address, chars = 6) {
    if (!address) return '';
    return `${address.slice(0, chars + 2)}...${address.slice(-4)}`;
  },
  
  // Format number with commas
  formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '0';
    return parseFloat(num).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },
  
  // Format wei to ETH
  formatWei(wei, decimals = 18) {
    return (wei / Math.pow(10, decimals)).toString();
  },
  
  // Show toast notification
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// Export for global use
window.Utils = Utils;
