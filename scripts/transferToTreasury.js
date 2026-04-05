// Transfer 250M PRGX to Multisig Treasury
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  console.log('💰 Transferring 250M PRGX to Treasury...\n');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://pulsechain.publicnode.com', {
    chainId: 369,
    name: 'pulsechain'
  }, {
    batchMaxCount: 1,
    batchStallTime: 0
  });

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // Addresses
  const PRGX_ADDRESS = process.env.PRGX_TOKEN_ADDRESS;
  const SAFE_ADDRESS = process.env.SAFE_ADDRESS;
  const TREASURY_AMOUNT = ethers.parseUnits('250000000', 18); // 250M PRGX

  console.log('📦 From:', wallet.address);
  console.log('🏛️  To (Treasury):', SAFE_ADDRESS);
  console.log('💸 Amount:', ethers.formatUnits(TREASURY_AMOUNT, 18), 'PRGX');

  // PRGX Token contract
  const prgxToken = new ethers.Contract(PRGX_ADDRESS, [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)'
  ], wallet);

  try {
    // Check current balance
    const balance = await prgxToken.balanceOf(wallet.address);
    console.log('💰 Current PRGX balance:', ethers.formatUnits(balance, 18));

    if (balance < TREASURY_AMOUNT) {
      console.log('❌ Insufficient PRGX balance for treasury transfer');
      console.log('📊 Need:', ethers.formatUnits(TREASURY_AMOUNT, 18), 'PRGX');
      console.log('📊 Have:', ethers.formatUnits(balance, 18), 'PRGX');
      return;
    }

    console.log('\n🚀 Transferring 250M PRGX to treasury...');
    
    const tx = await prgxToken.transfer(SAFE_ADDRESS, TREASURY_AMOUNT, {
      gasLimit: 100000,
      gasPrice: ethers.parseUnits('5', 'gwei')
    });

    console.log('⏳ Transaction:', tx.hash);
    console.log('🔗 PulseScan: https://scan.pulsechain.com/tx/' + tx.hash);

    const receipt = await tx.wait();
    console.log('✅ Treasury funded successfully!');
    console.log('📊 Gas used:', receipt.gasUsed.toString());

    // Verify treasury balance
    const treasuryBalance = await prgxToken.balanceOf(SAFE_ADDRESS);
    console.log('🏛️  Treasury PRGX balance:', ethers.formatUnits(treasuryBalance, 18));

    console.log('\n📋 Treasury Setup Complete!');
    console.log('🎯 Multisig: https://app.safe.global/home?safe=' + SAFE_ADDRESS);

  } catch (error) {
    console.error('❌ Transfer failed:', error.message);
    
    if (error.message.includes('nonce')) {
      console.log('\n💡 Try again in a few minutes');
      console.log('💡 Or use Remix for manual transfer');
    }
  }
}

main().catch(console.error);
