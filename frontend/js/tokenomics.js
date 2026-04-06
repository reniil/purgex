/**
 * Tokenomics Data Fetcher for PurgeX
 * Fetches live data from PulseChain contracts
 */

// Import ethers from CDN (included in config.js)
const getProvider = () => {
  if (typeof CONFIG === 'undefined') {
    throw new Error('CONFIG not loaded. Include config.js first.');
  }
  return new ethers.JsonRpcProvider(CONFIG.NETWORK.rpc);
};

const formatUnits = (value, decimals) => {
  return ethers.formatUnits(value, decimals);
};

const formatNumber = (num) => {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const formatUSD = (num) => {
  if (num === 0 || isNaN(num)) return '$—';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
  return '$' + num.toFixed(2);
};

/**
 * Main function to fetch all tokenomics data
 */
export async function fetchTokenomics() {
  const provider = getProvider();
  const tokens = CONFIG.APIS.TOKENS;
  
  try {
    // 1. Get PRGX total supply and decimals
    const prgxContract = new ethers.Contract(
      tokens.PRGX,
      [
        'function totalSupply() view returns (uint256)',
        'function decimals() view returns (uint8)'
      ],
      provider
    );
    
    const [totalSupply, decimals] = await Promise.all([
      prgxContract.totalSupply(),
      prgxContract.decimals()
    ]);
    
    const totalSupplyFormatted = parseFloat(formatUnits(totalSupply, decimals));
    
    // 2. Get staked amount
    const stakingContract = new ethers.Contract(
      tokens.STAKING,
      [
        'function getTotalStaked() view returns (uint256)',
        'function stakedBalanceOf(address) view returns (uint256)'
      ],
      provider
    );
    
    const totalStaked = await stakingContract.getTotalStaked();
    const stakedFormatted = parseFloat(formatUnits(totalStaked, decimals));
    
    // 3. Get PRGX/WPLS LP info
    const pairAddress = tokens.LP_TOKEN;
    const pairContract = new ethers.Contract(
      pairAddress,
      [
        'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)',
        'function token0() view returns (address)',
        'function token1() view returns (address)'
      ],
      provider
    );
    
    const [reserves, token0, token1] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1()
    ]);
    
    // Determine which reserve is PRGX
    const isPRGXToken0 = token0.toLowerCase() === tokens.PRGX.toLowerCase();
    const prgxReserve = isPRGXToken0 ? reserves.reserve0 : reserves.reserve1;
    const wplsReserve = isPRGXToken0 ? reserves.reserve1 : reserves.reserve0;
    
    const prgxReserveFormatted = parseFloat(formatUnits(prgxReserve, decimals));
    const wplsReserveFormatted = parseFloat(formatUnits(wplsReserve, 18)); // WPLS has 18 decimals
    
    // 4. Estimate PRGX price from LP
    // Price = (wplsReserve * wplsPrice) / prgxReserve
    // For simplicity, use estimated WPLS price (~$0.50)
    // In production, fetch from price oracle or API
    const estimatedWPLSPrice = 0.50; // TODO: Fetch real price
    const prgxPriceUSD = prgxReserveFormatted > 0 
      ? (wplsReserveFormatted * estimatedWPLSPrice) / prgxReserveFormatted 
      : 0;
    
    // 5. Calculate market cap
    const marketCapUSD = totalSupplyFormatted * prgxPriceUSD;
    
    // 6. Calculate liquidity USD
    const liquidityUSD = (prgxReserveFormatted * prgxPriceUSD) + (wplsReserveFormatted * estimatedWPLSPrice);
    
    // 7. Circulating supply (total - staked - burned)
    // Burned tokens: track via events or separate counter
    // For now, estimate from fee burning (need to track off-chain or add counter)
    const burnedTokens = 0; // TODO: Implement burn tracking
    
    const circulatingSupply = totalSupplyFormatted - stakedFormatted - burnedTokens;
    
    return {
      currentPrice: prgxPriceUSD,
      marketCap: marketCapUSD,
      liquidity: liquidityUSD,
      totalSupply: totalSupplyFormatted,
      circulatingSupply: Math.max(0, circulatingSupply),
      stakedSupply: stakedFormatted,
      burnedTokens: burnedTokens,
      lpReserves: {
        prgx: prgxReserveFormatted,
        wpls: wplsReserveFormatted
      },
      lastUpdated: new Date().toISOString(),
      success: true
    };
    
  } catch (error) {
    console.error('Failed to fetch tokenomics:', error);
    return {
      success: false,
      error: error.message,
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Fetch single metric (for granular updates)
 */
export async function fetchPrice() {
  const data = await fetchTokenomics();
  return data.success ? data.currentPrice : null;
}

export async function fetchMarketCap() {
  const data = await fetchTokenomics();
  return data.success ? data.marketCap : null;
}

export async function fetchLiquidity() {
  const data = await fetchTokenomics();
  return data.success ? data.liquidity : null;
}
