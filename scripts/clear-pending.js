// Clear pending transaction queue
require('dotenv').config();
const { ethers } = require('ethers');

async function clearPending() {
  const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const address = wallet.address;
  console.log(`🔧 Clearing pending transactions for: ${address}\n`);

  // Get nonces
  const latestNonce = await provider.getTransactionCount(address, 'latest');
  const pendingNonce = await provider.getTransactionCount(address, 'pending');

  console.log(`Latest nonce: ${latestNonce}`);
  console.log(`Pending nonce: ${pendingNonce}`);
  console.log(`Stuck transactions: ${pendingNonce - latestNonce}\n`);

  if (latestNonce === pendingNonce) {
    console.log('✅ No pending transactions to clear');
    return;
  }

  // Clear each stuck transaction by sending 0 PLS to self with higher gas
  const gasPrice = ethers.parseUnits('5', 'gwei'); // 5 gwei to ensure it gets mined

  for (let nonce = latestNonce; nonce < pendingNonce; nonce++) {
    console.log(`Clearing nonce ${nonce}...`);
    try {
      const tx = await wallet.sendTransaction({
        to: address,
        value: 0,
        gasLimit: 21000,
        gasPrice: gasPrice,
        nonce: nonce
      });
      console.log(`   Tx sent: ${tx.hash.slice(0, 10)}... waiting...`);
      await tx.wait();
      console.log(`   ✅ Cleared`);
    } catch (error) {
      console.log(`   ⚠️  ${error.message}`);
    }
  }

  console.log('\n🎉 Queue cleared! Ready for deployment.');
}

clearPending().catch(console.error);
