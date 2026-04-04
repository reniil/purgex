# Multisig Treasury Setup Guide

**Goal:** Create a 3-of-5 multisignature wallet for PurgeX team/treasury funds (250M PRGX + future fees).

---

## 🎯 **Why a Multisig?**

- **Security:** Requires 3 out of 5 signatures to spend funds
- **Decentralization:** No single point of failure
- **Transparency:** All transactions on-chain
- **Team trust:** Distributes control among 5 trusted members

---

## 🏦 **Recommended: PulseChain Safe (Gnosis Safe)**

The **Safe** (formerly Gnosis Safe) is the industry standard for multisig wallets.

**Features:**
- User-friendly web interface
- Mobile app support
- Custom spending limits
- Transaction queuing with time delays
- Support for custom tokens (PRGX, USDC, etc.)

---

## 📝 **Step-by-Step Setup**

### **1. Prepare the Team**

Identify **5 signers** (team members):
- Your own wallet (Ralph)
- Ben's wallet
- Emma's wallet
- Noah's wallet
- Pepe's wallet

Ensure each has a PulseChain-compatible wallet (MetaMask, Rabby, etc.) and enough PLS for gas.

---

### **2. Deploy Safe Multisig**

Go to: `https://app.safe.global` (or use PulseChain-specific Safe if available)

**Steps:**
1. Click **"Create new Safe"**
2. **Select network:** PulseChain Mainnet (Chain ID 369)
3. **Add owners:** Enter the 5 wallet addresses
4. **Set threshold:** 3 signatures required
5. **Review and deploy**

**Transaction details:**
- Deploy cost: ~0.1–0.2 PLS (gas)
- Takes 1–2 minutes to confirm

✅ After deployment, you'll get the **Safe address** (e.g., `0x...`)

---

### **3. Fund the Multisig**

Transfer the treasury assets to the Safe address:

**a) PRGX tokens:**
- Send **250M PRGX** (or less initially) to the Safe
- Use `transfer` or `transferFrom` if approved

**b) Other tokens:** (future fees)
- USDC, DAI, PLS can be sent anytime

**c) Verify balances:**
- Open Safe web interface
- Go to "Assets" tab
- Confirm PRGX balance shows

---

### **4. Configure Safe Settings**

**Set up spending policies:**
- **Daily limit:** Optional (e.g., 100k USDC per day without full 3/5)
- **Time lock:** Require 24-hour delay on large transactions (e.g., >10% of treasury)

**Add custom tokens:**
- PRGX may not auto-appear; add manually:
  - Click "Add token"
  - Paste PRGX contract: `0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0`

---

### **5. Test Transaction**

Send a small test transaction (e.g., 1 PRGX to yourself):

1. In Safe UI, click **"New transaction"**
2. Select **"Transfer"** or **"Custom transaction"**
3. Enter recipient: your wallet address
4. Enter amount: `1`
5. Confirm and sign
6. Other signers approve (need 2 more signatures)
7. Execute

✅ Verify received in your wallet.

---

### **6. Document Multisig Details**

Create a secure internal document (do NOT publish publicly):

```
Multisig Safe Address: 0x...
Network: PulseChain (369)
Threshold: 3/5
Signers:
1. Ralph (0x...) - Primary
2. Ben (0x...) - Technical
3. Emma (0x...) - Comms
4. Noah (0x...) - Strategy
5. Pepe (0x...) - Security

Recovery: If a signer loses keys, rotate via new Safe migration
Backups: All signers have wallet backups (seed phrases)
```

---

### **7. Update Tokenomics & Documentation**

- Mark treasury allocation as "transferred to multisig"
- Update PurgeX docs with Safe address
- Notify community (optional transparency)

---

## 🔐 **Security Best Practices**

- **Never share** private keys or seed phrases
- **Use hardware wallets** for signers when possible (Ledger, Trezor)
- **Keep Safe interface URL bookmarked** (avoid phishing)
- **Verify contract addresses** before signing any transaction
- **Regularly review** pending transactions in Safe UI
- **Set up alerts** (e.g., Discord webhook) for large transactions

---

## 🔄 **Ongoing Operations**

**To spend funds:**
1. Propose transaction in Safe UI
2. Sign with your wallet
3. Collect 2 additional signatures
4. Execute (any signer can execute after threshold met)

**To rotate signers:**
- Create new Safe with updated owners
- Transfer all assets to new Safe
- Update documentation

---

## 📊 **Treasury Management**

**Initial allocation:** 250M PRGX (25% of supply)  
**Future revenue:** 1% sweep fees in input tokens (USDC, DAI, etc.)

**Spend categories:**
- Marketing & promotions
- Liquidity incentives (PRGX rewards)
- Development bounties
- Team salaries (if applicable)

**Transparency:** Monthly treasury reports on status page.

---

## ⚙️ **Optional: Automate Fee Collection**

Set up a script to sweep received fee tokens (USDC, DAI) to the multisig:

```bash
# Cron job or bot that:
1. Checks sweeper contract fee balance
2. Calls sweep to transfer to Safe
3. Logs transaction
```

(We can build this later with the taker bot)

---

## ✅ **Checklist**

- [ ] Deploy Safe multisig on PulseChain
- [ ] Add 5 signers with threshold 3
- [ ] Transfer 250M PRGX to Safe
- [ ] Test small transaction
- [ ] Document Safe address and signer list
- [ ] Configure spending limits/time-locks
- [ ] Set up treasury monitoring (optional)

---

**After multisig is ready:** Move PRGX staking contract deployment to multisig control (owner = Safe). This ensures decentralized governance from day one. 🚀