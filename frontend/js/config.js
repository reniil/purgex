// PurgeX Frontend Configuration
// Contract addresses and network constants

const CONFIG = {
  // Network
  CHAIN_ID: 369,
  NETWORK: {
    chainId: '0x171',
    chainName: 'PulseChain',
    rpcUrls: ['https://rpc.pulsechain.com'],
    nativeCurrency: {
      name: 'Pulse',
      symbol: 'PLS',
      decimals: 18
    },
    blockExplorerUrls: ['https://scan.pulsechain.com']
  },

  // Deployed contract addresses
  CONTRACTS: {
    PRGX_TOKEN: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0',
    SWEEPER: '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575',
    STAKING: '0x7FaB14198ae87E6ad95C785E61f14b68D175317B',
    MULTISIG: '0xa3C05e032DC179C7BC801C65F35563c8382CF01A',
    LP_TOKEN: '0xc76f9b605a929a35f1a6d8b200630e84e27caaeb'
  },

  // Staking configuration
  STAKING: {
    REWARD_RATE: '6.4', // PRGX per second
    REWARD_TOKEN: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0' // PRGX itself
  },

  // Tokenomics
  TOKENOMICS: {
    TOTAL_SUPPLY: '1000000000', // 1B PRGX
    DISTRIBUTION: {
      LIQUIDITY: { amount: '500000000', percentage: 50, description: 'Liquidity Pool (locked 2 years)' },
      TREASURY: { amount: '250000000', percentage: 25, description: 'Multisig Treasury (2-year vest)' },
      TEAM: { amount: '150000000', percentage: 15, description: 'Team & Advisors (4-year cliff)' },
      COMMUNITY: { amount: '50000000', percentage: 5, description: 'Community Rewards' },
      AIRDROPS: { amount: '30000000', percentage: 3, description: 'Airdrops & Marketing' },
      DEVELOPMENT: { amount: '20000000', percentage: 2, description: 'Development Fund' }
    }
  },

  // External links
  LINKS: {
    PULSESCAN: 'https://scan.pulsechain.com',
    PULSEX: 'https://pulsex.com',
    GITHUB: 'https://github.com/reniil/purgex',
    TWITTER: 'https://twitter.com/purgex_xyz',
    DISCORD: 'https://discord.gg/purgex'
  },

  // UI Constants
  UI: {
    ANIMATION_DURATION: 300,
    TOAST_DURATION: 5000,
    DEBOUNCE_DELAY: 300
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else {
  window.CONFIG = CONFIG;
}
