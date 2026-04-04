// Simple deployment script - bypass Hardhat nonce issues
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
  console.log('🚀 Simple PurgeX Deployment - Direct Ethers Approach\n');

  const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  // Create provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('📦 Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // Contract bytecode and ABI (simplified - just deploy what we have)
  try {
    // Read compiled artifacts
    const tokenArtifact = JSON.parse(fs.readFileSync('artifacts/contracts/PurgeXToken.sol/PurgeXToken.json', 'utf8'));
    const sweeperArtifact = JSON.parse(fs.readFileSync('artifacts/contracts/PurgeXSweeper.sol/PurgeXSweeper.json', 'utf8'));

    // Deploy PurgeXSweeper only (token already deployed)
    console.log('\n🧹 Deploying PurgeXSweeper...');
    const PULSE_X_ROUTER = '0x165C3410fC91EF562C50559f7d2289fEbed552d9';
    const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
    const TOKEN_ADDRESS = '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0';
    
    const sweeperFactory = new ethers.ContractFactory(sweeperArtifact.abi, sweeperArtifact.bytecode, wallet);
    
    const sweeperContract = await sweeperFactory.deploy(
      TOKEN_ADDRESS, 
      PULSE_X_ROUTER, 
      WPLS, 
      wallet.address,
      {
        gasLimit: 5000000,
        gasPrice: ethers.parseUnits('5', 'gwei') // Higher gas to avoid nonce conflicts
      }
    );
    
    console.log('⏳ Sweeper deployment tx:', sweeperContract.deploymentTransaction().hash);
    const sweeperReceipt = await sweeperContract.waitForDeployment();
    const sweeperAddress = await sweeperContract.getAddress();
    console.log('✅ PurgeXSweeper deployed:', sweeperAddress);

    // Update .env
    let envContent = fs.readFileSync('.env', 'utf8');
    envContent = envContent.replace(/SWEEPER_CONTRACT_ADDRESS=.*/g, `SWEEPER_CONTRACT_ADDRESS=${sweeperAddress}`);
    fs.writeFileSync('.env', envContent);
    console.log('\n📝 Updated .env file');

    console.log('\n🎉 DEPLOYMENT SUCCESSFUL!');
    console.log('Token:', TOKEN_ADDRESS);
    console.log('Sweeper:', sweeperAddress);

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.transaction) {
      console.error('Transaction hash:', error.transaction.hash);
    }
  }
}

main().catch(console.error);
