// Force change fee recipient with very high gas
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  console.log('🔥 Force updating fee recipient with maximum gas...\n');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('📦 Wallet:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // Get current nonce
  const nonce = await provider.getTransactionCount(wallet.address, 'pending');
  console.log('📊 Current nonce:', nonce);

  // Sweeper contract
  const sweeperAddress = '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575';
  
  // New fee recipient (multisig or your address)
  const newFeeRecipient = '0x8544b3D5AA336dfc9290BE50dEfcb69593d6eeC7'; // Ralph's wallet for now

  console.log('🎯 Updating fee recipient to:', newFeeRecipient);

  // Create contract interface for transferFeeRecipient function
  const sweeperInterface = new ethers.Interface([
    'function transferFeeRecipient(address newRecipient)'
  ]);

  const data = sweeperInterface.encodeFunctionData('transferFeeRecipient', [newFeeRecipient]);

  // Use extremely high gas to force through
  const gasPrice = ethers.parseUnits('100', 'gwei'); // 100 gwei!
  const gasLimit = 300000;

  console.log('⛽ Gas price:', ethers.formatUnits(gasPrice, 'gwei'), 'gwei');
  console.log('📊 Gas limit:', gasLimit);
  console.log('💸 Max fee:', ethers.formatEther(BigInt(gasPrice) * BigInt(gasLimit)), 'PLS');

  try {
    const tx = await wallet.sendTransaction({
      to: sweeperAddress,
      data: data,
      nonce: nonce,
      gasLimit: gasLimit,
      gasPrice: gasPrice
      // Remove type: 2 for legacy transaction
    });

    console.log('⏳ Transaction sent:', tx.hash);
    console.log('🔗 PulseScan: https://scan.pulsechain.com/tx/' + tx.hash);

    const receipt = await tx.wait();
    console.log('✅ Success! Fee recipient updated');
    console.log('📊 Gas used:', receipt.gasUsed.toString());

  } catch (error) {
    console.error('❌ Failed:', error.message);
    
    if (error.message.includes('replacement')) {
      console.log('\n💡 Try waiting 2-3 minutes for pending txs to clear');
      console.log('💡 Or try with even higher gas (200+ gwei)');
    }
  }
}

main().catch(console.error);
