# PRGX TOKENOMICS PLAN
**Created:** April 6, 2026  
**Status:** Draft v1.0

---

## 📊 TOTAL SUPPLY BREAKDOWN

**Max Supply:** 1,000,000,000 PRGX (1 Billion)

| Allocation | Amount (PRGX) | Percentage | Purpose |
|------------|---------------|------------|---------|
| **Treasury** | 250,000,000 | 25% | Operations, grants, marketing, reserves |
| **Staking Rewards** | 50,000,000 | 5% | Long-term holder incentives |
| **Liquidity - WPLS Pool** | 500,000,000 | 50% | PulseChain native liquidity |
| **Liquidity - USDC Pool** | 50,000,000 | 5% | Stablecoin liquidity |
| **Liquidity - PRGX Pairs** | 50,000,000 | 5% | PRGX/WETH, PRGX/USDC, etc. |
| **Liquidity - WETH Pool** | 50,000,000 | 5% | Major ETH pair |
| **Liquidity - WBTC Pool** | 25,000,000 | 2.5% | Premium asset pair |
| **Dust Sweep Bonuses** | 25,000,000 | 2.5% | User rewards for cleaning wallets |
| **Team & Advisors** | 0 | 0% | (To be determined) |
| **Marketing & Partnerships** | 0 | 0% | (To be determined) |
| **Total** | **1,000,000,000** | **100%** | |

---

## 🎮 DUST SWEEP REWARDS SYSTEM

### **Bonus Structure**

To gamify wallet cleaning and drive engagement:

- **Every token swept = 100 PRGX bonus** (regardless of balance)
- **Additional PRGX from token value**: `(Token Balance × Token Price) ÷ PRGX Price`
- **Minimum reward**: 100 PRGX (even if token value = $0)
- **Maximum reward**: No cap ( whales get proportional rewards)

### **Examples**

| Token | Balance | Token Price | Value USD | Base PRGX | +100 Bonus | **Total PRGX** |
|-------|---------|-------------|-----------|-----------|------------|----------------|
| WBTC | 0.1 | $65,000 | $6,500 | 6,500,000 | +100 | **6,500,100** |
| PRGX | 1,000 | $0.001 | $1.00 | 1,000 | +100 | **1,100** |
| PLS | 3,573 | $0.0001 | $0.36 | 360 | +100 | **460** |
| Shitcoin | 50,000 | $0 | $0 | 0 | +100 | **100** |

### **Why 100 PRGX?**

**Analysis at current PRGX price ($0.00008757):**
- 100 PRGX = **$0.008757** (less than 1¢)
- **Cost per user per token**: < 1¢
- **If 10,000 users sweep 100 tokens each**: 1M tokens × 100 = 100M PRGX = $8,757
- **Budget from Dust Sweep Allocation**: 25M PRGX available
- **Can support**: 250,000 token sweeps total before depletion

**Feasibility:** ✅ **Sustainable** - 100 PRGX is low-cost enough to drive massive engagement without draining treasury.

---

## 💰 TREASURY ALLOCATION (250M PRGX)

### **Treasury Breakdown**

| Category | Amount (PRGX) | Purpose |
|----------|---------------|---------|
| **Operating Reserve** | 100M (40%) | Team salaries, infrastructure, legal |
| **Marketing & Growth** | 50M (20%) | Ads, influencers, partnerships |
| **Liquidity Mining** | 50M (20%) | Rewards for LPs, yield farmers |
| **Ecosystem Grants** | 30M (12%) | Developer grants, hackathons, bug bounties |
| **Emergency Reserve** | 20M (8%) | Unexpected costs, market making, stabilization |
| **Total** | **250M** | |

### **Treasury Management**

- **Multi-sig wallet** (3/5 signatures required)
- **Quarterly unlocks** (vesting over 2 years)
- **Transparent reporting** (public dashboards)
- **Community governance** (vote on major spends)

---

## 🏊‍♂️ LIQUIDITY PROVISION (675M PRGX total)

### **Rationale**
Deep liquidity = low slippage = better user experience = more volume = more fees.

### **Pool Allocations**

