import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { ethers } from 'ethers';
import { tokenDAO, pairDAO, scanLogDAO } from './db/index.js';
import { runFullScan } from './scanner.js';

// Load environment variables
import { config } from 'dotenv';
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== TOKENS ====================
app.get('/api/tokens', (req, res) => {
  try {
    const { verified } = req.query;
    const verifiedOnly = verified === 'true' ? true : verified === 'false' ? false : null;
    const tokens = tokenDAO.getAll(verifiedOnly);
    res.json({ count: tokens.length, tokens });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tokens/:address', (req, res) => {
  try {
    const token = tokenDAO.get(req.params.address);
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    res.json(token);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tokens', async (req, res) => {
  try {
    const { address, symbol, name, decimals, logoURI, source = 'custom' } = req.body;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    // Fetch on-chain metadata if not provided
    let tokenSymbol = symbol;
    let tokenName = name;
    let tokenDecimals = decimals;

    if (!symbol || !name || !decimals) {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
        const tokenContract = new ethers.Contract(address, [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)'
        ], provider);

        const [sym, nm, dec] = await Promise.all([
          tokenContract.symbol().catch(() => null),
          tokenContract.name().catch(() => null),
          tokenContract.decimals().catch(() => 18)
        ]);

        tokenSymbol = symbol || sym || '???';
        tokenName = name || nm || 'Unknown Token';
        tokenDecimals = decimals ?? dec ?? 18;
      } catch (e) {
        // Use defaults if RPC fails
        tokenSymbol = symbol || '???';
        tokenName = name || 'Unknown Token';
        tokenDecimals = decimals ?? 18;
      }
    }

    tokenDAO.upsert({
      address,
      symbol: tokenSymbol,
      name: tokenName,
      decimals: Number(tokenDecimals),
      logoURI,
      source,
      verified: false
    });

    res.json({ success: true, token: tokenDAO.get(address) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PAIRS ====================
app.get('/api/pairs', (req, res) => {
  try {
    const { dex } = req.query;
    const pairs = pairDAO.getAll(dex || null);
    res.json({ count: pairs.length, pairs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pairs/:address', (req, res) => {
  try {
    const pair = pairDAO.get(req.params.address);
    if (!pair) {
      return res.status(404).json({ error: 'Pair not found' });
    }
    res.json(pair);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pairs', async (req, res) => {
  try {
    const { address, token0, token1, dex, source = 'custom', reserve0, reserve1 } = req.body;

    if (!address || !token0 || !token1 || !dex) {
      return res.status(400).json({ error: 'Missing required fields: address, token0, token1, dex' });
    }

    if (!ethers.isAddress(address) || !ethers.isAddress(token0) || !ethers.isAddress(token1)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    // Optionally fetch live reserves if not provided
    let reserves = { reserve0, reserve1, reserveUpdatedAt: null };
    if (!reserve0 || !reserve1) {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
        const pairContract = new ethers.Contract(address, [
          'function getReserves() view returns (uint112, uint112, uint32)'
        ], provider);

        const [r0, r1, timestamp] = await pairContract.getReserves();
        reserves = {
          reserve0: r0.toString(),
          reserve1: r1.toString(),
          reserveUpdatedAt: Number(timestamp)
        };
      } catch (e) {
        // Use defaults
        reserves = { reserve0: '0', reserve1: '0', reserveUpdatedAt: null };
      }
    }

    // Ensure tokens exist in DB
    if (!tokenDAO.get(token0)) {
      tokenDAO.upsert({
        address: token0,
        symbol: token0.slice(0, 6),
        name: 'Unknown Token',
        decimals: 18,
        source: 'custom',
        verified: false
      });
    }

    if (!tokenDAO.get(token1)) {
      tokenDAO.upsert({
        address: token1,
        symbol: token1.slice(0, 6),
        name: 'Unknown Token',
        decimals: 18,
        source: 'custom',
        verified: false
      });
    }

    pairDAO.upsert({
      address,
      token0,
      token1,
      dex,
      reserve0: reserves.reserve0,
      reserve1: reserves.reserve1,
      reserveUpdatedAt: reserves.reserveUpdatedAt,
      tvl: 0, // Could calculate if we have price data
      source
    });

    res.json({ success: true, pair: pairDAO.get(address) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== WALLET DISCOVERY ====================
app.get('/api/wallet/:address/tokens', async (req, res) => {
  try {
    const walletAddress = req.params.address.toLowerCase();

    // 1. Get cached tokens that this wallet has interacted with (via pairs)
    // For now, we'll return all cached tokens + query BlockScout for this wallet
    // In a full implementation, we'd track wallet-token relationships

    // 2. Query BlockScout for current holdings
    const blockscoutUrl = `${process.env.BLOCKSCOUT_API}?module=account&action=tokenlist&address=${walletAddress}`;
    const response = await fetch(blockscoutUrl);
    const data = await response.json();

    let tokens = [];

    if (data.status === '1' && data.result) {
      for (const tok of data.result) {
        // Look up token metadata from our DB
        const dbToken = tokenDAO.get(tok.contractAddress);
        if (dbToken) {
          tokens.push({
            ...dbToken,
            balance: parseFloat(tok.balance) / Math.pow(10, parseInt(tok.decimals)),
            rawBalance: tok.balance
          });
        } else {
          // Token not in DB yet — add it on the fly
          tokenDAO.upsert({
            address: tok.contractAddress,
            symbol: tok.symbol,
            name: tok.name,
            decimals: parseInt(tok.decimals),
            source: 'blockscout',
            verified: false
          });

          const freshToken = tokenDAO.get(tok.contractAddress);
          tokens.push({
            ...freshToken,
            balance: parseFloat(tok.balance) / Math.pow(10, parseInt(tok.decimals)),
            rawBalance: tok.balance
          });
        }
      }
    }

    // Filter out zero balances
    tokens = tokens.filter(t => t.balance > 0);

    res.json({
      address: walletAddress,
      count: tokens.length,
      tokens
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SCANNER CONTROL ====================
app.post('/api/scan/trigger', async (req, res) => {
  try {
    res.json({ message: 'Scan started' });
    // Run scan in background to not block response
    runFullScan().catch(console.error);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/scan/status', (req, res) => {
  try {
    const lastScan = scanLogDAO.getLast();
    res.json(lastScan || { message: 'No scans yet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`PulseChain Explorer API listening on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/tokens');
  console.log('  GET  /api/tokens/:address');
  console.log('  POST /api/tokens');
  console.log('  GET  /api/pairs');
  console.log('  GET  /api/pairs/:address');
  console.log('  POST /api/pairs');
  console.log('  GET  /api/wallet/:address/tokens');
  console.log('  POST /api/scan/trigger');
  console.log('  GET  /api/scan/status');

  // Optional: Auto-scan on startup (commented out by default)
  // runFullScan().catch(console.error);

  // Optional: Schedule periodic scans
  if (process.env.SCAN_INTERVAL_MINUTES) {
    const interval = parseInt(process.env.SCAN_INTERVAL_MINUTES);
    cron.schedule(`*/${interval} * * * *`, () => {
      console.log(`\n[Scheduled] Running scan...`);
      runFullScan().catch(console.error);
    });
    console.log(`Scheduled scans every ${interval} minutes`);
  }
});