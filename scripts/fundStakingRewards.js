// Fund PRGX Staking Rewards
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.pulsechain.com');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const PRGX_ADDRESS = '0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0';
  const STAKING_ADDRESS = '0x7FaB14198ae87E6ad95C785E61f14b68D175317B';

  console.log('💰 Funding PRGX Staking Rewards...\n');
  console.log('Wallet:', wallet.address);
  console.log('PRGX Token:', PRGX_ADDRESS);
  console.log('Staking Contract:', STAKING_ADDRESS);

  // PRGX Token ABI
  const tokenAbi = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];

  // Staking ABI
  const stakingAbi = [
    'function depositRewards(uint256 amount) external',
    'function rewardToken() view returns (address)',
    'function availableRewardBalance() view returns (uint256)',
    'function configureReward(address _rewardToken, uint256 _rewardRatePerSecond) external'
  ];

  const prgx = new ethers.Contract(PRGX_ADDRESS, tokenAbi, wallet);
  const staking = new ethers.Contract(STAKING_ADDRESS, stakingAbi, wallet);

  // Check wallet balance
  const balance = await prgx.balanceOf(wallet.address);
  const decimals = await prgx.decimals();
  console.log('\nWallet PRGX balance:', ethers.formatUnits(balance, decimals));

  // Amount to fund (e.g., 50M PRGX for rewards)
  const rewardAmount = ethers.parseUnits('50000000', decimals); // 50M PRGX
  console.log('Amount to deposit:', ethers.formatUnits(rewardAmount, decimals), 'PRGX');

  if (balance < rewardAmount) {
    console.error('❌ Insufficient PRGX balance!');
    process.exit(1);
  }

  // Check current reward token
  try {
    const currentRewardToken = await staking.rewardToken();
    console.log('Current reward token:', currentRewardToken);
    
    if (currentRewardToken === '0x0000000000000000000000000000000000000000') {
      console.log('⚠️ Reward token not configured yet.');
      console.log('Need to call configureReward(PRGX_ADDRESS, rewardRate) first');
      
      // Configure reward token as PRGX
      // Reward rate: 1 PRGX per second = 86400 PRGX per day
      const rewardRate = ethers.parseUnits('1', decimals); // 1 PRGX per second
      console.log('\n🚀 Configuring reward token as PRGX...');
      console.log('Reward rate:', ethers.formatUnits(rewardRate, decimals), 'PRGX/sec');
      
      const configTx = await staking.configureReward(PRGX_ADDRESS, rewardRate);
      console.log('⏳ Config transaction:', configTx.hash);
      await configTx.wait();
      console.log('✅ Reward token configured');
    }
  } catch (e) {
    console.log('Note: rewardToken() may not be available on this contract version');
  }

  // Approve staking contract to spend PRGX
  console.log('\n🚀 Approving PRGX for staking contract...');
  const approveTx = await prgx.approve(STAKING_ADDRESS, rewardAmount);
  console.log('⏳ Approve transaction:', approveTx.hash);
  await approveTx.wait();
  console.log('✅ Approved');

  // Deposit rewards
  console.log('\n🚀 Depositing rewards...');
  const depositTx = await staking.depositRewards(rewardAmount);
  console.log('⏳ Deposit transaction:', depositTx.hash);
  
  const receipt = await depositTx.wait();
  console.log('✅ Confirmed in block', receipt.blockNumber);

  // Verify
  try {
    const available = await staking.availableRewardBalance();
    console.log('\n✅ Available reward balance:', ethers.formatUnits(available, decimals), 'PRGX');
  } catch (e) {
    console.log('✅ Rewards deposited (verification skipped)');
  }

  console.log('🔗 PulseScan: https://scan.pulsechain.com/tx/' + depositTx.hash);
}

main()
  .then(() => {
    console.log('\n🎉 Staking rewards funded!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
