# PRGX Tokenomics

**Token:** PRGX (PurgeX)  
**Network:** PulseChain (Chain ID: 369)  
**Contract:** `0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0`  
**Total Supply:** 1,000,000,000 PRGX (fixed, no mint)  
**Decimals:** 18  

---

## 🎯 **Token Purpose**

PRGX is the **utility and reward token** of the PurgeX ecosystem:

- Users receive PRGX when they sweep dust tokens
- PRGX can be traded on PulseX
- PRGX holders can participate in governance (future)
- PRGX serves as a **deflationary asset** with buyback mechanisms

---

## 📊 **Supply Distribution (1B Total)**

| Category | Amount | % | Vesting / Release |
|----------|--------|---|-------------------|
| **Liquidity Pool** | 500,000,000 | 50% | ✅ Fully allocated at deploy |
| **Treasury / Operations** | 250,000,000 | 25% | 2-year linear vest (12.5M/mo) |
| **Team & Advisors** | 150,000,000 | 15% | 4-year cliff, then 3.75M/mo |
| **Community Rewards** | 50,000,000 | 5% | Released via sweep incentives |
| **Airdrops & Marketing** | 30,000,000 | 3% | 6-month linear vest |
| **Development Fund** | 20,000,000 | 2% | Discretionary, 1-year cliff |

**Total:** 1,000,000,000 PRGX

---

## 💧 **Liquidity Layer (50% — 500M PRGX)**

**Purpose:** Ensure deep liquidity for PRGX swaps so sweepers can receive meaningful amounts.

**Implementation:**
- Deploy 500M PRGX to PulseX V2 PRGX/PLS pool
- Pair with ~$50,000–100,000 worth of PLS (initial)
- Lock liquidity for 2 years using PulseX lockers or third-party

**Why 50%?**
- Gives traders confidence in price stability
- Enables large sweeps without slippage
- Demonstrates commitment to ecosystem

---

## 🏦 **Treasury (25% — 250M PRGX)**

**Purpose:** Fund ongoing operations, partnerships, marketing, and ecosystem growth.

**Release Schedule:**
- 12.5M PRGX released monthly (linear over 2 years)
- Can be sold for operational expenses (with transparency)
- Can be used to provide additional liquidity (reinvested)

**Controls:**
- Multisig wallet (3/5 signers)
- Public treasury dashboard
- Monthly spend reports

---

## 👥 **Team & Advisors (15% — 150M PRGX)**

**Purpose:** Incentivize long-term commitment to PurgeX success.

**Vesting:**
- 4-year cliff (no release for first 4 years)
- After 4 years, linear monthly release over remaining term
- Ensures team aligned with long-term success

**Rationale:**
- 15% is industry standard for DeFi protocols
- 4-year vest prevents early dump
- Team already deployed contracts, built frontend, integrated explorer

---

## 🎁 **Community Rewards (5% — 50M PRGX)**

**Purpose:** Incentivize sweep activity and user engagement.

**Distribution Mechanisms:**
1. **Sweep Boosts** — Extra PRGX for sweeping high-value tokens
2. **Liquidity Mining** — Staking PRGX-SLP to earn more PRGX
3. **Referral Program** — Invite friends, earn PRGX
4. **Badges & Achievements** — Milestone rewards

**Release:** Gradual, based on sweep volume and ecosystem participation.

---

## 📢 **Airdrops & Marketing (3% — 30M PRGX)**

**Purpose:** Attract new users, partner promotions, social media campaigns.

**Targets:**
- Early PurgeX users
- PulseChain community members
- DeFi dust sweepers from other chains
- Influencer partnerships

**Vesting:** Linear over 6 months to prevent market dump.

---

## 🔧 **Development Fund (2% — 20M PRGX)**

**Purpose:** Pay for future contracts audits, bug bounties, new features.

**Management:** Sole discretion of core team, public ledger of spends.

---

## 💰 **Fee Structure & Value Accrual**

### **Sweeper Protocol Fee: 1%**
- Collected in the **input token** being swept (USDC, DAI, etc.)
- Sent to `feeRecipient` (currently sweeper owner)
- Not collected in PRGX

### **PRGX Value Accrual Mechanisms**

| Mechanism | How It Works | Impact |
|-----------|--------------|--------|
| **Buybacks** | Use 50% of protocol fees to buy PRGX from market → burn | Deflationary pressure |
| **Staking Rewards** | PRGX stakers earn % of sweep fees (in PRGX) | Demand for PRGX |
| **Liquidity Lock** | 500M PRGX locked → fixed supply in circulation | Price stability |
| **Burning** | Burn PRGX periodically (buybacks + fee conversion) | Decreasing supply |

**Proposed Fee Split (future):**
- 50% → Buybacks & burn
- 30% → Staking rewards (PRGX stakers)
- 20% → Treasury (operations)

---

## 🔄 **Circulating Supply Dynamics**

**Initial:** 500M PRGX in liquidity pool (considered circulating)  
**Effective circulating supply at launch:** ~50% (500M / 1B)

**Over time:**
- Team/Advisor vesting: +150M over 4 years (slow trickle)
- Treasury release: +250M over 2 years (controlled)
- Community rewards: +50M (distributed gradually)
- Burn mechanism: reduces supply

**Max potential circulating:** 800M (if all non-liquidity distributed and no burns)

---

## 🎚️ **Governance (Future)**

PRGX will eventually govern:

- Fee percentage adjustments
- New token support in sweeper
- Additional DEX integrations
- Treasury spending
- Distribution of community rewards

**Voting power:** 1 PRGX = 1 vote  
**Quorum:** 10% of circulating supply  
**Voting period:** 7 days

---

## 📈 **Value Proposition Summary**

**For Sweepers (Users):**
- Turn dust into valuable PRGX
- Low fees (1%)
- Fast, automated sweeps

**For PRGX Holders:**
- Deflationary tokenomics (buybacks)
- Staking rewards (future)
- Governance rights (future)
- Exposure to PulseChain DeFi growth

**For Protocol:**
- Sustainable revenue from fees
- Liquidity incentives
- Community-driven growth

---

## 🚀 **Immediate Next Steps**

1. **Lock 500M PRGX** in PulseX liquidity (2+ year lock)
2. **Transfer control** of sweeper feeRecipient to DAO treasury (multisig)
3. **Launch staking contract** for PRGX (earn fee share)
4. **Implement buyback mechanism** (weekly, 50% of fees)
5. **Set up multisig** for team/treasury holdings
6. **Create transparency dashboard** (supply, burns, fees)

---

**This tokenomics model ensures:**
✅ Sustainable economic model  
✅ Aligned incentives (users, team, holders)  
✅ Deflationary pressure on PRGX  
✅ Clear distribution and vesting schedules  
✅ Governance path to decentralization

Need adjustments? Let's refine! 🎯