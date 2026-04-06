// ================================================================
// LIQUIDITY ANALYSIS AGENT
// ================================================================
// Optimizes liquidity deployment across PulseX pools

class LiquidityAnalysisAgent {
  constructor() {
    this.targetLiquidityUSD = 625000; // $625K total target
    this.pools = [
      { name: 'PRGX/WPLS', ratio: 0.8, targetUSD: 500000, risk: 'high' },
      { name: 'PRGX/USDC', ratio: 0.08, targetUSD: 50000, risk: 'low' },
      { name: 'PRGX/WETH', ratio: 0.08, targetUSD: 50000, risk: 'medium' },
      { name: 'PRGX/WBTC', ratio: 0.04, targetUSD: 25000, risk: 'low' }
    ];
    
    this.results = {
      currentLiquidity: null,
      deploymentPlan: [],
      recommendations: []
    };
  }

  async run() {
    console.log('🏊‍♂️ Liquidity Analysis Agent starting...');
    
    await this.fetchCurrentLiquidity();
    await this.analyzePoolHealth();
    await this.createDeploymentPlan();
    await this.generateRecommendations();
    
    this.generateReport();
  }

  async fetchCurrentLiquidity() {
    console.log('\n📊 Fetching current liquidity...');
    
    try {
      const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0');
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.pairs) {
          const pools = [];
          let totalLiquidity = 0;
          
          for (const pair of data.pairs) {
            const liquidity = parseFloat(pair.liquidity?.usd || 0);
            if (liquidity > 0) {
              pools.push({
                address: pair.pairAddress,
                token0: pair.baseToken?.symbol,
                token1: pair.quoteToken?.symbol,
                liquidityUSD: liquidity,
                volume24h: parseFloat(pair.volume?.h24 || 0),
                apr: parseFloat(pair.apr?.base24h || 0)
              });
              totalLiquidity += liquidity;
            }
          }
          
          this.results.currentLiquidity = {
            total: totalLiquidity,
            pools: pools,
            poolCount: pools.length
          };
          
          console.log(`  💧 Current total liquidity: $${totalLiquidity.toFixed(2)}`);
          pools.forEach(pool => {
            console.log(`    ${pool.token0}/${pool.token1}: $${pool.liquidityUSD.toFixed(2)}`);
          });
        } else {
          throw new Error('No pairs data');
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn(`  ⚠️ Could not fetch current liquidity: ${error.message}`);
      this.results.currentLiquidity = {
        total: 0,
        pools: [],
        poolCount: 0
      };
    }
  }

  async analyzePoolHealth() {
    console.log('\n🏥 Analyzing pool health...');
    
    const current = this.results.currentLiquidity;
    const target = this.targetLiquidityUSD;
    const gap = target - current.total;
    
    this.results.gap = gap;
    this.results.percentComplete = (current.total / target * 100).toFixed(1);
    
    console.log(`  Target: $${target.toFixed(2)}`);
    console.log(`  Gap: $${gap.toFixed(2)} (${this.results.percentComplete}% complete)`);
    
    // Health metrics
    if (current.total > 0) {
      const avgPoolSize = current.total / current.poolCount;
      const largestPool = current.pools.reduce((max, p) => p.liquidityUSD > max.liquidityUSD ? p : max, current.pools[0]);
      
      this.results.health = {
        avgPoolSize,
        largestPool,
        isHealthy: current.poolCount >= 2 && current.total >= target * 0.5
      };
      
      console.log(`  Avg pool size: $${avgPoolSize.toFixed(2)}`);
      console.log(`  Largest pool: ${largestPool.token0}/${largestPool.token1} ($${largestPool.liquidityUSD.toFixed(2)})`);
    }
  }

  async createDeploymentPlan() {
    console.log('\n📋 Creating deployment plan...');
    
    const plan = [];
    const current = this.results.currentLiquidity;
    
    // Calculate how much PRGX needed for each pool
    // Assuming initial price ~$0.001 for PRGX
    const prgxPrice = 0.001; // Will be updated with real price
    
    for (const pool of this.pools) {
      const currentUSD = current.pools.find(p => 
        (p.token0 === 'PRGX' && p.token1?.includes(pool.name.split('/')[1])) ||
        (p.token1 === 'PRGX' && p.token0?.includes(pool.name.split('/')[1]))
      )?.liquidityUSD || 0;
      
      const neededUSD = pool.targetUSD - currentUSD;
      const neededPRGX = neededUSD > 0 ? neededUSD / prgxPrice : 0;
      
      if (neededPRGX > 0) {
        plan.push({
          pool: pool.name,
          targetUSD: pool.targetUSD,
          currentUSD,
          neededUSD,
          neededPRGX: Math.round(neededPRGX),
          priority: neededUSD / pool.targetUSD // Higher priority if further from target
        });
      }
    }
    
    // Sort by priority
    plan.sort((a, b) => b.priority - a.priority);
    
    this.results.deploymentPlan = plan;
    
    console.log('\n  Deployment Steps:');
    for (const step of plan) {
      console.log(`    ${step.pool}: Need $${step.neededUSD.toFixed(2)} (${step.neededPRGX.toLocaleString()} PRGX)`);
    }
  }

