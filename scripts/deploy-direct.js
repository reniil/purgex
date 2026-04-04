// Direct deployment script without Hardhat bootstrap
require('dotenv').config();
const { ethers } = require('ethers');

async function deploy() {
  const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  // Connect to PulseChain
  console.log('🔌 Connecting to PulseChain...');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`📦 Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} PLS`);

  // Check balance
  if (balance < ethers.parseEther('0.1')) {
    console.error('❌ Insufficient balance (need at least 0.1 PLS for gas)');
    process.exit(1);
  }

  // Read contract bytecode
  const fs = require('fs');
  const tokenArtifact = JSON.parse(fs.readFileSync('artifacts/contracts/PurgeXToken.sol/PurgeXToken.json', 'utf8'));
  const sweeperArtifact = JSON.parse(fs.readFileSync('artifacts/contracts/PurgeXSweeper.sol/PurgeXSweeper.json', 'utf8'));

  // Constants
  const PULSE_X_ROUTER = '0x165C3410fC91EF562C50559f7d2289fEbed552d9';
  const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

  // Deploy token
  console.log('📜 Deploying PurgeXToken...');
  const tokenFactory = new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    wallet
  );

  // Set higher gas price and limit
  const gasPrice = ethers.parseUnits('20', 'gwei'); // 20 gwei
  const gasLimit = 3000000;

  try {
    const token = await tokenFactory.deploy({ gasPrice, gasLimit });
    console.log(`   Tx hash: ${token.deploymentTransaction().hash}`);
    console.log('   Waiting for deployment (may take a few minutes)...');

    const tokenReceipt = await token.waitForDeployment({ wait: 60, pollTxInterval: 5000 });
    const tokenAddress = token.target;
    console.log(`✅ PurgeXToken deployed at: ${tokenAddress}\n`);

    // Deploy sweeper
    console.log('🧹 Deploying PurgeXSweeper...');
    const sweeperFactory = new ethers.ContractFactory(
      sweeperArtifact.abi,
      sweeperArtifact.bytecode,
      wallet
    );

    // Encode constructor args
    const iface = new ethers.Interface(sweeperArtifact.abi);
    const encodedArgs = iface.encodeDeploy([tokenAddress, PULSE_X_ROUTER, WPLS, wallet.address]);

    const sweeper = await sweeperFactory.deploy(encodedArgs, { gasPrice, gasLimit: 4000000 });
    console.log(`   Tx hash: ${sweeper.deploymentTransaction().hash}`);
    console.log('   Waiting for deployment...');

    const sweeperReceipt = await sweeper.waitForDeployment({ wait: 60, pollTxInterval: 5000 });
    const sweeperAddress = sweeper.target;
    console.log(`✅ PurgeXSweeper deployed at: ${sweeperAddress}\n`);

    // Save to .env
    const envContent = `PRGX_TOKEN_ADDRESS=${tokenAddress}
SWEEPER_CONTRACT_ADDRESS=${sweeperAddress}
RPC_URL=${RPC_URL}
PRIVATE_KEY=${PRIVATE_KEY}`;
    fs.writeFileSync('.env', envContent, 'utf8');
    console.log('📝 Updated .env\n');

    // Done
    console.log('🎉 DEPLOYMENT SUCCESSFUL!');
    console.log('\n📋 Next steps:');
    console.log(`1. Verify on PulseXScan:`);
    console.log(`   Token: https://scan.pulsechain.com/address/${tokenAddress}`);
    console.log(`   Sweeper: https://scan.pulsechain.com/address/${sweeperAddress}`);
    console.log('2. Add PRGX token to your wallet');
    console.log('3. Update frontend/app.js with these addresses');
    console.log('4. Run: npm run verify\n');

  } catch (error) {
    console.error('\n❌ Deployment failed:');
    console.error(error);
    process.exit(1);
  }
}

deploy();
