// Debug script to test contract functions directly
// Run this in browser console when connected to PulseChain

async function debugSweeperContract() {
  console.log('🔍 Testing Sweeper Contract Functions...');
  
  const provider = new ethers.JsonRpcProvider('https://rpc.pulsechain.com');
  const contract = new ethers.Contract(
    '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575',
    [
      'function owner() view returns (address)',
      'function feePercent() view returns (uint256)',
      'function getFeePercent() view returns (uint256)',
      'function FEE_PERCENT() view returns (uint256)',
      'function getEstimatedOutput(address[] calldata tokens, address user) view returns (uint256)',
      'function estimateOutput(address[] calldata tokens, address user) view returns (uint256)',
      'function calculateOutput(address[] calldata tokens, address user) view returns (uint256)',
      'function sweep(address[] calldata tokens) external'
    ],
    provider
  );
  
  console.log('✅ Contract created');
  
  // Test owner() - should work
  try {
    const owner = await contract.owner();
    console.log('✅ owner():', owner);
  } catch (error) {
    console.log('❌ owner():', error.message);
  }
  
  // Test fee functions
  const feeFunctions = ['feePercent', 'getFeePercent', 'FEE_PERCENT'];
  for (const func of feeFunctions) {
    try {
      const result = await contract[func]();
      console.log(`✅ ${func}():`, result.toString());
    } catch (error) {
      console.log(`❌ ${func}():`, error.message);
    }
  }
  
  // Test estimate functions with dummy data
  const estimateFunctions = ['getEstimatedOutput', 'estimateOutput', 'calculateOutput'];
  const dummyTokens = ['0xA1077a294dDE1B09bB078844df40758a5D0f9a27']; // WPLS
  const dummyUser = '0x8544b3D5AA336dfc9290BE50dEfcb69593d6eeC7';
  
  for (const func of estimateFunctions) {
    try {
      const result = await contract[func](dummyTokens, dummyUser);
      console.log(`✅ ${func}():`, result.toString());
    } catch (error) {
      console.log(`❌ ${func}():`, error.message);
    }
  }
  
  console.log('🏁 Debug complete');
}

// Run it
debugSweeperContract();
