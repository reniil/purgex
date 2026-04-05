/* PRGX Price Fetcher */

async function fetchPRGXPrice() {
  try {
    const response = await fetch('https://api.scan.pulsechain.com/api?module=stats&action=tokenprice&contractaddress=0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0');
    const data = await response.json();
    return parseFloat(data.result.usdPrice) || 0.0;
  } catch (error) {
    console.error('Error fetching PRGX price:', error);
    return 0.0;
  }
}

/* Update USD Value Display */
function updateUSDValue() {
  const estimatedPRGX = parseFloat(document.getElementById('estimatedOut').textContent);
  const prgxPrice = parseFloat(document.getElementById('prgxPrice').textContent) || 0.0;
  const usdValue = estimatedPRGX * prgxPrice;
  document.getElementById('estimatedUsdOut').textContent = `$${usdValue.toFixed(2)}`;  
}

/* Update USD Value Every 30 Seconds */
function updateUSDValuePeriodically() {
  fetchPRGXPrice().then(price => {
    const usdValue = (parseFloat(document.getElementById('estimatedOut').textContent) * price).toFixed(2);
    document.getElementById('estimatedUsdOut').textContent = `$${usdValue}`;
  });
  setTimeout(updateUSDValuePeriodically, 30000);
}

/* Initialize USD Value Display */
function initUSDValue() {
  const prgxPrice = parseFloat(document.getElementById('prgxPrice').textContent) || 0.0;
  const estimatedPRGX = parseFloat(document.getElementById('estimatedOut').textContent);
  const usdValue = estimatedPRGX * prgxPrice;
  document.getElementById('estimatedUsdOut').textContent = `$${usdValue.toFixed(2)}`;  
}

/* Initialize Price Fetch */
initUSDValue();
updateUSDValuePeriodically();