| Pool | PRGX Allocation | Equivalent USD (at $0.001) | Strategy |
|------|-----------------|----------------------------|----------|
| **PRGX/WPLS** | 500M | $500,000 | Native chain, primary pool |
| **PRGX/USDC** | 50M | $50,000 | Stable pair, easy on-ramp |
| **PRGX/WETH** | 50M | $50,000 | Major ETH ecosystem |
| **PRGX/WBTC** | 25M | $25,000 | Premium asset exposure |
| **PRGX/PRGX** | 0 | N/A | Self-liquidity (not needed) |
| **Total** | **675M** | **$625,000** | |

### **Liquidity Deployment Strategy**

1. **Initial DEX offering** (PulseX V2):
   - Deploy 500M PRGX + matching WPLS
   - Set initial price: $0.001/PRGX
   - Lock liquidity for 2 years minimum

2. **Gradual pool expansion**:
   - Add USDC pool after 30 days
   - Add WETH/WBTC pools after 90 days
   - All liquidity locked with **Team Finance** or **Unicrypt**

3. **Liquidity mining rewards**:
   - Use 50M PRGX from treasury to incentivize LPs
   - 2-year vesting: ~68,500 PRGX/day
   - Higher rewards for longer lock periods

---

## 🎯 STAKING REWARDS (50M PRGX)

### **PurgeX Staking Vault**

Hold PRGX earned from sweeping + buy more to:
- Earn **passive income** from protocol fees
- Access **exclusive features** (higher multipliers)
- Receive **governance tokens** (future)

### **Staking Tiers**

| Tier | Minimum Stake | APR (Base) | APR + Boost | Benefits |
|------|---------------|------------|-------------|----------|
| **Bronze** | 1,000 PRGX | 10% | Up to 15% | Basic rewards |
| **Silver** | 10,000 PRGX | 12% | Up to 20% | +5% sweep bonus |
| **Gold** | 100,000 PRGX | 15% | Up to 25% | +10% sweep bonus, early access |
| **Diamond** | 1,000,000 PRGX | 20% | Up to 35% | +20% sweep bonus, governance |

### **Reward Distribution**

- **Daily emissions**: 50,000,000 PRGX ÷ 730 days = **~68,500 PRGX/day**
- **Compounding**: Automatic (no claim needed)
- **Lock-up**: 30-day minimum (prevents farming)
- **Penalty for early unstake**: 10% of rewards

---

## 📈 ECONOMIC MODEL

### **Value Accrual Mechanisms**

1. **Buy pressure**:
   - Users must acquire PRGX to pay fees (future feature)
   - Treasury buys back & burns with profits
   - Staking locks supply

2. **Sink mechanisms** (remove PRGX from circulation):
   - **Protocol fees burned** (50% of fees)
   - **Staking lock-ups** (50M PRGX locked)
   - **Treasury vesting** (250M released slowly)
   - **Liquidity locks** (675M locked long-term)

3. **Source mechanisms** (new PRGX enters circulation):
   - **Staking rewards** (50M over 2 years)
   - **Dust sweep bonuses** (25M one-time)
   - **Liquidity mining** (50M over 2 years)
   - **Team unlock** (if allocated)

### **Circulating Supply Timeline**

| Month | New PRGX Released | Total Released | % of Max |
|-------|-------------------|----------------|----------|
| **Month 1** | 25M (sweep bonuses) | 25M | 2.5% |
| **Month 6** | +25M (staking + LM) | 50M | 5% |
| **Month 12** | +50M (continued) | 100M | 10% |
| **Month 24** | +75M (remaining) | 175M | 17.5% |
| **Month 36+** | +0 (full vesting done) | 175M+ | 17.5%+ |

**Note:** Full 1B supply exists contractually, but only ~175M will be liquid in first 3 years due to locks.

---

## 🔄 FEE STRUCTURE

### **Current: Sweep Fee**
- **Fee**: 5% of swept token value (taken in original token)
- **Revenue split**:
  - 50% → **Burned** (deflationary)
  - 30% → **Treasury** (operations)
  - 20% → **Staking rewards** (yield)

### **Future Fee Opportunities**

1. **Custom destination fees** (choose non-default recipient)
2. **Priority sweep** (higher fee for instant execution)
3. **Batch discount** (sweep 50+ tokens = 3% fee)
4. **Premium features** (analytics, auto-sweep, API access)

---

## 🚀 GAMIFICATION & ENGAGEMENT

### **Dust Sweep Leaderboard**
- Track total PRGX earned per user
- Weekly/Monthly rankings
- Top 10 get **exclusive NFT badges** + bonus multipliers

