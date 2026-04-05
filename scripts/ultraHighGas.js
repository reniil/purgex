// Ultra high gas to clear mempool
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  console.log('🚀 Ultra high gas to clear mempool...\n');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('📦 Wallet:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // Get highest nonce
  const nonce = await provider.getTransactionCount(wallet.address, 'pending');
  console.log('📊 Pending nonce:', nonce);

  // Sweeper contract
  const sweeperAddress = '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575';
  const newFeeRecipient = '0x8544b3D5AA336dfc9290BE50dEfcb69593d6eeC7';

  console.log('🎯 Updating fee recipient to:', newFeeRecipient);

  const sweeperInterface = new ethers.Interface([
    'function transferFeeRecipient(address newRecipient)'
  ]);

  const data = sweeperInterface.encodeFunctionData('transferFeeRecipient', [newFeeRecipient]);

  // Ultra high gas - 500 gwei!
  const gasPrice = ethers.parseUnits('500', 'gwei');
  const gasLimit = 300000;

  console.log('⛽ Gas price: 500 gwei (ULTRA HIGH!)');
  console.log('📊 Gas limit:', gasLimit);
  console.log('💸 Max fee:', ethers.formatEther(BigInt(gasPrice) * BigInt(gasLimit)), 'PLS');

  try {
    const tx = await wallet.sendTransaction({
      to: sweeperAddress,
      data: data,
      nonce: nonce,
      gasLimit: gasLimit,
      gasPrice: gasPrice
    });

    console.log('⏳ Transaction sent:', tx.hash);
    console.log('🔗 PulseScan: https://scan.pulsechain.com/tx/' + tx.hash);

    const receipt = await tx.wait();
    console.log('✅ Success! Fee recipient updated');
    console.log('📊 Gas used:', receipt.gasUsed.toString());

  } catch (error) {
    console.error('❌ Failed:', error.message);
    
    if (error.message.includes('replacement')) {
      console.log('\n💡 All transactions stuck in mempool');
      console.log('💡 Try again in 5-10 minutes');
      console.log('💡 Or use different RPC endpoint');
    }
  }
}

main().catch(console.error);
