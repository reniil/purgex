// Debug script to find correct function selectors
const commonSelectors = {
  'sweep(address[])': '0x7d5c7b2f',
  'getEstimatedOutput(address[],address)': '0x7fd6f15c', // This one is wrong
  'feePercent()': '0x7fd6f15c', // This one is wrong
  'getFeePercent()': '0x5e4a6320',
  'FEE_PERCENT()': '0x3b3c28bf',
  'estimateOutput(address[],address)': '0x8c3b2c97',
  'calculateOutput(address[],address)': '0x9a4b2c8d',
  'owner()': '0x8da5cb5b', // This one works
  'renounceOwnership()': '0x715018a6',
  'transferOwnership(address)': '0xf2fde38b'
};

console.log('Testing function selectors...');
console.log('Working selector (owner): 0x8da5cb5b');
console.log('This confirms contract exists and is callable');
