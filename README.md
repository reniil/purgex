# PurgeX

> **Dust Sweeper on PulseChain** — Consolidate small/unwanted ERC20 token balances into a single token (PRGX).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📋 Overview

PurgeX automatically sweeps small token balances (dust) from your wallet and converts them into PurgeX Token (PRGX) via PulseX V2 on PulseChain. The protocol charges a 1% fee on each sweep to sustain operations.

**How it works:**

1. You connect your wallet and see all your token balances
2. You select which dust tokens to sweep
3. You approve the sweeper contract to spend those tokens
4. A taker bot (or you manually) calls `sweepTokens()` to convert everything to PRGX
5. You receive PRGX directly in your wallet

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org))
- **MetaMask** or compatible Web3 wallet ([Download](https://metamask.io))
- **PulseChain** network added to your wallet
- **PLS** for gas fees (paying the sweep transaction)
- **Git** for cloning

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/purgex.git
cd purgex

# Install dependencies
npm install
```

### Deploy Contracts

1. Create `.env` from the example:

```bash
cp .env.example .env
```

2. Edit `.env` and add your **deployer private key**:

```env
RPC_URL=https://rpc.pulsechain.com
PRIVATE_KEY=0xYourPrivateKeyHere...
# Leave the rest blank — they will be filled after deployment
```

3. Deploy to PulseChain:

```bash
npm run deploy
```

4. After deployment, the script will automatically update `.env` with:
   - `PRGX_TOKEN_ADDRESS`
   - `SWEEPER_CONTRACT_ADDRESS`

5. (Optional) Verify contracts on PulseXScan to make them readable.

### Run the Taker Bot

The bot automatically finds wallets that have approved the sweeper and executes profitable sweeps.

```bash
# Set bot private key in .env (can be same as deployer or different)
TAKER_BOT_PRIVATE_KEY=0xBotPrivateKey...

# Start the bot
npm run bot
```

The bot will:
- Listen for new `Approval` events where spender = sweeper address
- Scan for token balances of users who approved
- Execute `sweepTokens()` if gas cost < potential PRGX output (with 5% buffer)
- Log all activity

### Use the Frontend

Open `frontend/index.html` directly in your browser (file://) or serve it:

```bash
# Option 1: direct open (simplest)
open frontend/index.html

# Option 2: serve locally
npx serve frontend
```

Then:
1. Connect your wallet (ensure you're on PulseChain)
2. See all tokens with balance > 0
3. Select tokens to sweep
4. Click "PURGE SELECTED TOKENS"
5. Approve each token (one transaction each)
6. The bot will execute the sweep automatically (or you can call manually)

**Note:** For testing on PulseChain testnet (if available), update `RPC_URL` and `CONFIG.CHAIN_ID` accordingly.

## 📁 Project Structure

```
purgex/
├── contracts/
│   ├── PurgeXToken.sol          # ERC20 token (PRGX)
│   └── PurgeXSweeper.sol        # Core sweeper contract
├── scripts/
│   ├── deploy.js                # Deployment script
│   └── takerBot.js              # Automated sweep bot
├── frontend/
│   ├── index.html               # Main dApp interface
│   ├── app.js                   # Web3 logic
│   └── styles.css               # Cyberpunk/industrial styling
├── hardhat.config.js            # Hardhat configuration
├── .env.example                 # Environment template
├── .env                         # Your secrets (IGNORED)
├── package.json                 # Dependencies
└── README.md                    # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RPC_URL` | Yes | PulseChain RPC endpoint (default provided) |
| `PRIVATE_KEY` | Yes (deploy) | Deployer wallet private key (mainnet) |
| `PRGX_TOKEN_ADDRESS` | After deploy | Filled by `deploy.js` |
| `SWEEPER_CONTRACT_ADDRESS` | After deploy | Filled by `deploy.js` |
| `TAKER_BOT_PRIVATE_KEY` | Optional | Bot wallet key (can be same as deployer) |

**⚠️ Never commit `.env` to version control!**

### PulseChain Network Details

- Chain ID: `369` (0x171 hex)
- RPC: `https://rpc.pulsechain.com`
- Explorer: `https://scan.pulsechain.com`
- Currency: PLS (native), gas price ~2 gwei

### DEX Integration

PurgeX uses PulseX V2 (Uniswap V2 fork):
- Router: `0x165C3410fC91EF562C50559f7d2289fEbed552d9`
- Factory: `0x1715a3E4A142d8b698131108995174F37aEBA10D`
- WPLS: `0xA1077a294dDE1B09bB078844df40758a5D0f9a27`

## 📜 Smart Contracts

### PurgeXToken (PRGX)

ERC20 token with:
- **Fixed name/symbol:** "PurgeX Token", "PRGX"
- **Total supply:** 1,000,000,000 tokens (minted to deployer on creation)
- **Mint:** Only owner can mint (for liquidity, rewards, etc.)
- **Burn:** Anyone can burn their own tokens; owner can burn from any (used for protocol fees)

**Why a separate token?** PRGX gives the protocol a native value accrual mechanism. Users receive PRGX as the consolidated output, creating demand and utility.

### PurgeXSweeper

Core contract that:
- Accepts token approval from users
- Takes a small protocol fee (default 1%, max 5%)
- Swaps tokens to PRGX via PulseX V2
- Supports direct swaps and two-hop via WPLS
- Allows per-user destination overrides

**Key functions:**
- `sweepTokens(address[] tokenAddresses, uint256[] minAmountsOut)` — main entry
- `setProtocolFee(uint256 bps)` — adjust fee (owner)
- `setDestination(address)` — user-defined PRGX recipient
- `rescueTokens(address, uint256)` — emergency token recovery (owner)

**Security features:**
- `nonReentrant` (ReentrancyGuard)
- `Ownable` for admin functions
- SafeERC20 for token transfers

## 🤖 Taker Bot

The bot (`scripts/takerBot.js`) monitors the mempool and executes profitable sweeps on behalf of users.

**Features:**
- Listens for `Approval` events where spender = sweeper
- Scans user balances for known tokens
- Estimates gas cost vs swap output
- Only executes if profit > gas * 1.05
- Runs continuously with 30-second polling fallback
- Graceful error handling

**Why a bot?** Users approve once, but someone needs to call `sweepTokens()` and pay the gas. The bot can be:
- Run by the protocol (collecting fees)
- Run by a third-party willing to capture MEV
- Eventually replaceable with a keeper network

**Running the bot:**

```bash
npm run bot
```

It will output logs like:
```
[12:34:56] New approval detected: Owner=0x123..., Amount=1000000
[12:34:57] Sweeping...
[12:35:02] ✅ Sweep confirmed in block 123456
[12:35:02] 🧹 150.5 USDC → 142.8 PRGX
```

## 🖥️ Frontend

A single-page dark-themed dApp with cyberpunk/industrial aesthetics.

**Features:**
- Wallet connect with PulseChain detection
- Network switching assistance
- Auto-scan of all token balances
- Approve individual tokens
- Manual sweep trigger (if bot not running)
- Real-time status logs

**Design choices:**
- Font: Share Tech Mono (headers) + IBM Plex Sans (body)
- Colors: Deep black (#0a0a0a), electric purple (#9333ea), cyan (#06b6d4)
- Glow effects on hover (box-shadow)
- Responsive layout (mobile stacks to single column)

**No build step:** Works as plain HTML/JS. Just open `frontend/index.html`.

## 🧪 Testing

Hardhat tests can be added to `test/` directory:

```bash
npm test
```

Currently the project includes integration-ready contract code but no unit tests yet. See `scripts/deploy.js` for deployment flow.

## 🛠️ Development

### Compile contracts

```bash
npm run compile
```

Outputs ABI/bytecode in `artifacts/`.

### Local testing network

```bash
npx hardhat node
```

Uses localhost accounts with pre-funded ETH.

### Deployment to other networks

Update `hardhat.config.js` with additional networks (e.g., Ethereum mainnet, local anvil). PulseChain is pre-configured.

## 🔗 Reference Projects

PurgeX is inspired by and built upon these open-source sweeper implementations:

- [PaymagicXYZ/dustsweeper-backend-old](https://github.com/PaymagicXYZ/dustsweeper-backend-old) — Original DustSweeper backend/bot logic
- [PaymagicXYZ/dustsweeper-ui-old](https://github.com/PaymagicXYZ/dustsweeper-ui-old) — Original frontend design
- [James-Sangalli/eth-sweep](https://github.com/James-Sangalli/eth-sweep) — Ethereum token/ERC721 sweeper with safety features
- [sparkidea25/ethereum-token-sweeper](https://github.com/sparkidea25/ethereum-token-sweeper) — Batch swap sweeper pattern
- [quiknode-labs/qn-guide-examples](https://github.com/quiknode-labs/qn-guide-examples) (see `token-sweeper-eip-7702` subfolder) — Modern EIP-7702 batch approach

Thank you to these contributors for pioneering the dust-sweeper concept!

## 📝 License

MIT. See LICENSE file for details.

## 🤝 Contributing

Pull requests welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a PR with description

For major changes, open an issue first to discuss.

## ⚠️ Disclaimer

**Use at your own risk.** This is experimental software. While we've implemented safety features (reentrancy guard, onlyOwner functions, fee caps), there are risks:

- Smart contract bugs could lead to loss of funds
- PulseChain network may be unstable
- Token prices fluctuate; output is not guaranteed
- Gas fees required for approvals and sweeps

**Never share your private keys.** Deployer key should be secure. Bot key should have limited funds only for gas.

---

**Built for PulseChain.** 🧹✨
