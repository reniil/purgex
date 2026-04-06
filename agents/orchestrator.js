// ================================================================
// PURGEX AGENT ORCHESTRATOR - Multi-Agent Research System
// ================================================================
// Spawns specialized research agents to analyze PRGX ecosystem
// ================================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PurgeXAgentOrchestrator {
  constructor() {
    this.agents = [];
    this.resultsDir = path.join(__dirname, 'research-results');
    
    // Ensure results directory exists
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  // ================================================================
  // AGENT DEFINITIONS
  // ================================================================
  
  getAgentConfigs() {
    return [
      {
        id: 'tokenomics-analyst',
        name: 'Tokenomics Analyst',
        script: 'agents/research-tokenomics.js',
        purpose: 'Analyze PRGX price, liquidity, volume; recommend bonus amounts'
      },
      {
        id: 'competitor-research',
        name: 'Competitor Researcher',
        script: 'agents/research-competitors.js',
        purpose: 'Research similar protocols: DustSweep, TokenCleaner, etc.'
      },
      {
        id: 'treasury-modeler',
        name: 'Treasury Modeler',
        script: 'agents/treasury-analysis.js',
        purpose: 'Model treasury sustainability under different bonus scenarios'
      },
      {
        id: 'liquidity-strategist',
        name: 'Liquidity Strategist',
        script: 'agents/liquidity-analysis.js',
        purpose: 'Optimize liquidity deployment across pools'
      },
      {
        id: 'community-growth',
        name: 'Community Growth Agent',
        script: 'agents/growth-analysis.js',
        purpose: 'Project user acquisition, retention, and viral coefficient'
      }
    ];
  }

  // ================================================================
  // DEPLOY ALL AGENTS
  // ================================================================
  
  async deployAll() {
    console.log('🚀 Deploying PurgeX Research Agent Fleet...\n');
    
    const configs = this.getAgentConfigs();
    const agents = [];
    
    for (const config of configs) {
      console.log(`📦 Preparing agent: ${config.name} (${config.id})`);
      
      try {
        const agent = await this.spawnAgent(config);
        agents.push(agent);
        console.log(`  ✅ Agent spawned (PID: ${agent.process.pid})`);
      } catch (error) {
        console.error(`  ❌ Failed to spawn ${config.name}:`, error.message);
      }
    }
    
    console.log(`\n🎯 ${agents.length} agents deployed. Monitoring...`);
    
    // Monitor all agents
    this.mitor(agents);
  }

  // ================================================================
  // SPAWN SINGLE AGENT
  // ================================================================
  
  spawnAgent(config) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, config.script);
      
      // Check if script exists
      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Script not found: ${scriptPath}`));
        return;
      }
      
      const child = spawn('node', [scriptPath], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      
      const agent = {
        id: config.id,
        name: config.name,
        config,
        process: child,
        stdout: [],
        stderr: [],
        exitCode: null,
        resultFile: path.join(this.resultsDir, `${config.id}.json`)
      };
      
      // Capture output
      child.stdout.on('data', (data) => {
        const line = data.toString().trim();
        agent.stdout.push(line);
        console.log(`[${config.id}] ${line}`);
      });
      
      child.stderr.on('data', (data) => {
        const line = data.toString().trim();
        agent.stderr.push(line);
        console.error(`[${config.id}] ERROR: ${line}`);
      });
      
      child.on('close', (code) => {
        agent.exitCode = code;
        console.log(`\n🏁 Agent ${config.name} exited with code ${code}`);
        
        // Check for result file
        if (fs.existsSync(agent.resultFile)) {
          try {
            const result = JSON.parse(fs.readFileSync(agent.resultFile, 'utf8'));
            agent.result = result;
            console.log(`  📊 Results saved: ${agent.resultFile}`);
          } catch (error) {
            console.warn(`  ⚠️ Failed to parse result file:`, error.message);
          }
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
      
      // Give it a moment to start
      setTimeout(() => resolve(agent), 100);
    });
  }

  // ================================================================
  // MONITOR AGENTS
  // ================================================================
  
  monitor(agents) {
    const checkInterval = setInterval(() => {
      const running = agents.filter(a => !a.exitCode);
      const completed = agents.filter(a => a.exitCode !== null);
      
      console.log(`\n📊 Status: ${running.length} running, ${completed.length} completed`);
      
      if (running.length === 0) {
        clearInterval(checkInterval);
        console.log('\n✅ All agents completed!');
        this.aggregateResults(agents);
      }
    }, 10000); // Check every 10 seconds
  }

  // ================================================================
  // AGGREGATE RESULTS
  // ================================================================
  
  aggregateResults(agents) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESEARCH RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    const summary = {
      timestamp: new Date().toISOString(),
      agents: [],
      consolidatedRecommendations: []
    };
    
    for (const agent of agents) {
      if (agent.result) {
        summary.agents.push({
          id: agent.id,
          name: agent.name,
          success: true,
          result: agent.result
        });
        
        // Collect recommendations
        if (agent.result.recommendations) {
          summary.consolidatedRecommendations.push(...agent.result.recommendations);
        }
      } else {
        summary.agents.push({
          id: agent.id,
          name: agent.name,
          success: false,
          error: agent.stderr.join('\n')
        });
      }
    }
    
    // Save master summary
    const summaryFile = path.join(this.resultsDir, `summary-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`\n✅ Master summary saved: ${summaryFile}`);
    
    // Print key findings
    console.log('\n🔑 KEY FINDINGS:');
    
    for (const agent of summary.agents) {
      if (agent.success) {
        console.log(`\n  [${agent.name}]`);
        if (agent.result.summary) {
          Object.entries(agent.result.summary).forEach(([key, value]) => {
            console.log(`    ${key}: ${value}`);
          });
        }
      }
    }
    
    console.log('\n📝 CONSOLIDATED RECOMMENDATIONS:');
    for (const rec of summary.consolidatedRecommendations) {
      console.log(`\n  [${rec.category}]`);
      console.log(`    → ${rec.recommendation}`);
    }
  }
}

// ================================================================
// CLI ENTRY
// ================================================================

if (require.main === module) {
  const orchestrator = new PurgeXAgentOrchestrator();
  
  // Check command line args
  const args = process.argv.slice(2);
  
  if (args.includes('--deploy') || args.length === 0) {
    orchestrator.deployAll().catch(console.error);
  } else if (args.includes('--list')) {
    console.log('Available agents:');
    orchestrator.getAgentConfigs().forEach(agent => {
      console.log(`  ${agent.id}: ${agent.name}`);
      console.log(`    Purpose: ${agent.purpose}`);
      console.log(`    Script: ${agent.script}\n`);
    });
  } else {
    console.log('Usage: node agents/orchestrator.js [--deploy|--list]');
    process.exit(1);
  }
}

module.exports = PurgeXAgentOrchestrator;
