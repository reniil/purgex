# PRGX Liquidity Provisioning Guide

**Goal:** Add 500M PRGX + ~$50K–100K worth of PLS to PulseX to create deep liquidity for PRGX swaps.

---

## 📊 **Why This Matters**

- Sweepers need PRGX to be easily swappable from their input tokens
- Deep liquidity = low slippage = better user experience
- Locked liquidity = price stability = confidence in PRGX
- 50% supply locked demonstrates long-term commitment

---

## 🛠️ **Prerequisites**

- PulseChain wallet with:
  - **500M PRGX** (half of total supply)
  - **~$50K–100K in PLS** (check current PLS price for exact amount)
- MetaMask or wallet connected to PulseChain (Chain ID 369)
- Sufficient PLS for gas fees (~$10–20 PLS recommended)

---

## 📝 **Step-by-Step Guide**

### **1. Open PulseX V2**

Go to: `https://app.pulsex.com` → Switch to **PulseChain Mainnet**

---

### **2. Navigate to "Pool" Tab**

Click **"Add Liquidity"**

---

### **3. Select Token Pair**

- **Token 1:** PRGX (`0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0`)
- **Token 2:** PLS (native Pulse token)

If PRGX doesn't appear, paste the contract address manually and click "Add".

---

### **4. Enter Amounts**

**PRGX amount:** `500,000,000` (500 million)

**PLS amount:** Calculate based on target ratio:
- Target: **1 PRGX ≈ $0.10–0.20** (initial price target)
- If 1 PRGX = $0.15 → 500M PRGX = $75M
- Need matching PLS value in the pool (50/50 split)
- **Approximately 1,500,000–2,500,000 PLS** (depending on PLS price)

Use PulseX's price oracle to see current PLS/USD value and adjust.

---

### **5. Check Slippage Settings**

- Set **slippage tolerance** to **0.5%** (default)
- If market volatile, increase to 1% temporarily

---

### **6. Approve PRGX**

- Click **"Enable PRGX"** or **"Approve"**
- Wallet prompt: Confirm PRGX spend approval
- Wait for transaction to confirm (~1–2 minutes)

---

### **7. Provide Liquidity**

After approval, button changes to **"Add Liquidity"**:

- Click **"Add Liquidity"**
- Confirm wallet transaction
- Pay gas fees in PLS
- Wait for confirmation

✅ **Success!** You'll receive **LP tokens** representing your share of the pool.

---

### **8. Lock Liquidity (Critical!)**

**Do NOT leave LP tokens unattended!** Immediately lock them:

Go to: `https://pulsex.fi/lock` or a trusted liquidity locker (e.g., Team Finance, Unicrypt)

**Steps:**
1. Connect wallet (holds LP tokens)
2. Select **PRGX/PLS LP token** (address will be generated after pool creation)
3. Enter **lock duration: 2 years** (minimum for credibility)
4. Click **"Lock Liquidity"**
5. Confirm transaction

After locking:
- You cannot withdraw LP tokens early
- You receive **lock receipt NFT** (proof of lock)
- Liquidity is guaranteed for 2 years

---

## 🔢 **Expected Results**

**Pool Details (after launch):**
- **PRGX reserve:** 500M
- **PLS reserve:** ~2M (example)
- **Total LP tokens:** √(500M × 2M) ≈ 31,622,776 LP tokens
- **Your share:** 100% initially (you're the only LP provider)

**Price Impact:** Since you're the first LP, your deposit sets the initial price. Use a reasonable PLS amount to avoid overpricing PRGX.

---

## 📈 **Post-Liquidity Steps**

1. **Verify pool on PulseX:**
   - Go to `https://app.pulsex.com/#/pool`
   - Search PRGX/PLS pair
   - Confirm reserves and your LP share

2. **Add PRGX logo and metadata:**
   - Submit PRGX token info to pulsetokens.org
   - Add logo, social links, description

3. **Update PurgeX frontend:**
   - Ensure sweeper uses correct PRGX address
   - Test sweep flow end-to-end

4. **Announce liquidity lock:**
   - Social media (Twitter, Discord)
   - Community channels
   - Transparency report

---

## ⚠️ **Important Warnings**

- **NEVER** leave LP tokens unlocked — risk of rug pull perception
- **Use reputable locker** (Team Finance, Unicrypt) — verify URL
- **Double-check contract addresses** before approving
- **Start with test amounts** if unsure (e.g., 1 PRGX + 0.001 PLS) to verify flow
- **Keep private keys secure** — never share or enter on untrusted sites

---

## 🧮 **Liquidity Calculator**

If PLS price = `$X`, and target PRGX price = `$0.15`:

```
PLS needed = 500,000,000 × 0.15 / (PLS price in USD)

Example:
PLS price = $0.10
PLS needed = 500M × 0.15 / 0.10 = 750,000,000 PLS

Example:
PLS price = $0.05
PLS needed = 500M × 0.15 / 0.05 = 1,500,000,000 PLS
```

Adjust based on current PLS market price.

---

## 🆘 **Troubleshooting**

| Issue | Solution |
|-------|----------|
| PRGX not found in PulseX | Click "Import Tokens" and paste contract address |
| Insufficient PLS for gas | Acquire more PLS (swap, bridge, faucet) |
| Transaction stuck | Increase gas price (PLS gas tracker) |
| LP tokens not appearing | Refresh wallet, add custom token for LP address |
| Can't find locker | Use `https://team.finance/lock` directly |

---

## 📞 **Support**

- **PulseX Docs:** https://docs.pulsex.fi
- **PulseChain RPC:** https://rpc.pulsechain.com
- **PulseScan:** https://scan.pulsechain.com

---

**After liquidity is live:** Update PurgeX frontend to reflect PRGX price and test sweep flows! 🚀