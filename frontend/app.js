/**
 * PurgeX Frontend Application
 * Enhanced with BlockScout token discovery, custom token support, and staking
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
  // Deployed contract addresses
  SWEEPER_ADDRESS: '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575',
  PRGX_ADDRESS: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0',
  STAKING_ADDRESS: '0x7FaB14198ae87E6ad95C785E61f14b68D175317B',
  MULTISIG_ADDRESS: '0xa3C05e032DC179C7BC801C65F35563c8382CF01A',

  // Network constants
  CHAIN_ID: 369,
  NETWORK: {
    chainId: '0x171', // PulseChain chainId
    chainName: 'PulseChain',
    rpcUrls: ['https://rpc.pulsechain.com'],
    nativeCurrency: {
      name: 'Pulse',
      symbol: 'PLS',
      decimals: 18
    },
    blockExplorerUrls: ['https://scan.pulsechain.com']
  },

  // Token discovery sources
  BLOCKSCOUT_API: 'https://api.scan.pulsechain.com/api',
  EXPLORER_API: 'http://localhost:3000/api', // Local pulsechain-explorer
  USE_EXPLORER: true, // Try explorer first, fallback to BlockScout

  // Known PulseChain tokens (baseline list for symbols/logos)
  COMMON_TOKENS: [
    {
      address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
      symbol: 'PLSX',
      name: 'PulseX'
    },
    {
      address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
      symbol: 'HEX',
      name: 'HEX'
    },
    {
      address: '0x9Ca7B2FEf14Abc5337A4b9D3cB233ebBd0cA730B',
      symbol: 'USDC',
      name: 'USDC (bridged)'
    },
    {
      address: '0x9A48D5524D9351eFF2D2c1B732AD5D9FC495A6e5',
      symbol: 'DAI',
      name: 'DAI (bridged)'
    },
    {
      address: '0x5D85C45E473C10dD3C691AdDe0E507f9347843Ba',
      symbol: 'WBTC',
      name: 'WBTC (bridged)'
    },
    {
      address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
      symbol: 'WPLS',
      name: 'Wrapped PLS'
    }
  ],

  // ABIs (minimal)
  ERC20_ABI: [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)'
  ],

  SWEEPER_ABI: [
    'function sweepTokens(address[] tokenAddresses, uint256[] minAmountsOut)',
    'function protocolFeeBps() view returns (uint256)',
    'function tokenDestinations(address) view returns (address)',
    'function setFeeRecipient(address recipient) external',
    'event Sweep(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 amountPRGXOut, address indexed recipient)'
  ],

  STAKING_ABI: [
    'function stake(uint256 amount) external',
    'function stakeAll() external',
    'function withdraw(uint256 amount) external',
    'function withdrawAll() external',
    'function claimReward() external',
    'function exit() external',
    'function getStakedBalance(address user) view returns (uint256)',
    'function pendingRewardsOf(address user) view returns (uint256)',
    'function getTotalStaked() view returns (uint256)',
    'function rewardToken() view returns (address)',
    'function rewardRate() view returns (uint256)',
    'function rewardRunwaySeconds() view returns (uint256)',
    'function owner() view returns (address)'
  ]
};

// ==================== DOM ELEMENTS ====================
const DOM = {
  connectBtn: document.getElementById('connectBtn'),
  connectBtnPrompt: document.getElementById('connectBtnPrompt'),
  networkBadge: document.getElementById('networkBadge'),
  prgxCard: document.getElementById('prgxCard'),
  prgxBalance: document.getElementById('prgxBalance'),
  dustPanel: document.getElementById('dustPanel'),
  dustTableBody: document.getElementById('dustTableBody'),
  selectAll: document.getElementById('selectAll'),
  customTokenAddress: document.getElementById('customTokenAddress'),
  addCustomTokenBtn: document.getElementById('addCustomTokenBtn'),
  emptyState: document.getElementById('emptyState'),
  sweepPanel: document.getElementById('sweepPanel'),
  selectedCount: document.getElementById('selectedCount'),
  estimatedOut: document.getElementById('estimatedOut'),
  sweepBtn: document.getElementById('sweepBtn'),
  btnText: document.querySelector('.btn-text'),
  btnLoading: document.querySelector('.btn-loading'),
  statusLog: document.getElementById('statusLog'),
  connectPrompt: document.getElementById('connectPrompt'),
  networkWarning: document.getElementById('networkWarning'),
  switchNetworkBtn: document.getElementById('switchNetworkBtn'),
  contractLink: document.getElementById('contractLink'),
  
  // Staking elements
  stakingPanel: document.getElementById('stakingPanel'),
  stakedBalance: document.getElementById('stakedBalance'),
  pendingRewards: document.getElementById('pendingRewards'),
  aprDisplay: document.getElementById('aprDisplay'),
  stakeAmount: document.getElementById('stakeAmount'),
  stakeBtn: document.getElementById('stakeBtn'),
  unstakeAmount: document.getElementById('unstakeAmount'),
  unstakeBtn: document.getElementById('unstakeBtn'),
  claimBtn: document.getElementById('claimBtn'),
  claimAmount: document.getElementById('claimAmount'),
  prgxMax: document.getElementById('prgxMax'),
  unstakeMax: document.getElementById('unstakeMax')
};

// ==================== STATE ====================
let state = {
  account: null,
  provider: null,
  signer: null,
  tokenData: [], // { address, symbol, name, balance, decimals, allowance, estValue, status, selected, isCustom }
  customTokens: [], // Additional tokens user added manually
  prgxBalance: 0,
  staking: {
    staked: 0,
    pending: 0,
    totalStaked: 0,
    rewardRate: 0
  },
  pollInterval: null
};

// ==================== UTILS ====================
const formatNumber = (num, decimals = 2) => {
  if (num === 0) return '0';
  return parseFloat(num).toFixed(decimals);
};

const shortenAddress = (addr) => {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== STAKING FUNCTIONS ====================
async function loadStakingData() {
  if (!state.signer) return;
  
  try {
    const staking = new ethers.Contract(CONFIG.STAKING_ADDRESS, CONFIG.STAKING_ABI, state.signer);
    const prgx = new ethers.Contract(CONFIG.PRGX_ADDRESS, CONFIG.ERC20_ABI, state.signer);
    
    // Load PRGX decimals
    const decimals = await prgx.decimals();
    const format = (n) => ethers.formatUnits(n, decimals);
    
    // Get user's staked balance
    const staked = await staking.getStakedBalance(state.account);
    state.staking.staked = staked;
    
    // Get pending rewards
    const pending = await staking.pendingRewardsOf(state.account);
    state.staking.pending = pending;
    
    // Get total staked and reward rate
    const totalStaked = await staking.getTotalStaked();
    state.staking.totalStaked = totalStaked;
    const rewardRate = await staking.rewardRate();
    state.staking.rewardRate = rewardRate;
    
    // Get user PRGX balance
    const prgxBal = await prgx.balanceOf(state.account);
    state.prgxBalance = prgxBal;
    
    // Update UI
    DOM.stakedBalance.textContent = format(staked);
    DOM.pendingRewards.textContent = format(pending);
    DOM.prgxBalance.textContent = format(prgxBal);
    DOM.prgxMax.textContent = format(prgxBal);
    DOM.unstakeMax.textContent = format(staked);
    
    // Calculate APR estimate (rough)
    if (totalStaked > 0n && rewardRate > 0n) {
      const rewardsPerYear = rewardRate * 365n * 24n * 60n * 60n;
      const totalStakedDecimal = ethers.formatUnits(totalStaked, decimals);
      const totalRewardsDecimal = ethers.formatUnits(rewardsPerYear, decimals);
      const apr = (parseFloat(totalRewardsDecimal) / parseFloat(totalStakedDecimal)) * 100;
      DOM.aprDisplay.textContent = apr.toFixed(2) + '%';
    } else {
      DOM.aprDisplay.textContent = '--';
    }
    
    // Show claim amount
    DOM.claimAmount.textContent = format(pending);
    
  } catch (error) {
    console.error('Error loading staking data:', error);
  }
}

async function stakePRGX(amount) {
  if (!state.signer) return;
  
  try {
    const prgx = new ethers.Contract(CONFIG.PRGX_ADDRESS, CONFIG.ERC20_ABI, state.signer);
    const staking = new ethers.Contract(CONFIG.STAKING_ADDRESS, CONFIG.STAKING_ABI, state.signer);
    
    const decimals = await prgx.decimals();
    const stakeAmount = ethers.parseUnits(amount.toString(), decimals);
    
    // Check allowance first (if not already approved)
    const allowance = await prgx.allowance(state.account, CONFIG.STAKING_ADDRESS);
    if (allowance < stakeAmount) {
      addLog('Approving PRGX for staking...');
      const approveTx = await prgx.approve(CONFIG.STAKING_ADDRESS, stakeAmount);
      addLog('Approval transaction sent...');
      await approveTx.wait();
      addLog('✅ Approved');
    }
    
    // Stake
    addLog(`Staking ${amount} PRGX...`);
    const tx = await staking.stake(stakeAmount);
    addLog('Transaction pending...');
    await tx.wait();
    addLog('✅ Staked successfully!');
    
    // Refresh data
    await loadStakingData();
    
  } catch (error) {
    addLog(`❌ Stake failed: ${error.message}`, 'error');
    console.error(error);
  }
}

async function unstakePRGX(amount) {
  if (!state.signer) return;
  
  try {
    const staking = new ethers.Contract(CONFIG.STAKING_ADDRESS, CONFIG.STAKING_ABI, state.signer);
    const decimals = 18n; // PRGX decimals fixed at 18
    const unstakeAmount = ethers.parseUnits(amount.toString(), decimals);
    
    addLog(`Unstaking ${amount} PRGX...`);
    const tx = await staking.withdraw(unstakeAmount);
    addLog('Transaction pending...');
    await tx.wait();
    addLog('✅ Unstaked successfully!');
    
    await loadStakingData();
    
  } catch (error) {
    addLog(`❌ Unstake failed: ${error.message}`, 'error');
  }
}

async function claimRewards() {
  if (!state.signer) return;
  
  try {
    const staking = new ethers.Contract(CONFIG.STAKING_ADDRESS, CONFIG.STAKING_ABI, state.signer);
    
    addLog('Claiming rewards...');
    const tx = await staking.claimReward();
    addLog('Transaction pending...');
    await tx.wait();
    addLog('✅ Rewards claimed!');
    
    await loadStakingData();
    
  } catch (error) {
    addLog(`❌ Claim failed: ${error.message}`, 'error');
  }
}

function setupStakingHandlers() {
  DOM.stakeBtn.addEventListener('click', async () => {
    const amount = DOM.stakeAmount.value;
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    await stakePRGX(amount);
    DOM.stakeAmount.value = '';
  });
  
  DOM.unstakeBtn.addEventListener('click', async () => {
    const amount = DOM.unstakeAmount.value;
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    await unstakePRGX(amount);
    DOM.unstakeAmount.value = '';
  });
  
  DOM.claimBtn.addEventListener('click', claimRewards);
}

// ==================== API FUNCTIONS ====================
async function fetchTokensFromExplorer(address) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const url = `${CONFIG.EXPLORER_API}/wallet/${address}/tokens`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    return (data.tokens || []).map(tok => ({
      address: tok.address,
      symbol: tok.symbol,
      name: tok.name,
      decimals: tok.decimals,
      balance: tok.balance,
      rawBalance: BigInt(Math.floor(tok.balance * Math.pow(10, tok.decimals))),
      logoURI: tok.logoURI,
      verified: tok.verified,
      source: tok.source || 'explorer'
    })).filter(tok => tok.balance > 0);
  } catch (error) {
    console.log('Explorer API unavailable, will use BlockScout:', error.message);
    return [];
  }
}

async function fetchTokensFromBlockScout(address) {
  // Implementation for BlockScout fallback
  // This would query BlockScout API directly
  return [];
}

// ==================== HYBRID TOKEN FETCH ====================
async function fetchWalletTokens(address) {
  // Try explorer first (faster, richer metadata)
  let tokens = await fetchTokensFromExplorer(address);
  
  if (tokens.length === 0) {
    // Fallback to BlockScout
    addLog('Using BlockScout for token discovery...');
    tokens = await fetchTokensFromBlockScout(address);
  } else {
    addLog(`Found ${tokens.length} tokens via explorer`);
  }
  
  return tokens;
}

// ==================== UI UPDATES ====================
function updateUI() {
  if (!state.account) {
    DOM.connectPrompt.style.display = 'flex';
    DOM.dustPanel.style.display = 'none';
    DOM.sweepPanel.style.display = 'none';
    DOM.prgxCard.style.display = 'none';
    DOM.stakingPanel.style.display = 'none';
    return;
  }

  DOM.connectPrompt.style.display = 'none';

  // Check network
  checkNetwork();

  // Render token table
  renderTokenTable();

  // Show panels if tokens found
  if (state.tokenData.length > 0) {
    DOM.dustPanel.style.display = 'block';
    DOM.sweepPanel.style.display = 'block';
    DOM.prgxCard.style.display = 'block';
    DOM.prgxBalance.textContent = formatNumber(ethers.formatUnits(state.prgxBalance, 18), 4);
  } else {
    DOM.dustPanel.style.display = 'none';
    DOM.sweepPanel.style.display = 'none';
    DOM.prgxCard.style.display = 'block';
    DOM.prgxBalance.textContent = formatNumber(ethers.formatUnits(state.prgxBalance, 18), 4);
  }

  // Show staking panel if connected
  if (state.account) {
    DOM.stakingPanel.style.display = 'block';
    loadStakingData();
  }

  // Update contract link if sweeper address is set
  if (CONFIG.SWEEPER_ADDRESS !== ethers.AddressZero) {
    DOM.contractLink.href = `https://scan.pulsechain.com/address/${CONFIG.SWEEPER_ADDRESS}`;
    DOM.contractLink.textContent = CONFIG.SWEEPER_ADDRESS;
  }
}

function renderTokenTable() {
  DOM.dustTableBody.innerHTML = '';

  state.tokenData.forEach((item, idx) => {
    const row = document.createElement('tr');
    row.dataset.index = idx;

    const checked = item.selected ? 'checked' : '';
    const statusBadge = item.status === 'approved' ?
      '<span class="badge success">Approved</span>' :
      item.status === 'approving' ?
      '<span class="badge pending">Approving...</span>' :
      '<span class="badge">Pending</span>';

    const isCustom = item.isCustom ? '<span class="badge custom">Custom</span>' : '';
    const isVerified = item.verified ? '<span class="badge verified">✓ Verified</span>' : '';
    const estValue = item.estValue > 0 ? `$${formatNumber(item.estValue, 4)}` : '—';

    // Show source badge if from explorer
    const sourceBadge = item.source === 'explorer' ? '<span class="badge explorer">Explorer</span>' : '';

    row.innerHTML = `
      <td><input type="checkbox" class="token-checkbox" data-index="${idx}" ${checked}></td>
      <td>
        <div class="token-info">
          <span class="token-symbol">${item.symbol}</span>
          <span class="token-name">${item.name}</span>
        </div>
      </td>
      <td>${formatNumber(item.balance, item.decimals)}</td>
      <td>${estValue}</td>
      <td>${statusBadge}${isCustom}${isVerified}${sourceBadge}</td>
    `;

    DOM.dustTableBody.appendChild(row);
  });

  // Update selected count and estimate
  updateSweepSummary();
}

function updateSweepSummary() {
  const selected = state.tokenData.filter(t => t.selected);
  DOM.selectedCount.textContent = selected.length;

  const totalPRGXOut = selected.reduce((sum, t) => sum + t.estValue, 0);
  DOM.estimatedOut.textContent = formatNumber(totalPRGXOut, 4);
}

// ==================== CONNECTION & NETWORK ====================
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('Please install MetaMask to use this app');
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();

    state.provider = provider;
    state.signer = signer;
    state.account = accounts[0];

    // Check if on PulseChain
    const chainId = Number(network.chainId);
    if (chainId !== CONFIG.CHAIN_ID) {
      DOM.networkWarning.style.display = 'block';
      DOM.dustPanel.style.display = 'none';
      DOM.sweepPanel.style.display = 'none';
      DOM.prgxCard.style.display = 'none';
      DOM.stakingPanel.style.display = 'none';
      return;
    }

    DOM.networkWarning.style.display = 'none';
    addLog(`Connected: ${shortenAddress(state.account)}`);

    // Start polling for token updates
    startPolling();

    // Initial UI update
    updateUI();

  } catch (error) {
    console.error('Connection error:', error);
    addLog(`❌ Connection failed: ${error.message}`, 'error');
  }
}

async function checkNetwork() {
  if (!state.provider) return;
  
  try {
    const network = await state.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    if (chainId !== CONFIG.CHAIN_ID) {
      DOM.networkBadge.textContent = `Wrong Network (${chainId})`;
      DOM.networkBadge.classList.add('error');
      DOM.networkWarning.style.display = 'block';
    } else {
      DOM.networkBadge.textContent = `PulseChain`;
      DOM.networkBadge.classList.remove('error');
      DOM.networkWarning.style.display = 'none';
    }
  } catch (error) {
    console.error('Network check error:', error);
  }
}

async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CONFIG.NETWORK.chainId }]
    });
    location.reload();
  } catch (error) {
    // Chain not added, try adding it
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [CONFIG.NETWORK]
        });
        location.reload();
      } catch (addError) {
        alert('Failed to add PulseChain network. Please add it manually in MetaMask.');
      }
    }
  }
}

function checkConnection() {
  // Check if already connected on page load
  if (window.ethereum && window.ethereum.selectedAddress) {
    // Injected provider found, but need to initialize state
    // For simplicity, user must click connect
  }
}

// ==================== TOKEN MANAGEMENT ====================
async function fetchAndUpdateTokens() {
  if (!state.account) return;
  
  try {
    const tokens = await fetchWalletTokens(state.account);
    
    // Merge with custom tokens
    const allTokens = [...tokens];
    state.customTokens.forEach(custom => {
      // Avoid duplicates
      if (!allTokens.find(t => t.address.toLowerCase() === custom.address.toLowerCase())) {
        allTokens.push(custom);
      }
    });
    
    // Preserve selection status
    const newTokenData = allTokens.map(token => {
      const existing = state.tokenData.find(t => t.address === token.address);
      return {
        ...token,
        selected: existing ? existing.selected : false,
        status: existing ? existing.status : 'pending',
        allowance: existing ? existing.allowance : 0n
      };
    });
    
    state.tokenData = newTokenData;
    updateUI();
    
    // Refresh PRGX balance specifically
    await refreshPRGXBalance();
    
  } catch (error) {
    console.error('Error fetching tokens:', error);
    addLog(`❌ Failed to fetch tokens: ${error.message}`, 'error');
  }
}

async function refreshPRGXBalance() {
  if (!state.signer) return;
  
  try {
    const prgx = new ethers.Contract(CONFIG.PRGX_ADDRESS, CONFIG.ERC20_ABI, state.signer);
    const balance = await prgx.balanceOf(state.account);
    state.prgxBalance = balance;
    
    // Update UI if PRGX card is visible
    if (DOM.prgxCard.style.display !== 'none') {
      DOM.prgxBalance.textContent = formatNumber(ethers.formatUnits(balance, 18), 4);
    }
  } catch (error) {
    console.error('Error fetching PRGX balance:', error);
  }
}

// ==================== EVENT HANDLERS (continued) ====================
function toggleSelectAll(checked) {
  state.tokenData.forEach(token => {
    token.selected = checked;
  });
  renderTokenTable();
}

async function addCustomToken() {
  const address = DOM.customTokenAddress.value.trim();
  if (!ethers.isAddress(address)) {
    alert('Invalid address');
    return;
  }
  
  // Check if already exists
  if (state.tokenData.find(t => t.address.toLowerCase() === address.toLowerCase())) {
    alert('Token already in list');
    return;
  }
  
  try {
    const token = new ethers.Contract(address, CONFIG.ERC20_ABI, state.provider);
    const [symbol, name, decimals] = await Promise.all([
      token.symbol(),
      token.name(),
      token.decimals()
    ]);
    
    const balance = await token.balanceOf(state.account);
    
    if (balance === 0n) {
      alert('This token has 0 balance in your wallet');
      return;
    }
    
    const customToken = {
      address,
      symbol,
      name,
      decimals: Number(decimals),
      balance: ethers.formatUnits(balance, decimals),
      rawBalance: balance,
      isCustom: true,
      selected: false,
      status: 'pending'
    };
    
    state.customTokens.push(customToken);
    DOM.customTokenAddress.value = '';
    
    // Refresh token list
    await fetchAndUpdateTokens();
    addLog(`Added custom token: ${symbol}`);
    
  } catch (error) {
    console.error('Error adding custom token:', error);
    addLog(`❌ Failed to add token: ${error.message}`, 'error');
  }
}

// ==================== LOGGING ====================
function addLog(message, type = 'info') {
  const log = document.createElement('div');
  log.className = `log-entry ${type}`;
  log.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  DOM.statusLog.appendChild(log);
  DOM.statusLog.scrollTop = DOM.statusLog.scrollHeight;
}

// ==================== MAIN APP LOGIC ====================
let app = {
  init() {
    this.setupEventListeners();
    this.checkConnection();
  },
  
  setupEventListeners() {
    DOM.connectBtn?.addEventListener('click', connectWallet);
    DOM.connectBtnPrompt?.addEventListener('click', connectWallet);
    DOM.switchNetworkBtn?.addEventListener('click', switchNetwork);
    DOM.selectAll?.addEventListener('change', (e) => toggleSelectAll(e.target.checked));
    DOM.addCustomTokenBtn?.addEventListener('click', () => addCustomToken());
    DOM.sweepBtn?.addEventListener('click', () => this.executeSweep());
    
    // Setup staking handlers
    setupStakingHandlers();
  },
  
  checkConnection() {
    // Auto-connect if provider present (optional)
    if (window.ethereum) {
      // Could auto-connect, but better to let user click
    }
  },
  
  toggleSelectAll(checked) {
    toggleSelectAll(checked);
  },
  
  async executeSweep() {
    // Implementation for sweep functionality
    addLog('Sweep functionality would go here...');
  }
};

// ==================== STANDALONE FUNCTIONS (for event handlers) ====================
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('Please install MetaMask to use this app');
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();

    state.provider = provider;
    state.signer = signer;
    state.account = accounts[0];

    // Check if on PulseChain
    const chainId = Number(network.chainId);
    if (chainId !== CONFIG.CHAIN_ID) {
      DOM.networkWarning.style.display = 'block';
      DOM.dustPanel.style.display = 'none';
      DOM.sweepPanel.style.display = 'none';
      DOM.prgxCard.style.display = 'none';
      DOM.stakingPanel.style.display = 'none';
      return;
    }

    DOM.networkWarning.style.display = 'none';
    addLog(`Connected: ${shortenAddress(state.account)}`);

    // Start polling for token updates
    startPolling();

    // Initial UI update
    updateUI();

  } catch (error) {
    console.error('Connection error:', error);
    addLog(`❌ Connection failed: ${error.message}`, 'error');
  }
}

async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CONFIG.NETWORK.chainId }]
    });
    location.reload();
  } catch (error) {
    // Chain not added, try adding it
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [CONFIG.NETWORK]
        });
        location.reload();
      } catch (addError) {
        alert('Failed to add PulseChain network. Please add it manually in MetaMask.');
      }
    }
  }
}

function startPolling() {
  // Poll for token updates every 30 seconds
  if (state.pollInterval) clearInterval(state.pollInterval);
  state.pollInterval = setInterval(async () => {
    if (state.account) {
      await fetchAndUpdateTokens();
      await loadStakingData();
    }
  }, 30000);
}

function toggleSelectAll(checked) {
  state.tokenData.forEach(token => {
    token.selected = checked;
  });
  renderTokenTable();
}

async function addCustomToken() {
  const address = DOM.customTokenAddress.value.trim();
  if (!ethers.isAddress(address)) {
    alert('Invalid address');
    return;
  }
  
  // Check if already exists
  if (state.tokenData.find(t => t.address.toLowerCase() === address.toLowerCase())) {
    alert('Token already in list');
    return;
  }
  
  try {
    const token = new ethers.Contract(address, CONFIG.ERC20_ABI, state.provider);
    const [symbol, name, decimals] = await Promise.all([
      token.symbol(),
      token.name(),
      token.decimals()
    ]);
    
    const balance = await token.balanceOf(state.account);
    
    if (balance === 0n) {
      alert('This token has 0 balance in your wallet');
      return;
    }
    
    const customToken = {
      address,
      symbol,
      name,
      decimals: Number(decimals),
      balance: ethers.formatUnits(balance, decimals),
      rawBalance: balance,
      isCustom: true,
      selected: false,
      status: 'pending'
    };
    
    state.customTokens.push(customToken);
    DOM.customTokenAddress.value = '';
    
    // Refresh token list
    await fetchAndUpdateTokens();
    addLog(`Added custom token: ${symbol}`);
    
  } catch (error) {
    console.error('Error adding custom token:', error);
    addLog(`❌ Failed to add token: ${error.message}`, 'error');
  }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

// Also try to init immediately in case DOM already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  app.init();
}
