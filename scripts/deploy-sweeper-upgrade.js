// ================================================================
// PURGEX SWEEPER UPGRADE DEPLOYMENT
// ================================================================
// Deploys upgraded Sweeper with:
// - 5% fee (was 1%)
// - 50% fee burning
// - 100 PRGX bonus per token
// - Bonus wallet configuration
// ================================================================

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
  console.log('🚀 PurgeX Sweeper Upgrade Deployment\n');
  console.log('=' .repeat(60));

  const RPC_URL = process.env.RPC_URL || 'https://pulsechain.publicnode.com';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('\n👛 Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // ========== CONFIGURATION ==========
  const PRGX_TOKEN = '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0';
  const PULSE_X_ROUTER = '0x165C3410fC91EF562C50559f7d2289fEbed552d9';
  const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
  const BONUS_WALLET = '0x59b6cDfA0282176939F0EDF5056a53Be113298b6';
  const TREASURY = wallet.address; // fee recipient

  console.log('\n📋 Deployment Config:');
  console.log('  PRGX Token:    ', PRGX_TOKEN);
  console.log('  PulseX Router: ', PULSE_X_ROUTER);
  console.log('  WPLS:          ', WPLS);
  console.log('  Treasury:      ', TREASURY);
  console.log('  Bonus Wallet:  ', BONUS_WALLET);

  // ========== DEPLOY NEW SWEEPER ==========
  try {
    console.log('\n\n🧹 Deploying UPGRADED PurgeXSweeper...');
    console.log('  Features: 5% fee, 50% burn, 100 PRGX bonus/token');

    const sweeperArtifact = JSON.parse(
      fs.readFileSync('artifacts/contracts/PurgeXSweeper.sol/PurgeXSweeper.json', 'utf8')
    );

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
    const newAddress = await contract.getAddress();

    console.log('\n✅ NEW Sweeper deployed:', newAddress);
    console.log('   Block:', receipt.blockNumber);
    console.log('   Gas used:', receipt.gasUsed.toString());

    // ========== CONFIGURE BONUS WALLET ==========
    console.log('\n🔧 Configuring bonus wallet...');
    const setBonusTx = await contract.setBonusWallet(BONUS_WALLET);
    await setBonusTx.wait();
    console.log('  ✅ Bonus wallet set to:', BONUS_WALLET);

    // ========== VERIFY SETTINGS ==========
    console.log('\n🔍 Verifying configuration...');

    const feeBps = await contract.getProtocolFee();
    const feePercent = ethers.formatUnits(feeBps, 4);
    console.log(`  Fee percentage: ${feePercent}% (target: 5%)`);

    const bonusWallet = await contract.bonusWallet();
    console.log(`  Bonus wallet: ${bonusWallet}`);
    console.log(`  Matches target: ${bonusWallet.toLowerCase() === BONUS_WALLET.toLowerCase() ? '✅' : '❌'}`);

    // Check PRGX balance in bonus wallet
    const prgx = new ethers.Contract(PRGX_TOKEN, [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint256)'
    ], provider);

    const bonusBalance = await prgx.balanceOf(bonusWallet);
    const decimals = await prgx.decimals();
    const formatted = ethers.formatUnits(bonusBalance, decimals);
    console.log(`  Bonus wallet balance: ${formatted} PRGX`);

    if (parseFloat(formatted) < 10_000_000) {
      console.warn('  ⚠️  Warning: Bonus wallet has < 10M PRGX');
    } else {
      console.log('  ✅ Bonus wallet sufficiently funded');
    }

    // ========== OLD CONTRACT INFO ==========
    console.log('\n📜 Old Contract (for reference):');
    console.log('  Address:', process.env.SWEEPER_CONTRACT_ADDRESS);
    console.log('  Status: Still live (will be deprecated)');

    // ========== UPDATE .ENV ==========
    console.log('\n📝 Updating .env file...');
    let envContent = fs.readFileSync('.env', 'utf8');
    envContent = envContent.replace(
      /SWEEPER_CONTRACT_ADDRESS=.*/g,
      `SWEEPER_CONTRACT_ADDRESS=${newAddress}`
    );
    // Mark upgrade
    if (!envContent.includes('SWEEPER_UPGRADED')) {
      envContent += `\n# Sweeper upgrade (2026-04-06)\nSWEEPER_UPGRADED=true\nOLD_SWEEPER_ADDRESS=${process.env.SWEEPER_CONTRACT_ADDRESS}\nNEW_SWEEPER_ADDRESS=${newAddress}\n`;
    }
    fs.writeFileSync('.env', envContent);
    console.log('  ✅ .env updated');

    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(60));
    console.log('🎉 UPGRADE DEPLOYMENT SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`  Old Sweeper: ${process.env.SWEEPER_CONTRACT_ADDRESS}`);
    console.log(`  New Sweeper: ${newAddress}`);
    console.log(`  Fee structure: ${feePercent}% (50% burn, 30% treasury, 20% staking)`);
    console.log(`  Bonus wallet: ${bonusWallet} (${formatted} PRGX)`);
    console.log('\n⚠️  NEXT STEPS:');
    console.log('  1. Update frontend config.js with new Sweeper address');
    console.log('  2. Test sweep flow (should get 100 PRGX bonus per token)');
    console.log('  3. Announce upgrade to users');
    console.log('  4. Monitor fee burning on blockchain');
    console.log('  5. Deprecate old sweeper after migration period');
    console.log('\n🚀 Phase 3 (Marketing) can now begin!');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.transaction) {
      console.error('Tx hash:', error.transaction.hash);
    }
    console.error(error);
  }
}

main().catch(console.error);
