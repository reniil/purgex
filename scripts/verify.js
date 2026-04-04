// Quick verification script for deployed contracts
require('dotenv').config();
const { ethers } = require('ethers');

async function verify() {
  const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
  const SWEEPER_ADDRESS = process.env.SWEEPER_CONTRACT_ADDRESS;
  const PRGX_ADDRESS = process.env.PRGX_TOKEN_ADDRESS;

  if (!SWEEPER_ADDRESS || SWEEPER_ADDRESS.startsWith('0x0000')) {
    console.error('❌ SWEEPER_CONTRACT_ADDRESS not set in .env');
    process.exit(1);
  }

  if (!PRGX_ADDRESS || PRGX_ADDRESS.startsWith('0x0000')) {
    console.error('❌ PRGX_TOKEN_ADDRESS not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log('🔍 Verifying PurgeX Contracts on PulseChain...\n');

  try {
    // Check PRGX Token
    console.log('📜 PurgeX Token (PRGX):');
    console.log(`   Address: ${PRGX_ADDRESS}`);

    const tokenAbi = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function totalSupply() view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function balanceOf(address) view returns (uint256)'
    ];

    const token = new ethers.Contract(PRGX_ADDRESS, tokenAbi, provider);
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const decimals = await token.decimals();

    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Total Supply: ${ethers.formatUnits(totalSupply, decimals)} ${symbol}`);
    console.log('   ✅ Token contract verified\n');

    // Check Sweeper
    console.log('🧹 PurgeXSweeper:');
    console.log(`   Address: ${SWEEPER_ADDRESS}`);

    const sweeperAbi = [
      'function prgxToken() view returns (address)',
      'function pulseXRouter() view returns (address)',
      'function wpls() view returns (address)',
      'function protocolFeeBps() view returns (uint256)',
      'function feeRecipient() view returns (address)'
    ];

    const sweeper = new ethers.Contract(SWEEPER_ADDRESS, sweeperAbi, provider);
    const prgxToken = await sweeper.prgxToken();
    const pulseXRouter = await sweeper.pulseXRouter();
    const wpls = await sweeper.wpls();
    const feeBps = await sweeper.protocolFeeBps();
    const feeRecipient = await sweeper.feeRecipient();

    console.log(`   PRGX Token: ${prgxToken}`);
    console.log(`   PulseX Router: ${pulseXRouter}`);
    console.log(`   WPLS: ${wpls}`);
    console.log(`   Protocol Fee: ${feeBps / 100}%`);
    console.log(`   Fee Recipient: ${feeRecipient}`);
    console.log('   ✅ Sweeper contract verified\n');

    // Validate connections
    if (prgxToken.toLowerCase() !== PRGX_ADDRESS.toLowerCase()) {
      console.warn('   ⚠️ Sweeper PRGX token address does not match .env PRGX_ADDRESS!');
    } else {
      console.log('   ✅ PRGX token correctly configured in sweeper');
    }

    console.log('\n🎉 All contracts verified successfully!');
    console.log('\n📝 Frontend Setup:');
    console.log('   Edit frontend/app.js config:');
    console.log(`   CONFIG.SWEEPER_ADDRESS = '${SWEEPER_ADDRESS}';`);
    console.log(`   CONFIG.PRGX_ADDRESS = '${PRGX_ADDRESS}';`);
    console.log('\n🚀 Then open frontend/index.html in your browser.\n');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  verify();
}

module.exports = verify;
