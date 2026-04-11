// ================================================================
// STAKING MANAGER — Staking dashboard with live reward counter
// ================================================================

class StakingManager {
  constructor() {
    this.dashboardData = null;
    this.rewardCounterInterval = null;
    this.pendingRewardsStart = 0;
    this.userStakeFraction = 0;
    this.lastUnstakeTime = null;
    this.cooldownData = null;
    this.cooldownInterval = null;
    this.COOLDOWN_PERIOD = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
  }

  // ================================================================
  // LOAD DASHBOARD DATA
  // ================================================================
  async loadDashboard() {
    try {
      this.updateStatusLog('📊 Loading staking dashboard...', 'info');

      // Use read-only provider for global data (works without wallet)
      const readProvider = new ethers.JsonRpcProvider(CONFIG.NETWORK.rpc);
      const isConnected = window.wallet?.isConnected;
      const userAddress = window.wallet?.address;

      console.log('🔍 [STAKING] Loading dashboard. Wallet connected:', isConnected);
      console.log('🔍 [STAKING] Staking contract:', CONFIG.CONTRACTS.STAKING);

      // Create contract instances with read provider
      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        readProvider
      );

      // Fetch global pool data (available to everyone)
      const globalResults = await Promise.allSettled([
        stakingContract.totalStaked(),
        stakingContract.rewardRate(),
        window.priceOracle?.fetchPRGXPrice() || Promise.resolve(0)
      ]);

      // Log global results
      globalResults.forEach((result, index) => {
        const methodNames = ['totalStaked', 'rewardRate', 'prgxPrice'];
        if (result.status === 'rejected') {
          console.error(`❌ [STAKING] ${methodNames[index]} failed:`, result.reason);
        } else {
          console.log(`✅ [STAKING] ${methodNames[index]}:`, result.value);
        }
      });

      const totalStaked = globalResults[0].status === 'fulfilled' ? globalResults[0].value : 0n;
      const rewardRate = globalResults[1].status === 'fulfilled' ? globalResults[1].value : 0n;
      const prgxPrice = globalResults[2].status === 'fulfilled' ? globalResults[2].value : 0;

      // Initialize dashboard data with global values
      this.dashboardData = {
        totalStaked: Number(ethers.formatEther(totalStaked)),
        rewardRate: Number(ethers.formatEther(rewardRate)),
        prgxPrice: prgxPrice,
        // User-specific defaults (will be updated if wallet connected)
        stakedBalance: 0,
        pendingRewards: 0,
        walletBalance: 0
      };

      // Calculate APR from global data
      this.dashboardData.apr = this.calculateAPR(this.dashboardData.rewardRate, this.dashboardData.totalStaked);

      // If wallet is connected, fetch user-specific data
      if (isConnected && userAddress) {
        console.log('🔍 [STAKING] Loading user data for:', userAddress);

        const prgxContract = new ethers.Contract(
          CONFIG.CONTRACTS.PRGX_TOKEN,
          CONFIG.ABIS.ERC20,
          readProvider
        );

        // Fetch user-specific data including cooldown
        const userResults = await Promise.allSettled([
          stakingContract.getStakedBalance(userAddress),
          stakingContract.pendingRewardsOf(userAddress),
          prgxContract.balanceOf(userAddress),
          stakingContract.getCooldownRemaining(userAddress),
          stakingContract.canUnstake(userAddress)
        ]);

        // Log user results
        userResults.forEach((result, index) => {
          const methodNames = ['stakedBalance', 'pendingRewards', 'walletBalance', 'cooldownRemaining', 'canUnstake'];
          if (result.status === 'rejected') {
            console.error(`❌ [STAKING] ${methodNames[index]} failed:`, result.reason);
          } else {
            console.log(`✅ [STAKING] ${methodNames[index]}:`, result.value);
          }
        });

        // Update user-specific data
        this.dashboardData.stakedBalance = userResults[0].status === 'fulfilled' ?
          Number(ethers.formatEther(userResults[0].value)) : 0;
        this.dashboardData.pendingRewards = userResults[1].status === 'fulfilled' ?
          Number(ethers.formatEther(userResults[1].value)) : 0;
        this.dashboardData.walletBalance = userResults[2].status === 'fulfilled' ?
          Number(ethers.formatEther(userResults[2].value)) : 0;

        // Store cooldown data (frontend-only implementation)
        const lastUnstake = this.getLastUnstakeTime();
        const now = Date.now();
        const elapsed = now - lastUnstake;
        const remaining = Math.max(0, this.COOLDOWN_PERIOD - elapsed);

        this.cooldownData = {
          remaining: remaining,
          canUnstake: elapsed >= this.COOLDOWN_PERIOD || lastUnstake === 0
        };

        // Update UI for connected user
        this.updateDashboardUI();
        this.startLiveRewardCounter(this.dashboardData.pendingRewards);
        this.updateCooldownUI();
        this.startCooldownCounter();
        this.updateStatusLog('✅ Dashboard loaded with wallet data', 'success');
      } else {
        // Update UI for disconnected user (show global data only)
        this.updateDashboardUIGlobalOnly();
        this.updateStatusLog('✅ Global pool data loaded (connect wallet for personal stats)', 'info');
      }

      console.log('🔍 [STAKING] Dashboard data:', this.dashboardData);

    } catch (error) {
      console.error('Dashboard load failed:', error);
      this.updateStatusLog(`❌ Failed to load dashboard: ${error.message}`, 'error');

      // Show demo data if contracts don't exist
      this.showDemoData();
      if (window.wallet?.showToast) {
        window.wallet.showToast('Using demo data - contracts not deployed yet', 'info');
      }
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
  // COOLDOWN STORAGE (Frontend-only)
  // ================================================================
  getLastUnstakeTime() {
    const stored = localStorage.getItem('purgeX_lastUnstake');
    return stored ? parseInt(stored) : 0;
  }

  setLastUnstakeTime(timestamp) {
    localStorage.setItem('purgeX_lastUnstake', timestamp.toString());
  }

  clearCooldown() {
    localStorage.removeItem('purgeX_lastUnstake');
  }

  // ================================================================
  // COOLDOWN COUNTER
  // ================================================================
  startCooldownCounter() {
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
    }

    if (!this.cooldownData || this.cooldownData.remaining === 0) {
      return;
    }

    // Update cooldown display every second
    this.cooldownInterval = setInterval(() => {
      if (this.cooldownData.remaining > 0) {
        this.cooldownData.remaining -= 1;
        this.updateCooldownUI();
      } else {
        this.cooldownData.canUnstake = true;
        this.updateCooldownUI();
        clearInterval(this.cooldownInterval);
        this.cooldownInterval = null;
      }
    }, 1000);
  }

