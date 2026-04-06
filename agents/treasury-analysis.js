// ================================================================
// TREASURY ANALYSIS AGENT
// ================================================================
// Models treasury sustainability under different bonus scenarios

class TreasuryAnalysisAgent {
  constructor() {
    this.config = {
      treasuryAllocation: 25_000_000, // 25M PRGX for dust sweep bonuses
      prgxPriceUSD: 0.00008757, // Current price (will fetch real)
      sweepFeePercent: 0.05, // 5% fee
      feeBurnPercent: 0.5, // 50% of fees burned
      feeTreasuryPercent: 0.3, // 30% to treasury
      feeStakingPercent: 0.2 // 20% to staking rewards
    };
    
    this.scenarios = [
      { bonus: 50, name: 'Conservative' },
      { bonus: 100, name: 'Current Proposal' },
      { bonus: 200, name: 'Generous' },
      { bonus: 500, name: 'Aggressive' }
    ];
    
    this.results = {
      modelParams: {},
      scenarios: [],
      recommendation: null
    };
  }

  async run() {
    console.log('💰 Treasury Analysis Agent starting...');
    
    // Try to fetch real PRGX price
    try {
      const realPrice = await this.fetchPRGXPrice();
      if (realPrice && realPrice > 0) {
        this.config.prgxPriceUSD = realPrice;
        console.log(`  ✓ Using live PRGX price: $${realPrice.toFixed(8)}`);
      }
    } catch (error) {
      console.log(`  ⚠️ Using fallback price: $${this.config.prgxPriceUSD.toFixed(8)}`);
    }
    
    this.results.modelParams = { ...this.config };
    
    await this.modelScenarios();
    await this.calculateSustainability();
    await this.generateRecommendation();
    
    this.generateReport();
  }

  async fetchPRGXPrice() {
    try {
      const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0');
      if (response.ok) {
        const data = await response.json();
        if (data.pairs?.[0]?.priceUsd) {
          return parseFloat(data.pairs[0].priceUsd);
        }
      }
    } catch (error) {
      // ignore
    }
    return null;
  }

  async modelScenarios() {
    console.log('\n📊 Modeling bonus scenarios...');
    
    for (const scenario of this.scenarios) {
      const bonus = scenario.bonus;
      const costPerSweep = bonus * this.config.prgxPriceUSD;
      const maxSweeps = Math.floor(this.config.treasuryAllocation / bonus);
      
      // Calculate cost tiers
      const costs = {
        perSweepUSD: costPerSweep,
        totalSweeps: maxSweeps,
        totalPRGX: maxSweeps * bonus,
        totalUSD: maxSweeps * costPerSweep
      };
      
      // Simulate different user adoption rates
      const adoptionScenarios = {
        conservative: Math.floor(maxSweeps * 0.1), // 10% adoption
        moderate: Math.floor(maxSweeps * 0.3), // 30% adoption
        aggressive: Math.floor(maxSweeps * 0.5) // 50% adoption
      };
      
      // Calculate fee revenue to replenish treasury
      const avgTokenValueUSD = 10; // Assumed average token value per sweep
      const avgSweepAmountPRGX = (avgTokenValueUSD * 0.95) / this.config.prgxPriceUSD; // 95% after fee
      const feePerSweepPRGX = avgSweepAmountPRGX * this.config.sweepFeePercent;
      const burnedPerSweepPRGX = feePerSweepPRGX * this.config.feeBurnPercent;
      const treasuryGainPerSweepPRGX = feePerSweepPRGX * this.config.feeTreasuryPercent;
      
      scenario.model = {
        bonus,
        costPerSweepUSD,
        maxSweeps,
        costs,
        feePerSweepPRGX,
        burnedPerSweepPRGX,
        treasuryGainPerSweepPRGX,
        netTreasuryCostPerSweep: bonus - treasuryGainPerSweepPRGX, // Treasury gets some back via fees
        adoptionScenarios
      };
      
      this.results.scenarios.push(scenario);
      
      console.log(`\n  [${scenario.name}] Bonus: ${bonus} PRGX`);
      console.log(`    Cost per sweep: $${costPerSweep.toFixed(6)}`);
      console.log(`    Max sweeps supported: ${maxSweeps.toLocaleString()}`);
      console.log(`    Total USD value: $${costs.totalUSD.toFixed(2)}`);
      console.log(`    Net treasury cost (after fee rebate): ${scenario.model.netTreasuryCostPerSweep.toFixed(2)} PRGX`);
      console.log(`    Adoption scenarios:`);
      Object.entries(adoptionScenarios).forEach(([key, val]) => {
        const daysSupply = Math.floor(val / 100); // assuming 100 sweeps/day avg
        console.log(`      ${key}: ${val.toLocaleString()} sweeps (~${daysSupply} days at 100/day)`);
      });
    }
  }

