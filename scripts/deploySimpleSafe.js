// Deploy Simple 1/1 Safe for PRGX Treasury
require('dotenv').config();
const { ethers } = require('ethers');

// Safe Master Copy on PulseChain
const SAFE_MASTER_COPY = ethers.getAddress('0xd9db270c1b5e3bd161e8c8503c55ceabee709f2b');
const SAFE_PROXY_FACTORY = ethers.getAddress('0xa6b71e26c5e0845f74c812102ca7114b6a896ab2');

async function main() {
  console.log('🏦 Deploying Simple Safe (1/1) for PRGX Treasury...\n');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('📦 Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // Setup for 1/1 Safe (just Ralph as owner)
  const owners = [wallet.address];
  const threshold = 1;
  const to = SAFE_MASTER_COPY;
  const data = '0x';
  const fallbackHandler = '0xf48f2b2d0000000000000000000000000000000000000';
  const paymentToken = '0x0000000000000000000000000000000000000000000';
  const payment = '0';
  const paymentReceiver = '0x0000000000000000000000000000000000000000000';

  // Setup interface
  const setupInterface = new ethers.Interface([
    'function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)'
  ]);

  const setupData = setupInterface.encodeFunctionData('setup', [
    owners,
    threshold,
    to,
    data,
    fallbackHandler,
    paymentToken,
    payment,
    paymentReceiver
  ]);

  // Deploy Safe Proxy
  const ProxyFactory = new ethers.Contract(SAFE_PROXY_FACTORY, [
    'function createProxy(address singleton, bytes memory initData) public returns (address proxy)'
  ], wallet);

  console.log('\n🚀 Deploying Safe...');
  const tx = await ProxyFactory.createProxy(SAFE_MASTER_COPY, setupData, {
    gasLimit: 2000000,
    gasPrice: ethers.parseUnits('2', 'gwei')
  });

  console.log('⏳ Transaction:', tx.hash);
  console.log('🔗 PulseScan: https://scan.pulsechain.com/tx/' + tx.hash);
  
  const receipt = await tx.wait();
  
  // Get Safe address from event
  const proxyCreationEvent = receipt.logs.find(log => {
    try {
      const parsed = ProxyFactory.interface.parseLog(log);
      return parsed.name === 'ProxyCreation';
    } catch {
      return false;
    }
  });

  const safeAddress = proxyCreationEvent.args.proxy;
  console.log('✅ Safe deployed to:', safeAddress);
  console.log('🔗 Safe UI: https://app.safe.global/home?safe=' + safeAddress);
  console.log('🔗 PulseScan: https://scan.pulsechain.com/address/' + safeAddress);

  // Save to .env
  let envContent = require('fs').readFileSync('.env', 'utf8');
  if (!envContent.includes('SAFE_ADDRESS=')) {
    envContent += '\nSAFE_ADDRESS=' + safeAddress;
  } else {
    envContent = envContent.replace(/SAFE_ADDRESS=.*/g, 'SAFE_ADDRESS=' + safeAddress);
  }
  require('fs').writeFileSync('.env', envContent);
  console.log('📝 Saved Safe address to .env');

  console.log('\n📋 Next Steps:');
  console.log('1. Transfer 250M PRGX to Safe address');
  console.log('2. Add more owners later (upgrade to 3/5 multisig)');
  console.log('3. Set spending limits if desired');
}

main().catch(console.error);
