// ================================================================
// SWEEPER — Dust sweep logic with approval flow
// ================================================================

class Sweeper {
  constructor() {
    this.isSweeping = false;
    this.selectedTokens = [];
    this.approvalStatus = new Map();
  }

  // ================================================================
  // INITIATE SWEEP - Called by UI button
  // ================================================================
  async initiateSweep() {
    try {
      // Get selected tokens from the UI
      const selectedTokens = this.getSelectedTokens();
      
      if (selectedTokens.length === 0) {
        this.updateStatusLog('⚠️ No tokens selected for sweep', 'error');
        return;
      }
      
      // Execute the sweep
      await this.executeSweep(selectedTokens);
      
    } catch (error) {
      console.error('Sweep initiation failed:', error);
      this.updateStatusLog(`❌ Sweep failed: ${error.message}`, 'error');
    }
  }

  // ================================================================
  // GET SELECTED TOKENS FROM UI
  // ================================================================
  getSelectedTokens() {
    // Use the token discovery's getSelectedTokens method
    if (window.tokenDiscovery) {
      const selected = window.tokenDiscovery.getSelectedTokens();
      const addresses = Array.from(selected.keys());
      console.log('Selected tokens:', addresses);
      return addresses;
    }
    
    // Fallback: try to read from DOM
    const checkedBoxes = document.querySelectorAll('.token-checkbox:checked');
    const selectedTokens = [];
    
    checkedBoxes.forEach(checkbox => {
      if (checkbox.dataset.token) {
        selectedTokens.push(checkbox.dataset.token);
      }
    });
    
    console.log('Selected tokens from DOM:', selectedTokens);
    return selectedTokens;
  }

  // ================================================================
  // MAIN SWEEP FLOW
  // ================================================================
  async executeSweep(selectedTokenAddresses) {
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    if (selectedTokenAddresses.length === 0) {
      throw new Error('No tokens selected for sweep');
    }
    
    this.isSweeping = true;
    this.selectedTokens = selectedTokenAddresses;
    this.approvalStatus.clear();
    
    try {
      // Step 1: Validate
      this.updateStatusLog('🔍 Validating sweep parameters...', 'info');
      await this.validateSweep(selectedTokenAddresses);
      
      // Step 2: Get estimate
      this.updateStatusLog('📊 Calculating estimated output...', 'info');
      const estimate = await this.getEstimate(selectedTokenAddresses);
      
      // Step 3: Show confirmation modal
      const confirmed = await this.showConfirmationModal(selectedTokenAddresses, estimate);
      if (!confirmed) {
        throw new Error('Sweep cancelled by user');
      }
      
      // Step 4: Handle approvals
      this.updateStatusLog('📋 Checking token approvals...', 'info');
      await this.handleApprovals(selectedTokenAddresses);
      
      // Step 5: Execute sweep
      this.updateStatusLog('🚀 Executing sweep transaction...', 'pending');
      const tx = await this.executeSweepTransaction(selectedTokenAddresses);
      
      // Step 6: Success
      this.updateStatusLog('✅ Sweep completed successfully!', 'success');
      this.updateSweepUI(tx);
      
      return tx;
      
    } catch (error) {
      console.error('Sweep failed:', error);
      this.updateStatusLog(`❌ Sweep failed: ${error.message}`, 'error');
      throw error;
    } finally {
      this.isSweeping = false;
    }
  }

  // ================================================================
  // VALIDATE SWEEP
  // ================================================================
  async validateSweep(tokenAddresses) {
    // Check if wallet is connected
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    // Check if we have token data
    for (const address of tokenAddresses) {
      const token = window.tokenDiscovery.discoveredTokens.get(address);
      if (!token) {
        throw new Error(`Token data not found for ${address}`);
      }
    }
  }

