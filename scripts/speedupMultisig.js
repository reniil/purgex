// Speed up multisig deployment with higher priority fee
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('⚡ Speeding up multisig deployment...\n');
  console.log('Wallet:', wallet.address);

  // Load SimpleMultisig artifact
  const fs = require('fs');
  const path = require('path');
  const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'SimpleMultisig.sol', 'SimpleMultisig.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  // Team owners (5 signers)
  const owners = [
    '0x26eCfe27327bbe20be6DEbFeb71319c22F8B36B3', // Ralph
    '0x4Bc71089B98092Bf0E5a1B77ca992f204b685311', // Ben
    '0xEdD5CbBc7f414F7B77f5e381431EcA7D13EBFCc8', // Emma
    '0xbbF1ABA72793efcBc871f2Db4B19e59d1F44eb5c', // Noah
    '0x06275119be938A032e33cb28aa35DEdB3fEBDF08'  // Pepe
  ];

  const numConfirmationsRequired = 3;

  // Get current network fee data
  const feeData = await provider.getFeeData();
  console.log('Current network fees:');
  console.log('  Base fee:', feeData.baseFeePerGas ? ethers.formatUnits(feeData.baseFeePerGas, 'gwei') + ' gwei' : 'N/A');
  console.log('  Suggested max priority:', feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') + ' gwei' : 'N/A');

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  // Deploy with higher priority fee
  const overrides = {
    gasLimit: 3000000,
    maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas + ethers.parseUnits('5', 'gwei') : ethers.parseUnits('30', 'gwei'),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas + ethers.parseUnits('2', 'gwei') : ethers.parseUnits('5', 'gwei'),
    nonce: 59 // Same nonce to replace pending transaction
  };

  console.log('\n🚀 Deploying with replacement transaction...');
  console.log('  Gas limit:', overrides.gasLimit);
  console.log('  Max fee per gas:', ethers.formatUnits(overrides.maxFeePerGas, 'gwei'), 'gwei');
  console.log('  Max priority fee per gas:', ethers.formatUnits(overrides.maxPriorityFeePerGas, 'gwei'), 'gwei');
  console.log('  Nonce:', overrides.nonce);

  try {
    const contract = await factory.deploy(owners, numConfirmationsRequired, overrides);
    const tx = contract.deploymentTransaction();
    
    console.log('⏳ Transaction sent:', tx.hash);
    console.log('   Replacing old transaction: 0xc9d002d61671cd3369cdecf336ca2b7b947c8a6e6d2503a9c1d766a5ecb7fb46');
    
    console.log('\n⏳ Waiting for confirmation (this may take a few minutes)...');
    await tx.wait();
    
    const address = await contract.getAddress();
    console.log('\n✅ SimpleMultisig deployed to:', address);
    console.log('🔗 PulseScan: https://scan.pulsechain.com/address/' + address);
    
    // Save deployment info
    const deployments = {
      multisigAddress: address,
      deployedAt: new Date().toISOString(),
      network: 'pulsechain',
      chainId: 369,
      owners: owners,
      threshold: numConfirmationsRequired,
      deployer: wallet.address,
      transactionHash: tx.hash
    };

    if (!fs.existsSync('./deployments')) {
      fs.mkdirSync('./deployments');
    }
    fs.writeFileSync(
      './deployments/multisig.json',
      JSON.stringify(deployments, null, 2)
    );
    console.log('📁 Deployment saved to deployments/multisig.json');
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.code === 'NONCE_EXPIRED') {
      console.log('   The original transaction may have been replaced or confirmed.');
      console.log('   Checking status...');
      const receipt = await provider.getTransactionReceipt('0xc9d002d61671cd3369cdecf336ca2b7b947c8a6e6d2503a9c1d766a5ecb7fb46');
      if (receipt) {
        console.log('   ✅ Original transaction confirmed:', receipt.status ? 'SUCCESS' : 'FAILED');
      }
    }
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('\n🎉 Complete!');
    process.exit(0);
  })
  .catch(console.error);
