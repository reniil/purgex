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
    FALLBACK_CONTRACT:  '0xa3C05e032DC179C7BC801C65F35563c8382CF01A', // Configurable contract for non-swappable tokens
    TREASURY:           '0xa3C05e032DC179C7BC801C65F35563c8382CF01A', // Treasury for PRGX distribution
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
    PULSESCAN_BASE: 'https://api.routescan.io/v2/network/mainnet/evm/369/etherscan/api',
    DEXSCREENER_BASE: 'https://api.dexscreener.com/latest/dex/tokens',
    IPULSE_ROUTER: '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02',
    IPULSE_FACTORY: '0x43d7dA3090A2F0c8A0b8F9a5E3E4bA6F5E6E8E',
    PULSEX_ROUTER: '0x165C341Df11E16e97605F8f84Ee5E475e902B82b', // PulseX router on PulseChain
    PULSEX_FACTORY: '0x1715a3E4A142d8b698131108995174F37aEBA10D', // PulseX factory on PulseChain
  },
  SWEEP_CONFIG: {
    MIN_LIQUIDITY_THRESHOLD: 1000, // Minimum liquidity in USD to consider swappable
    GAS_FEE_PAYER: 'sweeper', // 'sweeper' or 'user'
    AUTO_CLASSIFY: true, // Enabled with correct PulseX factory address
    SLIPPAGE_TOLERANCE: 0.5, // 0.5% slippage tolerance for swaps
    USE_FIXED_SWEEP_PRICING: true,
    FIXED_PRGX_PER_USD: 100000,
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
    'function sweep(address[] calldata tokens) external',
    'function getEstimatedOutput(address[] calldata tokens, address user) view returns (uint256)',
    'function feePercent() view returns (uint256)',
    'event Swept(address indexed user, address[] tokens, uint256 prgxReceived)',
  ],

  STAKING: [
    'function stake(uint256 amount) external',
    'function stakeAll() external',
    'function withdraw(uint256 amount) external',
    'function withdrawAll() external',
    'function exit() external',
    'function claimReward() external',
    'function pendingRewards(address user) view returns (uint256)',
    'function pendingRewardsOf(address user) view returns (uint256)',
    'function userStaked(address user) view returns (uint256)',
    'function getStakedBalance(address user) view returns (uint256)',
    'function totalStaked() view returns (uint256)',
    'function rewardRate() view returns (uint256)',
    'function UNSTAKE_COOLDOWN() view returns (uint256)',
    'function lastStakeTime(address user) view returns (uint256)',
    'function getCooldownEnd(address user) view returns (uint256)',
    'function getCooldownRemaining(address user) view returns (uint256)',
    'function canUnstake(address user) view returns (bool)',
    'event Staked(address indexed user, uint256 amount)',
    'event Withdrawn(address indexed user, uint256 amount)',
    'event RewardPaid(address indexed user, address indexed token, uint256 amount)',
  ],

  PAIR: [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
  ],

  PULSEX_ROUTER: [
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
    'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
  ]
};

// ================================================================
// KNOWN DUST TOKENS (Strategy B for token discovery)
// ================================================================

CONFIG.KNOWN_DUST_TOKENS = [
  // Real PulseChain tokens with proper checksums
  '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', // WPLS (Wrapped PLS)
  '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0', // PRGX
  '0xc76f9b605a929a35f1a6d8b200630e84e27caaeb', // LP Token
  '0x2b591e99af9fd0f5672567f8ccf83965dfc0db8f', // HEX (PulseChain)
];

// ================================================================
// EXPORT FOR GLOBAL USE
// ================================================================

window.CONFIG = CONFIG;
