// Speed up feeRecipient update transaction with higher priority fee
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const SWEEPER_ADDRESS = '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575';
  const MULTISIG_ADDRESS = '0xa3C05e032DC179C7BC801C65F35563c8382CF01A';
  const ORIGINAL_TX_HASH = '0xa0ba4443bd99d1d48575f5e7899d17744b0c25d80ee9a8886d4f6d395539f546';

  console.log('⚡ Speeding up feeRecipient update...\n');
  console.log('Wallet:', wallet.address);
  console.log('Target nonce: 60 (same as original tx)');

  // Check if original tx is still pending
  const originalTx = await provider.getTransaction(ORIGINAL_TX_HASH);
  if (!originalTx) {
    console.log('Original transaction not found (may have dropped or confirmed).');
    // Check current feeRecipient
    const abi = ['function feeRecipient() view returns (address)'];
    const sweeper = new ethers.Contract(SWEEPER_ADDRESS, abi, provider);
    const current = await sweeper.feeRecipient();
    if (current.toLowerCase() === MULTISIG_ADDRESS.toLowerCase()) {
      console.log('✅ feeRecipient already set to multisig:', current);
      return;
    } else {
      console.log('Current feeRecipient:', current);
      console.log('Will proceed with new transaction.');
    }
  } else {
    console.log('Original tx still in mempool. Sending replacement with higher fee...');
  }

  // Get current network fee data
  const feeData = await provider.getFeeData();
  console.log('\nNetwork fees:');
  console.log('  Base fee:', feeData.baseFeePerGas ? ethers.formatUnits(feeData.baseFeePerGas, 'gwei') + ' gwei' : 'N/A');
  console.log('  Suggested max priority:', feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') + ' gwei' : 'N/A');
  console.log('  Suggested max fee:', feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') + ' gwei' : 'N/A');

  // Build replacement transaction with higher priority fee
  const sweeperAbi = [
    'function setFeeRecipient(address recipient) external',
    'function feeRecipient() view returns (address)'
  ];
  const sweeper = new ethers.Contract(SWEEPER_ADDRESS, sweeperAbi, wallet);

  // Use 2x suggested priority fee to ensure inclusion
  const priorityFee = (feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')) * 2n;
  const maxFee = (feeData.maxFeePerGas || ethers.parseUnits('30', 'gwei')) + priorityFee;

  console.log('\n🚀 Sending replacement transaction:');
  console.log('  Nonce: 60');
  console.log('  Max fee per gas:', ethers.formatUnits(maxFee, 'gwei'), 'gwei');
  console.log('  Max priority fee per gas:', ethers.formatUnits(priorityFee, 'gwei'), 'gwei');

  try {
    const tx = await sweeper.setFeeRecipient(MULTISIG_ADDRESS, {
      nonce: 60,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priorityFee,
      gasLimit: 100000 // estimateGas can be used if needed
    });

    console.log('⏳ Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('\n✅ Transaction confirmed!');
    console.log('Block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());

    // Verify
    const newRecipient = await sweeper.feeRecipient();
    console.log('New feeRecipient:', newRecipient);
    if (newRecipient.toLowerCase() === MULTISIG_ADDRESS.toLowerCase()) {
      console.log('\n🎉 feeRecipient successfully updated to multisig!');
    } else {
      console.error('\n❌ feeRecipient still not set correctly:', newRecipient);
    }
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    if (error.code === 'NONCE_TOO_LOW' || error.code === 'REPLACEMENT_UNDERPRICED') {
      console.log('The original transaction may have already confirmed or dropped.');
      // Check final status
      const finalCheck = await provider.getTransactionReceipt(ORIGINAL_TX_HASH);
      if (finalCheck) {
        console.log('Original tx status:', finalCheck.status ? 'SUCCESS' : 'FAILED');
      } else {
        console.log('Original tx dropped. Nonce is now free. Try again with different nonce?');
      }
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
