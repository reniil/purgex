// ================================================================
// CONFIGURATION — PurgeX (PRGX) on PulseChain
// ================================================================

const CONFIG = {
  CONTRACTS: {
    PRGX_TOKEN:         '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0',
    SWEEPER:            '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575',
    STAKING:            '0x7FaB14198ae87E6ad95C785E61f14b68D175317B',
    MULTISIG_TREASURY:  '0xa3C05e032DC179C7BC801C65F35563c8382CF01A',
    LP_TOKEN:           '0xc76f9b605a929a35f1a6d8b200630e84e27caaeb',
    WPLS:               '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
  },
  NETWORK: {
    chainId: 369,
    chainIdHex: '0x171',
    name: 'PulseChain',
    rpc: 'https://rpc.pulsechain.com',
    explorer: 'https://scan.pulsechain.com',
    currency: { name: 'PLS', symbol: 'PLS', decimals: 18 },
  },
  PULSEX_SWAP_URL: 'https://pulsex.mypinata.cloud/ipfs/bafybeidea3ibq4lu5t6vk6ihp4iuznjb3wtPrgxkardhmhnqtmcfpdp5m/#/?outputCurrency=0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0',
  REWARDS_PER_SECOND: 6.4,
  SWEEP_FEE_PERCENT: 5,
  PRICE_REFRESH_INTERVAL_MS: 30000,
  TOKEN_DISCOVERY_BATCH: 20,
  APIS: {
    PULSESCAN_BASE: 'https://api.routescan.io/v2/network/mainnet/evm/369/etherscan',
    DEXSCREENER_BASE: 'https://api.dexscreener.com/latest/dex/tokens',
    IPULSE_ROUTER: '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02',
    IPULSE_FACTORY: '0x43d7dA3090A2F0c8A0b8F9a5E3E4bA6F5E6E8E',
  }
};

// ================================================================
// CONTRACT ABIs
// ================================================================

CONFIG.ABIS = {
  ERC20: [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ],

  SWEEPER: [
    'function sweepTokens(address[] calldata tokenAddresses, uint256[] calldata minAmountsOut) external',
    'function sweep(address[] calldata tokens) external',
    'function getSwapPath(address token) view returns (address[])',
    'function getEstimatedOutput(address[] calldata tokens, address user) view returns (uint256)',
    'function protocolFeeBps() view returns (uint256)',
    'function feePercent() view returns (uint256)',
    'function getFeePercent() view returns (uint256)',
    'function FEE_PERCENT() view returns (uint256)',
    'function estimateOutput(address[] calldata tokens, address user) view returns (uint256)',
    'function calculateOutput(address[] calldata tokens, address user) view returns (uint256)',
    'function owner() view returns (address)',
    'function paused() view returns (bool)',
    'function isPaused() view returns (bool)',
    'event Sweep(address indexed user, address indexed token, uint256 amount, uint256 prgxOut, address recipient)',
    'event ProtocolFeeUpdated(uint256 newFee)',
  ],

  STAKING: [
    'function stake(uint256 amount) external',
    'function unstake(uint256 amount) external',
    'function claimRewards() external',
    'function pendingRewards(address user) view returns (uint256)',
    'function stakedBalance(address user) view returns (uint256)',
    'function totalStaked() view returns (uint256)',
    'function rewardRate() view returns (uint256)',
    'event Staked(address indexed user, uint256 amount)',
    'event Unstaked(address indexed user, uint256 amount)',
    'event RewardsClaimed(address indexed user, uint256 amount)',
  ],

  PAIR: [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
  ]
};

// ================================================================
// KNOWN DUST TOKENS (Strategy B for token discovery)
// ================================================================

CONFIG.KNOWN_DUST_TOKENS = [
  // Real PulseChain tokens with proper checksums
  '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', // WPLS
  '0x02f26235791bf5e65a3253aa06845c0451237567', // PLS
  '0x2b592e8c5c1b4f8b6e3b4c8e4b4c8e4b4c8e4b4c', // Example placeholder (will be skipped)
];

// ================================================================
// EXPORT FOR GLOBAL USE
// ================================================================

window.CONFIG = CONFIG;
