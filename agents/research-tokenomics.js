// ================================================================
// PURGEX RESEARCH AGENT - Tokenomics & Market Analysis
// ================================================================
// Autonomous agent that researches PRGX tokenomics and provides
// data-driven recommendations for the PurgeX ecosystem
// ================================================================

const axios = require('axios');

class PurgeXResearchAgent {
  constructor() {
    this.config = {
      prgxToken: '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0',
      wplsToken: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
      pulseScanApi: 'https://api.scan.pulsechain.com/api/v2',
      dexScreener: 'https://api.dexscreener.com/latest/dex/tokens',
      coinGecko: 'https://api.coingecko.com/api/v3',
      userAgent: 'PurgeXResearchAgent/1.0'
    };
    
    this.results = {
      prgxPrice: null,
      liquidity: {},
      volume: {},
      tokenomics: {},
      recommendations: []
    };
  }

  // ================================================================
  // MAIN EXECUTION
  // ================================================================
  
  async run() {
    console.log('🔬 PurgeX Research Agent starting...');
    
    try {
      // 1. Fetch PRGX price from multiple sources
      await this.fetchPRGXPrice();
      
      // 2. Analyze liquidity pools
      await this.analyzeLiquidity();
      
      // 3. Check trading volume
      await this.fetchVolumeData();
      
      // 4. Calculate tokenomics models
      await this.calculateTokenomics();
      
      // 5. Generate recommendations
      await this.generateRecommendations();
      
      // 6. Output report
      this.generateReport();
      
      console.log('✅ Research complete');
      
    } catch (error) {
      console.error('❌ Research failed:', error.message);
    }
  }

  // ================================================================
  // DATA COLLECTION
  // ================================================================
  
  async fetchPRGXPrice() {
    console.log('\n📊 Fetching PRGX price...');
    
    const sources = [
      { name: 'DEXScreener', fn: () => this.fetchFromDexScreener() },
      { name: 'PulseScan', fn: () => this.fetchFromPulseScan() },
      { name: 'CoinGecko', fn: () => this.fetchFromCoinGecko() }
    ];
    
    const prices = [];
    
    for (const source of sources) {
      try {
        const price = await source.fn();
        if (price && price > 0) {
          prices.push({ source: source.name, price });
          console.log(`  ✓ ${source.name}: $${price.toFixed(8)}`);
        } else {
          console.log(`  ✗ ${source.name}: No data`);
        }
      } catch (error) {
        console.log(`  ✗ ${source.name}: ${error.message}`);
      }
    }
    
    if (prices.length === 0) {
      throw new Error('No price data from any source');
    }
    
    // Use median to avoid outliers
    const sorted = prices.map(p => p.price).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    this.results.prgxPrice = {
      sources: prices,
      median: median,
      avg: prices.reduce((sum, p) => sum + p.price, 0) / prices.length,
      min: Math.min(...prices.map(p => p.price)),
      max: Math.max(...prices.map(p => p.price))
    };
    
    console.log(`  📈 Median price: $${median.toFixed(8)}`);
  }

  async fetchFromDexScreener() {
    const url = `${this.config.dexScreener}/${this.config.prgxToken}`;
    const response = await axios.get(url, { headers: { 'User-Agent': this.config.userAgent } });
    
    if (response.data.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      if (pair.priceUsd) {
        return parseFloat(pair.priceUsd);
      }
    }
    throw new Error('No price in DEXScreener response');
  }

