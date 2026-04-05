// PurgeX Frontend - Staking Dashboard Logic
// Staking, unstaking, and reward claiming functionality

class StakingDashboard {
  constructor(app) {
    this.app = app;
    this.refreshInterval = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadStakingData();
    this.startAutoRefresh();
  }

  setupEventListeners() {
    // Stake button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.stake-btn, [data-action="stake"]')) {
        this.handleStake();
      }
    });

    // Unstake button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.unstake-btn, [data-action="unstake"]')) {
        this.handleUnstake();
      }
    });

    // Claim rewards button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.claim-btn, [data-action="claim"]')) {
        this.handleClaimRewards();
      }
    });

    // Stake all button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.stake-all-btn, [data-action="stake-all"]')) {
        this.stakeAll();
      }
    });

    // Unstake all button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.unstake-all-btn, [data-action="unstake-all"]')) {
        this.unstakeAll();
      }
    });

    // Refresh button
    document.addEventListener('click', (e) => {
      if (e.target.matches('.refresh-staking-btn, [data-action="refresh-staking"]')) {
        this.loadStakingData();
      }
    });

    // Input validation
    document.addEventListener('input', (e) => {
      if (e.target.matches('.stake-input, .unstake-input')) {
        this.validateInput(e.target);
      }
    });
  }

  // Load staking data
  async loadStakingData() {
    if (!this.app.signer) {
      this.updateStakingUI(null);
      return;
    }

    try {
      const data = await this.fetchStakingData();
      this.updateStakingUI(data);
    } catch (error) {
      console.error('Error loading staking data:', error);
      this.app.showToast('Failed to load staking data', 'error');
    }
  }

  // Fetch staking data from contracts
  async fetchStakingData() {
    const account = this.app.account;
    const stakingContract = this.app.contracts.Staking;
    const prgxContract = this.app.contracts.PRGX;

    const [
      userStaked,
      pendingRewards,
      totalStaked,
      rewardRate,
      userBalance
    ] = await Promise.all([
      stakingContract.getStakedBalance(account),
      stakingContract.pendingRewardsOf(account),
      stakingContract.getTotalStaked(),
      stakingContract.getRewardRate(),
      prgxContract.balanceOf(account)
    ]);

    return {
      userStaked,
      pendingRewards,
      totalStaked,
      rewardRate,
      userBalance,
      apr: this.calculateAPR(totalStaked, rewardRate)
    };
  }

  // Calculate APR (ethers v6 syntax with safe formatting)
  calculateAPR(totalStaked, rewardRate) {
    if (!totalStaked || totalStaked.toString() === '0') return 0;
    
    const rewardsPerYear = parseFloat(this.safeFormatUnits(rewardRate, 18)) * 60 * 60 * 24 * 365;
    const totalStakedAmount = parseFloat(this.safeFormatUnits(totalStaked, 18));
    
    return ((rewardsPerYear / totalStakedAmount) * 100).toFixed(2);
  }

  // Update staking UI
  updateStakingUI(data) {
    if (!data) {
      // Not connected
      document.querySelectorAll('.staking-data').forEach(el => {
        el.textContent = '--';
      });
      return;
    }

    // Update stats cards
    this.updateElement('.user-staked', this.app.formatAmount(data.userStaked, 18, 4) + ' PRGX');
    this.updateElement('.pending-rewards', this.app.formatAmount(data.pendingRewards, 18, 4) + ' PRGX');
    this.updateElement('.total-staked', this.app.formatAmount(data.totalStaked, 18, 0) + ' PRGX');
    this.updateElement('.reward-rate', CONFIG.STAKING.REWARD_RATE + ' PRGX/sec');
    this.updateElement('.apr', data.apr + '%');
    this.updateElement('.user-balance', this.app.formatAmount(data.userBalance, 18, 4) + ' PRGX');
    this.updateElement('.user-staked-hint', this.app.formatAmount(data.userStaked, 18, 4) + ' PRGX');

    // Update button states
    this.updateButtonStates(data);

    // Update progress bars
    this.updateProgressBars(data);

    // Update input max values
    const stakeInput = document.querySelector('.stake-input');
    const unstakeInput = document.querySelector('.unstake-input');
    
    if (stakeInput) {
      const maxStake = parseFloat(this.safeFormatUnits(data.userBalance, 18)).toFixed(4);
      stakeInput.max = maxStake;
    }
    
    if (unstakeInput) {
      const maxUnstake = parseFloat(this.safeFormatUnits(data.userStaked, 18)).toFixed(4);
      unstakeInput.max = maxUnstake;
    }
  }

  // Update element safely
  updateElement(selector, content) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = content;
    }
  }

  // Update button states
  updateButtonStates(data) {
    const stakeBtn = document.querySelector('.stake-btn');
    const unstakeBtn = document.querySelector('.unstake-btn');
    const claimBtn = document.querySelector('.claim-btn');

    if (stakeBtn) {
      stakeBtn.disabled = !data.userBalance || data.userBalance.toString() === '0';
    }

    if (unstakeBtn) {
      unstakeBtn.disabled = !data.userStaked || data.userStaked.toString() === '0';
    }

    if (claimBtn) {
      claimBtn.disabled = !data.pendingRewards || data.pendingRewards.toString() === '0';
    }
  }

  // Update progress bars
  updateProgressBars(data) {
    // User's share of total staked (ethers v6 syntax with safe formatting)
    const userSharePercent = data.totalStaked && data.totalStaked.toString() !== '0' ? 
      (parseFloat(this.safeFormatUnits(data.userStaked, 18)) / 
       parseFloat(this.safeFormatUnits(data.totalStaked, 18))) * 100 : 0;

    const progressBar = document.querySelector('.user-share-progress');
    if (progressBar) {
      progressBar.style.width = userSharePercent + '%';
      progressBar.setAttribute('aria-valuenow', userSharePercent);
    }

    // Rewards progress (mock) (ethers v6 syntax with safe formatting)
    const rewardsProgress = document.querySelector('.rewards-progress');
    if (rewardsProgress) {
      const rewardsPercent = Math.min((parseFloat(this.safeFormatUnits(data.pendingRewards, 18)) * 100), 100);
      rewardsProgress.style.width = rewardsPercent + '%';
      rewardsProgress.setAttribute('aria-valuenow', rewardsPercent);
    }
  }

  // Handle staking
  async handleStake() {
    if (!this.app.signer) {
      this.app.showToast('Please connect your wallet first', 'error');
      return;
    }

    const input = document.querySelector('.stake-input');
    const amount = input?.value;

    if (!amount || parseFloat(amount) <= 0) {
      this.app.showToast('Please enter a valid amount', 'error');
      return;
    }

    const stakeBtn = document.querySelector('.stake-btn');
    this.app.setLoading(stakeBtn, true);

    try {
      const amountWei = ethers.parseUnits(amount, 18);
      
      // First approve PRGX spending
      this.app.showToast('Approving PRGX...', 'info');
      
      const approveTx = await this.app.contracts.PRGX.approve(
        CONFIG.CONTRACTS.STAKING, 
        amountWei
      );
      await approveTx.wait();

      // Then stake
      this.app.showToast('Staking PRGX...', 'info');
      
      const stakeTx = await this.app.contracts.Staking.stake(amountWei);
      await stakeTx.wait();

      this.app.showToast(`Successfully staked ${amount} PRGX! 🎉`, 'success');
      
      // Clear input and refresh data
      if (input) input.value = '';
      await this.loadStakingData();

    } catch (error) {
      console.error('Staking failed:', error);
      this.app.showToast('Staking failed: ' + error.message, 'error');
    } finally {
      this.app.setLoading(stakeBtn, false);
    }
  }

  // Handle unstaking
  async handleUnstake() {
    if (!this.app.signer) {
      this.app.showToast('Please connect your wallet first', 'error');
      return;
    }

    const input = document.querySelector('.unstake-input');
    const amount = input?.value;

    if (!amount || parseFloat(amount) <= 0) {
      this.app.showToast('Please enter a valid amount', 'error');
      return;
    }

    const unstakeBtn = document.querySelector('.unstake-btn');
    this.app.setLoading(unstakeBtn, true);

    try {
      const amountWei = ethers.parseUnits(amount, 18);
      
      this.app.showToast('Unstaking PRGX...', 'info');
      
      const unstakeTx = await this.app.contracts.Staking.withdraw(amountWei);
      await unstakeTx.wait();

      this.app.showToast(`Successfully unstaked ${amount} PRGX! 🎉`, 'success');
      
      // Clear input and refresh data
      if (input) input.value = '';
      await this.loadStakingData();

    } catch (error) {
      console.error('Unstaking failed:', error);
      this.app.showToast('Unstaking failed: ' + error.message, 'error');
    } finally {
      this.app.setLoading(unstakeBtn, false);
    }
  }

  // Handle claiming rewards
  async handleClaimRewards() {
    if (!this.app.signer) {
      this.app.showToast('Please connect your wallet first', 'error');
      return;
    }

    const claimBtn = document.querySelector('.claim-btn');
    this.app.setLoading(claimBtn, true);

    try {
      this.app.showToast('Claiming rewards...', 'info');
      
      const claimTx = await this.app.contracts.Staking.claimReward();
      await claimTx.wait();

      this.app.showToast('Successfully claimed rewards! 🎉', 'success');
      
      // Refresh data
      await this.loadStakingData();

    } catch (error) {
      console.error('Claim failed:', error);
      this.app.showToast('Claim failed: ' + error.message, 'error');
    } finally {
      this.app.setLoading(claimBtn, false);
    }
  }

  // Stake all available PRGX
  async stakeAll() {
    const data = await this.fetchStakingData();
    // Format the balance properly for display
    const availableAmount = parseFloat(this.safeFormatUnits(data.userBalance, 18)).toFixed(4);
    
    const input = document.querySelector('.stake-input');
    if (input) {
      input.value = availableAmount;
      // Update the max attribute for validation
      input.max = availableAmount;
      this.handleStake();
    }
  }

  // Unstake all staked PRGX
  async unstakeAll() {
    const data = await this.fetchStakingData();
    // Format the staked amount properly for display
    const stakedAmount = parseFloat(this.safeFormatUnits(data.userStaked, 18)).toFixed(4);
    
    const input = document.querySelector('.unstake-input');
    if (input) {
      input.value = stakedAmount;
      // Update the max attribute for validation
      input.max = stakedAmount;
      this.handleUnstake();
    }
  }

  // Validate input
  validateInput(input) {
    const value = parseFloat(input.value);
    const max = parseFloat(input.max || '999999999');
    
    if (value > max) {
      input.value = max;
      this.app.showToast('Maximum amount is ' + max, 'warning');
    }
    
    if (value < 0) {
      input.value = 0;
    }
  }

  // Start auto refresh
  startAutoRefresh() {
    // Refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      if (this.app.signer) {
        this.loadStakingData();
      }
    }, 30000);
  }

  // Stop auto refresh
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Format token amount safely (ethers v6 syntax)
  safeFormatUnits(value, decimals = 18) {
    try {
      if (!value) return '0';
      return ethers.formatUnits(value, decimals);
    } catch (error) {
      console.warn('Format error:', error.message);
      return '0';
    }
  }

  // Format time until next reward
  formatTimeUntilReward() {
    const now = Math.floor(Date.now() / 1000);
    const nextBlock = Math.ceil(now / 12) * 12; // Assuming 12-second blocks
    const secondsUntil = nextBlock - now;
    
    if (secondsUntil <= 0) return 'Now';
    
    const minutes = Math.floor(secondsUntil / 60);
    const seconds = secondsUntil % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Initialize staking dashboard when app is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.purgeXApp) {
      window.stakingDashboard = new StakingDashboard(window.purgeXApp);
    }
  }, 100);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StakingDashboard;
} else {
  window.StakingDashboard = StakingDashboard;
}
