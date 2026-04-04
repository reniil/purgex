# PulseChain Token Explorer

A token and liquidity pair discovery service for PulseChain. Scans DEX factories, caches token metadata, and provides a REST API for integrated applications like PurgeX.

## Features

- **Factory Scanning**: Enumerates all LP pairs from PulseX V1/V2 (and other DEXes)
- **Token Registry**: Fetches and caches token metadata from pulsetokens.org
- **Wallet Discovery**: Uses BlockScout API to find tokens held by any address
- **Custom Additions**: Users can manually add tokens or LP pairs
- **Caching Layer**: SQLite database for fast lookups (no repeated RPC calls)
- **REST API**: Simple endpoints for PurgeX frontend integration

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env
# Edit .env with your RPC URL if needed (defaults to PulseChain public RPC)

# Initialize database
npm run db:init

# Run initial scan (may take 5-10 minutes as it enumerates all pairs)
npm run scan

# Start the API server
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

### Tokens
- `GET /api/tokens` — List all known tokens (supports ?verified=true filter)
- `GET /api/tokens/:address` — Get token details
- `POST /api/tokens` — Add custom token (body: `{ address, source?: 'custom' }`)

### Liquidity Pairs
- `GET /api/pairs` — List all LP pairs (supports ?dex=pulsex-v1 filter)
- `GET /api/pairs/:address` — Get pair details with reserves
- `POST /api/pairs` — Add custom pair (body: `{ address, token0, token1, dex, source?: 'custom' }`)

### Wallet Discovery
- `GET /api/wallet/:address/tokens` — Get all tokens held by wallet (cached + real-time BlockScout)

### Scanner Control
- `POST /api/scan/trigger` — Manually trigger a full rescan
- `GET /api/scan/status` — Get last scan timestamp and stats

### Health
- `GET /api/health` — Service health check

## PurgeX Integration

Update PurgeX frontend to use this API instead of direct BlockScout calls:

```javascript
// Old: direct BlockScout
const tokens = await fetch(`https://api.scan.pulsechain.com/api?module=account&action=tokenlist&address=${userAddress}`);

// New: local cache + fallback
const tokens = await fetch(`http://localhost:3000/api/wallet/${userAddress}/tokens`);
```

Benefits:
- Faster (cached DB vs RPC every time)
- Richer metadata (logos, verified status)
- Custom token persistence across sessions
- Unified source (tokens + pairs in one place)

## Database Schema

### tokens
- `address` (TEXT PRIMARY KEY)
- `symbol` (TEXT)
- `name` (TEXT)
- `decimals` (INTEGER)
- `logoURI` (TEXT)
- `source` (TEXT) — 'pulsetokens', 'factory', 'custom', etc.
- `verified` (BOOLEAN) — if in pulsetokens.org list
- `createdAt` (TIMESTAMP)
- `updatedAt` (TIMESTAMP)

### pairs
- `address` (TEXT PRIMARY KEY)
- `token0` (TEXT)
- `token1` (TEXT)
- `dex` (TEXT) — 'pulsex-v1', 'pulsex-v2', 'custom'
- `reserve0` (TEXT)
- `reserve1` (TEXT)
- `tvl` (REAL) — calculated USD value if price known
- `source` (TEXT)
- `createdAt` (TIMESTAMP)
- `updatedAt` (TIMESTAMP)

### scan_log
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `startedAt` (TIMESTAMP)
- `completedAt` (TIMESTAMP)
- `pairsFound` (INTEGER)
- `tokensFound` (INTEGER)
- `error` (TEXT)

## Tech Stack

- Node.js 18+
- Express.js
- better-sqlite3 (SQLite)
- ethers.js (v6)
- node-cron (optional scheduled scans)

## Configuration

Environment variables:
- `PORT` (default: 3000)
- `RPC_URL` (default: https://rpc.pulsechain.com)
- `PULSECHAIN_CHAIN_ID` (default: 369)
- `BLOCKSCOUT_API` (default: https://api.scan.pulsechain.com/api)
- `PULSETOKENS_URL` (default: https://tokens.pulsechain.com/output/tokens.pulsechain.com.json)

## License

MIT