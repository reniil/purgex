// ================================================================
// STAKING MANAGER — Staking dashboard with live reward counter
// ================================================================

class StakingManager {
  constructor() {
    this.dashboardData = null;
    this.rewardCounterInterval = null;
    this.pendingRewardsStart = 0;
    this.userStakeFraction = 0;
  }

  // ================================================================
  // LOAD DASHBOARD DATA
  // ================================================================
  async loadDashboard() {
    if (!window.wallet?.isConnected) {
      this.showDisconnectedState();
      return;
    }
    
    try {
      this.updateStatusLog('📊 Loading staking dashboard...', 'info');
      
      const provider = window.wallet.provider;
      const userAddress = window.wallet.address;
      
      // Create contract instances
      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        provider
      );
      
      const prgxContract = new ethers.Contract(
        CONFIG.CONTRACTS.PRGX_TOKEN,
        CONFIG.ABIS.ERC20,
        provider
      );
      
      // Fetch all data in parallel with error handling
      const results = await Promise.allSettled([
        stakingContract.getStakedBalance(userAddress),
        stakingContract.pendingRewardsOf(userAddress),
        stakingContract.getTotalStaked(),
        stakingContract.getRewardRate(),
        prgxContract.balanceOf(userAddress),
        window.priceOracle?.fetchPRGXPrice() || Promise.resolve(0)
      ]);
      
      // Extract results, using fallbacks for failed calls
      const stakedBalance = results[0].status === 'fulfilled' ? results[0].value : 0n;
      const pendingRewards = results[1].status === 'fulfilled' ? results[1].value : 0n;
      const totalStaked = results[2].status === 'fulfilled' ? results[2].value : 0n;
      const rewardRate = results[3].status === 'fulfilled' ? results[3].value : 0n;
      const walletBalance = results[4].status === 'fulfilled' ? results[4].value : 0n;
      const prgxPrice = results[5].status === 'fulfilled' ? results[5].value : 0;
      
      // Format data
      this.dashboardData = {
        stakedBalance: Number(ethers.formatEther(stakedBalance)),
        pendingRewards: Number(ethers.formatEther(pendingRewards)),
        totalStaked: Number(ethers.formatEther(totalStaked)),
        rewardRate: Number(ethers.formatEther(rewardRate)),
        walletBalance: Number(ethers.formatEther(walletBalance)),
        prgxPrice: prgxPrice
      };
      
      // Calculate APR
      const apr = this.calculateAPR(this.dashboardData.rewardRate, this.dashboardData.totalStaked);
      this.dashboardData.apr = apr;
      
      // Update UI
      this.updateDashboardUI();
      
      // Start live reward counter
      this.startLiveRewardCounter(this.dashboardData.pendingRewards);
      
      this.updateStatusLog('✅ Dashboard loaded', 'success');
      
    } catch (error) {
      console.error('Dashboard load failed:', error);
      this.updateStatusLog(`❌ Failed to load dashboard: ${error.message}`, 'error');
      
      // Show demo data if contracts don't exist
      this.showDemoData();
      window.wallet.showToast('Using demo data - contracts not deployed yet', 'info');
    }
  }

  // ================================================================
  // SHOW DEMO DATA (for when contracts aren't deployed)
  // ================================================================
  showDemoData() {
    this.dashboardData = {
      stakedBalance: 0,
      pendingRewards: 0,
      totalStaked: 0,
      rewardRate: CONFIG.REWARDS_PER_SECOND,
      walletBalance: 0,
      prgxPrice: 0.000008943,
      apr: 0
    };
    
    this.updateDashboardUI();
    this.updateStatusLog('📊 Showing demo data', 'info');
  }

  // ================================================================
  // CALCULATE APR
  // ================================================================
  calculateAPR(rewardRatePerSec, totalStaked) {
    if (totalStaked === 0) return 0;
    
    // Formula: (rewardRate * seconds_in_year / totalStaked) * 100
    const secondsInYear = 31536000; // 365 * 24 * 60 * 60
    const yearlyRewards = rewardRatePerSec * secondsInYear;
    const apr = (yearlyRewards / totalStaked) * 100;
    
    return apr;
  }

  // ================================================================
  // LIVE REWARD COUNTER
  // ================================================================
  startLiveRewardCounter(initialRewards) {
    // Clear existing interval
    if (this.rewardCounterInterval) {
      clearInterval(this.rewardCounterInterval);
    }
    
    if (!this.dashboardData || this.dashboardData.totalStaked === 0) {
      return;
    }
    
    // Calculate user's share of rewards
    this.userStakeFraction = this.dashboardData.stakedBalance / this.dashboardData.totalStaked;
    this.pendingRewardsStart = initialRewards;
    const startTime = Date.now();
    
    // Update counter every second
    this.rewardCounterInterval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const accruedRewards = elapsedSeconds * this.dashboardData.rewardRate * this.userStakeFraction;
      const currentRewards = this.pendingRewardsStart + accruedRewards;
      
      // Update display
      const counter = document.getElementById('pendingRewards');
      if (counter) {
        counter.textContent = currentRewards.toFixed(4);
      }
      
      // Update claim button
      this.updateClaimButton(currentRewards);
    }, 1000);
  }

  stopLiveRewardCounter() {
    if (this.rewardCounterInterval) {
      clearInterval(this.rewardCounterInterval);
      this.rewardCounterInterval = null;
    }
  }

  // ================================================================
  // STAKE PRGX
  // ================================================================
  async stake(amountPRGX) {
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    if (!amountPRGX || parseFloat(amountPRGX) <= 0) {
      throw new Error('Invalid stake amount');
    }
    
    if (!this.dashboardData) {
      throw new Error('Dashboard data not loaded');
    }
    
    if (parseFloat(amountPRGX) > this.dashboardData.walletBalance) {
      throw new Error('Insufficient PRGX balance');
    }
    
    try {
      this.updateStatusLog('📝 Checking PRGX approval...', 'info');
      
      // Check and handle approval
      const needsApproval = await this.checkStakingApproval(amountPRGX);
      if (needsApproval) {
        await this.approveStaking(amountPRGX);
      }
      
      this.updateStatusLog('🚀 Executing stake transaction...', 'pending');
      
      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        window.wallet.signer
      );
      
      const amountWei = ethers.parseEther(amountPRGX);
      const tx = await stakingContract.stake(amountWei);
      
      this.updateStatusLog(`⏳ Stake TX: ${tx.hash}`, 'pending');
      
      const receipt = await tx.wait();
      
      this.updateStatusLog('✅ Stake successful!', 'success');
      
      // Reload dashboard
      await this.loadDashboard();
      
      window.wallet.showToast(`Successfully staked ${amountPRGX} PRGX`, 'success');
      
    } catch (error) {
      console.error('Stake failed:', error);
      this.updateStatusLog(`❌ Stake failed: ${error.message}`, 'error');
      
      if (error.code === 4001) {
        throw new Error('Transaction cancelled');
      } else {
        throw new Error(`Stake failed: ${error.message}`);
      }
    }
  }

  // ================================================================
  // UNSTAKE PRGX
  // ================================================================
  async unstake(amountPRGX) {
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    if (!amountPRGX || parseFloat(amountPRGX) <= 0) {
      throw new Error('Invalid unstake amount');
    }
    
    if (!this.dashboardData) {
      throw new Error('Dashboard data not loaded');
    }
    
    if (parseFloat(amountPRGX) > this.dashboardData.stakedBalance) {
      throw new Error('Insufficient staked balance');
    }
    
    try {
      this.updateStatusLog('🚀 Executing unstake transaction...', 'pending');
      
      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        window.wallet.signer
      );
      
      const amountWei = ethers.parseEther(amountPRGX);
      const tx = await stakingContract.withdraw(amountWei);
      
      this.updateStatusLog(`⏳ Unstake TX: ${tx.hash}`, 'pending');
      
      const receipt = await tx.wait();
      
      this.updateStatusLog('✅ Unstake successful!', 'success');
      
      // Reload dashboard
      await this.loadDashboard();
      
      window.wallet.showToast(`Successfully unstaked ${amountPRGX} PRGX`, 'success');
      
    } catch (error) {
      console.error('Unstake failed:', error);
      this.updateStatusLog(`❌ Unstake failed: ${error.message}`, 'error');
      
      if (error.code === 4001) {
        throw new Error('Transaction cancelled');
      } else {
        throw new Error(`Unstake failed: ${error.message}`);
      }
    }
  }

  // ================================================================
  // CLAIM REWARDS
  // ================================================================
  async claimRewards() {
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    if (!this.dashboardData) {
      throw new Error('Dashboard data not loaded');
    }
    
    if (this.dashboardData.pendingRewards <= 0) {
      throw new Error('No rewards to claim');
    }
    
    try {
      this.updateStatusLog('� Claiming rewards...', 'pending');
      
      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        window.wallet.signer
      );
      
      const tx = await stakingContract.claimReward();
      
      this.updateStatusLog(`⏳ Claim TX: ${tx.hash}`, 'pending');
      
      const receipt = await tx.wait();
      
      // Extract claimed amount from event
      const claimedEvent = receipt.logs?.find(log => {
        try {
          const parsed = stakingContract.interface.parseLog(log);
          return parsed.name === 'RewardPaid';
        } catch {
          return false;
        }
      });
      
      let claimedAmount = 0;
      if (claimedEvent) {
        const parsed = stakingContract.interface.parseLog(claimedEvent);
        claimedAmount = Number(ethers.formatEther(parsed.args.amount));
      }
      
      this.updateStatusLog(`✅ Claimed ${claimedAmount.toFixed(4)} PRGX!`, 'success');
      
      // Reload dashboard
      await this.loadDashboard();
      
      window.wallet.showToast(`Successfully claimed ${claimedAmount.toFixed(4)} PRGX`, 'success');
      
    } catch (error) {
      console.error('Claim failed:', error);
      this.updateStatusLog(`❌ Claim failed: ${error.message}`, 'error');
      
      if (error.code === 4001) {
        throw new Error('Transaction cancelled');
      } else {
        throw new Error(`Claim failed: ${error.message}`);
      }
    }
  }

  // ================================================================
  // APPROVAL HELPERS
  // ================================================================
  async checkStakingApproval(amount) {
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
      
      const amountWei = ethers.parseEther(amount);
      return allowance < amountWei;
    } catch (error) {
      console.warn('Approval check failed:', error);
      return true; // Assume approval needed
    }
  }

  async approveStaking(amount) {
    try {
      this.updateStatusLog('📝 Approving PRGX for staking...', 'pending');
      
      const prgxContract = new ethers.Contract(
        CONFIG.CONTRACTS.PRGX_TOKEN,
        CONFIG.ABIS.ERC20,
        window.wallet.signer
      );
      
      const amountWei = ethers.parseEther(amount);
      const tx = await prgxContract.approve(CONFIG.CONTRACTS.STAKING, amountWei);
      
      this.updateStatusLog(`⏳ Approval TX: ${tx.hash}`, 'pending');
      
      const receipt = await tx.wait();
      
      this.updateStatusLog('✅ PRGX approved for staking', 'success');
      
    } catch (error) {
      console.error('Approval failed:', error);
      throw new Error(`Approval failed: ${error.message}`);
    }
  }

  // ================================================================
  // MAX BUTTONS
  // ================================================================
  setMaxStake() {
    if (!this.dashboardData) return;
    
    const input = document.getElementById('stakeAmount');
    if (input) {
      input.value = Math.max(0, this.dashboardData.walletBalance - 0.001).toFixed(6);
    }
  }

  setMaxUnstake() {
    if (!this.dashboardData) return;
    
    const input = document.getElementById('unstakeAmount');
    if (input) {
      input.value = this.dashboardData.stakedBalance.toFixed(6);
    }
  }

  // ================================================================
  // UI UPDATES
  // ================================================================
  updateDashboardUI() {
    if (!this.dashboardData) return;
    
    // Update stat cards
    this.updateElement('stakedBalance', this.dashboardData.stakedBalance.toFixed(2));
    this.updateElement('totalStaked', this.dashboardData.totalStaked.toFixed(0));
    this.updateElement('estimatedAPR', `${this.dashboardData.apr.toFixed(1)}%`);
    
    // Update wallet and staked displays
    this.updateElement('walletPRGX', `${this.dashboardData.walletBalance.toFixed(4)} PRGX`);
    this.updateElement('stakedDisplay', `${this.dashboardData.stakedBalance.toFixed(4)} PRGX`);
    
    // Update pending rewards (will be updated by live counter)
    this.updateElement('pendingRewards', this.dashboardData.pendingRewards.toFixed(4));
    
    // Update claim button
    this.updateClaimButton(this.dashboardData.pendingRewards);
  }

  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  updateClaimButton(pendingRewards) {
    const claimBtn = document.getElementById('claimBtn');
    const claimAmount = document.getElementById('claimAmount');
    
    if (claimBtn && claimAmount) {
      claimAmount.textContent = pendingRewards.toFixed(4);
      claimBtn.disabled = pendingRewards <= 0;
    }
  }

  showDisconnectedState() {
    // Show placeholder values
    this.updateElement('stakedBalance', '—');
    this.updateElement('pendingRewards', '—');
    this.updateElement('estimatedAPR', '—');
    this.updateElement('totalStaked', '—');
    this.updateElement('walletPRGX', '— PRGX');
    this.updateElement('stakedDisplay', '— PRGX');
    
    // Disable action buttons
    const buttons = ['claimBtn'];
    buttons.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = true;
    });
  }

  // ================================================================
  // UI HELPERS
  // ================================================================
  updateStatusLog(message, type = 'info') {
    const log = document.getElementById('statusLog');
    if (!log) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  // ================================================================
  // CLEANUP
  // ================================================================
  cleanup() {
    this.stopLiveRewardCounter();
    this.dashboardData = null;
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.stakingManager = new StakingManager();
