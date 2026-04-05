# PurgeX Frontend

A professional, multi-page website for PurgeX (PRGX) on PulseChain.

## 🚀 Quick Start

### Option 1: Direct Open
Simply open `index.html` in your browser - no build step required!

### Option 2: Local Server
For better development experience:

```bash
# Using Python 3
python -m http.server 3000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:3000
```

Then visit `http://localhost:3000`

## 📁 File Structure

```
frontend/
├── index.html          # Home page with hero, features, stats
├── sweep.html          # Dust sweeper interface  
├── staking.html        # Staking dashboard
├── tokenomics.html     # Token distribution & economics
├── contracts.html      # Contract verification & security
├── about.html          # Team, vision, roadmap
├── css/
│   └── styles.css      # Complete styling system
├── js/
│   ├── config.js        # Contract addresses & constants
│   ├── router.js        # Simple hash-based routing
│   ├── app.js           # Core app logic & wallet connect
│   ├── sweeper.js       # Dust sweeper functionality
│   └── staking.js       # Staking dashboard logic
└── assets/
    └── favicon.svg      # PurgeX broom icon
```

## 🎨 Features

### ✅ Core Functionality
- **Wallet Connection**: MetaMask, WalletConnect support
- **Dust Sweeping**: Bulk token discovery and sweeping
- **Staking Dashboard**: Real-time rewards, APR tracking
- **Multi-page Navigation**: Clean hash-based routing

### ✅ Professional Design
- **Dark Theme**: Modern PulseChain aesthetic
- **Responsive**: Mobile-first design (320px+)
- **Animations**: Smooth transitions and micro-interactions
- **Typography**: Inter font for readability

### ✅ Contract Integration
- **Live Addresses**: All deployed contracts integrated
- **Real-time Data**: Staking stats, token balances
- **Transaction Handling**: Approval patterns, gas estimation

## 🔧 Configuration

### Contract Addresses (Live)
```javascript
PRGX_TOKEN: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0'
SWEEPER: '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575'  
STAKING: '0x7FaB14198ae87E6ad95C785E61f14b68D175317B'
MULTISIG: '0xa3C05e032DC179C7BC801C65F35563c8382CF01A'
LP_TOKEN: '0xc76f9b605a929a35f1a6d8b200630e84e27caaeb'
```

### Network Configuration
- **Chain ID**: 369 (PulseChain)
- **RPC**: `https://rpc.pulsechain.com`
- **Explorer**: `https://scan.pulsechain.com`

## 🌐 Pages Overview

### 1. Home (`/`)
- Hero section with CTAs
- Live stats (TVL, treasury, sweepers)
- Feature highlights
- Staking preview

### 2. Sweep (`#/sweep`)
- Token discovery from wallet
- Bulk selection interface
- Sweep execution with 1% fee
- Transaction status tracking

### 3. Staking (`#/staking`)
- Real-time staking stats
- Stake/unstake operations
- Reward claiming
- APR calculations

### 4. Tokenomics (`#/tokenomics`)
- Supply distribution charts
- Vesting schedules
- Value accrual mechanisms
- Buy PRGX on PulseX

### 5. Contracts (`#/contracts`)
- Verified contract list
- Security features
- Fee structure
- Audit information

### 6. About (`#/about`)
- Team profiles
- Project vision
- Development roadmap
- Contact information

## 🛠 Development

### Adding New Pages
1. Create HTML file in root (e.g., `newpage.html`)
2. Add route in `js/router.js`:
   ```javascript
   router.addRoute('/newpage', () => showPage('newpage-page'));
   ```
3. Add navigation link in header
4. Style with existing CSS classes

### Modifying Styles
- All styles in `css/styles.css`
- CSS variables for easy theming
- Mobile-first responsive design
- Component-based organization

### Contract Interactions
- Use ethers.js v6 (UMD from CDN)
- Contract ABIs in respective JS files
- Error handling with user-friendly messages
- Loading states and transaction tracking

## 🔒 Security Notes

- **No Private Keys**: Frontend never handles private keys
- **MetaMask Only**: All signing via wallet provider
- **HTTPS Required**: For production deployment
- **Contract Verified**: All addresses verified on PulseScan

## 📱 Mobile Optimization

- **Breakpoints**: 640px, 768px, 1024px, 1280px
- **Touch Targets**: Minimum 44px tap targets
- **Responsive Grid**: Auto-adjusting layouts
- **Performance**: Optimized images, minimal JS

## 🚀 Deployment

### Static Hosting (Recommended)
```bash
# Deploy to Netlify
netlify deploy --prod --dir=frontend

# Deploy to Vercel  
vercel --prod frontend/

# Deploy to GitHub Pages
gh-pages -d frontend/
```

### Server Hosting
```bash
# Using the unified server
cd ..
npm start
# Frontend served at http://localhost:3000
```

## 🐛 Troubleshooting

### Common Issues
- **MetaMask Not Connecting**: Ensure PulseChain network added
- **Contract Calls Failing**: Check RPC endpoint status
- **Styles Not Loading**: Verify CSS file path
- **Routing Not Working**: Check hash-based URLs

### Debug Mode
Open browser console and look for:
- Wallet connection status
- Contract interaction logs
- Network switch requests
- Transaction confirmations

## 📞 Support

- **GitHub**: https://github.com/reniil/purgex
- **Discord**: https://discord.gg/purgex  
- **Twitter**: @purgex_xyz
- **Email**: hello@purgex.xyz

---

**Built with ❤️ for the PulseChain ecosystem**
