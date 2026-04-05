require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🏦 Deploying SimpleMultisig Treasury on PulseChain...\n');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('📦 Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'PLS');

  // Load SimpleMultisig artifact
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

  const numConfirmationsRequired = 3; // 3 of 5 required

  console.log('👥 Owners:');
  owners.forEach((owner, i) => console.log(`   ${i+1}. ${owner}`));
  console.log(`\n✅ Threshold: ${numConfirmationsRequired}/${owners.length}`);

  // Deploy contract
  console.log('\n🚀 Deploying SimpleMultisig...');
  
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  try {
    // In ethers v6, estimateGas is on the factory
    const estimatedGas = await factory.estimateGas.deployCall(owners, numConfirmationsRequired);
    console.log('   Estimated gas:', estimatedGas.toString());
  } catch (e) {
    console.log('   Gas estimation failed, using default');
  }

  // Deploy with options
  const overrides = {
    gasLimit: 3000000,
  };

  const contract = await factory.deploy(owners, numConfirmationsRequired, overrides);
  
  // In ethers v6, the deployment transaction is accessible via contract.deploymentTransaction()
  const tx = contract.deploymentTransaction();
  console.log('⏳ Transaction:', tx.hash);

  // Wait for deployment to complete
  console.log('⏳ Waiting for confirmation...');
  await tx.wait();
  
  const address = await contract.getAddress();
  console.log('\n✅ SimpleMultisig deployed to:', address);
  console.log('🔗 PulseScan: https://scan.pulsechain.com/address/' + address);

  // Get receipt for gas used
  const receipt = await provider.getTransactionReceipt(tx.hash);
  console.log('📦 Gas used:', receipt.gasUsed.toString());
  console.log('🔢 Block:', receipt.blockNumber);

  // Save deployment info
  const deployments = {};
  deployments.multisigAddress = address;
  deployments.deployedAt = new Date().toISOString();
  deployments.network = 'pulsechain';
  deployments.chainId = 369;
  deployments.owners = owners;
  deployments.threshold = numConfirmationsRequired;
  deployments.deployer = wallet.address;
  deployments.transactionHash = tx.hash;
  deployments.gasUsed = receipt.gasUsed.toString();

  if (!fs.existsSync('./deployments')) {
    fs.mkdirSync('./deployments');
  }
  fs.writeFileSync(
    './deployments/multisig.json',
    JSON.stringify(deployments, null, 2)
  );
  console.log('📁 Deployment info saved to deployments/multisig.json');

  console.log('\n✅ Multisig ready for treasury!');
  console.log('\n📋 Next Steps:');
  console.log('1. Add PRGX token to multisig assets (custom token: 0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0)');
  console.log('2. Transfer 250,000,000 PRGX to the multisig address above');
  console.log('3. Test with a small transaction (e.g., 1 PRGX)');
  console.log('4. Update sweeper feeRecipient to multisig address');
}

main()
  .then(() => {
    console.log('\n🎉 Complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Deployment failed:', error);
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('   💸 Insufficient PLS for gas!');
    }
    process.exit(1);
  });
