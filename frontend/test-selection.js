// Test script to verify token selection works
// Run this in browser console on sweep page

function testTokenSelection() {
  console.log('🧪 Testing token selection...');
  
  // Check if token discovery has tokens
  if (window.tokenDiscovery && window.tokenDiscovery.discoveredTokens.size > 0) {
    console.log('✅ Tokens discovered:', window.tokenDiscovery.discoveredTokens.size);
    
    // Check selected tokens
    console.log('Selected tokens in discovery:', Array.from(window.tokenDiscovery.selectedTokens));
    
    // Check sweeper can read selections
    if (window.sweeper) {
      const selected = window.sweeper.getSelectedTokens();
      console.log('Tokens read by sweeper:', selected);
      
      if (selected.length > 0) {
        console.log('✅ Token selection working!');
      } else {
        console.log('❌ No tokens detected by sweeper');
        
        // Try manual selection
        console.log('🔍 Checking DOM elements...');
        const checkedDivs = document.querySelectorAll('.checkbox-custom.checked[data-token]');
        console.log('Checked divs:', checkedDivs.length);
        
        checkedDivs.forEach(div => {
          console.log('Checked token:', div.dataset.token);
        });
      }
    } else {
      console.log('❌ Sweeper not found');
    }
  } else {
    console.log('❌ No tokens discovered');
  }
}

// Run test
testTokenSelection();