  async generateRecommendations() {
    console.log('\n💡 Generating recommendations...');
    
    const recommendations = [];
    
    // 1. Immediate action
    if (this.results.gap > 400000) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Deploy 500M PRGX to PRGX/WPLS pool immediately',
        reason: 'Primary pool needs deep liquidity for low slippage',
        impact: 'Critical'
      });
    }
    
    // 2. Progressive deployment
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Deploy pools in order: WPLS → USDC → WETH → WBTC',
      reason: 'WPLS is native chain, highest volume expected',
      impact: 'High'
    });
    
    // 3. Liquidity locking
    recommendations.push({
      priority: 'HIGH',
      action: 'Lock all LP tokens with Team Finance for 2 years',
      reason: 'Prevents rug pull, builds trust',
      impact: 'Critical'
    });
    
    // 4. Incentives
    if (this.results.percentComplete < 50) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Launch liquidity mining with 50M PRGX over 2 years',
        reason: 'Attract LPs to reach target faster',
        impact: 'High'
      });
    }
    
    // 5. Monitoring
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Monitor liquidity-to-volume ratio weekly',
      reason: 'Target: >30% ratio for healthy market',
      impact: 'Medium'
    });
    
    this.results.recommendations = recommendations;
    
    for (const rec of recommendations) {
      console.log(`\n  [${rec.priority}] ${rec.action}`);
      console.log(`    Reason: ${rec.reason}`);
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 LIQUIDITY ANALYSIS REPORT');
    console.log('='.repeat(60));
    
    console.log('\n💰 CURRENT STATE');
    console.log(`  Total Liquidity: $${this.results.currentLiquidity.total.toFixed(2)}`);
    console.log(`  Pools: ${this.results.currentLiquidity.poolCount}`);
    console.log(`  Progress: ${this.results.percentComplete}% of $${this.targetLiquidityUSD.toFixed(2)} target`);
    console.log(`  Gap: $${this.results.gap.toFixed(2)}`);
    
    console.log('\n📋 DEPLOYMENT PLAN');
    for (const step of this.results.deploymentPlan) {
      console.log(`\n  ${step.pool}:`);
      console.log(`    Target: $${step.targetUSD.toFixed(2)}`);
      console.log(`    Current: $${step.currentUSD.toFixed(2)}`);
      console.log(`    Needed: $${step.neededUSD.toFixed(2)} (${step.neededPRGX.toLocaleString()} PRGX)`);
    }
    
    console.log('\n💡 RECOMMENDATIONS');
    for (const rec of this.results.recommendations) {
      console.log(`\n  [${rec.priority}] ${rec.action}`);
      console.log(`    Impact: ${rec.impact}`);
      console.log(`    Reason: ${rec.reason}`);
    }
    
    console.log('\n⏱️ TIMELINE SUGGESTION');
    console.log('  Week 1-2: Deploy PRGX/WPLS pool (500M PRGX)');
    console.log('  Week 3-4: Lock LP tokens, announce liquidity mining');
    console.log('  Month 2: Deploy PRGX/USDC pool (50M PRGX)');
    console.log('  Month 3: Deploy PRGX/WETH pool (50M PRGX)');
    console.log('  Month 4: Deploy PRGX/WBTC pool (25M PRGX)');
    
    console.log('\n' + '='.repeat(60));
    
    // Save results
    const fs = require('fs');
    const path = require('path');
    const filename = `liquidity-analysis-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(
      path.join(__dirname, 'research-results', filename),
      JSON.stringify(this.results, null, 2)
    );
    console.log(`\n✅ Results saved: ${filename}`);
  }
}

if (require.main === module) {
  const agent = new LiquidityAnalysisAgent();
  agent.run().catch(console.error);
}

module.exports = LiquidityAnalysisAgent;
