// Debug script to check staking contract calls
// Run this in browser console on staking page

window.debugStaking = async function() {
  console.log('🔍 Debugging Staking Contract...');
  
  if (!window.wallet?.isConnected) {
    console.log('❌ Wallet not connected');
    return;
  }
  
  try {
    const provider = window.wallet.provider;
    const userAddress = window.wallet.address;
    
    // Create contract instances
    const stakingContract = new ethers.Contract(
      CONFIG.CONTRACTS.STAKING,
      CONFIG.ABIS.STAKING,
      provider
    );
    
    console.log('📋 Contract Address:', CONFIG.CONTRACTS.STAKING);
    console.log('👤 User Address:', userAddress);
    
    // Check if contract exists
    console.log('🔍 Checking contract...');
    try {
      const owner = await stakingContract.owner();
      console.log('✅ Contract exists, owner:', owner);
    } catch (error) {
      console.log('❌ Contract call failed:', error.message);
      return;
    }
    
    // Check staked balance directly
    console.log('🔍 Checking staked balance...');
    try {
      const stakedBalance = await stakingContract.getStakedBalance(userAddress);
      console.log('✅ Raw staked balance:', stakedBalance.toString());
      console.log('✅ Formatted staked balance:', ethers.formatEther(stakedBalance));
    } catch (error) {
      console.log('❌ getStakedBalance call failed:', error.message);
    }
    
    // Check wallet balance
    console.log('🔍 Checking wallet balance...');
    const prgxContract = new ethers.Contract(
      CONFIG.CONTRACTS.PRGX_TOKEN,
      CONFIG.ABIS.ERC20,
      provider
    );
    
    try {
      const walletBalance = await prgxContract.balanceOf(userAddress);
      console.log('✅ Raw wallet balance:', walletBalance.toString());
      console.log('✅ Formatted wallet balance:', ethers.formatEther(walletBalance));
    } catch (error) {
      console.log('❌ balanceOf call failed:', error.message);
    }
    
    // Check total staked
    console.log('🔍 Checking total staked...');
    try {
      const totalStaked = await stakingContract.getTotalStaked();
      console.log('✅ Raw total staked:', totalStaked.toString());
      console.log('✅ Formatted total staked:', ethers.formatEther(totalStaked));
    } catch (error) {
      console.log('❌ getTotalStaked call failed:', error.message);
    }
    
    // Check dashboard data
    console.log('🔍 Checking dashboard data...');
    if (window.stakingManager.dashboardData) {
      console.log('✅ Dashboard data:', window.stakingManager.dashboardData);
    } else {
      console.log('❌ No dashboard data');
    }
    
    // Force refresh dashboard
    console.log('🔄 Forcing dashboard refresh...');
    await window.stakingManager.loadDashboard();
    
    console.log('🏁 Debug complete');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
};

// Auto-run if loaded directly
if (typeof window !== 'undefined') {
  console.log('🔍 Debug script loaded. Call debugStaking() to run.');
}
