# PURGEX SWEEPER DEPLOYMENT GUIDE
**Updated:** April 6, 2026  
**Contract:** PurgeXSweeper.sol (cleaned version)

---

## ✅ **CONTRACT VALIDATION**

Your cleaned contract is **deployment-ready**:

- ✅ No stack depth issues
- ✅ All constants properly defined
- ✅ Simplified functions
- ✅ Clean structure

**Key Features:**
- 5% sweep fee (500 bps)
- 50% fee burning (FEE_BURN_PERCENT)
- 30% to treasury (FEE_TREASURY_PERCENT)
- 20% to staking (implicit)
- 100 PRGX bonus per token (BONUS_PER_TOKEN)
- Bonus wallet support

---

## 🚀 **DEPLOYMENT STEPS (Remix)**

### **1. Prepare Remix**
- Go to https://remix.ethereum.org
- Create new file: `PurgeXSweeper.sol`
- Copy-paste the entire contract code

### **2. Compile**
- Compiler: **0.8.20** (or 0.8.19+)
- Enable optimizer: **200 runs**
- Click **Compile PurgeXSweeper.sol**

### **3. Deploy**
**Environment:** Injected Web3 (MetaMask/Rabby + PulseChain)

**Constructor Parameters:**
```solidity
_prgxToken: 0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0
_pulseXRouter: 0x165C3410fC91EF562C50559f7d2289fEbed552d9
_wpls: 0xA1077a294dDE1B09bB078844df40758a5D0f9a27
_feeRecipient: 0xa3C05e032DC179C7BC801C65F35563c8382CF01A (multisig)
```

**Gas:** ~5,000,000 (estimate)

### **4. Post-Deployment**
After deployment, **immediately** call:

```
setBonusWallet(0x59b6cDfA0282176939F0EDF5056a53Be113298b6)
```

**Transaction:**
- To: `YOUR_DEPLOYED_ADDRESS`
- Function: `setBonusWallet`
- Parameter: `0x59b6cDfA0282176939F0EDF5056a53Be113298b6`

---

## 📊 **VERIFICATION CHECKLIST**

After deployment, verify:

- [ ] `protocolFeeBps()` returns `500` (5%)
- [ ] `bonusWallet()` returns `0x59b6cDfA0282176939F0EDF5056a53Be113298b6`
- [ ] `prgxToken()` returns `0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0`
- [ ] `feeRecipient()` is correct
- [ ] Bonus wallet has **25M PRGX** balance (check via PRGX token contract)

---

## 🔧 **NEXT STEPS AFTER DEPLOYMENT**

### **1. Update .env**
```bash
SWEEPER_CONTRACT_ADDRESS=YOUR_NEW_ADDRESS
```

### **2. Update frontend/config.js**
```javascript
CONTRACTS.SWEEPER = 'YOUR_NEW_ADDRESS'
```

### **3. Test Sweep Flow**
- Connect wallet to PurgeX
- Sweep any token
- Verify:
  - Fees are correct (5%)
  - Bonus arrives (100 PRGX per token)
  - PRGX shows in wallet

### **4. Monitor**
- Watch fee burning on PulseScan
- Track bonus distributions
- Monitor staking rewards pool

---

## 🎯 **PHASE 3 LAUNCH**

Once Sweeper is deployed and verified:

1. ✅ All contracts deployed (Sweeper + Staking)
2. ✅ Bonus wallet funded (25M PRGX)
3. ✅ Liquidity locked (500M PRGX WPLS)
4. ✅ Staking rewards funded (50M PRGX)
5. ✅ Frontend updated
6. → **LAUNCH MARKETING**

**Marketing assets ready:**
- Blog post
- Twitter thread
- Discord announcement
- FAQ
- Press release

---

## 🚨 **IMPORTANT NOTES**

- **Do NOT use the old Sweeper** (`0xc6735B24D5A082E0A75637179A76ecE8a1aE1575`) - it has 1% fee, no bonus
- **New Sweeper address** will be different (new deployment)
- **Update all configs** to point to new address
- **Bonus wallet already funded** - just needs to be connected via `setBonusWallet()`

---

**Ready to deploy!** Let me know the new contract address and I'll help with the next steps. 🚀
