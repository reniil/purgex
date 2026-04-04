# PurgeX — Quick Start Guide

Get up and running in 10 minutes.

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your private key (without `0x` prefix):

```env
RPC_URL=https://rpc.pulsechain.com
PRIVATE_KEY=YourPrivateKeyHere...
```

## 3. Deploy Contracts

```bash
npm run deploy
```

Wait for transaction confirmation (30-60 seconds). The script will output:

```
✅ PurgeXToken deployed at: 0x...
✅ PurgeXSweeper deployed at: 0x...
```

It will also automatically update `.env` with these addresses.

## 4. Verify Deployment (Optional)

```bash
npm run verify
```

This checks that contracts are properly deployed and shows you the addresses to use in the frontend.

## 5. Run Taker Bot (Optional)

The bot automatically sweeps tokens for users who have approved.

```bash
npm run bot
```

It will continuously scan and execute sweeps. Press `Ctrl+C` to stop.

## 6. Open Frontend

```bash
# Option A: direct open
open frontend/index.html

# Option B: serve (better for development)
npx serve frontend
```

### Frontend Setup

If you used the direct `open` method, edit `frontend/app.js`:

```javascript
const CONFIG = {
  SWEEPER_ADDRESS: '0x...', // from .env
  PRGX_ADDRESS: '0x...',    // from .env
  ...
};
```

Or if you serve via `npx serve`, you can inject these via URL params:

```
http://localhost:3000?sweeper=0x...&prgx=0x...
```

(Modify `app.js` to read URL params if needed.)

## 7. Connect and Sweep

1. Click "Connect Wallet"
2. Select tokens to sweep
3. Click "Approve" for each token (one transaction each)
4. Click "PURGE SELECTED TOKENS"
5. Wait for bot to execute (or run `npm run bot` yourself)

## Troubleshooting

**Transaction fails:**
- Ensure you have PLS for gas
- Check token has sufficient balance
- Some tokens may not have a liquidity path to PRGX on PulseX

**Tokens not appearing:**
- The frontend only checks known tokens (see `COMMON_TOKENS` in `app.js`)
- Add more token addresses to that list if needed

**Bot not sweeping:**
- Check the bot logs for errors
- Ensure sweeper is approved (check allowance on block explorer)
- Gas price may be too high relative to sweep value

**Network wrong:**
- Switch MetaMask to PulseChain (Chain ID 369)

## Need Help?

- Check README.md for detailed documentation
- Review contract code in `contracts/`
- PulseChain docs: https://docs.pulsechain.com

---

**Happy sweeping!** 🧹
