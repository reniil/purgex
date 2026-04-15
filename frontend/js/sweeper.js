// ================================================================
// SWEEPER - Dust sweep logic with approval flow
// ================================================================

class Sweeper {
  constructor() {
    this.isSweeping = false;
    this.selectedTokens = [];
    this.approvalStatus = new Map();
    this.autoStakeEnabled = true; // Default to enabled
    this.BASE_REWARD = 100; // Base reward of 100 PRGX for every sweep
  }

  toggleAutoStake(enabled) {
    this.autoStakeEnabled = enabled;
    console.log('Auto-stake toggled:', enabled);
    if (window.wallet?.showToast) {
      window.wallet.showToast(`Auto-stake ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }
  }

  // ================================================================
  // SAFE PARSE ETHER - Handles very small numbers and scientific notation
  // ================================================================
  safeParseEther(value) {
    try {
      // If value is 0 or very close to 0, return 0n
      if (!value || value === 0 || Math.abs(value) < 1e-18) {
        return 0n;
      }

      // Convert to string and handle scientific notation
      const valueStr = value.toString();

      // If it's in scientific notation, convert to decimal
      if (valueStr.includes('e')) {
        const [base, exponent] = valueStr.split('e');
        const exp = parseInt(exponent);
        const num = parseFloat(base);

        // If exponent is negative, we have a very small number
        if (exp < -18) {
          // Too small to represent in wei, return 0
          return 0n;
        }

        // Convert to fixed-point notation
        const decimalPlaces = Math.abs(exp);
        const fixedValue = num.toFixed(decimalPlaces + 18);
        return ethers.parseUnits(fixedValue, 'ether');
      }

      // Normal case - use parseEther directly
      return ethers.parseEther(valueStr);
    } catch (error) {
      console.warn('safeParseEther failed, returning 0:', error, value);
      return 0n;
    }
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
      this.updateStatusLog(`✅ Sweep successful! Received ${estimate.totalWithBonus} PRGX (including ${estimate.baseReward} bonus)`, 'success');
      this.showTransactionLink(tx.hash);

      // Step 8: Auto-stake PRGX
      const stakedAmount = await this.autoStakePRGX(estimate.totalWithBonus);

      // Step 9: Refresh data
      await this.postSweepRefresh();

      return { success: true, txHash: tx.hash, prgxReceived: estimate.totalWithBonus, stakedAmount };
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
      const lookupAddr = address.toLowerCase();
      const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
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
      
      // DEBUG: Log input
      console.log('🔍 getEstimate called with:', tokenAddresses);
      console.log('🔍 getEstimate type:', typeof tokenAddresses, 'length:', tokenAddresses?.length);

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
        
        // If contract returns 0, use fallback
        if (prgxAmount === 0 || isNaN(prgxAmount)) {
          console.warn('⚠️ Contract returned 0, using fallback estimation');
          throw new Error('Contract returned zero - using fallback');
        }
        
        const feeAmount = prgxAmount * (CONFIG.SWEEP_FEE_PERCENT / 100);
        const netAmount = prgxAmount - feeAmount;
        const baseReward = this.BASE_REWARD;
        const totalWithBonus = netAmount + baseReward;

        const usdValue = window.priceOracle ?
          window.priceOracle.prgxToUSD(totalWithBonus) : 0;

        console.log('✅ Real contract estimate successful:', { prgxAmount, feeAmount, netAmount, baseReward, totalWithBonus });

        return {
          grossAmount: prgxAmount,
          feeAmount: feeAmount,
          netAmount: netAmount,
          baseReward: baseReward,
          totalWithBonus: totalWithBonus,
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
        
        // DEBUG: Log what we're looking for
        console.log('🔍 DEBUG: tokenAddresses passed:', tokenAddresses);
        console.log('🔍 DEBUG: discoveredTokens size:', window.tokenDiscovery.discoveredTokens?.size);
        console.log('🔍 DEBUG: discoveredTokens keys:', Array.from(window.tokenDiscovery.discoveredTokens?.keys() || []));
        
        // Fallback estimation: sum up token values
        let totalUSD = 0;
        let totalPRGX = 0;
        let swappableCount = 0;
        let nonSwappableCount = 0;
        
        for (const address of tokenAddresses) {
          // Try both cases - discovered tokens stored as lowercase
          const lookupAddr = address.toLowerCase();
          const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
          console.log(`🔍 DEBUG: Looking up ${lookupAddr}, found:`, token ? {symbol: token.symbol, estimatedPRGX: token.estimatedPRGX} : 'NOT FOUND');
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
        const baseReward = this.BASE_REWARD;
        const totalWithBonus = netAmount + baseReward;

        console.log('📊 Fallback estimate:', { totalPRGX, totalUSD, swappableCount, nonSwappableCount, baseReward, totalWithBonus });

        return {
          grossAmount: totalPRGX,
          feeAmount: feeAmount,
          netAmount: netAmount,
          baseReward: baseReward,
          totalWithBonus: totalWithBonus,
          usdValue: totalUSD,
          rawEstimate: this.safeParseEther(totalPRGX),
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

      const lookupAddr = tokenAddress.toLowerCase();
      const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
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
        console.error('Approval failed:', approvalError);
        throw approvalError; // Throw real error instead of mocking
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
        console.error('Contract call failed:', contractError);
        throw contractError; // Throw real error instead of mocking
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
        const lookupAddr = address.toLowerCase();
        const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
        if (!token) {
          console.warn(`Token not found for address: ${address}`);
          return '';
        }
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
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span>Net PRGX from sweep:</span>
            <span class="mono">${estimate.netAmount.toFixed(4)} PRGX</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: var(--green);">
            <span>🎁 Base Reward:</span>
            <span class="mono" style="color: var(--green);">+${estimate.baseReward.toFixed(4)} PRGX</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 1.1rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-1);">
            <span>Total you will receive:</span>
            <span class="mono" style="color: var(--primary-light);">${estimate.totalWithBonus.toFixed(4)} PRGX</span>
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
      let hasUnpurgable = false;
      let hasPurgable = false;

      for (const address of selectedTokens) {
        const lookupAddr = address.toLowerCase();
        const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
        if (token) {
          if (token.classification === 'unpurgable') {
            hasUnpurgable = true;
          } else if (token.classification === 'purgable') {
            hasPurgable = true;
          }
        }
      }

      // Route to appropriate sweep method
      if (hasUnpurgable && hasPurgable) {
        // Mixed tokens - use sweep-to-wallet
        await this.executeSweepToWallet(selectedTokens);
      } else if (hasUnpurgable) {
        // Only unpurgable - skip these (can't be swept)
        window.wallet.showToast('Selected tokens cannot be swept', 'error');
        return;
      } else {
        // Only purgable - use sweep-to-wallet
        await this.executeSweepToWallet(selectedTokens);
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
  async swapOnPulseX(tokenAddress, amount, recipient = null) {
    try {
      if (!window.wallet?.provider || !window.wallet?.signer) {
        throw new Error('Wallet not connected');
      }

      const router = new ethers.Contract(
        ethers.getAddress(CONFIG.APIS.PULSEX_ROUTER.toLowerCase()),
        CONFIG.ABIS.PULSEX_ROUTER,
        window.wallet.signer
      );

      // Create swap path: token -> WPLS -> PRGX
      const path = [
        ethers.getAddress(tokenAddress.toLowerCase()),
        ethers.getAddress(CONFIG.CONTRACTS.WPLS.toLowerCase()),
        ethers.getAddress(CONFIG.CONTRACTS.PRGX_TOKEN.toLowerCase())
      ];

      // Approve router to spend token
      const tokenContract = new ethers.Contract(
        ethers.getAddress(tokenAddress.toLowerCase()),
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );

      const allowance = await tokenContract.allowance(window.wallet.address, router.target);
      if (allowance < amount) {
        const approveTx = await tokenContract.approve(router.target, ethers.MaxUint256);
        this.updateStatusLog(`📝 Approving router for ${this.getTokenSymbol(tokenAddress)}: ${approveTx.hash}`, 'pending');
        await approveTx.wait();
        this.updateStatusLog(`✅ Approval confirmed for ${this.getTokenSymbol(tokenAddress)}`, 'success');
      }

      // Get expected output
      const amounts = await router.getAmountsOut(amount, path);
      const expectedPRGX = amounts[2];

      // Calculate minimum output with slippage tolerance
      const slippageTolerance = CONFIG.SWEEP_CONFIG.SLIPPAGE_TOLERANCE / 100;
      const amountOutMin = expectedPRGX * (1 - slippageTolerance);

      // Get deadline (20 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      // Use provided recipient or default to treasury
      const recipientAddress = recipient || ethers.getAddress(CONFIG.CONTRACTS.TREASURY.toLowerCase());

      // Execute swap
      const tx = await router.swapExactTokensForTokens(
        amount,
        amountOutMin,
        path,
        recipientAddress,
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
        ethers.getAddress(tokenAddress.toLowerCase()),
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );

      // Transfer to fallback contract
      const tx = await tokenContract.transfer(
        ethers.getAddress(CONFIG.CONTRACTS.FALLBACK_CONTRACT.toLowerCase()),
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
  // SWEEP CONTRACT TRANSFER
  // ================================================================
  async transferToSweepContract(tokenAddress, amount) {
    try {
      if (!window.wallet?.provider || !window.wallet?.signer) {
        throw new Error('Wallet not connected');
      }

      const tokenContract = new ethers.Contract(
        ethers.getAddress(tokenAddress.toLowerCase()),
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );

      // Transfer to sweep contract (treasury)
      const tx = await tokenContract.transfer(
        ethers.getAddress(CONFIG.CONTRACTS.TREASURY.toLowerCase()),
        amount
      );

      this.updateStatusLog(`📤 Transferring ${this.getTokenSymbol(tokenAddress)} to sweep contract: ${tx.hash}`, 'pending');

      const receipt = await tx.wait();
      this.updateStatusLog(`✅ Transfer completed: ${receipt.transactionHash}`, 'success');

      return {
        success: true,
        txHash: receipt.transactionHash
      };
    } catch (error) {
      console.error(`Sweep contract transfer failed for ${tokenAddress}:`, error);
      this.updateStatusLog(`❌ Sweep contract transfer failed: ${error.message}`, 'error');
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
      const purgableTokens = [];
      const unpurgableTokens = [];

      for (const address of selectedTokenAddresses) {
        const lookupAddr = address.toLowerCase();
        const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
        if (token) {
          if (token.classification === 'purgable') {
            purgableTokens.push(address);
          } else {
            unpurgableTokens.push(address);
          }
        }
      }

      this.updateStatusLog(`📊 Found ${purgableTokens.length} purgable, ${unpurgableTokens.length} unpurgable tokens`, 'info');

      // Step 3: Get estimate (include all tokens)
      this.updateStatusLog('📊 Calculating estimated output...', 'info');
      let totalPRGX = 0;
      let totalUSD = 0;
      
      for (const address of selectedTokenAddresses) {
        const lookupAddr = address.toLowerCase();
        const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
        if (token) {
          totalPRGX += token.estimatedPRGX || 0;
          totalUSD += token.estimatedUSD || 0;
        }
      }

      // Step 4: Show confirmation modal
      const netAmount = totalPRGX * (1 - CONFIG.SWEEP_FEE_PERCENT / 100);
      const baseReward = this.BASE_REWARD;
      const totalWithBonus = netAmount + baseReward;

      const confirmed = await this.showConfirmationModal(selectedTokenAddresses, {
        grossAmount: totalPRGX,
        feeAmount: totalPRGX * (CONFIG.SWEEP_FEE_PERCENT / 100),
        netAmount: netAmount,
        baseReward: baseReward,
        totalWithBonus: totalWithBonus,
        usdValue: totalUSD,
        rawEstimate: this.safeParseEther(totalPRGX),
        purgableCount: purgableTokens.length,
        unpurgableCount: unpurgableTokens.length
      });

      if (!confirmed) {
        throw new Error('Sweep cancelled by user');
      }

      // Step 5: Handle approvals
      this.updateStatusLog('📋 Checking token approvals...', 'info');
      await this.handleApprovals(selectedTokenAddresses);

      // Step 6: Process purgable tokens (attempt swap to PRGX)
      this.updateStatusLog('🔄 Attempting to swap purgable tokens to PRGX...', 'info');

      for (const address of purgableTokens) {
        const lookupAddr = address.toLowerCase();
        const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
        if (token) {
          // Only attempt swap if token has non-zero balance
          if (token.balance > 0n) {
            this.updateStatusLog(`🔄 Attempting to swap ${this.getTokenSymbol(address)} to PRGX...`, 'info');
            const swapResult = await this.swapOnPulseX(address, token.balance, window.wallet.address);
            if (!swapResult.success) {
              // If swap fails, transfer to sweep contract as fallback
              this.updateStatusLog(`⚠️ Swap failed, transferring to sweep contract: ${address}`, 'warning');
              await this.transferToSweepContract(address, token.balance);
            } else {
              this.updateStatusLog(`✅ Successfully swapped ${this.getTokenSymbol(address)} to PRGX`, 'success');
            }
          } else {
            // Zero balance - transfer to sweep contract
            this.updateStatusLog(`📤 Zero balance token, transferring to sweep contract: ${address}`, 'info');
            await this.transferToSweepContract(address, token.balance);
          }
        }
      }

      // Step 7: Process unpurgable tokens (transfer to sweep contract if any)
      if (unpurgableTokens.length > 0) {
        this.updateStatusLog('📤 Transferring unpurgable tokens to sweep contract...', 'info');

        for (const address of unpurgableTokens) {
          const lookupAddr = address.toLowerCase();
          const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
          if (token) {
            await this.transferToSweepContract(address, token.balance);
          }
        }
      }

      // Step 8: Call sweep contract to process unpurgable tokens and reward PRGX
      if (unpurgableTokens.length > 0) {
        this.updateStatusLog('🔄 Processing sweep contract for unpurgable tokens...', 'info');

        try {
          const sweeperContract = new ethers.Contract(
            CONFIG.CONTRACTS.SWEEPER,
            CONFIG.ABIS.SWEEPER,
            window.wallet.signer
          );

          // Call the sweep contract to process unpurgable tokens
          const tx = await sweeperContract.sweep(unpurgableTokens);

          this.updateStatusLog(`⏳ Sweep contract processing: ${tx.hash}`, 'pending');

          const receipt = await tx.wait();
          this.updateStatusLog(`✅ Sweep contract completed: ${receipt.transactionHash}`, 'success');
        } catch (error) {
          console.error('Sweep contract call failed:', error);
          this.updateStatusLog(`⚠️ Sweep contract call failed: ${error.message}`, 'warning');
          // Continue anyway - tokens were already transferred
        }
      }

      // Step 9: Verify token balances after sweep
      this.updateStatusLog('🔍 Verifying token balances after sweep...', 'info');

      const verificationResults = [];
      for (const address of selectedTokenAddresses) {
        const lookupAddr = address.toLowerCase();
        const token = window.tokenDiscovery.discoveredTokens.get(lookupAddr);
        if (token) {
          const tokenContract = new ethers.Contract(
            address,
            CONFIG.ABIS.ERC20,
            window.wallet.provider
          );
          const currentBalance = await tokenContract.balanceOf(window.wallet.address);
          const wasSwept = currentBalance === 0n || currentBalance < token.balance;

          verificationResults.push({
            address: address,
            symbol: token.symbol,
            previousBalance: token.balance,
            currentBalance: currentBalance,
            wasSwept: wasSwept
          });

          if (wasSwept) {
            this.updateStatusLog(`✅ ${token.symbol} successfully swept (balance: ${ethers.formatEther(currentBalance)})`, 'success');
          } else {
            this.updateStatusLog(`⚠️ ${token.symbol} may not have been swept (balance: ${ethers.formatEther(currentBalance)})`, 'warning');
          }
        }
      }

      // Step 10: Check actual PRGX balance in wallet and auto-stake
      this.updateStatusLog('🔍 Checking PRGX balance in wallet...', 'info');

      // Get actual PRGX balance from wallet
      const prgxContract = new ethers.Contract(
        CONFIG.CONTRACTS.PRGX_TOKEN,
        CONFIG.ABIS.ERC20,
        window.wallet.provider
      );

      const prgxBalance = await prgxContract.balanceOf(window.wallet.address);
      const prgxBalanceFormatted = Number(ethers.formatEther(prgxBalance));

      console.log(`Actual PRGX balance in wallet: ${prgxBalanceFormatted}`);

      let stakedAmount = 0;
      if (prgxBalanceFormatted > 0) {
        stakedAmount = await this.autoStakePRGX(prgxBalanceFormatted);
      } else {
        this.updateStatusLog('ℹ️ No PRGX in wallet to stake', 'info');
      }

      // Step 11: Success
      const sweptCount = verificationResults.filter(r => r.wasSwept).length;
      this.updateStatusLog(`✅ Sweep completed! ${sweptCount}/${verificationResults.length} tokens swept. Received ${totalWithBonus.toFixed(4)} PRGX (including ${baseReward.toFixed(4)} bonus)${stakedAmount > 0 ? ', ' + stakedAmount.toFixed(4) + ' PRGX auto-staked' : ''}`, 'success');

      // Step 12: Refresh data
      await this.postSweepRefresh();

      return { success: true, message: 'Sweep-to-wallet completed', prgxReceived: totalWithBonus, stakedAmount, verificationResults };
    } catch (error) {
      this.updateStatusLog(`❌ Sweep-to-wallet failed: ${error.message}`, 'error');
      throw error;
    } finally {
      this.isSweeping = false;
    }
  }

  // ================================================================
  // AUTO-STAKE PRGX
  // ================================================================
  async autoStakePRGX(amountPRGX) {
    if (!amountPRGX || amountPRGX <= 0) {
      console.log('No PRGX to stake');
      return 0;
    }

    // Check if auto-stake is enabled
    if (!this.autoStakeEnabled) {
      this.updateStatusLog('ℹ️ Auto-stake disabled. PRGX remains in your wallet.', 'info');
      return 0;
    }

    try {
      this.updateStatusLog(`🔄 Step: Auto-staking ${amountPRGX.toFixed(4)} PRGX...`, 'info');

      // Check if staking contract is available
      if (!CONFIG.CONTRACTS.STAKING || CONFIG.CONTRACTS.STAKING === '0x0000000000000000000000000000000000000000') {
        this.updateStatusLog('⚠️ Staking contract not configured, skipping auto-stake', 'warning');
        return 0;
      }

      this.updateStatusLog('🔍 Step: Checking PRGX staking approval...', 'info');

      // Check and handle PRGX approval for staking
      const needsApproval = await this.checkPRGXStakingApproval(amountPRGX);
      if (needsApproval) {
        this.updateStatusLog('📝 Step: Approving PRGX for staking...', 'info');
        await this.approvePRGXForStaking(amountPRGX);
        this.updateStatusLog('✅ Step: PRGX approval completed', 'success');
      } else {
        this.updateStatusLog('✅ Step: PRGX already approved for staking', 'success');
      }

      this.updateStatusLog('🚀 Step: Executing stake transaction...', 'info');

      // Execute stake
      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        window.wallet.signer
      );

      const amountWei = ethers.parseEther(amountPRGX.toString());
      const tx = await stakingContract.stake(amountWei);

      this.updateStatusLog(`⏳ Step: Waiting for stake confirmation... TX: ${tx.hash}`, 'pending');

      const receipt = await tx.wait();

      this.updateStatusLog(`✅ Step: Successfully staked ${amountPRGX.toFixed(4)} PRGX for 24 hours!`, 'success');
      this.updateStatusLog(`📊 Step: Refreshing staking dashboard...`, 'info');
      window.wallet.showToast(`Auto-staked ${amountPRGX.toFixed(4)} PRGX for 24 hours!`, 'success');

      // Refresh staking dashboard if available
      if (window.stakingManager) {
        await window.stakingManager.loadDashboard();
        this.updateStatusLog('✅ Step: Staking dashboard refreshed', 'success');
      }

      return amountPRGX;

    } catch (error) {
      console.error('Auto-stake failed:', error);
      this.updateStatusLog(`❌ Step: Auto-stake failed: ${error.message}. PRGX remains in your wallet.`, 'error');
      window.wallet.showToast('Auto-stake failed. PRGX remains in wallet.', 'warning');
      return 0;
    }
  }

  async checkPRGXStakingApproval(amount) {
    try {
      const prgxContract = new ethers.Contract(
        CONFIG.CONTRACTS.PRGX_TOKEN,
        CONFIG.ABIS.ERC20,
        window.wallet.provider
      );

      const allowance = await prgxContract.allowance(
        window.wallet.address,
        CONFIG.CONTRACTS.STAKING
      );

      const amountWei = ethers.parseEther(amount.toString());
      return allowance < amountWei;
    } catch (error) {
      console.warn('PRGX staking approval check failed:', error);
      return true; // Assume approval needed
    }
  }

  async approvePRGXForStaking(amount) {
    try {
      const prgxContract = new ethers.Contract(
        CONFIG.CONTRACTS.PRGX_TOKEN,
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );

      const amountWei = ethers.parseEther(amount.toString());
      const tx = await prgxContract.approve(CONFIG.CONTRACTS.STAKING, amountWei);

      this.updateStatusLog(`⏳ PRGX approval TX: ${tx.hash}`, 'pending');

      const receipt = await tx.wait();

      this.updateStatusLog('✅ PRGX approved for staking', 'success');

    } catch (error) {
      console.error('PRGX staking approval failed:', error);
      throw new Error(`PRGX approval failed: ${error.message}`);
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