  stopCooldownCounter() {
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
    }
  }

  // ================================================================
  // STAKE PRGX
  // ================================================================
  async stake(amountPRGX) {
    console.log('🔍 [STAKE] Stake called with amount:', amountPRGX);
    
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    // Get amount from input if not provided
    if (!amountPRGX) {
      const input = document.getElementById('stakeAmount');
      if (input) {
        amountPRGX = input.value;
      }
    }
    
    console.log('🔍 [STAKE] Amount after input check:', amountPRGX);
    
    if (!amountPRGX || amountPRGX === '' || isNaN(parseFloat(amountPRGX)) || parseFloat(amountPRGX) <= 0) {
      throw new Error('Invalid stake amount. Please enter a valid number.');
    }
    
    const amount = parseFloat(amountPRGX);
    console.log('🔍 [STAKE] Parsed amount:', amount);
    
    if (!this.dashboardData) {
      throw new Error('Dashboard data not loaded. Please wait for data to load.');
    }
    
    if (amount > this.dashboardData.walletBalance) {
      throw new Error(`Insufficient PRGX balance. You have ${this.dashboardData.walletBalance.toFixed(4)} PRGX available.`);
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
      
      // Wait a moment for blockchain sync
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reload dashboard to update staked balance
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
    console.log('🔍 [UNSTAKE] Unstake called with amount:', amountPRGX);
    
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }

    // Check frontend cooldown
    const lastUnstake = this.getLastUnstakeTime();
    const now = Date.now();
    const elapsed = now - lastUnstake;

    if (lastUnstake > 0 && elapsed < this.COOLDOWN_PERIOD) {
      const hoursRemaining = Math.ceil((this.COOLDOWN_PERIOD - elapsed) / (60 * 60 * 1000));
      throw new Error(`Unstake cooldown active. Please wait ${hoursRemaining} hours before unstaking again.`);
    }

    // Get amount from input if not provided
    if (!amountPRGX) {
      const input = document.getElementById('unstakeAmount');
      if (input) {
        amountPRGX = input.value;
      }
    }
    
    console.log('🔍 [UNSTAKE] Amount after input check:', amountPRGX);
    
    if (!amountPRGX || amountPRGX === '' || isNaN(parseFloat(amountPRGX)) || parseFloat(amountPRGX) <= 0) {
      throw new Error('Invalid unstake amount. Please enter a valid number.');
    }
    
    const amount = parseFloat(amountPRGX);
    console.log('🔍 [UNSTAKE] Parsed amount:', amount);
    
    if (!this.dashboardData) {
      throw new Error('Dashboard data not loaded. Please wait for data to load.');
    }
    
    if (amount > this.dashboardData.stakedBalance) {
      throw new Error(`Insufficient staked balance. You have ${this.dashboardData.stakedBalance.toFixed(4)} PRGX staked.`);
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

      // Record last unstake time for frontend cooldown
      this.setLastUnstakeTime(Date.now());
      this.cooldownData = {
        remaining: this.COOLDOWN_PERIOD,
        canUnstake: false
      };
      this.startCooldownCounter();
      
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

  async unstakeAll() {
    if (!window.wallet?.isConnected) {
      throw new Error('Wallet not connected');
    }

    // Check frontend cooldown
    const lastUnstake = this.getLastUnstakeTime();
    const now = Date.now();
    const elapsed = now - lastUnstake;

    if (lastUnstake > 0 && elapsed < this.COOLDOWN_PERIOD) {
      const hoursRemaining = Math.ceil((this.COOLDOWN_PERIOD - elapsed) / (60 * 60 * 1000));
      throw new Error(`Unstake cooldown active. Please wait ${hoursRemaining} hours before unstaking again.`);
    }

    try {
      this.updateStatusLog('🚀 Executing unstake all transaction...', 'pending');

      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        window.wallet.signer
      );

      const tx = await stakingContract.withdrawAll();

      this.updateStatusLog(`⏳ Unstake All TX: ${tx.hash}`, 'pending');

      const receipt = await tx.wait();

      this.updateStatusLog('✅ Unstake all successful!', 'success');

      // Record last unstake time for frontend cooldown
      this.setLastUnstakeTime(Date.now());
      this.cooldownData = {
        remaining: this.COOLDOWN_PERIOD,
        canUnstake: false
      };
      this.startCooldownCounter();

      // Reload dashboard
      await this.loadDashboard();

      window.wallet.showToast('Successfully unstaked all PRGX', 'success');

    } catch (error) {
      console.error('Unstake all failed:', error);
      this.updateStatusLog(`❌ Unstake all failed: ${error.message}`, 'error');

      if (error.code === 4001) {
        throw new Error('Transaction cancelled');
      } else {
        throw new Error(`Unstake all failed: ${error.message}`);
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
    
    try {
      this.updateStatusLog('🚀 Executing claim transaction...', 'pending');
      
      const stakingContract = new ethers.Contract(
        CONFIG.CONTRACTS.STAKING,
        CONFIG.ABIS.STAKING,
        window.wallet.signer
      );
      
      const tx = await stakingContract.claimReward();
      
      this.updateStatusLog(`⏳ Claim TX: ${tx.hash}`, 'pending');
      
      const receipt = await tx.wait();
      
      this.updateStatusLog('✅ Rewards claimed!', 'success');
      
      // Reload dashboard
      await this.loadDashboard();
      
      window.wallet.showToast('Successfully claimed rewards', 'success');
      
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

    // Hide connect banner when connected
    const connectBanner = document.getElementById('stakingConnectBanner');
    if (connectBanner) {
      connectBanner.style.display = 'none';
    }

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

  updateCooldownUI() {
    if (!this.cooldownData) return;

    const cooldownEl = document.getElementById('unstakeCooldown');
    const unstakeBtn = document.getElementById('unstakeBtn');
    const unstakeAllBtn = document.getElementById('unstakeAllBtn');

    if (cooldownEl) {
      if (this.cooldownData.remaining > 0) {
        const hours = Math.floor(this.cooldownData.remaining / 3600);
        const minutes = Math.floor((this.cooldownData.remaining % 3600) / 60);
        const seconds = Math.floor(this.cooldownData.remaining % 60);
        cooldownEl.textContent = `⏱️ Cooldown: ${hours}h ${minutes}m ${seconds}s`;
        cooldownEl.style.display = 'block';
        cooldownEl.style.color = 'var(--red)';
      } else {
        cooldownEl.textContent = '✅ Ready to unstake';
        cooldownEl.style.color = 'var(--green)';
      }
    }

    // Disable unstake buttons during cooldown
    const canUnstake = this.cooldownData.canUnstake;
    if (unstakeBtn) unstakeBtn.disabled = !canUnstake;
    if (unstakeAllBtn) unstakeAllBtn.disabled = !canUnstake;
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
  // UI UPDATE FOR DISCONNECTED USERS (Global data only)
  // ================================================================
  updateDashboardUIGlobalOnly() {
    if (!this.dashboardData) return;

    // Show connect banner
    const connectBanner = document.getElementById('stakingConnectBanner');
    if (connectBanner) {
      connectBanner.style.display = 'block';
    }

    // Update global stats (visible to everyone)
    this.updateElement('totalStaked', this.dashboardData.totalStaked.toFixed(0));
    this.updateElement('estimatedAPR', `${this.dashboardData.apr.toFixed(1)}%`);

    // Show connect prompt for user-specific stats
    this.updateElement('stakedBalance', 'Connect Wallet');
    this.updateElement('pendingRewards', '—');
    this.updateElement('walletPRGX', '— PRGX');
    this.updateElement('stakedDisplay', '— PRGX');

    // Disable action buttons
    const buttons = ['claimBtn'];
    buttons.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = true;
    });

    // Add click handlers to connect wallet on user stats
    const stakedBalanceEl = document.getElementById('stakedBalance');
    if (stakedBalanceEl) {
      stakedBalanceEl.style.cursor = 'pointer';
      stakedBalanceEl.style.color = 'var(--primary-light)';
      stakedBalanceEl.onclick = () => {
        if (window.wallet?.connect) {
          window.wallet.connect();
        }
      };
      stakedBalanceEl.title = 'Click to connect wallet';
    }
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
    this.stopCooldownCounter();
    this.dashboardData = null;
    this.cooldownData = null;
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.stakingManager = new StakingManager();