  async fetchFromPulseScan() {
    const url = `${this.config.pulseScanApi}/tokens/${this.config.prgxToken}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.priceUsd) {
      return parseFloat(response.data.priceUsd);
    }
    throw new Error('No price in PulseScan response');
  }

  async fetchFromCoinGecko() {
    // CoinGecko may not have PulseChain tokens, but try
    try {
      const response = await axios.get(`${this.config.coinGecko}/simple/token_price/pulsechain`, {
        params: { contract_addresses: this.config.prgxToken, vs_currencies: 'usd' }
      });
      
      if (response.data[this.config.prgxToken]?.usd) {
        return response.data[this.config.prgxToken].usd;
      }
    } catch {
      // CoinGecko likely doesn't support PulseChain
    }
    throw new Error('CoinGecko no data');
  }

  async analyzeLiquidity() {
    console.log('\n🏊‍♂️ Analyzing liquidity...');
    
    try {
      const url = `${this.config.dexScreener}/${this.config.prgxToken}`;
      const response = await axios.get(url);
      
      const pools = [];
      
      if (response.data.pairs) {
        for (const pair of response.data.pairs) {
          const liquidity = parseFloat(pair.liquidity?.usd || 0);
          const volume24h = parseFloat(pair.volume?.h24 || 0);
          
          if (liquidity > 0) {
            pools.push({
              pair: pair.pairAddress,
              token0: pair.baseToken?.symbol || 'Unknown',
              token1: pair.quoteToken?.symbol || 'Unknown',
              liquidityUSD: liquidity,
              volume24hUSD: volume24h,
              apr: parseFloat(pair.apr?.base24h || 0)
            });
            
            console.log(`  ✓ ${pair.baseToken?.symbol}/${pair.quoteToken?.symbol}: $${liquidity.toFixed(2)} liquidity`);
          }
        }
      }
      
      this.results.liquidity = {
        totalLiquidity: pools.reduce((sum, p) => sum + p.liquidityUSD, 0),
        pools: pools,
        poolCount: pools.length
      };
      
      console.log(`  💧 Total liquidity: $${this.results.liquidity.totalLiquidity.toFixed(2)}`);
      
    } catch (error) {
      console.warn('  ⚠️ Liquidity analysis failed:', error.message);
      this.results.liquidity = { totalLiquidity: 0, pools: [], poolCount: 0 };
    }
  }

  async fetchVolumeData() {
    console.log('\n📈 Fetching volume data...');
    
    try {
      const url = `${this.config.dexScreener}/${this.config.prgxToken}`;
      const response = await axios.get(url);
      
      if (response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        
        this.results.volume = {
          volume24h: parseFloat(pair.volume?.h24 || 0),
          volume7d: parseFloat(pair.volume?.h7 || 0),
          volume30d: parseFloat(pair.volume?.h30 || 0),
          txns24h: pair.transactions?.h24 || { buys: 0, sells: 0 }
        };
        
        console.log(`  📊 24h Volume: $${this.results.volume.volume24h.toFixed(2)}`);
        console.log(`  📊 7d Volume: $${this.results.volume.volume7d.toFixed(2)}`);
      }
    } catch (error) {
      console.warn('  ⚠️ Volume fetch failed:', error.message);
      this.results.volume = { volume24h: 0, volume7d: 0, volume30d: 0, txns24h: { buys: 0, sells: 0 } };
    }
  }

  // ================================================================
  // TOKENOMICS CALCULATIONS
  // ================================================================
  
  calculateTokenomics() {
    console.log('\n🧮 Calculating tokenomics models...');
    
    const price = this.results.prgxPrice?.median || 0.001;
    const totalSupply = 1_000_000_000;
    
    // FDV (Fully Diluted Valuation)
    const fdv = totalSupply * price;
    
    // Circulating supply estimate (excluding locked liquidity)
    const lockedLiquidity = 675_000_000; // From tokenomics plan
    const stakingLocked = 50_000_000;
    const treasuryVested = 250_000_000 * 0.5; // Assume 50% unlocked
    const circulating = totalSupply - lockedLiquidity - stakingLocked - treasuryVested;
    const circulatingPercent = (circulating / totalSupply) * 100;
    
    // Market cap (circulating × price)
    const marketCap = circulating * price;
    
    this.results.tokenomics = {
      totalSupply,
      circulatingSupply: circulating,
      circulatingPercent: circulatingPercent.toFixed(2),
      fdv: fdv,
      marketCap: marketCap,
      priceUSD: price,
      liquidityDepth: this.results.liquidity.totalLiquidity,
      liquidityToMarketCapRatio: (this.results.liquidity.totalLiquidity / marketCap * 100).toFixed(2)
    };
    
    console.log(`  💰 FDV: $${fdv.toFixed(2)}`);
    console.log(`  💰 Market Cap: $${marketCap.toFixed(2)}`);
    console.log(`  💧 Liquidity Ratio: ${this.results.tokenomics.liquidityToMarketCapRatio}%`);
  }

  // ================================================================
  // RECOMMENDATION ENGINE
  // ================================================================
  
  generateRecommendations() {
    console.log('\n💡 Generating recommendations...');
    
    const price = this.results.prgxPrice?.median || 0.001;
    const recommendations = [];
    
    // 1. Bonus amount analysis
    const bonusOptions = [50, 100, 200, 500];
    const costPerSweep = {};
    
    for (const bonus of bonusOptions) {
      const usdCost = bonus * price;
      costPerSweep[bonus] = usdCost;
    }
    
    // Determine optimal bonus based on treasury health
    // Assume we want to support at least 1M token sweeps
    const treasuryBudget = 25_000_000; // 25M PRGX dust sweep allocation
    const maxSweepsAtBonus = {};
    
    for (const bonus of bonusOptions) {
      const maxSweeps = Math.floor(treasuryBudget / bonus);
      maxSweepsAtBonus[bonus] = maxSweeps;
    }
    
    recommendations.push({
      category: 'Bonus Optimization',
      analysis: `Price: $${price.toFixed(8)} PRGX. Cost per sweep: ${JSON.stringify(costPerSweep)}. Budget can support: ${JSON.stringify(maxSweepsAtBonus)} sweeps.`,
      recommendation: `Use 100 PRGX bonus. Cost per user: $${costPerSweep[100].toFixed(6)}. Can fund ${maxSweepsAtBonus[100].toLocaleString()} sweeps from 25M allocation.`
    });
    
    // 2. Liquidity recommendations
    const currentLiq = this.results.liquidity.totalLiquidity;
    const targetLiq = 625_000; // $625K target from tokenomics
    
    if (currentLiq < targetLiq * 0.1) {
      recommendations.push({
        category: 'Liquidity',
        analysis: `Current liquidity: $${currentLiq.toFixed(2)}. Target: $${targetLiq.toFixed(2)}.`,
        recommendation: 'Urgently deploy 500M PRGX + matching WPLS to PulseX. Use Team Finance locker for 2-year lock.'
      });
    } else if (currentLiq < targetLiq * 0.5) {
      recommendations.push({
        category: 'Liquidity',
        analysis: `Current: $${currentLiq.toFixed(2)}. Target: $${targetLiq.toFixed(2)}.`,
        recommendation: 'Progressively add additional pools (USDC, WETH, WBTC) using remaining liquidity allocation.'
      });
    } else {
      recommendations.push({
        category: 'Liquidity',
        analysis: `Current liquidity ($${currentLiq.toFixed(2)}) approaching target ($${targetLiq.toFixed(2)}).`,
        recommendation: 'Liquidity is healthy. Focus on marketing and user acquisition now.'
      });
    }
    
    // 3. Volume sustainability
    const dailyVolume = this.results.volume.volume24h;
    const volumeToLiqRatio = dailyVolume / currentLiq;
    
    if (volumeToLiqRatio < 0.1) {
      recommendations.push({
        category: 'Volume',
        analysis: `24h volume: $${dailyVolume.toFixed(2)}. Ratio to liquidity: ${(volumeToLiqRatio*100).toFixed(2)}% (low).`,
        recommendation: 'Launch liquidity mining program (50M PRGX over 2 years) to incentivize trading and volume.'
      });
    }
    
    // 4. Treasury management
    recommendations.push({
      category: 'Treasury',
      analysis: 'Treasury: 250M PRGX (25% supply).',
      recommendation: 'Set up 3/5 multi-sig wallet. Implement 2-year vesting schedule with quarterly unlocks. Create public dashboard for transparency.'
    });
    
    // 5. Staking rewards
    recommendations.push({
      category: 'Staking',
      analysis: 'Staking allocation: 50M PRGX over 2 years (~68,500/day).',
      recommendation: 'Deploy staking vault immediately. Offer tiered APRs: Bronze 10%, Silver 12%, Gold 15%, Diamond 20%. Include sweep bonus multipliers.'
    });
    
    this.results.recommendations = recommendations;
  }

  // ================================================================
  // REPORT GENERATION
  // ================================================================
  
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 PURGEX RESEARCH REPORT');
    console.log('='.repeat(60));
    
    console.log('\n💰 PRICE DATA');
    console.log(`  Median: $${this.results.prgxPrice?.median?.toFixed(8) || 'N/A'}`);
    console.log(`  Range: $${this.results.prgxPrice?.min?.toFixed(8)} - $${this.results.prgxPrice?.max?.toFixed(8)}`);
    
    console.log('\n🏊‍♂️ LIQUIDITY');
    console.log(`  Total: $${this.results.liquidity.totalLiquidity?.toFixed(2) || 0}`);
    console.log(`  Pool Count: ${this.results.liquidity.poolCount}`);
    
    console.log('\n📈 VOLUME');
    console.log(`  24h: $${this.results.volume.volume24h?.toFixed(2) || 0}`);
    console.log(`  7d: $${this.results.volume.volume7d?.toFixed(2) || 0}`);
    
    console.log('\n🧮 TOKENOMICS');
    const t = this.results.tokenomics;
    console.log(`  Circulating Supply: ${t.circulatingSupply?.toLocaleString() || 0} PRGX (${t.circulatingPercent}%)`);
    console.log(`  Market Cap: $${t.marketCap?.toFixed(2) || 0}`);
    console.log(`  FDV: $${t.fdv?.toFixed(2) || 0}`);
    
    console.log('\n💡 RECOMMENDATIONS');
    for (const rec of this.results.recommendations) {
      console.log(`\n  [${rec.category}]`);
      console.log(`    Analysis: ${rec.analysis}`);
      console.log(`    → ${rec.recommendation}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Save to file
    const fs = require('fs');
    const path = require('path');
    
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        prgxPriceUSD: this.results.prgxPrice?.median,
        totalLiquidityUSD: this.results.liquidity.totalLiquidity,
        marketCapUSD: this.results.tokenomics.marketCap,
        circulatingSupplyPRGX: this.results.tokenomics.circulatingSupply,
        recommendation: this.results.recommendations[0]?.recommendation
      }
    };
    
    const filename = `purgex-research-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(report, null, 2));
    console.log(`\n✅ Report saved to: ${filename}`);
  }
}

// ================================================================
// RUN AGENT
// ================================================================

if (require.main === module) {
  const agent = new PurgeXResearchAgent();
  agent.run().catch(console.error);
}

module.exports = PurgeXResearchAgent;
