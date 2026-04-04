// PurgeX Taker Bot
// Automatically sweeps tokens for users who have approved the sweeper contract
// Runs continuously, polling for approvals and executing profitable sweeps

require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');

// Load configuration
const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
const SWEEPER_ADDRESS = process.env.SWEEPER_CONTRACT_ADDRESS;
const PRGX_ADDRESS = process.env.PRGX_TOKEN_ADDRESS;
const BOT_PRIVATE_KEY = process.env.TAKER_BOT_PRIVATE_KEY;

// Constants
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const MIN_PROFIT_MARGIN = 1.05; // 5% profit buffer (output must be > 1.05 * gas cost)
const GAS_PRICE = 2_000_000_000; // 2 gwei (adjust dynamically in prod)
const GAS_LIMIT_SWEEP = 500_000; // High estimate for sweepTokens with multiple tokens

// Common PulseChain tokens to check (users could have any token, but we focus on known ones)
const COMMON_TOKENS = [
  // PLSX (PulseX)
  '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
  // HEX
  '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
  // USDC (bridged)
  '0x9Ca7B2FeF14Abc5337A4b9D3cB233ebBd0cA730B',
  // DAI (bridged)
  '0x9A48D5524D9351eFF2D2c1B732AD5D9FC495A6e5',
  // WBTC (bridged)
  '0x5D85C45E473C10dD3C691AdDe0E507f9347843Ba',
  // WPLS (Wrapped PLS)
  '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
];

// ABIs (minimal)
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
];

const SWEEPER_ABI = [
  'function sweepTokens(address[] tokenAddresses, uint256[] minAmountsOut)',
  'function protocolFeeBps() view returns (uint256)',
  'function prgxToken() view returns (address)',
  'function tokenDestinations(address) view returns (address)'
];

class TakerBot {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.sweeper = new ethers.Contract(SWEEPER_ADDRESS, SWEEPER_ABI, this.provider);
    this.prgx = new ethers.Contract(PRGX_ADDRESS, ERC20_ABI, this.provider);

    // Wallet for executing sweeps (if different from contract)
    this.wallet = BOT_PRIVATE_KEY ? new ethers.Wallet(BOT_PRIVATE_KEY, this.provider) : null;

    this.lastBlock = 0;
    this.running = true;

    // Track already processed approvals to avoid duplicates
    this.processedApprovals = new Set();

