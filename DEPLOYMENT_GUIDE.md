# PRGX Ecosystem Deployment Guide

**Objective:** Deploy staking, set up multisig treasury, add liquidity

**Estimated Time:** 45-60 minutes

**Prerequisites:**
- PulseChain wallet with PRGX tokens (1B total)
- ~100 PLS for gas fees (deployments + transactions)
- Private key available for deployment wallet
- Hardhat configured (already done in this repo)

---

## 📦 **Phase 1: Deploy PRGX Staking Contract**

### **1.1 Compile Contract**

```bash
cd /home/ralph/.openclaw/workspace/purgex
npm run compile
```

Expected output: `artifacts/contracts/PRGXStaking.sol/PRGXStaking.json`

---

### **1.2 Prepare Environment Variables**

Create `.env` (or ensure these are set):

```bash
PRIVATE_KEY=0xYourPrivateKeyHere
PULSECHAIN_RPC=https://rpc.pulsechain.com
PRGX_ADDRESS=0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0
REWARD_TOKEN_ADDRESS=0x[USDC_or_DAI_address_on_PulseChain]
REWARD_RATE_PER_SECOND=1000000000000000  # 1 token per second (adjust for 18 decimals)
```

**Reward token options on PulseChain:**
- USDC (bridged): `0x9Ca7B2FEf14Abc5337A4b9D3cB233ebBd0cA730B`
- DAI (bridged): `0x9A48D5524D9351eFF2D2c1B732AD5D9FC495A6e5`
- Or use PRGX itself as reward: same as PRGX_ADDRESS

**Reward rate calculation:**
- Want to distribute X tokens per month?
- `REWARD_RATE_PER_SECOND = X / (30 days * 86400 seconds)`

Example: 100,000 USDC per month
- 100,000 / 2,592,000 ≈ 0.0386 USDC/second
- For 6 decimals: `38600000000` (38.6 × 10^9)
- For 18 decimals: `38600000000000000000`

---

### **1.3 Deploy**

```bash
npm run deploy:staking
```

This runs `scripts/deployStaking.js` and outputs:

```
Deploying PRGX Staking contract...
Wallet: 0xYourWallet
Network: Chain ID 369

✅ PRGXStaking deployed to: 0xStakingContractAddress
📁 Deployment info saved to deployments/staking.json
```

**Save the contract address** — you'll need it for frontend integration.

---

### **1.4 Verify Contract on PulseScan**

After deployment:
1. Go to `https://scan.pulsechain.com/address/0xStakingContractAddress`
2. Click **"Verify Contract"**
3. Select `PRGXStaking.sol` from artifacts
4. Paste constructor arguments: `0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0` (PRGX address)
5. Submit verification

✅ Verified contract = trust and transparency

---

### **1.5 Fund Staking Rewards**

The staking contract needs reward tokens to distribute.

**Transfer reward tokens to staking contract:**

```bash
# Example: transfer 100,000 USDC to staking contract
# Use wallet or script to call:
stakingContract.depositRewards(100000 * 10**6)  # 6 decimals
```

Or send directly from wallet using contract address.

**Check balance:**
```bash
node -e "
const {ethers} = require('ethers');
const provider = new ethers.JsonRpcProvider('https://rpc.pulsechain.com');
const rewardToken = new ethers.Contract('REWARD_TOKEN_ADDRESS', ['function balanceOf(address) view returns (uint256)'], provider);
rewardToken.balanceOf('STAKING_CONTRACT_ADDRESS').then(b => console.log('Balance:', ethers.formatUnits(b, 6)));
"
```

---

### **1.6 Test Staking**

1. **Approve PRGX** for staking contract:
   - In wallet, call `stakingContract.stake(amount)` — it will call `transferFrom`
   - Or manually approve first: `stakingToken.approve(stakingAddress, maxUint256)`

2. **Stake some PRGX:**
   ```bash
   # Using cast or web interface
   stakingContract.stake(1000 * 10**18)  # stake 1000 PRGX
   ```

3. **Wait and claim:**
   - Rewards accrue every second based on your share
   - Call `claimReward()` to withdraw rewards anytime

✅ Staking works!

---

## 🏦 **Phase 2: Deploy Multisig Treasury**

### **2.1 Gather Signer Wallets**

From team roster:
1. Ralph (Creator) — `blackralph_bot@botemail.ai` (wallet: 0x...)
2. Ben (Coding) — `ben-openclaw_bot@botemail.ai` (wallet: obtain)
3. Emma (Comms) — `emma-openclaw_bot@botemail.ai` (wallet: obtain)
4. Noah (Strategy) — `noah-openclaw_bot@botemail.ai` (wallet: obtain)
5. Pepe (Security) — `pepe-openclaw_bot@botemail.ai` (wallet: obtain)

**Action:** Collect actual PulseChain wallet addresses for each member.

---

### **2.2 Deploy Safe Multisig**

