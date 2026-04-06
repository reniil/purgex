// SPDX-License-Identifier: MIT
// PurgeX Staking Vault - Rewards distribution for PRGX stakers
// Compatible with OpenZeppelin v5.0.0

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PurgeXStakingVault
 * @dev Staking vault for PRGX tokens with rewards distribution
 */
contract PurgeXStakingVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // ========== EVENTS ==========
    event Staked(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 amount, uint256 shares);
    event RewardsAdded(uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    
    // ========== STRUCTS ==========
    struct Stake {
        uint256 amount;        // Amount staked
        uint256 shares;        // Shares representing stake
        uint256 rewardDebt;    // Rewards owed per share
        uint256 lastClaimTime;
    }
    
    // ========== STATE ==========
    IERC20 public stakingToken; // PRGX token
    IERC20 public rewardsToken; // PRGX token (same)
    
    uint256 public totalShares;
    uint256 public totalSupply; // Total tokens staked
    uint256 public rewardRate;  // Rewards per second per share (in wei)
    uint256 public rewardPool;  // Accumulated rewards available
    
    mapping(address => Stake) public stakes;
    mapping(address => uint256) public lastUpdate;
    
    uint256 public constant PRECISION = 1e18;
    uint256 public constant SECONDS_PER_DAY = 86400;
    
    // Tier multipliers
    uint256 public constant BRONZE_MULTIPLIER = 100; // 1x
    uint256 public constant SILVER_MULTIPLIER = 120; // 1.2x
    uint256 public constant GOLD_MULTIPLIER = 150; // 1.5x
    uint256 public constant DIAMOND_MULTIPLIER = 200; // 2x
    
    mapping(address => uint256) public tierMultipliers;
    
    // ========== CONSTRUCTOR ==========
    constructor(address _stakingToken) {
        require(_stakingToken != address(0), "Invalid token");
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_stakingToken); // Same token for simplicity
        
        // Set default multipliers
        tierMultipliers[msg.sender] = DIAMOND_MULTIPLIER; // Owner gets diamond for testing
    }
    
    // ========== MAIN FUNCTIONS ==========
    
    /**
     * @dev Stake PRGX tokens
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        
        // Update rewards before stake
        _updateRewards(msg.sender);
        
        // Transfer tokens from user to vault
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate shares (1:1 ratio initially)
        uint256 shares = amount;
        
        stakes[msg.sender].amount += amount;
        stakes[msg.sender].shares += shares;
        totalSupply += amount;
        totalShares += shares;
        
        emit Staked(msg.sender, amount, shares);
    }
    
    /**
     * @dev Withdraw staked tokens
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot withdraw 0");
        require(stakes[msg.sender].amount >= amount, "Insufficient stake");
        
        // Update rewards before withdrawal
        _updateRewards(msg.sender);
        
        // Calculate share proportion
        uint256 share = (amount * stakes[msg.sender].shares) / stakes[msg.sender].amount;
        
        // Update state
        stakes[msg.sender].amount -= amount;
        stakes[msg.sender].shares -= share;
        totalSupply -= amount;
        totalShares -= share;
        
        // Transfer tokens back to user
        stakingToken.safeTransfer(msg.sender, amount);
        
        emit Withdrawn(msg.sender, amount, share);
    }
    
    /**
     * @dev Claim earned rewards
     */
    function claimRewards() external nonReentrant {
        _updateRewards(msg.sender);
        
        uint256 reward = stakes[msg.sender].rewardDebt;
        require(reward > 0, "No rewards");
        
        stakes[msg.sender].rewardDebt = 0;
        require(rewardsToken.balanceOf(address(this)) >= reward, "Insufficient rewards in vault");
        
        rewardsToken.safeTransfer(msg.sender, reward);
        
        emit RewardsClaimed(msg.sender, reward);
    }
    
    /**
     * @dev Emergency withdraw (owner only) - for token recovery
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    // ========== REWARDS DISTRIBUTION ==========
    
    /**
     * @dev Add rewards to the vault (callable by owner)
     */
    function addRewards(uint256 amount) external onlyOwner {
        require(amount > 0, "Cannot add 0 rewards");
        
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;
        
        emit RewardsAdded(amount);
    }
    
    /**
     * @dev Set reward rate (owner only) - rewards per second per share
     */
    function setRewardRate(uint256 rate) external onlyOwner {
        rewardRate = rate;
    }
    
    /**
     * @dev Update rewards for a user (internal)
     */
    function _updateRewards(address user) internal {
        if (totalShares == 0 || stakes[user].shares == 0) {
            stakes[user].lastClaimTime = block.timestamp;
            return;
        }
        
        uint256 timePassed = block.timestamp - stakes[user].lastClaimTime;
        uint256 rewardPerShare = (rewardRate * timePassed) / PRECISION;
        
        // Calculate base reward
        uint256 baseReward = (stakes[user].shares * rewardPerShare) / PRECISION;
        
        // Apply tier multiplier
        uint256 multiplier = tierMultipliers[user];
        if (multiplier == 0) multiplier = BRONZE_MULTIPLIER;
        
        uint256 multipliedReward = (baseReward * multiplier) / PRECISION;
        
        stakes[user].rewardDebt += multipliedReward;
        stakes[user].lastClaimTime = block.timestamp;
    }
    
    /**
     * @dev Calculate pending rewards for a user
     */
    function pendingRewards(address user) external view returns (uint256) {
        if (totalShares == 0 || stakes[user].shares == 0) {
            return stakes[user].rewardDebt;
        }
        
        uint256 timePassed = block.timestamp - stakes[user].lastClaimTime;
        uint256 rewardPerShare = (rewardRate * timePassed) / PRECISION;
        
        uint256 baseReward = (stakes[user].shares * rewardPerShare) / PRECISION;
        
        uint256 multiplier = tierMultipliers[user];
        if (multiplier == 0) multiplier = BRONZE_MULTIPLIER;
        
        uint256 multipliedReward = (baseReward * multiplier) / PRECISION;
        
        return stakes[user].rewardDebt + multipliedReward;
    }
    
    // ========== TIER MANAGEMENT ==========
    
    /**
     * @dev Set user tier multiplier (owner only)
     */
    function setTier(address user, uint256 multiplier) external onlyOwner {
        require(multiplier >= 100 && multiplier <= 200, "Invalid multiplier");
        tierMultipliers[user] = multiplier;
    }
    
    /**
     * @dev Get user tier
     */
    function getUserTier(address user) external view returns (uint256) {
        uint256 multiplier = tierMultipliers[user];
        if (multiplier == 0) return BRONZE_MULTIPLIER;
        return multiplier;
    }
    
    // ========== VIEWS ==========
    
    function totalStaked() external view returns (uint256) {
        return totalSupply;
    }
    
    function totalSharesOutstanding() external view returns (uint256) {
        return totalShares;
    }
    
    function getStake(address user) external view returns (uint256 amount, uint256 shares, uint256 rewards) {
        amount = stakes[user].amount;
        shares = stakes[user].shares;
        rewards = stakes[user].rewardDebt;
    }
    
    // ========== RECEIVE ==========
    
    receive() external payable {}
}