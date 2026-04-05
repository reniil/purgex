// Check transaction status
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const txHash = '0x62b4bc61db4303e36eb063a019ccb172f847dcd8108d6d1c0e1f4e8b41cca73a';
  
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  
  console.log('🔍 Checking transaction:', txHash);
  console.log('🔗 PulseScan: https://scan.pulsechain.com/tx/' + txHash);
  
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      console.log('✅ Transaction confirmed!');
      console.log('📊 Block:', receipt.blockNumber);
      console.log('⛽ Gas used:', receipt.gasUsed.toString());
      console.log('💸 Gas price:', ethers.formatUnits(receipt.gasPrice || 0, 'gwei'), 'gwei');
    } else {
      const tx = await provider.getTransaction(txHash);
      if (tx) {
        console.log('⏳ Transaction pending...');
        console.log('📊 Nonce:', tx.nonce);
        console.log('⛽ Gas price:', ethers.formatUnits(tx.gasPrice || 0, 'gwei'), 'gwei');
      } else {
        console.log('❌ Transaction not found');
      }
    }
  } catch (error) {
    console.error('❌ Error checking transaction:', error.message);
  }
}

main().catch(console.error);
