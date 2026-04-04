/**
 * PurgeX Frontend Application
 * No build step required - works with file:// protocol
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
  // Deployed contract addresses
  SWEEPER_ADDRESS: '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575',
  PRGX_ADDRESS: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0',

  // Network constants
  CHAIN_ID: 369,
  NETWORK: {
    chainId: `0x${369.toString(16)}`, // 0x171
    chainName: 'PulseChain',
    rpcUrls: ['https://rpc.pulsechain.com'],
    nativeCurrency: {
      name: 'Pulse',
      symbol: 'PLS',
      decimals: 18
    },
    blockExplorerUrls: ['https://scan.pulsechain.com']
  },

  // Known PulseChain tokens (add more as needed)
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
    // Add any other tokens you want to include
  ],

  // ABIs (minimal)
  ERC20_ABI: [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
    'function approve(address spender, uint256 amount) returns (bool)'
  ],

  SWEEPER_ABI: [
    'function sweepTokens(address[] tokenAddresses, uint256[] minAmountsOut)',
    'function protocolFeeBps() view returns (uint256)',
    'function tokenDestinations(address) view returns (address)',
    'event Sweep(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 amountPRGXOut, address indexed recipient)'
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
  contractLink: document.getElementById('contractLink')
};

// ==================== STATE ====================
let state = {
  account: null,
  provider: null,
  signer: null,
  tokenData: [], // { token, balance, decimals, allowance, estValue, status }
  prgxBalance: 0,
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

// ==================== UI UPDATES ====================
function updateUI() {
  if (!state.account) {
    DOM.connectPrompt.style.display = 'flex';
    DOM.dustPanel.style.display = 'none';
    DOM.sweepPanel.style.display = 'none';
    DOM.prgxCard.style.display = 'none';
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

    const estValue = item.estValue > 0 ? `$${formatNumber(item.estValue, 4)}` : '—';

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
      <td>${statusBadge}</td>
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

function addLog(message, type = 'info') {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  const timestamp = new Date().toLocaleTimeString();
  logEntry.textContent = `[${timestamp}] ${message}`;
  DOM.statusLog.prepend(logEntry);

  // Keep only last 10 logs
  if (DOM.statusLog.children.length > 10) {
    DOM.statusLog.removeChild(DOM.statusLog.lastChild);
  }
}

// ==================== WALLET CONNECTION ====================
async function connectWallet() {
  if (!window.ethereum) {
    alert('Please install MetaMask or another Web3 wallet to use PurgeX.');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    state.account = accounts[0];
    state.provider = new ethers.BrowserProvider(window.ethereum);
    state.signer = await state.provider.getSigner();

    DOM.connectBtn.textContent = shortenAddress(state.account);
    DOM.connectBtnPrompt.textContent = shortenAddress(state.account);

    addLog(`Wallet connected: ${shortenAddress(state.account)}`);

    // Start scanning
    await scanTokens();
    startPolling();

  } catch (error) {
    console.error('Connection failed:', error);
    addLog(`Connection failed: ${error.message}`, 'error');
  }
}

async function checkNetwork() {
  if (!state.provider) return;

  const network = await state.provider.getNetwork();
  const currentChainId = Number(network.chainId);

  if (currentChainId !== CONFIG.CHAIN_ID) {
    DOM.networkWarning.style.display = 'block';
    DOM.dustPanel.style.display = 'none';
    DOM.sweepPanel.style.display = 'none';
    return;
  } else {
    DOM.networkWarning.style.display = 'none';
    if (state.account) {
      DOM.dustPanel.style.display = 'block';
      DOM.sweepPanel.style.display = 'block';
    }
  }
}

async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CONFIG.NETWORK.chainId }]
    });
    addLog('Network switched to PulseChain');
    await checkNetwork();
  } catch (error) {
    // Network not added, try adding
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [CONFIG.NETWORK]
        });
        addLog('PulseChain network added and switched');
        await checkNetwork();
      } catch (addError) {
        addLog(`Failed to add network: ${addError.message}`, 'error');
      }
    } else {
      addLog(`Switch failed: ${error.message}`, 'error');
    }
  }
}

// ==================== TOKEN SCANNING ====================
async function scanTokens() {
  if (!state.account || !state.provider) return;

  addLog('Scanning wallet for dust tokens...');
  state.tokenData = [];

  // Worker to fetch token data in parallel
  const fetchPromises = CONFIG.COMMON_TOKENS.map(async (token) => {
    try {
      const tokenContract = new ethers.Contract(token.address, CONFIG.ERC20_ABI, state.provider);
      const [balance, decimals, symbol, name] = await Promise.all([
        tokenContract.balanceOf(state.account),
        tokenContract.decimals(),
        tokenContract.symbol(),
        tokenContract.name()
      ]);

      if (balance > 0) {
        // Get allowance for sweeper
        let allowance = 0;
        try {
          allowance = await tokenContract.allowance(state.account, CONFIG.SWEEPER_ADDRESS);
        } catch (e) {
          allowance = 0;
        }

        // Estimate value (in PRGX) - would need price feed; placeholder 0 for now
        const estValue = 0; // TODO: integrate price API

        return {
          address: token.address,
          symbol,
          name,
          balance: ethers.formatUnits(balance, decimals),
          decimals: Number(decimals),
          rawBalance: balance,
          allowance,
          estValue,
          status: allowance > 0 ? 'approved' : 'pending',
          selected: true // default select all
        };
      }
    } catch (error) {
      // Token might not be deployed or RPC error - skip
    }
    return null;
  });

  const results = await Promise.all(fetchPromises);
  state.tokenData = results.filter(r => r !== null);

  // Also check PRGX balance
  try {
    if (CONFIG.PRGX_ADDRESS !== ethers.AddressZero) {
      const prgxContract = new ethers.Contract(CONFIG.PRGX_ADDRESS, CONFIG.ERC20_ABI, state.provider);
      state.prgxBalance = await prgxContract.balanceOf(state.account);
    }
  } catch (e) {
    state.prgxBalance = 0;
  }

  addLog(`Found ${state.tokenData.length} dust token(s)`);
  updateUI();
}

// ==================== APPROVAL & SWEEPING ====================
async function approveToken(token) {
  const tokenContract = new ethers.Contract(token.address, CONFIG.ERC20_ABI, state.signer);

  // Update status
  token.status = 'approving';
  updateTokenRow(token);

  try {
    // Approve max uint256
    const maxAmount = ethers.MaxUint256.toString();
    const tx = await tokenContract.approve(CONFIG.SWEEPER_ADDRESS, maxAmount);
    addLog(`Approving ${token.symbol}... (tx: ${tx.hash.slice(0, 10)}...)`);

    await tx.wait();
    token.status = 'approved';
    addLog(`✅ Approved ${token.symbol}`);
  } catch (error) {
    token.status = 'pending';
    addLog(`❌ Approval failed for ${token.symbol}: ${error.message}`, 'error');
  }

  updateTokenRow(token);
  updateSweepSummary();
}

async function sweepSelected() {
  const selected = state.tokenData.filter(t => t.selected);

  if (selected.length === 0) {
    addLog('No tokens selected for sweeping', 'error');
    return;
  }

  // Ensure all selected are approved
  const pendingApprovals = selected.filter(t => t.status !== 'approved');
  if (pendingApprovals.length > 0) {
    addLog('Please approve all selected tokens first', 'error');
    return;
  }

  DOM.btnText.style.display = 'none';
  DOM.btnLoading.style.display = 'inline';

  try {
    const sweeperContract = new ethers.Contract(CONFIG.SWEEPER_ADDRESS, CONFIG.SWEEPER_ABI, state.signer);

    const tokenAddresses = selected.map(t => t.address);
    const minAmountsOut = selected.map(() => 0); // No minimum

    addLog(`Sweeping ${selected.length} token(s)...`);
    const tx = await sweeperContract.sweepTokens(tokenAddresses, minAmountsOut);
    addLog(`Transaction sent: ${tx.hash.slice(0, 10)}...`);

    const receipt = await tx.wait();
    addLog(`✅ Sweep confirmed in block ${receipt.blockNumber}`);

    // Parse Sweep events
    const iface = new ethers.Interface(CONFIG.SWEEPER_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'Sweep') {
          const { tokenIn, amountIn, amountPRGXOut } = parsed.args;
          const token = selected.find(t => t.address.toLowerCase() === tokenIn.toLowerCase());
          const tokenSymbol = token ? token.symbol : 'Unknown';
          const prgxOut = ethers.formatUnits(amountPRGXOut, 18);
          addLog(`   🧹 ${ethers.formatUnits(amountIn, 18)} ${tokenSymbol} → ${prgxOut} PRGX`);
        }
      } catch (e) {
        // Not a Sweep event
      }
    }

    // Refresh balances after sweep
    await sleep(2000); // Wait for RPC update
    await scanTokens();

  } catch (error) {
    addLog(`❌ Sweep failed: ${error.message}`, 'error');
  } finally {
    DOM.btnText.style.display = 'inline';
    DOM.btnLoading.style.display = 'none';
  }
}

function updateTokenRow(token) {
  const row = document.querySelector(`tr[data-index="${state.tokenData.indexOf(token)}"]`);
  if (!row) return;

  const statusCell = row.querySelector('td:last-child');
  if (token.status === 'approved') {
    statusCell.innerHTML = '<span class="badge success">Approved</span>';
  } else if (token.status === 'approving') {
    statusCell.innerHTML = '<span class="badge pending">Approving...</span>';
  } else {
    statusCell.innerHTML = '<span class="badge">Pending</span>';
  }
}

// ==================== EVENT LISTENERS ====================
DOM.connectBtn.addEventListener('click', connectWallet);
DOM.connectBtnPrompt.addEventListener('click', connectWallet);
DOM.switchNetworkBtn.addEventListener('click', switchNetwork);

DOM.selectAll.addEventListener('change', (e) => {
  const checked = e.target.checked;
  state.tokenData.forEach(t => t.selected = checked);
  updateTokenTable();
  updateSweepSummary();
});

DOM.dustTableBody.addEventListener('change', (e) => {
  if (e.target.classList.contains('token-checkbox')) {
    const idx = parseInt(e.target.dataset.index);
    state.tokenData[idx].selected = e.target.checked;
    updateSweepSummary();
  }
});

DOM.sweepBtn.addEventListener('click', sweepSelected);

// Allow triggering sweep with Enter key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && DOM.sweepPanel.style.display !== 'none') {
    sweepSelected();
  }
});

// Poll for network changes and balances
function startPolling() {
  if (state.pollInterval) clearInterval(state.pollInterval);
  state.pollInterval = setInterval(async () => {
    await checkNetwork();
    await scanTokens(); // Refresh balances every 30s
  }, 30_000);
}

// ==================== INIT ====================
// Pre-fill config if not set (will be overwritten by server-side env injection)
if (typeof CONFIG_ADDRESSES !== 'undefined') {
  CONFIG.SWEEPER_ADDRESS = CONFIG_ADDRESSES.SWEEPER;
  CONFIG.PRGX_ADDRESS = CONFIG_ADDRESSES.PRGX;
}

addLog('PurgeX frontend loaded');
updateUI();
