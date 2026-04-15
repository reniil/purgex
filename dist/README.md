# PurgeX Frontend

Multi-page DeFi frontend for PRGX on PulseChain. Convert worthless ERC-20 dust tokens into valuable PRGX and earn staking rewards.

## 🚀 Quick Start

1. **Clone or download** this repository
2. **Open index.html** in your browser (or serve with `npx serve .`)
3. **Connect MetaMask or Rabby** to PulseChain (chainId 369)
4. **Start sweeping** your dust tokens for PRGX!

## 🌐 Tech Stack

- **Pure HTML/CSS/JavaScript** - No frameworks, maximum performance
- **Ethers.js v6** - Web3 interactions via CDN
- **Hash-based SPA routing** - Single-page application without server
- **Responsive design** - Works on desktop, tablet, and mobile

## 📄 Pages

- **/** - Home page with hero, stats, and overview
- **#/sweep** - Main dust sweeper interface (core feature)
- **#/staking** - Stake PRGX and earn 6.4 PRGX/second
- **#/tokenomics** - Supply breakdown and token economics
- **#/contracts** - Verified contract addresses and security info
- **#/about** - Team, roadmap, and contact information

## 🔗 Contracts (PulseChain)

| Contract | Address | Status |
|----------|---------|--------|
| PRGX Token | `0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0` | ✅ Verified |
| Sweeper | `0xc6735B24D5A082E0A75637179A76ecE8a1aE1575` | ✅ Verified |
| Staking | `0x7FaB14198ae87E6ad95C785E61f14b68D175317B` | ✅ Verified |
| Multisig Treasury | `0xa3C05e032DC179C7BC801C65F35563c8382CF01A` | ✅ 3-of-5 |
| LP Token | `0xc76f9b605a929a35f1a6d8b200630e84e27caaeb` | 🔒 Locked |

## 🛠️ Features

### 🔥 Dust Sweeping
- **3-strategy token discovery**: PulseScan API + known dust list + transfer events
- **Batch contract calls** for optimal performance
- **Real-time estimates** as you select tokens
- **Per-token approval tracking** with progress indicators
- **5% protocol fee** (permanently capped)

### 💰 Staking System
- **Live reward counter** ticking up every second
- **6.4 PRGX/second** distributed to all stakers
- **No lock-up period** - unstake anytime
- **APR calculation** based on current participation
- **Emergency unstake** always available

### 🎨 Design System
- **PulseChain purple/pink theme** matching ecosystem
- **Fully responsive** with mobile-first approach
- **Smooth animations** and micro-interactions
- **Accessibility compliant** with semantic HTML
- **Dark mode optimized** for reduced eye strain

### 🔒 Security Features
- **All contracts verified** on PulseScan
- **Multisig treasury** (3-of-5 threshold)
- **LP tokens locked** 2+ years (no rug possible)
- **No admin keys** on staking contract
- **Independent audits** completed

## 📋 Wallet Support

- **MetaMask** - Full support with auto network switching
- **Rabby** - Optimized for DeFi power users
- **Any EIP-1193 wallet** - Compatible with all Web3 wallets

## 🌍 Network Requirements

- **PulseChain** (Chain ID: 369)
- **RPC**: `https://rpc.pulsechain.com`
- **Explorer**: `https://scan.pulsechain.com`

## 🔧 Development

### File Structure
```
frontend/
├── index.html              # Main entry point
├── pages/                  # HTML pages
│   ├── home.html
│   ├── sweep.html
│   ├── staking.html
│   ├── tokenomics.html
│   ├── contracts.html
│   └── about.html
├── css/
│   └── styles.css          # Complete design system
├── js/
│   ├── config.js           # Contracts & configuration
│   ├── router.js           # SPA routing
│   ├── app.js              # Main initialization
│   ├── wallet.js           # Wallet connection
│   ├── tokens.js           # Token discovery
│   ├── sweeper.js          # Sweep logic
│   ├── staking.js          # Staking dashboard
│   └── price.js            # Price fetching
├── assets/
│   ├── favicon.svg
│   └── logo.svg
└── README.md
```

### Configuration
Edit `js/config.js` to update:
- Contract addresses
- Network settings
- API endpoints
- Token lists

### Styling
All styles are in `css/styles.css` with:
- CSS custom properties for theming
- Component-based organization
- Mobile-first responsive design
- Smooth animations and transitions

## 🔍 Key Modules

### Wallet Manager (`js/wallet.js`)
- Auto-reconnect functionality
- Network switching prompts
- Event handling for accounts/chains
- Global UI state management

### Token Discovery (`js/tokens.js`)
- Multi-strategy token detection
- Batch contract calls for performance
- Real-time balance updates
- Custom token addition

### Sweeper (`js/sweeper.js`)
- Approval flow management
- Transaction status logging
- Confirmation modals
- Error handling

### Staking Manager (`js/staking.js`)
- Live reward counter
- APR calculations
- Batch operations
- Performance tracking

### Price Oracle (`js/price.js`)
- Multi-source price fetching
- Auto-refresh every 30 seconds
- Fallback mechanisms
- USD conversions

## 🚀 Deployment

### Static Hosting
Deploy to any static hosting service:
- **Vercel**, **Netlify**, **GitHub Pages**
- **IPFS** for decentralized hosting
- **AWS S3** with CloudFront

### Build Process
No build step required - it's vanilla HTML/CSS/JS!
Just upload the files as-is.

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly on PulseChain
5. **Submit** a pull request

## 📞 Support

- **GitHub**: [github.com/reniil/purgex](https://github.com/reniil/purgex)
- **Twitter**: [@purgex_xyz](https://twitter.com/purgex_xyz)
- **Email**: hello@purgex.xyz

## ⚠️ Disclaimer

This is experimental DeFi software. Use at your own risk. Always:
- **Do your own research** before using
- **Start with small amounts**
- **Understand the risks** involved
- **Never share your private keys**

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with ❤️ for the PulseChain ecosystem**
