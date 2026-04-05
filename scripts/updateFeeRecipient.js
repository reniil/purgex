// Update Sweeper feeRecipient to Multisig - Standalone (no compile needed)
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const SWEEPER_ADDRESS = '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575';
  const MULTISIG_ADDRESS = '0xa3C05e032DC179C7BC801C65F35563c8382CF01A';

  console.log('🔄 Updating Sweeper feeRecipient to Multisig...\n');
  console.log('Wallet:', wallet.address);
  console.log('Sweeper:', SWEEPER_ADDRESS);
  console.log('New feeRecipient:', MULTISIG_ADDRESS);

  // Minimal ABI for Sweeper
  const abi = [
    'function setFeeRecipient(address recipient) external',
    'function feeRecipient() view returns (address)',
    'function owner() view returns (address)'
  ];

  const sweeper = new ethers.Contract(SWEEPER_ADDRESS, abi, wallet);

  // Check current owner
  const owner = await sweeper.owner();
  console.log('\nCurrent owner:', owner);
  
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error('❌ Wallet is not the sweeper owner!');
    console.error('   Owner:', owner);
    console.error('   Your wallet:', wallet.address);
    process.exit(1);
  }

  // Check current feeRecipient
  const currentRecipient = await sweeper.feeRecipient();
  console.log('Current feeRecipient:', currentRecipient);

  if (currentRecipient.toLowerCase() === MULTISIG_ADDRESS.toLowerCase()) {
    console.log('✅ FeeRecipient already set to multisig');
    return;
  }

  // Update feeRecipient
  console.log('\n🚀 Sending transaction...');
  const tx = await sweeper.setFeeRecipient(MULTISIG_ADDRESS);
  console.log('⏳ Transaction:', tx.hash);
  
  const receipt = await tx.wait();
  console.log('✅ Confirmed in block', receipt.blockNumber);

  // Verify
  const newRecipient = await sweeper.feeRecipient();
  console.log('\n✅ New feeRecipient:', newRecipient);
  console.log('🔗 PulseScan: https://scan.pulsechain.com/tx/' + tx.hash);
}

main()
  .then(() => {
    console.log('\n🎉 Sweeper feeRecipient updated!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
