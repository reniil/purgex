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
      
      // Step 6: Wait for confirmation
      this.updateStatusLog(`⏳ Waiting for confirmation... TX: ${tx.hash}`, 'pending');
      const receipt = await tx.wait();
      
      // Step 7: Success
      this.updateStatusLog(`✅ Sweep successful! Received ${estimate.prgxAmount} PRGX`, 'success');
      this.showTransactionLink(tx.hash);
      
      // Step 8: Refresh data
      await this.postSweepRefresh();
      
      return { success: true, txHash: tx.hash, prgxReceived: estimate.prgxAmount };
    } catch (error) {
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
    // Check wallet connection
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    // Check network
    if (window.wallet.chainId !== CONFIG.NETWORK.chainId) {
      throw new Error('Wrong network. Please switch to PulseChain');
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
    
    this.updateStatusLog(`📝 Need approval for ${approvalsNeeded.length} token(s)...`, 'info');
    
    // Process approvals
    for (const tokenAddress of approvalsNeeded) {
      await this.approveToken(tokenAddress);
    }
    
    this.updateStatusLog('✅ All token approvals completed', 'success');
  }

  async checkApprovalNeeded(tokenAddress) {
    try {
      if (!window.wallet?.provider || !window.wallet?.address) {
        return true;
      }
      
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
      if (!token) return true;
      
      return allowance < token.balance;
    } catch (error) {
      console.warn(`Approval check failed for ${tokenAddress}:`, error);
      return true; // Assume approval needed on error
    }
  }

  async approveToken(tokenAddress) {
    try {
      // Try real approval first
      const tokenContract = new ethers.Contract(
        tokenAddress,
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );
      
      try {
        const tx = await tokenContract.approve(
          CONFIG.CONTRACTS.SWEEPER,
          ethers.MaxUint256
        );
        
        this.updateStatusLog(`✅ Approval sent for ${this.getTokenSymbol(tokenAddress)}: ${tx.hash}`, 'pending');
        
        const receipt = await tx.wait();
        this.updateStatusLog(`✅ Approval confirmed for ${this.getTokenSymbol(tokenAddress)}`, 'success');
        
        this.approvalStatus.set(tokenAddress, true);
        this.updateApprovalUI(tokenAddress, true);
        
      } catch (approvalError) {
        console.warn('Real approval failed, checking if sweeper contract exists:', approvalError);
        
        // Check if sweeper contract exists
        try {
          const sweeperContract = new ethers.Contract(
            CONFIG.CONTRACTS.SWEEPER,
            CONFIG.ABIS.SWEEPER,
            window.wallet.provider
          );
          await sweeperContract.feePercent();
          
          // Contract exists but approval failed
          throw approvalError;
        } catch (viewError) {
          console.warn('Sweeper contract not deployed, simulating approval:', viewError);
          
          // Fallback: Simulate approval for demo
          this.updateStatusLog(`🧪 Simulating approval for ${this.getTokenSymbol(tokenAddress)}`, 'info');
          
          // Simulate approval delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          this.approvalStatus.set(tokenAddress, true);
          this.updateApprovalUI(tokenAddress, true);
          
          this.updateStatusLog(`✅ Mock approval completed for ${this.getTokenSymbol(tokenAddress)}`, 'success');
        }
      }
    } catch (error) {
      this.updateStatusLog(`❌ Approval failed for ${this.getTokenSymbol(tokenAddress)}: ${error.message}`, 'error');
      throw error;
    }
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
      
      // Try to execute real sweep first
      const sweeperContract = new ethers.Contract(
        CONFIG.CONTRACTS.SWEEPER,
        CONFIG.ABIS.SWEEPER,
        window.wallet.signer
      );
      
      try {
        const tx = await sweeperContract.sweep(tokenAddresses);
        this.updateStatusLog(`🚀 Sweep transaction sent: ${tx.hash}`, 'pending');
        
        const receipt = await tx.wait();
        this.updateStatusLog(`✅ Sweep completed! Block: ${receipt.blockNumber}`, 'success');
        
        return receipt;
      } catch (sweepError) {
        console.warn('Sweep transaction failed:', sweepError);
        throw sweepError;
      }
      
    } catch (error) {
      console.error('Sweep execution failed:', error);
      throw new Error(`Sweep failed: ${error.message}`);
    }
  }

  // ================================================================
  // HELPER METHODS
  // ================================================================
          throw contractError; // Contract exists but call failed
        } catch (viewError) {
          console.warn('Contract does not exist, simulating sweep:', viewError);
          
          // Fallback: Simulate sweep for demo purposes
          this.updateStatusLog('🧪 Contract not deployed - simulating sweep for demo', 'info');
          
          // Simulate transaction
          const mockTx = {
            hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
            wait: async () => {
              // Simulate 2 second delay
              await new Promise(resolve => setTimeout(resolve, 2000));
              return { status: 1, transactionHash: mockTx.hash };
            }
          };
          
          return mockTx;
        }
      }
    } catch (error) {
      console.error('Sweep transaction failed:', error);
      
      // Handle common errors
      if (error.code === 4001) {
        throw new Error('Transaction cancelled by user');
      } else if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds for gas');
      } else {
        throw new Error(`Transaction failed: ${error.message}`);
      }
    }
  }

  // ================================================================
  // CONFIRMATION MODAL
  // ================================================================
  async showConfirmationModal(selectedTokens, estimate) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modalOverlay');
      const content = document.getElementById('modalContent');
      
      if (!overlay || !content) {
        resolve(false);
        return;
      }
      
      // Build token list
      const tokenList = selectedTokens.map(address => {
        const token = window.tokenDiscovery.discoveredTokens.get(address);
        return `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-1);">
            <span>${token.symbol}</span>
            <span class="mono">${parseFloat(token.balanceFormatted).toLocaleString()}</span>
          </div>
        `;
      }).join('');
      
      content.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">Confirm Sweep</h3>
          <button class="btn-icon" onclick="sweeper.closeModal()">✕</button>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <h4 style="margin-bottom: 1rem;">You will sweep ${selectedTokens.length} tokens:</h4>
          <div style="max-height: 200px; overflow-y: auto;">
            ${tokenList}
          </div>
        </div>
        
        <div class="card" style="background: var(--bg-input); margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span>Estimated PRGX (before fee):</span>
            <span class="mono">${estimate.grossAmount.toFixed(4)} PRGX</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span>Protocol Fee (${CONFIG.SWEEP_FEE_PERCENT}%):</span>
            <span class="mono">${estimate.feeAmount.toFixed(4)} PRGX</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 1.1rem;">
            <span>You will receive:</span>
            <span class="mono" style="color: var(--primary-light);">${estimate.netAmount.toFixed(4)} PRGX</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; color: var(--text-3);">
            <span>Estimated USD value:</span>
            <span class="mono">$${estimate.usdValue.toFixed(6)}</span>
          </div>
        </div>
        
        <div style="display: flex; gap: 1rem;">
          <button class="btn-secondary" onclick="sweeper.closeModal()" style="flex: 1;">
            Cancel
          </button>
          <button class="btn-primary" onclick="sweeper.confirmSweep(true)" style="flex: 1;">
            🔥 Confirm Sweep
          </button>
        </div>
      `;
      
      overlay.classList.remove('hidden');
      
      // Store resolve function
      this.confirmationResolve = resolve;
    });
  }

  confirmSweep(confirmed) {
    this.closeModal();
    if (this.confirmationResolve) {
      this.confirmationResolve(confirmed);
      this.confirmationResolve = null;
    }
  }

  closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  // ================================================================
  // TRANSACTION LINK
  // ================================================================
  showTransactionLink(txHash) {
    const link = document.getElementById('txLink');
    if (link) {
      link.href = `${CONFIG.NETWORK.explorer}/tx/${txHash}`;
      link.classList.remove('hidden');
    }
  }

  // ================================================================
  // POST SWEEP REFRESH
  // ================================================================
  async postSweepRefresh() {
    try {
      // Refresh token discovery
      if (window.tokenDiscovery) {
        await window.tokenDiscovery.refreshTokens();
      }
      
      // Refresh wallet balance
      if (window.wallet) {
        window.wallet.updateAllWalletUI();
      }
      
      // Clear selection
      window.tokenDiscovery.deselectAll();
    } catch (error) {
      console.error('Post-sweep refresh failed:', error);
    }
  }

  // ================================================================
  // INITIATE SWEEP (called from UI)
  // ================================================================
  async initiateSweep() {
    if (this.isSweeping) {
      window.wallet.showToast('Sweep already in progress', 'error');
      return;
    }
    
    try {
      const selectedTokens = Array.from(window.tokenDiscovery.selectedTokens);
      await this.executeSweep(selectedTokens);
      
      window.wallet.showToast('Sweep completed successfully!', 'success');
    } catch (error) {
      console.error('Sweep failed:', error);
      window.wallet.showToast(error.message, 'error');
    }
  }

  // ================================================================
  // HELPERS
  // ================================================================
  getTokenSymbol(address) {
    const token = window.tokenDiscovery.discoveredTokens.get(address);
    return token ? token.symbol : 'Unknown';
  }

  updateApprovalUI(tokenAddress, approved) {
    // Update UI to show approval status for a token
    const row = document.querySelector(`tr[data-token-address="${tokenAddress}"]`);
    if (row) {
      const badge = row.querySelector('.approval-badge') || document.createElement('span');
      badge.className = `badge ${approved ? 'badge-success' : 'badge-pending'}`;
      badge.textContent = approved ? '✓ Approved' : '⏳ Pending';
      if (!row.querySelector('.approval-badge')) {
        row.appendChild(badge);
      }
    }
  }

  updateStatusLog(message, type = 'info') {
    const log = document.getElementById('statusLog');
    if (!log) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    
    // Also update wallet status log if available
    if (window.wallet && window.wallet.updateStatusLog) {
      window.wallet.updateStatusLog(message, type);
    }
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.sweeper = new Sweeper();
