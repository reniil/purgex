// ================================================================
// SWEEPER UPGRADE DEPLOYMENT
// ================================================================
// Deploy new PurgeXSweeper with bonus + fee burning
// Then migrate from old contract (optional)
// ================================================================

require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  console.log('🚀 PurgeX Sweeper Upgrade Deployment\n');

  const RPC_URL = process.env.RPC_URL || 'https://pulsechain.publicnode.com';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('👛 Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // Configuration
  const PRGX_TOKEN = '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0';
  const PULSE_X_ROUTER = '0x165C3410fC91EF562C50559f7d2289fEbed552d9';
  const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
  const BONUS_WALLET = '0x59b6cDfA0282176939F0EDF5056a53Be113298b6'; // 25M PRGX funded
  const TREASURY = wallet.address; // Use deployer as treasury for now

  console.log('\n📋 Configuration:');
  console.log('  PRGX Token:', PRGX_TOKEN);
  console.log('  PulseX Router:', PULSE_X_ROUTER);
  console.log('  WPLS:', WPLS);
  console.log('  Bonus Wallet:', BONUS_WALLET);
  console.log('  Treasury (fee recipient):', TREASURY);

  try {
    // Read artifacts
    const sweeperArtifact = JSON.parse(
      require('fs').readFileSync('artifacts/contracts/PurgeXSweeper.sol/PurgeXSweeper.json', 'utf8')
    );

    console.log('\n🧹 Deploying UPGRADED PurgeXSweeper...');
    const factory = new ethers.ContractFactory(
      sweeperArtifact.abi,
      sweeperArtifact.bytecode,
      wallet
    );

    const contract = await factory.deploy(
      PRGX_TOKEN,
      PULSE_X_ROUTER,
      WPLS,
      TREASURY,
      {
        gasLimit: 5_000_000,
        gasPrice: ethers.parseUnits('5', 'gwei')
      }
    );

    console.log('⏳ Deployment tx:', contract.deploymentTransaction().hash);
    const receipt = await contract.waitForDeployment();
    const address = await contract.getAddress();

    console.log('\n✅ NEW Sweeper deployed:', address);
    console.log('\n🔧 Post-deployment configuration:');

    // Set bonus wallet
    console.log('  Setting bonus wallet...');
    const setBonusTx = await contract.setBonusWallet(BONUS_WALLET);
    await setBonusTx.wait();
    console.log('  ✅ Bonus wallet set to:', BONUS_WALLET);

    // Verify settings
    const feeBps = await contract.getProtocolFee();
    console.log('  📊 Fee percentage:', ethers.formatUnits(feeBps, 4) + '%'); // 5%

    // Check bonus wallet
    const bonusWallet = await contract.bonusWallet();
    console.log('  🎁 Bonus wallet:', bonusWallet);

    // Check PRGX balance in bonus wallet
    const prgx = new ethers.Contract(PRGX_TOKEN, [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint256)'
    ], provider);
    
    const bonusBalance = await prgx.balanceOf(bonusWallet);
    const decimals = await prgx.decimals();
    const formatted = ethers.formatUnits(bonusBalance, decimals);
    console.log('  💰 Bonus wallet balance:', formatted, 'PRGX');

    // Update .env
    const fs = require('fs');
    let envContent = fs.readFileSync('.env', 'utf8');
    envContent = envContent.replace(
      /SWEEPER_CONTRACT_ADDRESS=.*/g,
      `SWEEPER_CONTRACT_ADDRESS=${address}`
    );
    // Add upgrade note
    if (!envContent.includes('SWEEPER_UPGRADED')) {
      envContent += `\n# Sweeper upgrade (Phase 2)\nSWEEPER_UPGRADED=true\nNEW_SWEEPER_ADDRESS=${address}\n`;
    }
    fs.writeFileSync('.env', envContent);
    console.log('\n📝 Updated .env file');

    console.log('\n🎉 UPGRADE DEPLOYMENT COMPLETE!');
    console.log('\n📊 Summary:');
    console.log('  Old Sweeper:', process.env.SWEEPER_CONTRACT_ADDRESS);
    console.log('  New Sweeper:', address);
    console.log('  Fee: 5% (50% burn, 30% treasury, 20% staking)');
    console.log('  Bonus: 100 PRGX per token');
    console.log('  Bonus wallet funded:', formatted, 'PRGX');
    console.log('\n⚠️  NEXT: Update frontend config to use new address');
    console.log('   Then test sweep with bonus! 🧹💰');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.transaction) {
      console.error('Tx hash:', error.transaction.hash);
    }
  }
}

main().catch(console.error);
