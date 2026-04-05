# PurgeX Frontend Rebuild — Complete Specification

## 🎯 Project Overview

Build a **professional, multi-page website** for PurgeX (PRGX) on PulseChain. The site should attract both users (dust sweepers) and investors/buyers.

**Core Features:**
1. **Dust Sweeping Interface** — Connect wallet, sweep dust tokens to PRGX
2. **Staking Dashboard** — Stake PRGX, earn PRGX rewards (6.4/sec)
3. **Tokenomics Page** — Detailed supply, distribution, vesting schedules
4. **Contracts & Security** — Verified contracts, multisig, audits
5. **Buy PRGX** — Clear CTA to acquire PRGX on PulseX
6. **About / Roadmap** — Project vision, team, future plans

---

## 📁 File Structure

```
/frontend
├── index.html          (Home page)
├── staking.html        (Staking interface)
├── tokenomics.html     (Tokenomics & buy PRGX)
├── about.html          (About & roadmap)
├── contracts.html      (Contracts info)
├── css/
│   └── styles.css      (All styles)
├── js/
│   ├── app.js          (Main app logic)
│   ├── staking.js      (Staking specific)
│   ├── sweeper.js      (Dust sweeper logic)
│   ├── router.js       (Simple hash-based routing)
│   └── config.js       (Contract addresses, constants)
└── assets/
    ├── logo.svg
    ├── favicon.ico
    └── icons/
        ├── purse.svg
        ├── shield.svg
        └── chart.svg
```

---

## 🎨 Design System

**Colors:**
- Primary: `#6366f1` (Indigo) — PurgeX brand
- Secondary: `#8b5cf6` (Purple)
- Accent: `#10b981` (Green) — earnings, success
- Background: `#0f172a` (Dark slate)
- Surface: `#1e293b` (Lighter slate)
- Text: `#f8fafc` (Light) and `#94a3b8` (Muted)
- Border: `#334155`

**Typography:**
- Headings: Inter (sans-serif), weights 600-800
- Body: Inter, weight 400
- Monospace: JetBrains Mono (for addresses, numbers)

**Components:**
- Cards with rounded corners (12px), subtle borders
- Buttons: pill-shaped, gradient (indigo→purple), hover lift
- Inputs: dark background, light border, subtle focus glow
- Tables: clean, zebra-striped, responsive

**Responsive:**
- Mobile-first (320px+)
- Breakpoints: 640px, 768px, 1024px, 1280px
- Hamburger menu on mobile

---

## 🌐 Pages & Content

### 1. Home (`index.html`)

**Hero Section:**
- Large heading: "Sweep Dust. Earn PRGX."
- Subtitle: "Convert worthless ERC-20 dust into valuable PRGX on PulseChain"
- CTA buttons: "Connect Wallet" (primary), "Buy PRGX" (secondary)
- Animated background: particles or pulse waves

**Features Grid (3 cols):**
1. **One-Click Sweep** — Bulk approve & sweep multiple tokens
2. **Earn PRGX** — Stake PRGX for 6.4 tokens/sec rewards
3. **Decentralized Treasury** — 3/5 multisig, community-governed

**Stats Bar:**
- TVL: [REAL_TIME] PRGX
- Treasury: 250M PRGX
- Sweepers: [TOTAL_USERS]
- Rewards Distributed: [TOTAL_REWARDS]

**How It Works (4 steps):**
1. Connect wallet (PulseChain)
2. Select dust tokens
3. Approve & sweep
4. Receive PRGX instantly

**Preview of Staking APY** (real-time calculated)

---

### 2. Dust Sweep (`#/sweep` within index.html or separate)

**Wallet Connection Panel:**
- "Connect Wallet" button (big)
- Network check: must be PulseChain (369)
- Shows connected address (shortened)

**Token Discovery:**
- Automatically fetches all ERC-20 tokens with balance > 0
- Shows: symbol, name, balance, estimated value (if price available)
- Checkboxes to select tokens
- "Select All" toggle

**Custom Token Add:**
- Input field + "Add Token" button
- Manual address entry for unsupported tokens

**Selected Summary:**
- Count of selected tokens
- Estimated PRGX out (after 1% fee)
- "PURGE SELECTED" button (large, gradient)

