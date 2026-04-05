// Deploy Safe Multisig on PulseChain
require('dotenv').config();
const { ethers } = require('ethers');

// Safe Master Copy on PulseChain (Gnosis Safe v1.3.0)
const SAFE_MASTER_COPY = '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709F2b';
const SAFE_PROXY_FACTORY = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';

async function main() {
  console.log('🏦 Deploying Safe Multisig on PulseChain...\n');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('📦 Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // Safe setup parameters - 5 owners, 3-of-5 threshold
  const owners = [
    '0x26eCfe27327bbe20be6DEbFeb71319c22F8B36B3', // Ralph
    '0x4Bc71089B98092Bf0E5a1B77ca992f204b685311', // Ben
    '0xEdD5CbBc7f414F7B77f5e381431EcA7D13EBFCc8', // Emma
    '0xbbF1ABA72793efcBc871f2Db4B19e59d1F44eb5c', // Noah
    '0x06275119be938A032e33cb28aa35DEdB3fEBDF08'  // Pepe
  ];

  const threshold = 3; // 3 of 5 required
  const to = SAFE_MASTER_COPY;
  const data = '0x'; // No initialization data
  const fallbackHandler = '0xf48f2b2d'; // Default fallback handler
  const paymentToken = '0x0000000000000000000000000000000000000000000'; // PLS
  const payment = '0'; // No payment
  const paymentReceiver = '0x0000000000000000000000000000000000000000000';

  // Encode setup function call
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
    gasLimit: 3000000,
    gasPrice: ethers.parseUnits('2', 'gwei')
  });

  console.log('⏳ Transaction:', tx.hash);
  const receipt = await tx.wait();
  
  // Get deployed Safe address from event logs
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
  console.log('1. Verify Safe on PulseScan');
  console.log('2. Add PRGX token to Safe assets (custom token: 0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0)');
  console.log('3. Transfer 250,000,000 PRGX to Safe address');
  console.log('4. Test with a small transaction (1 PRGX)');
}

main().catch(console.error);
