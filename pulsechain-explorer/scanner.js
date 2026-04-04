import { ethers } from 'ethers';
import { tokenDAO, pairDAO, scanLogDAO } from './db/index.js';

// Configuration
const CONFIG = {
  rpcUrl: process.env.RPC_URL || 'https://rpc.pulsechain.com',
  blockscoutApi: process.env.BLOCKSCOUT_API || 'https://api.scan.pulsechain.com/api',
  pulsetokensUrl: process.env.PULSETOKENS_URL || 'https://tokens.pulsechain.com/output/tokens.pulsechain.com.json',

  // Known DEX factories on PulseChain
  factories: [
    { address: '0x1715a3E4A142d8b698131108995174F37aEBA10D', name: 'pulsex-v1', type: 'uniswap-v2' },
    // Add more DEX factories as they appear
  ],

  // Batch size for token metadata fetches (avoid rate limits)
  tokenBatchSize: 50
};

// ABIs
const factoryABI = [
  'function allPairsLength() view returns (uint256)',
  'function allPairs(uint256) view returns (address)'
];

const pairABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

const erc20ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)'
];

// Initialize provider
const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

// ==================== PULSETOKENS.ORG REGISTRY ====================
async function fetchPulseTokensRegistry() {
  try {
    const response = await fetch(CONFIG.pulsetokensUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    console.log(`Fetched ${data.tokens?.length || 0} tokens from pulsetokens.org`);

    // Store tokens in DB
    let count = 0;
    for (const token of data.tokens || []) {
      tokenDAO.upsert({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI,
        source: 'pulsetokens',
        verified: true
      });
      count++;
    }

    // Build verified set for quick lookup
    const verifiedSet = new Set(
      (data.tokens || []).map(t => t.address.toLowerCase())
    );

    console.log(`Stored ${count} verified tokens`);
    return verifiedSet;
  } catch (error) {
    console.error('Failed to fetch pulsetokens.org registry:', error.message);
    return new Set();
  }
}

// ==================== FACTORY SCANNING ====================
async function scanFactory(factory, verifiedSet) {
  console.log(`Scanning factory ${factory.name} at ${factory.address}`);

  const factoryContract = new ethers.Contract(factory.address, factoryABI, provider);

  try {
    const totalPairs = await factoryContract.allPairsLength();
    const totalPairsNum = Number(totalPairs); // Convert to number for loops
    console.log(`  Found ${totalPairs} LP pairs`);

    let tokensFound = new Set();

    // Process in batches to avoid overwhelming RPC
    const batchSize = 100;
    for (let i = 0; i < totalPairsNum; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, totalPairsNum);
      console.log(`  Scanning pairs ${i + 1}-${batchEnd}...`);

      // Fetch pair addresses in parallel (safe for read-only)
      const pairPromises = [];
      for (let j = i; j < batchEnd; j++) {
        pairPromises.push(factoryContract.allPairs(j));
      }

      const pairAddresses = await Promise.all(pairPromises);

      // Fetch pair details in parallel
      const pairDetailsPromises = pairAddresses.map(addr => {
        const pair = new ethers.Contract(addr, pairABI, provider);
        return pair.token0().then(t0 =>
          pair.token1().then(t1 =>
            pair.getReserves().then(reserves => ({
              address: addr,
              token0: t0,
              token1: t1,
              reserve0: reserves.reserve0.toString(),
              reserve1: reserves.reserve1.toString(),
              reserveUpdatedAt: reserves.blockTimestampLast
            }))
          )
        );
      });

      const pairDetails = await Promise.all(pairDetailsPromises);

      // Save pairs and collect tokens
      for (const pair of pairDetails) {
        pairDAO.upsert({
          ...pair,
          dex: factory.name,
          tvl: 0, // Will calculate later if we have prices
          source: 'factory-scan'
        });

        tokensFound.add(pair.token0);
        tokensFound.add(pair.token1);
      }

      // Progress update
      if (batchEnd % 500 === 0) {
        console.log(`  Processed ${batchEnd}/${totalPairsNum} pairs`);
      }
    }

    console.log(`  Factory scan complete: ${tokensFound.size} unique tokens found`);
    return { pairsTotal: totalPairsNum, tokensFound };
  } catch (error) {
    console.error(`Factory scan failed for ${factory.name}:`, error.message);
    throw error;
  }
}