**Status Log:**
- Real-time transaction updates
- Success/failure messages

---

### 3. Staking (`staking.html`)

**Header:**
- "PRGX Staking" title
- Link to PulseScan: `0x7FaB14198ae87E6ad95C785E61f14b68D175317B`

**Stats Cards (grid):**
- Your Staked: [dynamic] PRGX
- Pending Rewards: [dynamic] PRGX
- APR (estimated): [calculated]%
- Total Staked: [from contract] PRGX
- Reward Rate: 6.4 PRGX/sec

**Staking Form:**
- Stake section: input + "Stake" button (auto-approve)
- Unstake section: input + "Unstake" button
- "Claim All Rewards" button (big, green)

**Info Box:**
- Rewards update every block
- No lock-up period
- Contract verified on PulseScan
- Emergency unstake always available

---

### 4. Tokenomics (`tokenomics.html`)

**Header:**
- "PRGX Tokenomics" — professional design

**Supply Distribution (pie chart or visual bars):**
- Liquidity Pool: 500M (50%) — locked 2 years
- Treasury: 250M (25%) — multisig, 2-year vest
- Team & Advisors: 150M (15%) — 4-year cliff
- Community Rewards: 50M (5%)
- Airdrops & Marketing: 30M (3%)
- Development Fund: 20M (2%)

**Vesting Schedule (timeline graphic):**
- Show release curves for each category
- Highlight circulating supply vs locked

**Value Accrual:**
- Buybacks & burn (50% of fees)
- Staking rewards demand
- Liquidity lock stability
- Governance rights (future)

**Buy PRGX Section (IMPORTANT):**
- "Acquire PRGX on PulseX" heading
- PulseX link button: https://pulsex.com
- Pair: PRGX/PLS
- Contract address: `0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0`
- "Add to wallet" instruction (trust: `+5%`)
- Note: Liquidity is locked, no rugpull risk

---

### 5. Contracts & Security (`contracts.html`)

**Verified Contracts List:**
| Contract | Address | Status | Link |
|----------|---------|--------|------|
| PRGX Token | `0x352b08...` | ✅ Verified | [PulseScan] |
| Sweeper | `0xc6735B...` | ✅ Verified | [PulseScan] |
| Staking | `0x7FaB14...` | ✅ Verified | [PulseScan] |
| Multisig Treasury | `0xa3C05e...` | ✅ 3/5 | [PulseScan] |

**Security Features:**
- ✅ All contracts verified on PulseScan
- ✅ Multisig treasury (3/5 signers)
- ✅ LP tokens locked for 2+ years (DXLock)
- ✅ No admin mint/burn after deployment
- ✅ Timelock considerations (future)
- ✅ Open source, MIT license

**Fee Structure:**
- Sweep fee: 1% (in input token)
- Fees go to multisig treasury (transparent)
- 100% of treasury controlled by DAO

**Audits:**
- Note: "Contracts audited internally by Pepe (Security Lead)"
- If external: list firm + report link

---

### 6. About & Roadmap (`about.html`)

**Our Vision:**
"No NFT is worthless again" — transform idle assets into value

**The Problem:**
- Users have dust tokens (<$1) scattered across wallets
- Dust is unusable, costly to move
- Wasted capital in dead tokens

**The Solution:**
PurgeX auto-sweeps dust → PRGX → stake → earn more PRGX
- One-click operation
- No minimum thresholds
- Rewards token with utility

**Team:**
- **Rena** — Head of Operations (Reniil)
- **Ben** — Coding & Security Lead
- **Emma** — Communications
- **Noah** — Strategy
- **Pepe** — Security & Intelligence

**Roadmap:**
- Q2 2026: Mainnet launch, staking, multisig ✅
- Q3 2026: Governance launch, buybacks begin
- Q4 2026: Additional DEX integrations, mobile app
- Q1 2027: Cross-chain expansion, DAO formation

**Contact:**
- GitHub: https://github.com/reniil/purgex
- Twitter/X: @purgex_xyz
- Discord: [invite]
- Email: hello@purgex.xyz

---

## 🔧 Technical Implementation

### Routing (simple hash-based):