  // ================================================================
  // GET ESTIMATE WITH FALLBACK FUNCTION NAMES
  // ================================================================
  async getEstimate(tokenAddresses) {
    if (!window.wallet?.provider) {
      throw new Error('Wallet provider not available');
    }
    
    const sweeperContract = new ethers.Contract(
      CONFIG.CONTRACTS.SWEEPER,
      CONFIG.ABIS.SWEEPER,
      window.wallet.provider
    );
    
    // Try different function names in order
    const functionNames = [
      'getEstimatedOutput',
      'estimateOutput', 
      'calculateOutput'
    ];
    
    let estimate = null;
    let lastError = null;
    
    for (const funcName of functionNames) {
      try {
        console.log(`🔍 Trying ${funcName}...`);
        estimate = await sweeperContract[funcName](tokenAddresses, window.wallet.address);
        console.log(`✅ ${funcName} successful:`, estimate.toString());
        break;
      } catch (error) {
        console.warn(`❌ ${funcName} failed:`, error.message);
        lastError = error;
      }
    }
    
    if (!estimate) {
      console.warn('All contract functions failed, using fallback estimation:', lastError);
      return await this.getFallbackEstimate(tokenAddresses);
    }
    
    const prgxAmount = Number(ethers.formatEther(estimate));
    const feeAmount = prgxAmount * (CONFIG.SWEEP_FEE_PERCENT / 100);
    const netAmount = prgxAmount - feeAmount;
    
    const usdValue = window.priceOracle ? 
      window.priceOracle.prgxToUSD(netAmount) : 0;
    
    return {
      grossAmount: prgxAmount,
      feeAmount: feeAmount,
      netAmount: netAmount,
      usdValue: usdValue,
      rawEstimate: estimate
    };
  }

  // ================================================================
  // FALLBACK ESTIMATION
  // ================================================================
  async getFallbackEstimate(tokenAddresses) {
    let totalUSD = 0;
    let totalPRGX = 0;
    
    for (const address of tokenAddresses) {
      const token = window.tokenDiscovery.discoveredTokens.get(address);
      if (token) {
        totalUSD += token.estimatedUSD || 0;
        totalPRGX += token.estimatedPRGX || 0;
      }
    }
    
    const feeAmount = totalPRGX * (CONFIG.SWEEP_FEE_PERCENT / 100);
    const netAmount = totalPRGX - feeAmount;
    const usdValue = totalUSD - (totalUSD * CONFIG.SWEEP_FEE_PERCENT / 100);
    
    return {
      grossAmount: totalPRGX,
      feeAmount: feeAmount,
      netAmount: netAmount,
      usdValue: usdValue,
      rawEstimate: ethers.parseEther(totalPRGX.toString()),
      isFallback: true
    };
  }

  // ================================================================
  // GET FEE PERCENTAGE WITH FALLBACKS
  // ================================================================
  async getFeePercent() {
    const sweeperContract = new ethers.Contract(
      CONFIG.CONTRACTS.SWEEPER,
      CONFIG.ABIS.SWEEPER,
      window.wallet.provider
    );
    
    // Try different fee function names
    const feeFunctions = [
      'protocolFeeBps',  // This is the correct one from the contract
      'feePercent',
      'getFeePercent', 
      'FEE_PERCENT'
    ];
    
    for (const funcName of feeFunctions) {
      try {
        console.log(`🔍 Trying ${funcName}...`);
        const fee = await sweeperContract[funcName]();
        console.log(`✅ ${funcName} successful:`, fee.toString());
        return Number(fee);
      } catch (error) {
        console.warn(`❌ ${funcName} failed:`, error.message);
      }
    }
    
    // Fallback to config
    console.warn('All fee functions failed, using config fallback');
    return CONFIG.SWEEP_FEE_PERCENT;
  }

