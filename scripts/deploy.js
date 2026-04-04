// PurgeX Deployment Script - Robust Version
require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');

async function main() {
  console.log('🚀 Starting PurgeX deployment on PulseChain...\n');

  // Load configuration
  const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  console.log('🔧 Configuration check:');
  console.log(`   RPC_URL: ${RPC_URL}`);
  console.log(`   PRIVATE_KEY set: ${PRIVATE_KEY ? 'YES' : 'NO'}`);
  console.log(`   PRIVATE_KEY length: ${PRIVATE_KEY ? PRIVATE_KEY.length : 0}`);

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  console.log('\n🔌 Connecting to provider...');
  try {
    const provider = hre.ethers.provider;
    const network = await provider.getNetwork();
    console.log(`   Connected to network: ${network.name} (chainId: ${network.chainId})`);
  } catch (error) {
    console.error('❌ Failed to connect to provider:', error.message);
    process.exit(1);
  }

  // Get deployer account from Hardhat configuration
  console.log('\n👛 Getting deployer account...');
  let deployer;
  try {
    const signers = await hre.ethers.getSigners();
    deployer = signers[0];
    console.log(`   Deployer: ${deployer.address}`);
  } catch (error) {
    console.error('❌ Failed to get signer:', error.message);
    process.exit(1);
  }

  // Check balance
  console.log('\n💰 Checking balance...');
  try {
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`   Balance: ${balance.toString()} wei (${hre.ethers.formatEther(balance)} PLS)`);

    if (balance < hre.ethers.parseEther('0.01')) {
      console.warn('⚠️  WARNING: Balance is low. Deployment may fail due to insufficient gas.');
    }

    // Check pending transactions
    console.log('\n🔍 Checking for pending transactions...');
    const pendingCount = await hre.ethers.provider.getTransactionCount(deployer.address, 'pending');
    const latestCount = await hre.ethers.provider.getTransactionCount(deployer.address, 'latest');
    console.log(`   Pending tx count: ${pendingCount}`);
    console.log(`   Latest tx count: ${latestCount}`);
    
    if (pendingCount > latestCount) {
      console.log(`⚠️  There are ${pendingCount - latestCount} pending transactions.`);
      console.log('   Using higher gas price to replace stuck transactions...');
    }
    
    // Use latest nonce with higher gas to replace any stuck transactions
    const nonce = latestCount;
    console.log(`   Using nonce: ${nonce} (latest) to replace stuck txs`);
  } catch (error) {
    console.error('❌ Failed to get balance/nonce:', error.message);
    process.exit(1);
  }

  try {
    // Deploy PurgeXSweeper first (simpler contract)
    console.log('\n🧹 Deploying PurgeXSweeper first...');
    const PULSE_X_ROUTER = '0x165C3410fC91EF562C50559f7d2289fEbed552d9';
    const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
    
    console.log('   Constructor args:');
    console.log(`     tokenAddress: ${deployer.address} // Using deployer as placeholder`);
    console.log(`     PULSE_X_ROUTER: ${PULSE_X_ROUTER}`);
    console.log(`     WPLS: ${WPLS}`);
    console.log(`     feeRecipient: ${deployer.address}`);
    
    console.log('   Getting contract factory...');
    const PurgeXSweeper = await hre.ethers.getContractFactory('PurgeXSweeper');
    
    // Alternative: Use a fresh approach - skip nonce management and let ethers handle it
    console.log('   Letting ethers handle nonce automatically...');
    const sweeper = await PurgeXSweeper.deploy(deployer.address, PULSE_X_ROUTER, WPLS, deployer.address);
    console.log('   Transaction sent, waiting for receipt...');
    const sweeperReceipt = await sweeper.deploymentTransaction().wait();
    console.log('   Getting deployed address...');
    const sweeperAddress = await sweeper.getAddress();
    console.log(`✅ PurgeXSweeper deployed at: ${sweeperAddress}`);
    console.log(`   Transaction: ${sweeper.deploymentTransaction().hash}`);
    console.log(`   Gas used: ${sweeperReceipt.gasUsed.toString()}\n`);

    // Deploy PurgeXToken second
    console.log('📜 Deploying PurgeXToken...');
    console.log('   Getting contract factory...');
    const PurgeXToken = await hre.ethers.getContractFactory('PurgeXToken');
    console.log('   Creating deployment transaction...');
    const token = await PurgeXToken.deploy();
    console.log('   Transaction sent, waiting for receipt...');
    const tokenReceipt = await token.deploymentTransaction().wait();
    console.log('   Getting deployed address...');
    const tokenAddress = await token.getAddress();
    console.log(`✅ PurgeXToken deployed at: ${tokenAddress}`);
    console.log(`   Transaction: ${token.deploymentTransaction().hash}`);
    console.log(`   Gas used: ${tokenReceipt.gasUsed.toString()}\n`);

    // Update .env file
    const envPath = '.env';
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Replace or add addresses
    envContent = envContent.replace(/PRGX_TOKEN_ADDRESS=.*/g, `PRGX_TOKEN_ADDRESS=${tokenAddress}`);
    envContent = envContent.replace(/SWEEPER_CONTRACT_ADDRESS=.*/g, `SWEEPER_CONTRACT_ADDRESS=${sweeperAddress}`);

    if (!envContent.includes('PRGX_TOKEN_ADDRESS=')) {
      envContent += `\nPRGX_TOKEN_ADDRESS=${tokenAddress}`;
    }
    if (!envContent.includes('SWEEPER_CONTRACT_ADDRESS=')) {
      envContent += `\nSWEEPER_CONTRACT_ADDRESS=${sweeperAddress}`;
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');
    console.log('📝 Updated .env file with contract addresses\n');

    // Verification info
    console.log('📋 Post-Deployment Checklist:');
    console.log('1. Verify contracts on PulseXScan:');
    console.log(`   - Token: https://scan.pulsechain.com/address/${tokenAddress}`);
    console.log(`   - Sweeper: https://scan.pulsechain.com/address/${sweeperAddress}`);
    console.log('2. Add PRGX token to your wallet:');
    console.log(`   Address: ${tokenAddress}`);
    console.log('   Symbol: PRGX, Decimals: 18');
    console.log('3. Fund the sweeper contract with PLS for gas (if using bot)');
    console.log('4. Update frontend/app.js with these addresses');
    console.log('5. Run verification: npm run verify\n');

    console.log('🎉 PURGEX DEPLOYMENT COMPLETE! 🧹✨');

  } catch (error) {
    console.error('\n❌ Deployment failed:');
    console.error('   Error code:', error.code);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    
    if (error.code === 'NETWORK_ERROR') {
      console.error('   Network error: Cannot connect to RPC');
      console.error(`   Check RPC_URL: ${RPC_URL}`);
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('   Insufficient funds for gas');
    } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      console.error('   Transaction would revert - check contract code or constructor args');
    } else if (error.code === 'INVALID_ARGUMENT') {
      console.error('   Invalid argument - check constructor parameters');
    } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      console.error('   Gas estimation failed - contract might revert during deployment');
    } else if (error.message && error.message.includes('nonce')) {
      console.error('   Nonce error - try resetting your wallet or waiting for pending transactions');
    } else if (error.message && error.message.includes('gas')) {
      console.error('   Gas-related error - try increasing gas price in hardhat.config.js');
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;
