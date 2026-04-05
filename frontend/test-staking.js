// Test script to verify staking functionality
// Run this in browser console on staking page

function testStaking() {
  console.log('🧪 Testing Staking Functionality...');
  
  // Check if staking manager exists
  if (!window.stakingManager) {
    console.log('❌ Staking manager not found');
    return;
  }
  
  console.log('✅ Staking manager found');
  
  // Check if wallet is connected
  if (!window.wallet?.isConnected) {
    console.log('❌ Wallet not connected');
    return;
  }
  
  console.log('✅ Wallet connected');
  
  // Check dashboard data
  if (!window.stakingManager.dashboardData) {
    console.log('❌ Dashboard data not loaded');
    return;
  }
  
  console.log('✅ Dashboard data loaded');
  console.log('Dashboard data:', window.stakingManager.dashboardData);
  
  // Check buttons
  const buttons = ['stakeBtn', 'unstakeBtn', 'claimBtn', 'maxStakeBtn', 'maxUnstakeBtn'];
  buttons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      console.log(`✅ ${id} found`);
      console.log(`  - Disabled: ${btn.disabled}`);
      console.log(`  - Text: ${btn.textContent}`);
    } else {
      console.log(`❌ ${id} not found`);
    }
  });
  
  // Check inputs
  const inputs = ['stakeAmount', 'unstakeAmount'];
  inputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      console.log(`✅ ${id} input found`);
      console.log(`  - Value: ${input.value}`);
      console.log(`  - Disabled: ${input.disabled}`);
    } else {
      console.log(`❌ ${id} input not found`);
    }
  });
  
  // Test max button functionality
  console.log('🔍 Testing MAX buttons...');
  const maxStakeBtn = document.getElementById('maxStakeBtn');
  if (maxStakeBtn) {
    console.log('Clicking MAX stake button...');
    maxStakeBtn.click();
    
    const stakeAmount = document.getElementById('stakeAmount');
    if (stakeAmount) {
      console.log(`✅ Stake amount filled: ${stakeAmount.value}`);
    }
  }
  
  console.log('🏁 Staking test complete');
}

// Run test
testStaking();