  // ================================================================
  // EXECUTE SWEEP TRANSACTION
  // ================================================================
  async executeSweepTransaction(tokenAddresses) {
    try {
      // Get actual fee from contract
      const actualFee = await this.getFeePercent();
      console.log(`📊 Using fee: ${actualFee}%`);
      
      // Try the correct sweepTokens function first
      const sweeperContract = new ethers.Contract(
        CONFIG.CONTRACTS.SWEEPER,
        CONFIG.ABIS.SWEEPER,
        window.wallet.signer
      );
      
      // Create minAmountsOut array (0 = accept any amount)
      const minAmountsOut = tokenAddresses.map(() => 0n);
      
      try {
        console.log('🔍 Trying sweepTokens with correct signature...');
        console.log('Token addresses:', tokenAddresses);
        console.log('Min amounts out:', minAmountsOut.map(x => x.toString()));
        
        // Try to estimate gas first
        const gasEstimate = await sweeperContract.sweepTokens.estimateGas(tokenAddresses, minAmountsOut);
        console.log('✅ Gas estimate for sweepTokens:', gasEstimate.toString());
        
        // Execute the function
        const tx = await sweeperContract.sweepTokens(tokenAddresses, minAmountsOut);
        this.updateStatusLog(`🚀 sweepTokens transaction sent: ${tx.hash}`, 'pending');
        
        const receipt = await tx.wait();
        this.updateStatusLog(`✅ sweepTokens completed! Block: ${receipt.blockNumber}`, 'success');
        
        return receipt;
        
      } catch (error) {
        console.warn('❌ sweepTokens failed:', error.message);
        
        // Check for specific error patterns
        if (error.message.includes('No balance')) {
          this.updateStatusLog('⚠️ No token balance found', 'error');
          throw new Error('No token balance - check your wallet');
        }
        
        if (error.message.includes('No allowance')) {
          this.updateStatusLog('⚠️ Token approval required', 'error');
          throw new Error('Token approval missing - try approving first');
        }
        
        if (error.message.includes('Amount too small')) {
          this.updateStatusLog('⚠️ Token amount too small to sweep', 'error');
          throw new Error('Token amounts too small for protocol fee');
        }
        
        if (error.message.includes('Length mismatch')) {
          this.updateStatusLog('⚠️ Parameter length mismatch', 'error');
          throw new Error('Internal error - please try again');
        }
        
        // Try fallback to old sweep function
        try {
          console.log('🔍 Trying fallback sweep function...');
          const tx = await sweeperContract.sweep(tokenAddresses);
          this.updateStatusLog(`🚀 sweep transaction sent: ${tx.hash}`, 'pending');
          
          const receipt = await tx.wait();
          this.updateStatusLog(`✅ sweep completed! Block: ${receipt.blockNumber}`, 'success');
          
          return receipt;
        } catch (fallbackError) {
          console.warn('❌ Fallback sweep also failed:', fallbackError.message);
          throw new Error(`Sweep failed: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.error('Sweep execution failed:', error);
      throw new Error(`Sweep failed: ${error.message}`);
    }
  }

  // ================================================================
  // SIMULATE SWEEP (Fallback for demo/testing)
  // ================================================================
  async simulateSweep(tokenAddresses) {
    this.updateStatusLog('🧪 Real contract unavailable - simulating sweep for demo', 'info');
    
    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create mock transaction
    const mockTx = {
      hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      blockNumber: Math.floor(Math.random() * 1000000) + 40000000,
      gasUsed: ethers.parseEther('0.0001'),
      success: true
    };
    
    this.updateStatusLog(`✅ Mock sweep completed: ${mockTx.hash}`, 'success');
    
    // Clear selections
    if (window.tokenDiscovery) {
      window.tokenDiscovery.selectedTokens.clear();
      window.tokenDiscovery.renderTokenTable(window.tokenDiscovery.discoveredTokens, 'tokenTableBody');
    }
    
    return mockTx;
  }

  // ================================================================
  // APPROVAL FLOW
  // ================================================================
  async handleApprovals(tokenAddresses) {
    const approvalsNeeded = [];
    
    // Check which tokens need approval
    for (const tokenAddress of tokenAddresses) {
      const needsApproval = await this.checkApprovalNeeded(tokenAddress);
      if (needsApproval) {
        approvalsNeeded.push(tokenAddress);
      }
    }
    
    if (approvalsNeeded.length === 0) {
      this.updateStatusLog('✅ All tokens already approved', 'success');
      return;
    }
    
    // Process approvals
    for (const tokenAddress of approvalsNeeded) {
      await this.approveToken(tokenAddress);
    }
  }

  async checkApprovalNeeded(tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        CONFIG.ABIS.ERC20,
        window.wallet.provider
      );
      
      const allowance = await tokenContract.allowance(
        window.wallet.address,
        CONFIG.CONTRACTS.SWEEPER
      );
      
      const token = window.tokenDiscovery.discoveredTokens.get(tokenAddress);
      const balance = token ? token.balance : ethers.Zero;
      
      return allowance < balance;
    } catch (error) {
      console.warn('Approval check failed:', error);
      return true; // Assume approval needed on error
    }
  }

  async approveToken(tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );
      
      const token = window.tokenDiscovery.discoveredTokens.get(tokenAddress);
      const balance = token ? token.balance : ethers.Zero;
      
      const tx = await tokenContract.approve(CONFIG.CONTRACTS.SWEEPER, balance);
      
      this.updateStatusLog(`✅ Approval sent for ${this.getTokenSymbol(tokenAddress)}: ${tx.hash}`, 'pending');
      
      const receipt = await tx.wait();
      this.updateStatusLog(`✅ Approval confirmed for ${this.getTokenSymbol(tokenAddress)}`, 'success');
      
      this.approvalStatus.set(tokenAddress, true);
      this.updateApprovalUI(tokenAddress, true);
      
    } catch (error) {
      this.updateStatusLog(`❌ Approval failed for ${this.getTokenSymbol(tokenAddress)}: ${error.message}`, 'error');
      throw error;
    }
  }

  // ================================================================
  // UI HELPERS
  // ================================================================
  updateStatusLog(message, type) {
    const statusLog = document.getElementById('statusLog');
    if (statusLog) {
      const entry = document.createElement('div');
      entry.className = `status-entry status-${type}`;
      entry.textContent = message;
      statusLog.appendChild(entry);
      statusLog.scrollTop = statusLog.scrollHeight;
    }
    
    // Show status section when first message is added
    const statusSection = document.getElementById('statusSection');
    if (statusSection && statusSection.classList.contains('hidden')) {
      statusSection.classList.remove('hidden');
    }
  }

  updateApprovalUI(tokenAddress, approved) {
    const checkbox = document.querySelector(`input[data-token="${tokenAddress}"]`);
    if (checkbox) {
      checkbox.checked = approved;
      checkbox.disabled = approved;
    }
  }

  updateSweepUI(tx) {
    // Update transaction link
    const txLink = document.getElementById('txLink');
    if (txLink && tx.hash) {
      txLink.href = `${CONFIG.NETWORK.explorer}/tx/${tx.hash}`;
      txLink.classList.remove('hidden');
    }
    
    // Update sweep button
    const sweepBtn = document.getElementById('purgeBtn');
    if (sweepBtn) {
      sweepBtn.textContent = '✅ Sweep Completed';
      sweepBtn.disabled = true;
    }
    
    // Clear selections
    const checkboxes = document.querySelectorAll('input[data-token]:checked');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    
    // Clear token discovery selections
    if (window.tokenDiscovery) {
      window.tokenDiscovery.selectedTokens.clear();
      window.tokenDiscovery.renderTokenTable(window.tokenDiscovery.discoveredTokens, 'tokenTableBody');
    }
  }

  getTokenSymbol(tokenAddress) {
    const token = window.tokenDiscovery.discoveredTokens.get(tokenAddress);
    return token ? token.symbol : 'Unknown';
  }

  // ================================================================
  // MODAL HELPERS
  // ================================================================
  async showConfirmationModal(tokenAddresses, estimate) {
    // Show confirmation modal with sweep details
    return new Promise((resolve) => {
      // For now, auto-confirm
      resolve(true);
    });
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.sweeper = new Sweeper();