**Option A: Web (Recommended)**
1. Visit `https://app.safe.global`
2. Click **"Create new Safe"**
3. **Network:** PulseChain (add if not listed: Chain ID 369, RPC=https://rpc.pulsechain.com)
4. **Owners:** Add the 5 wallet addresses
5. **Threshold:** 3
6. **Deploy** (pay ~0.1 PLS gas)

**Option B: CLI**
```bash
npm install -g @safe-global/safe-core-sdk
# Follow Safe CLI deployment guide for custom networks
```

After deployment, **save the Safe address** (e.g., `0xSafe...`)

---

### **2.3 Transfer Treasury PRGX**

**Amount:** 250,000,000 PRGX (25% of supply)

**Steps:**
1. From your wallet (where PRGX is held), send 250M PRGX to Safe address
2. Transaction: `stakingToken.transfer(SafeAddress, 250e6 * 1e18)`
3. Wait for confirmation (~1 min)

**Verify:**
- Open Safe UI → Assets tab
- Confirm PRGX balance shows `250,000,000`

---

### **2.4 Configure Safe Settings**

- **Add custom token:** PRGX may not auto-appear; add manually with contract address
- **Set spending limits:** Optional daily limit (e.g., 100k USDC)
- **Time lock:** Recommend 24h delay for transactions >10% of treasury

---

### **2.5 Test Multisig**

Send 1 PRGX to yourself:
1. New transaction in Safe UI → Transfer
2. Sign with your wallet
3. Collect 2 more signatures (any 2 other signers)
4. Execute
5. Confirm received in your wallet

✅ Multisig functional

---

## 💧 **Phase 3: Add Liquidity**

### **3.1 Determine PLS Amount**

Target: 500M PRGX + matching PLS value

**Calculate PLS needed:**
```
Target PRGX price: $0.15 (initial)
Total PRGX value: 500M * $0.15 = $75,000,000

Pool should be 50/50:
PLs value = $75M as well

Current PLS price: check https://coinmarketcap.com/currencies/pulsechain
If PLS = $0.10 → need 750M PLS
If PLS = $0.05 → need 1.5B PLS
```

**Get current PLS price:**
```bash
curl -s https://api.coingecko.com/api/v3/simple/price?ids=pulsechain&vs_currencies=usd
```

**Example:** If PLS = $0.08 → need `75,000,000 / 0.08 = 937,500,000 PLS`

---

### **3.2 Prepare PLS**

Make sure your wallet has:
- **500M PRGX** (already have)
- **~900M–1B PLS** (acquire via bridge, exchange, or faucet)

---

### **3.3 Create Pool on PulseX**

1. Go to `https://app.pulsex.com`
2. Switch to **PulseChain Mainnet**
3. **Pool tab** → **"Add Liquidity"**
4. Select:
   - Token 1: PRGX (`0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0`)
   - Token 2: PLS
5. Enter amounts:
   - PRGX: `500000000`
   - PLS: *calculated amount from above*
6. Set slippage: 0.5% (increase if needed)
7. Click **"Add Liquidity"**
8. Confirm transaction (pay gas in PLS)
9. Wait for confirmation

✅ Liquidity added. You now have LP tokens.

---

### **3.4 Lock Liquidity Immediately**

**Do NOT skip this!** Unlocked liquidity looks like a rug pull.

**Steps:**
1. Go to `https://pulsex.fi/lock` (or `https://team.finance/lock`)
2. Connect wallet (with LP tokens)
3. Select **PRGX/PLS LP token** (auto-detected after adding)
4. **Lock duration:** 2 years (minimum for credibility)
5. Click **"Lock Liquidity"**
6. Confirm transaction

✅ LP tokens locked. You'll receive a lock receipt NFT.

**Verify lock:**
- In PulseX pool page, check "Locked" status
- Lock explorer shows your locked amount and unlock date

---

### **3.5 Verify Pool**

After liquidity:
1. In PulseX, go to **"Pool"** tab
2. Search `PRGX/PLS`
3. Confirm:
   - PRGX reserve: ~500M
   - PLS reserve: your amount
   - Your LP share: 100% (initially)
   - TVL displayed

✅ Pool active

---

## 🔗 **Phase 4: Integrate Everything**

### **4.1 Update Config Files**

In `purgex/.env` or frontend config:

```bash
PRGX_ADDRESS=0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0
STAKING_CONTRACT_ADDRESS=0x[from deployment]
MULTISIG_ADDRESS=0x[Safe address]
```

---

### **4.2 Connect Frontend to Staking**

Add staking UI to PurgeX frontend (optional):
- Dashboard showing staked PRGX
- Rewards claim button
- APR calculator

---

### **4.3 Configure Sweeper Fee Recipient**

Currently, sweep fees go to contract owner. Transfer control to **multisig**:

```javascript
// In sweeper contract (PurgeXSweeper.sol)
// Change feeRecipient to multisig address
// Only owner can call this
sweeperContract.transferFeeRecipient(multisigAddress);
```

---

## ✅ **Checklist & Timeline**

| Task | Time | Status |
|------|------|--------|
| Compile staking contract | 2 min | ☐ |
| Deploy staking | 5 min | ☐ |
| Verify on PulseScan | 5 min | ☐ |
| Fund staking rewards | 2 min | ☐ |
| Test staking | 5 min | ☐ |
| Create Safe multisig | 10 min | ☐ |
| Transfer 250M PRGX | 5 min | ☐ |
| Test multisig transaction | 5 min | ☐ |
| Calculate & acquire PLS | variable | ☐ |
| Add PRGX/PLS liquidity | 10 min | ☐ |
| Lock LP tokens | 5 min | ☐ |
| Verify pool | 2 min | ☐ |
| Update configs | 5 min | ☐ |
| **Total** | **~60 min** | |

---

## 🆘 **Support & Troubleshooting**

- **RPC timeouts:** Switch to alternative RPC (e.g., `https://rpc.pulsechain.com` or community nodes)
- **Insufficient gas:** Top up PLS in deployment wallet
- **Token not appearing:** Add custom token address manually in wallet/PulseX
- **Transaction stuck:** Increase gas price (use gas tracker)
- **Safe not loading PulseChain:** Add custom network in Safe settings (Chain ID 369)

---

**Let's execute!** Start with Phase 1 — do you have the environment ready? 🚀