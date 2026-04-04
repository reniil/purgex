// Quick verification of deployed sweeper
require('dotenv').config();
const { ethers } = require('ethers');

async function verifySweeper() {
  const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
  const SWEEPER_ADDRESS = '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575';
  const PRGX_ADDRESS = '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0';

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log('🔍 Verifying PurgeXSweeper deployment...\n');

  try {
    // Check if code exists at address
    const code = await provider.getCode(SWEEPER_ADDRESS);
    if (code === '0x') {
      console.error('❌ No contract code at sweeper address');
      process.exit(1);
    }
    console.log('✅ Sweeper contract exists on-chain');

    // Read configuration
    const iface = new ethers.Interface([
      'function prgxToken() view returns (address)',
      'function pulseXRouter() view returns (address)',
      'function wpls() view returns (address)',
      'function protocolFeeBps() view returns (uint256)',
      'function feeRecipient() view returns (address)'
    ]);

    const sweeper = new ethers.Contract(SWEEPER_ADDRESS, iface, provider);

    const [
      prgxToken,
      pulseXRouter,
      wpls,
      feeBps,
      feeRecipient
    ] = await Promise.all([
      sweeper.prgxToken(),
      sweeper.pulseXRouter(),
      sweeper.wpls(),
      sweeper.protocolFeeBps(),
      sweeper.feeRecipient()
    ]);

    console.log('\n📊 Sweeper Configuration:');
    console.log(`   PRGX Token: ${prgxToken}`);
    console.log(`   Matches deployed token? ${prgxToken.toLowerCase() === PRGX_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO'}`);
    console.log(`   PulseX Router: ${pulseXRouter}`);
    console.log(`   WPLS: ${wpls}`);
    console.log(`   Protocol Fee: ${feeBps / 100}%`);
    console.log(`   Fee Recipient: ${feeRecipient}`);

    // Check PRGX token total supply
    const tokenIface = new ethers.Interface([
      'function totalSupply() view returns (uint256)',
      'function name() view returns (string)',
      'function symbol() view returns (string)'
    ]);
    const token = new ethers.Contract(PRGX_ADDRESS, tokenIface, provider);
    const [name, symbol, supply] = await Promise.all([
      token.name(),
      token.symbol(),
      token.totalSupply()
    ]);

    console.log('\n💰 PRGX Token Info:');
    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Total Supply: ${ethers.formatUnits(supply, 18)}`);

    console.log('\n🎉 Sweeper deployment verified!');
    console.log('\n📝 Next:');
    console.log('1. Verify on PulseXScan');
    console.log('2. Update frontend/app.js with sweeper address');
    console.log('3. Test sweep functionality');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifySweeper();
