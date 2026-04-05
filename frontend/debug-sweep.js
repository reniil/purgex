// Debug script to test sweep contract functions
// Run this in browser console when connected to PulseChain

async function debugSweepContract() {
  console.log('🔍 Debugging Sweep Contract...');
  
  const provider = new ethers.JsonRpcProvider('https://rpc.pulsechain.com');
  const contract = new ethers.Contract(
    '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575',
    [
      'function owner() view returns (address)',
      'function sweep(address[] calldata tokens) external',
      'function sweepTokens(address[] calldata tokens) external',
      'function sweepDust(address[] calldata tokens) external',
      'function sweepToken(address token) external',
      'function withdraw(address token) external',
      'function emergencyWithdraw() external',
      'function paused() view returns (bool)',
      'function isPaused() view returns (bool)'
    ],
    provider
  );
  
  console.log('✅ Contract created');
  
  // Test owner
  try {
    const owner = await contract.owner();
    console.log('✅ Contract owner:', owner);
  } catch (error) {
    console.log('❌ owner():', error.message);
  }
  
  // Test if paused
  try {
    const paused = await contract.paused();
    console.log('✅ Contract paused:', paused);
  } catch (error) {
    console.log('❌ paused():', error.message);
  }
  
  // Test different sweep function names
  const sweepFunctions = [
    { name: 'sweep', params: [['0xefd766ccb38eaf1dfd701853bfce31359239f305']] },
    { name: 'sweepTokens', params: [['0xefd766ccb38eaf1dfd701853bfce31359239f305']] },
    { name: 'sweepDust', params: [['0xefd766ccb38eaf1dfd701853bfce31359239f305']] },
    { name: 'sweepToken', params: ['0xefd766ccb38eaf1dfd701853bfce31359239f305'] }
  ];
  
  for (const func of sweepFunctions) {
    try {
      console.log(`🔍 Testing ${func.name} with params:`, func.params);
      const result = await contract[func.name](...func.params);
      console.log(`✅ ${func.name}():`, result.toString());
    } catch (error) {
      console.log(`❌ ${func.name}():`, error.message);
      if (error.data) {
        console.log(`   Error data:`, error.data);
      }
    }
  }
  
  // Test with user address (maybe sweep needs user param)
  try {
    console.log('🔍 Testing sweep with user address...');
    const userAddress = '0x8544b3D5AA336dfc9290BE50dEfcb69593d6eeC7';
    const result = await contract.sweep(['0xefd766ccb38eaf1dfd701853bfce31359239f305'], userAddress);
    console.log('✅ sweep with user:', result.toString());
  } catch (error) {
    console.log('❌ sweep with user:', error.message);
  }
  
  console.log('🏁 Debug complete');
}

// Run debug
debugSweepContract();
