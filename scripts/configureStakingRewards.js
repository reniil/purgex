// Configure PRGX staking rewards
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com', {
  chainId: 369,
  name: 'pulsechain'
}, {
  batchMaxCount: 1,
  batchStallTime: 0
});
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const STAKING_ADDRESS = '0x7FaB14198ae87E6ad95C785E61f14b68D175317B';
  const PRGX_ADDRESS = '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0';

  console.log('💰 Configuring PRGX Staking Rewards...\n');
  console.log('Wallet:', wallet.address);
  console.log('Staking Contract:', STAKING_ADDRESS);
  console.log('Reward Token:', PRGX_ADDRESS);

  // Staking ABI
  const stakingAbi = [
    'function configureReward(address _rewardToken, uint256 _rewardRatePerSecond) external',
    'function rewardToken() view returns (address)',
    'function rewardRate() view returns (uint256)',
    'function availableRewardBalance() view returns (uint256)'
  ];

  const staking = new ethers.Contract(STAKING_ADDRESS, stakingAbi, wallet);

  // Check balance first
  const tokenAbi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
  const prgx = new ethers.Contract(PRGX_ADDRESS, tokenAbi, provider);
  const balance = await prgx.balanceOf(STAKING_ADDRESS);
  const decimals = await prgx.decimals();
  console.log('\nStaking contract PRGX balance:', ethers.formatUnits(balance, decimals));

  if (balance === 0n) {
    console.error('❌ No PRGX in staking contract!');
    console.error('   Send PRGX to the contract first, then run this script.');
    process.exit(1);
  }

  // Calculate reward rate: 6.4 PRGX per second
  const rewardRate = ethers.parseUnits('6.4', decimals);
  console.log('\nSetting reward rate:', ethers.formatUnits(rewardRate, decimals), 'PRGX per second');
  
  // Estimate duration
  const durationSeconds = Number(balance) / Number(rewardRate);
  const days = durationSeconds / 86400;
  console.log('Expected duration:', days.toFixed(1), 'days');

  // Check current reward token
  try {
    const currentToken = await staking.rewardToken();
    const currentRate = await staking.rewardRate();
    console.log('\nCurrent reward token:', currentToken);
    console.log('Current reward rate:', ethers.formatUnits(currentRate, decimals), 'PRGX/sec');
    
    if (currentToken !== '0x0000000000000000000000000000000000000000') {
      console.log('⚠️ Reward already configured with a different token/rate.');
      console.log('   Proceeding will overwrite. Continue? (y/N)');
      // For automated script, we'll just proceed
    }
  } catch (e) {
    console.log('Could not read current reward settings (contract may need upgrade)');
  }

  // Configure reward
  console.log('\n🚀 Calling configureReward...');
  try {
    const tx = await staking.configureReward(PRGX_ADDRESS, rewardRate);
    console.log('⏳ Transaction:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('✅ Confirmed in block', receipt.blockNumber);

    // Verify
    const newToken = await staking.rewardToken();
    const newRate = await staking.rewardRate();
    console.log('\n✅ Reward token:', newToken);
    console.log('✅ Reward rate:', ethers.formatUnits(newRate, decimals), 'PRGX/sec');

    console.log('\n🎉 Staking is now live! Users can stake PRGX and earn PRGX rewards.');
    console.log('🔗 PulseScan: https://scan.pulsechain.com/address/' + STAKING_ADDRESS);
    
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    if (error.message.includes('OnlyOwner')) {
      console.error('   This function can only be called by the contract owner.');
      console.error('   Owner:', await staking.owner());
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
