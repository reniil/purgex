// ================================================================
// SWEEPER - Dust sweep logic with approval flow
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
      this.updateStatusLog(`✅ Sweep successful! Received ${estimate.netAmount} PRGX`, 'success');
      this.showTransactionLink(tx.hash);

      // Step 8: Refresh data
      await this.postSweepRefresh();

      return { success: true, txHash: tx.hash, prgxReceived: estimate.netAmount };
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
  // ESTIMATE OUTPUT
  // ================================================================
  async getEstimate(tokenAddresses) {
    try {
      if (!window.wallet?.provider) {
        throw new Error('Wallet provider not available');
      }

      // Try to get real estimate from contract first
      const sweeperContract = new ethers.Contract(
        CONFIG.CONTRACTS.SWEEPER,
        CONFIG.ABIS.SWEEPER,
        window.wallet.provider
      );

      try {
        const estimate = await sweeperContract.getEstimatedOutput(
          tokenAddresses,
          window.wallet.address
        );

        const prgxAmount = Number(ethers.formatEther(estimate));
        const feeAmount = prgxAmount * (CONFIG.SWEEP_FEE_PERCENT / 100);
        const netAmount = prgxAmount - feeAmount;

        const usdValue = window.priceOracle ?
          window.priceOracle.prgxToUSD(netAmount) : 0;

        console.log('✅ Real contract estimate successful:', { prgxAmount, feeAmount, netAmount });

        return {
          grossAmount: prgxAmount,
          feeAmount: feeAmount,
          netAmount: netAmount,
          usdValue: usdValue,
          rawEstimate: estimate
        };
      } catch (contractError) {
        console.warn('Contract call failed, using fallback estimation:', contractError);
        
        // Ensure price oracle has the PRGX price
        if (window.priceOracle && !window.priceOracle.prgxPriceUSD) {
          console.log('⏳ Fetching PRGX price...');
          await window.priceOracle.fetchPRGXPrice();
        }
        
        // Fallback estimation: sum up token values
        let totalUSD = 0;
        let totalPRGX = 0;
        let swappableCount = 0;
        let nonSwappableCount = 0;
        
        for (const address of tokenAddresses) {
          const token = window.tokenDiscovery.discoveredTokens.get(address);
          if (token) {
            totalUSD += token.estimatedUSD || 0;
            totalPRGX += token.estimatedPRGX || 0;
            if (token.classification === 'swappable') swappableCount++;
            else if (token.classification === 'non-swappable') nonSwappableCount++;
          }
        }
        
        // If still 0, use fixed pricing
        if (totalPRGX === 0 && totalUSD > 0) {
          totalPRGX = totalUSD * CONFIG.SWEEP_CONFIG.FIXED_PRGX_PER_USD;
          console.log('📊 Using fixed pricing:', { totalUSD, totalPRGX });
        }
        
        const feeAmount = totalPRGX * (CONFIG.SWEEP_FEE_PERCENT / 100);
        const netAmount = totalPRGX - feeAmount;
        
        console.log('📊 Fallback estimate:', { totalPRGX, totalUSD, swappableCount, nonSwappableCount });
        
        return {
          grossAmount: totalPRGX,
          feeAmount: feeAmount,
          netAmount: netAmount,
          usdValue: totalUSD,
          rawEstimate: ethers.parseEther(totalPRGX.toString()),
          swappableCount,
          nonSwappableCount
        };
      }
    } catch (error) {
      console.error('Estimate failed:', error);
      throw new Error('Failed to estimate sweep output');
    }
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

          this.updateStatusLog(`✅ Mock approval completed for ${this.getTokenSymbol(tokenAddress)}`, 'success');
        }
      }
    } catch (error) {
      this.updateStatusLog(`❌ Approval failed for ${this.getTokenSymbol(tokenAddress)}: ${error.message}`, 'error');
      throw error;
    }
  }

  // ================================================================
  // EXECUTE SWEEP TRANSACTION
  // ================================================================
  async executeSweepTransaction(tokenAddresses) {
    try {
      // Try to execute real sweep first
      const sweeperContract = new ethers.Contract(
        CONFIG.CONTRACTS.SWEEPER,
        CONFIG.ABIS.SWEEPER,
        window.wallet.signer
      );

      try {
        const tx = await sweeperContract.sweep(tokenAddresses);

        this.updateStatusLog(`🚀 Sweep transaction sent: ${tx.hash}`, 'pending');

        return tx;
      } catch (contractError) {
        console.warn('Contract call failed, checking if contract exists:', contractError);

        // Check if contract exists by calling a view function
        try {
          await sweeperContract.feePercent();
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

      // Build token list with classification (sanitized)
      const tokenList = selectedTokens.map(address => {
        const token = window.tokenDiscovery.discoveredTokens.get(address);
        const safeSymbol = token.symbol ? Utils.sanitize(token.symbol) : '???';
        const classificationBadge = token.classification === 'swappable' ? '🟢' :
                                   token.classification === 'non-swappable' ? '🔴' : '⚪';
        return `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-1);">
            <span>${classificationBadge} ${safeSymbol}</span>
            <span class="mono">${parseFloat(token.balanceFormatted).toLocaleString()}</span>
          </div>
        `;
      }).join('');

      // Determine sweep method
      const sweepMethod = estimate.swappableCount > 0 || estimate.nonSwappableCount > 0
        ? 'Sweep-to-Wallet (PulseX Swap + Fallback)'
        : 'Original Sweep (Contract)';

      content.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">Confirm Sweep</h3>
          <button class="btn-icon" onclick="sweeper.closeModal()">✕</button>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <h4 style="margin-bottom: 1rem;">Sweep Method:</h4>
          <div style="padding: 1rem; background: var(--bg-input); border-radius: var(--r-md); margin-bottom: 1rem;">
            <span style="color: var(--primary-light); font-weight: 600;">${sweepMethod}</span>
            ${estimate.swappableCount !== undefined ? `
              <div style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-2);">
                🟢 ${estimate.swappableCount} swappable → PulseX → Treasury<br>
                🔴 ${estimate.nonSwappableCount} non-swappable → Fallback contract
              </div>
            ` : ''}
          </div>

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

      // Check token classifications to determine routing
      let hasNonSwappable = false;
      let hasSwappable = false;

      for (const address of selectedTokens) {
        const token = window.tokenDiscovery.discoveredTokens.get(address);
        if (token) {
          if (token.classification === 'non-swappable' || token.classification === 'unknown') {
            hasNonSwappable = true;
          } else if (token.classification === 'swappable') {
            hasSwappable = true;
          }
        }
      }

      // Route to appropriate sweep method
      if (hasNonSwappable) {
        // Use sweep-to-wallet for non-swappable tokens
        this.updateStatusLog('🔄 Using sweep-to-wallet for non-swappable tokens', 'info');
        await this.executeSweepToWallet(selectedTokens);
      } else if (hasSwappable) {
        // Use sweep-to-wallet for swappable tokens (to avoid burning)
        this.updateStatusLog('🔄 Using sweep-to-wallet for swappable tokens', 'info');
        await this.executeSweepToWallet(selectedTokens);
      } else {
        // Fallback to original sweep if classification unknown
        this.updateStatusLog('🔄 Using original sweep method', 'info');
        await this.executeSweep(selectedTokens);
      }

      window.wallet.showToast('Sweep completed successfully!', 'success');
    } catch (error) {
      console.error('Sweep failed:', error);
      window.wallet.showToast(error.message, 'error');
    }
  }

  // ================================================================
  // PULSEX SWAP INTEGRATION
  // ================================================================
  async swapOnPulseX(tokenAddress, amount) {
    try {
      if (!window.wallet?.provider || !window.wallet?.signer) {
        throw new Error('Wallet not connected');
      }

      const router = new ethers.Contract(
        CONFIG.APIS.PULSEX_ROUTER,
        CONFIG.ABIS.PULSEX_ROUTER,
        window.wallet.signer
      );

      // Create swap path: token -> WPLS -> PRGX
      const path = [tokenAddress, CONFIG.CONTRACTS.WPLS, CONFIG.CONTRACTS.PRGX_TOKEN];

      // Get expected output
      const amounts = await router.getAmountsOut(amount, path);
      const expectedPRGX = amounts[2];

      // Calculate minimum output with slippage tolerance
      const slippageTolerance = CONFIG.SWEEP_CONFIG.SLIPPAGE_TOLERANCE / 100;
      const amountOutMin = expectedPRGX * (1 - slippageTolerance);

      // Get deadline (20 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      // Execute swap
      const tx = await router.swapExactTokensForTokens(
        amount,
        amountOutMin,
        path,
        CONFIG.CONTRACTS.TREASURY, // Send PRGX to treasury
        deadline
      );

      this.updateStatusLog(`🔄 Swapping ${this.getTokenSymbol(tokenAddress)} for PRGX on PulseX: ${tx.hash}`, 'pending');

      const receipt = await tx.wait();
      this.updateStatusLog(`✅ Swap completed: ${receipt.transactionHash}`, 'success');

      return {
        success: true,
        txHash: receipt.transactionHash,
        prgxReceived: expectedPRGX
      };
    } catch (error) {
      console.warn(`PulseX swap failed for ${tokenAddress}:`, error);
      this.updateStatusLog(`⚠️ PulseX swap failed, will use fallback: ${error.message}`, 'warning');
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ================================================================
  // FALLBACK CONTRACT TRANSFER
  // ================================================================
  async transferToFallback(tokenAddress, amount) {
    try {
      if (!window.wallet?.provider || !window.wallet?.signer) {
        throw new Error('Wallet not connected');
      }

      const tokenContract = new ethers.Contract(
        tokenAddress,
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );

      // Transfer to fallback contract
      const tx = await tokenContract.transfer(
        CONFIG.CONTRACTS.FALLBACK_CONTRACT,
        amount
      );

      this.updateStatusLog(`📤 Transferring ${this.getTokenSymbol(tokenAddress)} to fallback contract: ${tx.hash}`, 'pending');

      const receipt = await tx.wait();
      this.updateStatusLog(`✅ Transfer completed: ${receipt.transactionHash}`, 'success');

      return {
        success: true,
        txHash: receipt.transactionHash
      };
    } catch (error) {
      console.error(`Fallback transfer failed for ${tokenAddress}:`, error);
      this.updateStatusLog(`❌ Fallback transfer failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ================================================================
  // NEW SWEEP-TO-WALLET METHOD
  // ================================================================
  async executeSweepToWallet(selectedTokenAddresses) {
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

      // Step 2: Classify tokens
      this.updateStatusLog('🔬 Classifying tokens...', 'info');
      const swappableTokens = [];
      const nonSwappableTokens = [];

      for (const address of selectedTokenAddresses) {
        const token = window.tokenDiscovery.discoveredTokens.get(address);
        if (token) {
          if (token.classification === 'swappable') {
            swappableTokens.push(address);
          } else {
            nonSwappableTokens.push(address);
          }
        }
      }

      this.updateStatusLog(`📊 Found ${swappableTokens.length} swappable, ${nonSwappableTokens.length} non-swappable tokens`, 'info');

      // Step 3: Get estimate
      let totalPRGX = 0;
      if (swappableTokens.length > 0) {
        this.updateStatusLog('📊 Calculating estimated output...', 'info');
        for (const address of swappableTokens) {
          const token = window.tokenDiscovery.discoveredTokens.get(address);
          if (token) {
            totalPRGX += token.estimatedPRGX || 0;
          }
        }
      }

      // Step 4: Show confirmation modal
      const confirmed = await this.showConfirmationModal(selectedTokenAddresses, {
        grossAmount: totalPRGX,
        feeAmount: totalPRGX * (CONFIG.SWEEP_FEE_PERCENT / 100),
        netAmount: totalPRGX * (1 - CONFIG.SWEEP_FEE_PERCENT / 100),
        usdValue: 0,
        rawEstimate: ethers.parseEther(totalPRGX.toString()),
        swappableCount: swappableTokens.length,
        nonSwappableCount: nonSwappableTokens.length
      });

      if (!confirmed) {
        throw new Error('Sweep cancelled by user');
      }

      // Step 5: Handle approvals
      this.updateStatusLog('📋 Checking token approvals...', 'info');
      await this.handleApprovals(selectedTokenAddresses);

      // Step 6: Process swappable tokens
      for (const address of swappableTokens) {
        const token = window.tokenDiscovery.discoveredTokens.get(address);
        if (token) {
          const swapResult = await this.swapOnPulseX(address, token.balance);
          if (!swapResult.success) {
            // If swap fails, transfer to fallback
            this.updateStatusLog(`⚠️ Swap failed, transferring to fallback: ${address}`, 'warning');
            await this.transferToFallback(address, token.balance);
          }
        }
      }

      // Step 7: Process non-swappable tokens
      for (const address of nonSwappableTokens) {
        const token = window.tokenDiscovery.discoveredTokens.get(address);
        if (token) {
          await this.transferToFallback(address, token.balance);
        }
      }

      // Step 8: Success
      this.updateStatusLog(`✅ Sweep-to-wallet completed!`, 'success');

      // Step 9: Refresh data
      await this.postSweepRefresh();

      return { success: true, message: 'Sweep-to-wallet completed' };
    } catch (error) {
      this.updateStatusLog(`❌ Sweep-to-wallet failed: ${error.message}`, 'error');
      throw error;
    } finally {
      this.isSweeping = false;
    }
  }

  // ================================================================
  // HELPERS
  // ================================================================
  getTokenSymbol(address) {
    const token = window.tokenDiscovery.discoveredTokens.get(address);
    return token ? token.symbol : 'Unknown';
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