### **Achievement System**
- **First Sweep**: 500 PRGX bonus
- **Sweep 10 different tokens**: 1,000 PRGX
- **Sweep 100 tokens**: 5,000 PRGX + "Dust King" badge
- **Sweep 1,000,000 PRGX value**: "Whale Hunter" title

### **Referral Program**
- Referrer: 5% of referee's sweep earnings (in PRGX)
- Referee: +50 PRGX on first sweep
- Viral loop incentives

---

## 🎯 SUSTAINABILITY CHECKLIST

### **✅ Revenue Generators**
- Sweep fees (5%)
- Future protocol fees
- Premium feature subscriptions
- API access fees
- Consultancy services (for businesses)

### **✅ Deflationary Mechanics**
- 50% of fees burned
- Staking locks
- Treasury vesting
- Liquidity locks

### **✅ Value Accrual**
- Demand from sweep rewards
- Utility via staking
- Governance rights (future)
- Exclusive access

---

## 📋 IMMEDIATE ACTION ITEMS

1. **✅ Deploy updated Sweeper** with 100 PRGX bonus
2. **🔬 Research PRGX price** (agents to gather data)
3. **💰 Calculate safe bonus amount** based on treasury sustainability
4. **📝 Write smart contract update** (bonus minting)
5. **🔒 Set up multi-sig treasury**
6. **📊 Build public dashboard** (supply, burns, fees)
7. **🚀 Launch liquidity mining program**
8. **📢 Announce tokenomics** to community

---

## 🤖 AGENT RESEARCH TASKS

### **Agent: Price Analyst**
- Track PRGX price history (min, max, avg)
- Monitor liquidity depth (WPLS, USDC pools)
- Analyze trading volume patterns
- Competitor token benchmark (dust sweep protocols)

### **Agent: Treasury Manager**
- Model different bonus amounts (50, 100, 200 PRGX)
- Simulate 1-year cashflow with 10K/100K users
- Optimize fee burn vs. reward ratio
- Suggest treasury allocation adjustments

### **Agent: Community Growth**
- Estimate viral coefficient from referral program
- Project user acquisition cost (UAC) vs. LTV
- Design gamification mechanics
- Create content calendar for announcements

---

## ⚖️ GOVERNANCE FUTURE

After 6 months, transition to **community governance**:

- **PRGX holders vote** on:
  - Fee percentage changes
  - Treasury spending proposals
  - New feature additions
  - Bonus amount adjustments
  - Liquidity mining parameters

- **Governance token**: PRGX (1 token = 1 vote)
- **Quorum**: 10% of circulating supply
- **Voting period**: 7 days

---

## 🎯 SUCCESS METRICS

| Metric | Target (Month 6) | Target (Year 1) |
|--------|------------------|-----------------|
| **Sweeps completed** | 10,000 | 100,000 |
| **Total dust cleaned** | 1B tokens | 10B tokens |
| **PRGX distributed** | 10M | 100M |
| **Liquidity depth** | $100K | $1M |
| **Unique users** | 5,000 | 50,000 |
| **Treasury revenue** | $5K | $100K |

---

## 🚨 RISKS & MITIGATIONS

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **PRGX price collapse** | Medium | High | Treasury reserves, gradual unlocks |
| **Smart contract bug** | Low | Critical | Audits, bug bounty, insurance |
| **Regulatory scrutiny** | Medium | High | Legal review, KYC optional, compliant jurisdiction |
| **Competitor copycat** | High | Medium | First-mover advantage, brand loyalty, network effects |
| **Liquidity drying up** | Low | High | Treasury buybacks, router optimizations, liquidity mining |

---

## 📞 NEXT STEPS

1. **Review & approve tokenomics plan** (Creator)
2. **Deploy research agents** (next 24 hours)
3. **Calculate optimal bonus amount** (awaiting agent data)
4. **Update smart contract** (add bonus minting)
5. **Fund treasury wallet** (250M PRGX)
6. **Deploy liquidity** (starting with PRGX/WPLS pool)
7. **Launch staking** (50M PRGX rewards)
8. **Go live with sweep bonuses**

---

**Questions to resolve:**
- Should 100 PRGX bonus be flat or tiered based on token count?
- Should team allocation be added? (Typically 10-20%)
- Should we enable fee burning immediately or later?
- Should the bonus be minted from treasury or new emission?

*Ready for Creator review and agent deployment orders.* 🚀