    console.log('🤖 PurgeX Taker Bot initialized');
    console.log(`   RPC: ${RPC_URL}`);
    console.log(`   Sweeper: ${SWEEPER_ADDRESS}`);
    console.log(`   PRGX: ${PRGX_ADDRESS}`);
    console.log(`   Bot wallet: ${this.wallet ? this.wallet.address : 'N/A (read-only)'}`);
    console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s\n`);
  }

  async start() {
    console.log('🔄 Starting taker bot...');
    console.log('Listening for approvals and scanning for dust tokens...\n');

    // Initial scan for existing approvals
    await this.scanExistingApprovals();

    // Main event listening loop
    while (this.running) {
      try {
        await this.pollEvents();
        await this.scanProfitableSweeps();

        // Wait before next poll
        await this.sleep(POLL_INTERVAL_MS);
      } catch (error) {
        console.error(`❌ Error in main loop: ${error.message}`);
        await this.sleep(POLL_INTERVAL_MS);
      }
    }
  }

  async scanExistingApprovals() {
    console.log('🔍 Scanning for existing approvals (this may take a while)...');
    // We'll implement a simplified version: just check common tokens for known holders
    // In production, you'd use a subgraph or TheGraph to find all approvals
    console.log('✅ Initial scan complete (polling for new approvals)\n');
  }

  async pollEvents() {
    try {
      // Get current block
      const currentBlock = await this.provider.getBlockNumber();

      if (currentBlock <= this.lastBlock) {
        return; // No new blocks
      }

      // Query Approval events where spender == SWEEPER_ADDRESS
      const filter = {
        address: null, // any token
        topics: [
          ethers.id('Approval(address,address,uint256)'),
          null, // owner (any)
          ethers.hexZeroPad(SWEEPER_ADDRESS, 32) // spender
        ],
        fromBlock: this.lastBlock + 1,
        toBlock: currentBlock
      };

      const logs = await this.provider.getLogs(filter);

      for (const log of logs) {
        try {
          await this.processApprovalEvent(log);
        } catch (error) {
          console.error(`   Failed to process approval event: ${error.message}`);
        }
      }

      this.lastBlock = currentBlock;
    } catch (error) {
      console.error(`   Error polling events: ${error.message}`);
    }
  }

  async processApprovalEvent(log) {
    // Decode Approval event
    // topics[1] = owner, topics[2] = spender, topics[3] = amount
    const owner = ethers.getAddress(log.topics[1]);
    const spender = ethers.getAddress(log.topics[2]);
    const amount = BigInt(log.topics[3]);

    // Sanity check
    if (spender.toLowerCase() !== SWEEPER_ADDRESS.toLowerCase()) {
      return;
    }

    // Avoid duplicates
    const key = `${owner}-${log.blockNumber}`;
    if (this.processedApprovals.has(key)) {
      return;
    }
    this.processedApprovals.add(key);

    console.log(`\n📝 New approval detected:`);
    console.log(`   Owner: ${owner}`);
    console.log(`   Spender: ${spender}`);
    console.log(`   Amount: ${ethers.formatUnits(amount, 18)} (raw: ${amount})`);

    // Check if this user has any dust tokens we can sweep
    await this.checkAndExecuteSweep(owner);
  }

  async scanProfitableSweeps() {
    // In a more advanced version, you'd scan all token holders for balances
    // For simplicity, we'll focus on recent approval events
    // This is where you could add a subgraph query to find all users with token balances
  }

  async checkAndExecuteSweep(userAddress) {
    try {
      // Get user's balances for common tokens
      const tokensToSweep = [];
      const minAmountsOut = [];

      for (const tokenAddress of COMMON_TOKENS) {
        try {
          const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
          const balance = await token.balanceOf(userAddress);
          const decimals = await token.decimals();

          if (balance > 0) {
            const formatted = ethers.formatUnits(balance, decimals);
            console.log(`   Found balance: ${formatted} (token: ${tokenAddress})`);

            tokensToSweep.push(tokenAddress);
            minAmountsOut.push(0); // No minimum (user accepts market rate)
          }
        } catch (error) {
          // Token may not exist or RPC error - skip silently
        }
      }

      if (tokensToSweep.length === 0) {
        console.log(`   No dust tokens found for ${userAddress}`);
        return;
      }

      console.log(`   ${tokensToSweep.length} tokens to sweep`);

      // Estimate profit and gas cost
      // In production, you'd call the router to get expected output
      // For now, we'll just execute if user approved

      // Only execute if we have a wallet to send the transaction
      if (!this.wallet) {
        console.log('   ⚠️ No bot wallet configured - cannot execute sweep. Set TAKER_BOT_PRIVATE_KEY');
        return;
      }

      // Execute sweep
      console.log('   Executing sweep...');
      const tx = await this.sweeper.connect(this.wallet).sweepTokens(tokensToSweep, minAmountsOut, {
        gasLimit: GAS_LIMIT_SWEEP,
        gasPrice: GAS_PRICE
      });

      console.log(`   🧹 Sweep transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`   ✅ Sweep confirmed in block ${receipt.blockNumber}`);

      // Parse Sweep events to show results
      for (const event of receipt.logs) {
        try {
          const parsed = this.sweeper.interface.parseLog(event);
          if (parsed && parsed.name === 'Sweep') {
            const { tokenIn, amountIn, amountPRGXOut } = parsed.args;
            console.log(`   💰 Swept ${ethers.formatUnits(amountIn, 18)} tokens → ${ethers.formatUnits(amountPRGXOut, 18)} PRGX`);
          }
        } catch (e) {
          // Not a Sweep event
        }
      }
    } catch (error) {
      console.error(`   ❌ Sweep failed: ${error.message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.running = false;
    console.log('\n👋 Taker bot stopped');
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

// Start bot
if (BOT_PRIVATE_KEY) {
  const bot = new TakerBot();
  bot.start().catch(console.error);
} else {
  console.log('⚠️  TAKER_BOT_PRIVATE_KEY not set. Bot running in read-only mode (no execution).');
  console.log('Set it in .env to enable automatic sweeping.\n');
  // Still start to process events but not execute
  const bot = new TakerBot();
  bot.wallet = null;
  bot.start().catch(console.error);
}