// ==================== TOKEN METADATA FETCH ====================
async function fetchTokenMetadata(tokenAddress, verifiedSet) {
  try {
    const token = new ethers.Contract(tokenAddress, erc20ABI, provider);

    const [symbol, name, decimals] = await Promise.all([
      token.symbol().catch(() => null),
      token.name().catch(() => null),
      token.decimals().catch(() => 18)
    ]);

    // Skip if no symbol (likely not a real token)
    if (!symbol) return null;

    tokenDAO.upsert({
      address: tokenAddress,
      symbol,
      name: name || symbol,
      decimals: Number(decimals),
      logoURI: null,
      source: 'factory-scan',
      verified: verifiedSet.has(tokenAddress.toLowerCase())
    });

    return { address: tokenAddress, symbol, name, decimals };
  } catch (error) {
    // Some tokens may revert on symbol/name calls; skip silently
    return null;
  }
}

async function fetchAllTokenMetadata(tokenAddresses, verifiedSet) {
  console.log(`Fetching metadata for ${tokenAddresses.size} tokens...`);

  const addresses = Array.from(tokenAddresses);
  const batchSize = CONFIG.tokenBatchSize;
  let processed = 0;

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(addr => fetchTokenMetadata(addr, verifiedSet))
    );

    processed += batch.length;
    if (processed % 100 === 0) {
      console.log(`  Processed ${processed}/${addresses.length} tokens`);
    }
  }

  console.log(`Token metadata fetch complete`);
}

// ==================== MAIN SCAN ====================
export async function runFullScan() {
  console.log('='.repeat(50));
  console.log('PulseChain Explorer: Starting full scan');
  console.log('='.repeat(50));

  const scanId = scanLogDAO.start();
  let pairsTotal = 0;
  let tokensTotal = 0;
  let error = null;

  try {
    // Step 1: Fetch verified token registry
    console.log('\n[1/3] Fetching verified token registry...');
    const verifiedSet = await fetchPulseTokensRegistry();

    // Step 2: Scan factories
    console.log('\n[2/3] Scanning DEX factories...');
    const factoryResults = [];
    for (const factory of CONFIG.factories) {
      const result = await scanFactory(factory, verifiedSet);
      factoryResults.push(result);
      pairsTotal += result.pairsTotal;
    }
    tokensTotal = new Set().add(...factoryResults.flatMap(r => r.tokensFound)).size;

    // Step 3: Fetch metadata for all discovered tokens
    const allTokenAddresses = new Set();
    // Re-query all tokens that came from factory scans (source = 'factory-scan')
    // We'll fetch all token addresses from pairs table that don't have metadata yet
    const allPairs = pairDAO.getAll();
    for (const pair of allPairs) {
      allTokenAddresses.add(pair.token0);
      allTokenAddresses.add(pair.token1);
    }

    await fetchAllTokenMetadata(allTokenAddresses, verifiedSet);

    console.log('\n' + '='.repeat(50));
    console.log('Scan completed successfully!');
    console.log(`Total pairs: ${pairsTotal}`);
    console.log(`Unique tokens: ${allTokenAddresses.size}`);
    console.log(`Verified tokens: ${verifiedSet.size}`);
    console.log('='.repeat(50));

  } catch (err) {
    console.error('Scan failed:', err);
    error = err.message;
  } finally {
    scanLogDAO.complete(scanId, pairsTotal, tokensTotal, error);
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFullScan().catch(console.error);
}