  async calculateSustainability() {
    console.log('\n⏳ Calculating treasury sustainability...');
    
    // Time horizons (days)
    const horizons = [30, 90, 180, 365];
    
    for (const scenario of this.results.scenarios) {
      const model = scenario.model;
      const dailySweeps = 100; // Baseline assumption
      
      const timeline = {};
      
      for (const days of horizons) {
        const totalSweeps = dailySweeps * days;
        const prgxUsed = totalSweeps * model.bonus;
        const feeRevenue = totalSweeps * model.treasuryGainPerSweepPRGX;
        const netBurn = prgxUsed - feeRevenue;
        
        const remainingTreasury = this.config.treasuryAllocation - netBurn;
        const depletionDate = Math.max(0, Math.floor(remainingTreasury / (dailySweeps * model.bonus)));
        
        timeline[days] = {
          totalSweeps,
          prgxUsed,
          feeRevenue,
          netBurn,
          remainingTreasury,
          depletionDateDays: remainingTreasury > 0 ? depletionDate : 0,
          status: remainingTreasury > 0 ? 'healthy' : 'depleted'
        };
      }
      
      model.sustainability = timeline;
      
      console.log(`\n  [${scenario.name}] Sustainability Projection:`);
      horizons.forEach(days => {
        const t = timeline[days];
        console.log(`    ${days}d: ${t.status === 'healthy' ? '✅' : '❌'} Treasury: ${Math.max(0, t.remainingTreasury).toLocaleString()} PRGX left${t.status === 'depleted' ? ' (DEPLETED)' : ''}`);
      });
    }
  }

  async generateRecommendation() {
    console.log('\n💡 Generating recommendation...');
    
    // Find scenario with best balance
    const viableScenarios = this.results.scenarios.filter(s => {
      const t = s.model.sustainability[365];
      return t.status === 'healthy' && t.remainingTreasury > this.config.treasuryAllocation * 0.2;
    });
    
    let recommended = null;
    
    if (viableScenarios.length > 0) {
      // Pick highest bonus that's still viable
      recommended = viableScenarios.reduce((best, curr) => 
        curr.bonus > best.bonus ? curr : best
      );
    } else {
      // All scenarios deplete - pick one with longest runway
      recommended = this.results.scenarios.reduce((best, curr) => {
        const bestDepletion = best.model.sustainability[365].depletionDateDays || 0;
        const currDepletion = curr.model.sustainability[365].depletionDateDays || 0;
        return currDepletion > bestDepletion ? curr : best;
      });
    }
    
    // Adjust based on additional revenue (staking, other)
    const expectedAnnualRevenue = 1_000_000; // Estimate from staking and other fees
    const adjustedTreasury = this.config.treasuryAllocation + expectedAnnualRevenue;
    
    this.results.recommendation = {
      scenario: recommended.name,
      bonus: recommended.bonus,
      rationale: `Recommended: ${recommended.name} (${recommended.bonus} PRGX)`,
      reasoning: [
        `Cost per sweep: $${recommended.model.costPerSweepUSD.toFixed(6)}`,
        `Max sweeps supported: ${recommended.model.maxSweeps.toLocaleString()}`,
        `Treasury runway: ${recommended.model.sustainability[365].depletionDateDays || 0} days at 100 sweeps/day`,
        `Fee rebate reduces net cost by ${(recommended.model.treasuryGainPerSweepPRGX / recommended.bonus * 100).toFixed(1)}%`,
        `With additional revenue, scenario becomes more sustainable`
      ],
      caveats: [
        'Assumes 100 sweeps/day baseline',
        'Fee revenue helps extend runway',
        'May need treasury top-up or bonus reduction after 6 months',
        'Monitor adoption rate closely'
      ]
    };
    
    console.log(`\n  🎯 RECOMMENDATION: ${recommended.name} (${recommended.bonus} PRGX)`);
    console.log(`     Reasonable cost: $${recommended.model.costPerSweepUSD.toFixed(6)}/sweep`);
    console.log(`     Treasury runway: ${recommended.model.sustainability[365].depletionDateDays || 0} days`);
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TREASURY ANALYSIS REPORT');
    console.log('='.repeat(60));
    
    console.log('\n💰 MODEL PARAMETERS');
    console.log(`  Treasury allocation: ${this.config.treasuryAllocation.toLocaleString()} PRGX`);
    console.log(`  PRGX price: $${this.config.prgxPriceUSD.toFixed(8)}`);
    console.log(`  Sweep fee: ${this.config.sweepFeePercent * 100}%`);
    
    console.log('\n📊 SCENARIO COMPARISON');
    for (const scenario of this.results.scenarios) {
      const m = scenario.model;
      console.log(`\n  [${scenario.name}] (${m.bonus} PRGX)`);
      console.log(`    Cost/sweep: $${m.costPerSweepUSD.toFixed(6)}`);
      console.log(`    Max sweeps: ${m.maxSweeps.toLocaleString()}`);
      console.log(`    1-year treasury: ${m.sustainability[365].remainingTreasury.toLocaleString()} PRGX (${m.sustainability[365].status})`);
    }
    
    console.log('\n🎯 RECOMMENDATION');
    console.log(`  ${this.results.recommendation.rationale}`);
    console.log('\n  Reasoning:');
    this.results.recommendation.reasoning.forEach(r => console.log(`    • ${r}`));
    
    console.log('\n⚠️ CAVEATS');
    this.results.recommendation.caveats.forEach(c => console.log(`    • ${c}`));
    
    console.log('\n' + '='.repeat(60));
    
    // Save results
    const fs = require('fs');
    const path = require('path');
    const filename = `treasury-analysis-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(
      path.join(__dirname, 'research-results', filename),
      JSON.stringify(this.results, null, 2)
    );
    console.log(`\n✅ Results saved: ${filename}`);
  }
}

if (require.main === module) {
  const agent = new TreasuryAnalysisAgent();
  agent.run().catch(console.error);
}

module.exports = TreasuryAnalysisAgent;