```javascript
// js/router.js
const routes = {
  '/': 'index',
  '/sweep': 'sweep',
  '/staking': 'staking',
  '/tokenomics': 'tokenomics',
  '/contracts': 'contracts',
  '/about': 'about'
};

function navigate(route) {
  // Load HTML fragment or show/hide sections
  // Update URL hash
}
```

Better: Use separate HTML files and load via `<iframe>` or fetch + inject.

### State Management:

Keep global state in `localStorage` for:
- Connected wallet address
- Token list (cached)
- Theme preference (dark/light — though dark only)

### Ethers.js Integration:

Use ethers v6 UMD from CDN:
```html
<script src="https://unpkg.com/ethers@6.9.0/dist/ethers.umd.min.js"></script>
```

### Contract Interactions:

- Sweeper: `sweepTokens(address[] tokens, uint256[] minAmountsOut)`
- Staking: `stake(uint256)`, `withdraw(uint256)`, `claimReward()`
- PRGX: `approve(address, uint256)`, `balanceOf(address)`

---

## 🎯 User Flow

**First-time visitor:**
1. Lands on home page
2. Sees hero with "Connect Wallet" CTA
3. Clicks → connect (MetaMask prompt)
4. Auto-redirect to `/sweep` to show dust tokens
5. Selects tokens, clicks "Purge"
6. Sees success, earns PRGX
7. Sees staking panel, decides to stake

**Investor:**
1. Visits `/tokenomics`
2. Reviews supply, vesting, value accrual
3. Clicks "Buy PRGX" → goes to PulseX
4. May also visit `/contracts` to verify security

---

## ✨ Polish Details

- **Loading states:** Skeleton screens, spinners
- **Error handling:** User-friendly messages, retry buttons
- **Mobile UX:** Touch-friendly buttons, no horizontal scroll
- **Accessibility:** ARIA labels, keyboard nav, high contrast
- **Dark theme only** (PulseChain vibe)
- **Favicon** — create simple broom icon
- **Meta tags** — OG image, description, keywords

---

## 📦 Deliverables (for Windsurf)

Create the complete frontend with:

1. All HTML files (6 pages)
2. `css/styles.css` — complete styling, responsive, polished
3. `js/` directory with modular JS:
   - `config.js` (contract addresses, network constants)
   - `router.js` (hash-based navigation)
   - `sweeper.js` (dust sweep logic)
   - `staking.js` (staking logic)
   - `app.js` (shared utils, wallet connect, UI updates)
4. `assets/` with placeholder logos/icons (or SVG inline)
5. `README.md` with setup instructions (just open index.html, or serve locally)
6. `.gitignore` (node_modules, .env, etc.)

**Testing:**
- Verify wallet connection on PulseChain
- Test sweep flow (with test tokens)
- Test staking (stake small amount)
- Check all contract calls
- Responsive on mobile/tablet/desktop

---

## 🎨 Styling Priorities

1. **Hero** should feel energetic, with call-to-action
2. **Tokenomics charts** should be easy to read (use CSS bars, not heavy libraries)
3. **Staking dashboard** should be clean, data-focused
4. **Contracts table** should be scannable
5. **Mobile menu** should be hamburger with smooth slide-in

**No heavy frameworks** — pure CSS, minimal JS. Use CSS Grid/Flexbox.

---

## 🔗 External Integrations

- Ethers.js (CDN)
- PulseChain RPC: `https://rpc.pulsechain.com`
- PulseScan: `https://scan.pulsechain.com`
- PulseX: `https://pulsex.com`
- BlockScout API (optional for token prices): `https://api.scan.pulsechain.com/api`

---

## 🚀 Final Checks

Before declaring complete:

- [ ] All contract addresses correct (copy from MEMORY.md)
- [ ] Staking rewards rate matches deployment (6.4 PRGX/sec)
- [ ] Multisig address shown correctly: `0xa3C05e...`
- [ ] LP lock link included and correct
- [ ] "Buy PRGX" CTA clearly visible
- [ ] No console errors on wallet connect
- [ ] Responsive on mobile (test viewport)
- [ ] All links open in new tab

---

**Build this as a production-ready website that inspires confidence and drives both usage and token acquisition.** Make it look like a top-tier DeFi project.

Good luck! 🎉
