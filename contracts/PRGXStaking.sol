// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PRGX Staking
 * @notice Stake PRGX to earn rewards distributed in a reward token (e.g., USDC, DAI, or PRGX itself)
 * @dev Simple, gas-efficient staking with reward per second accrual.
 */
contract PRGXStaking is Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ==================== EVENTS ====================
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, IERC20 indexed token, uint256 amount);
    event RewardAdded(IERC20 indexed token, uint256 rewardRatePerSecond);
    event Paused();
    event Unpaused();

    // ==================== STATE ====================
    IERC20 public stakingToken; // PRGX
    uint256 public totalStaked;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored; // scaled by 1e18

    // Reward distribution state for current reward token
    IERC20 public rewardToken;
    uint256 public rewardRate; // tokens per second
    uint256 public distributed; // total distributed since last update
    uint256 public rewardFinishTime; // when current reward allocation ends

    // Per-user state
    mapping(address => uint256) public userStaked;
    mapping(address => uint256) public userRewardPerTokenPaid; // what user has already claimed
    mapping(address => uint256) public pendingRewards; // pending reward amount for user

    // ==================== MODIFIERS ====================
    modifier updateReward(address _user) {
        _updateReward(_user);
        _;
    }

    modifier onlyRewardToken() {
        require(msg.sender == address(rewardToken), "Only reward token");
        _;
    }

    // ==================== CONSTRUCTOR ====================
    constructor(IERC20 _stakingToken) {
        stakingToken = _stakingToken;
        lastUpdateTime = block.timestamp;
    }

    // ==================== REWARD DISTRIBUTION LOGIC ====================
    /// @dev Update global and user pending rewards
    function _updateReward(address _user) internal {
        if (totalStaked > 0 && rewardRate > 0 && block.timestamp > lastUpdateTime) {
            uint256 timePassed = block.timestamp - lastUpdateTime;
            uint256 rewardToDistribute = rewardRate * timePassed;
            distributed += rewardToDistribute;
            rewardPerTokenStored += (rewardToDistribute * 1e18) / totalStaked;
            lastUpdateTime = block.timestamp;
        }

        if (_user != address(0) && userStaked[_user] > 0) {
            uint256 userReward = ((userStaked[_user] * rewardPerTokenStored) / 1e18) - userRewardPerTokenPaid[_user];
            pendingRewards[_user] += userReward;
            userRewardPerTokenPaid[_user] += userReward;
        }
    }

    /// @notice Add a new reward token and rate (can only have one at a time for simplicity)
    function configureReward(IERC20 _rewardToken, uint256 _rewardRatePerSecond) external onlyOwner {
        require(address(_rewardToken) != address(0), "Invalid token");
        require(_rewardRatePerSecond > 0, "Rate must be > 0");

        // Update any pending rewards before switching
        _updateReward(address(0));

        rewardToken = _rewardToken;
        rewardRate = _rewardRatePerSecond;
        distributed = 0;
        lastUpdateTime = block.timestamp;

        // Optionally set an end time (rate * seconds = total rewards)
        // For now, indefinite until owner reconfigures

        emit RewardAdded(_rewardToken, _rewardRatePerSecond);
    }

    /// @notice Fund the staking contract with reward tokens to be distributed
    function depositRewards(uint256 amount) external onlyOwner {
        require(address(rewardToken) != address(0), "No reward token configured");
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw excess reward tokens (owner only)
    function withdrawRewardToken(uint256 amount) external onlyOwner {
        require(address(rewardToken) != address(0), "No reward token configured");
        rewardToken.safeTransfer(owner(), amount);
    }

    // ==================== STAKING ====================
    function stake(uint256 amount) external whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        require(stakingToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        totalStaked += amount;
        userStaked[msg.sender] += amount;

        emit Staked(msg.sender, amount);
    }

    /// @dev Stake all available PRGX
    function stakeAll() external whenNotPaused {
        uint256 balance = stakingToken.balanceOf(msg.sender);
        if (balance > 0) {
            stake(balance);
        }
    }

    // ==================== WITHDRAWAL ====================
    function withdraw(uint256 amount) external whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        require(userStaked[msg.sender] >= amount, "Insufficient balance");

        totalStaked -= amount;
        userStaked[msg.sender] -= amount;

        require(stakingToken.transfer(msg.sender, amount), "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    /// @dev Withdraw all staked PRGX
    function withdrawAll() external whenNotPaused {
        uint256 amount = userStaked[msg.sender];
        if (amount > 0) {
            withdraw(amount);
        }
    }

    // ==================== REWARD CLAIMS ====================
    /// @notice Claim pending rewards for caller
    function claimReward() external whenNotPaused updateReward(msg.sender) {
        _claimReward(msg.sender);
    }

    /// @dev Internal reward claim
    function _claimReward(address _user) internal {
        uint256 reward = pendingRewards[_user];
        if (reward > 0) {
            pendingRewards[_user] = 0;
            require(address(rewardToken) != address(0), "No reward token");
            require(rewardToken.balanceOf(address(this)) >= reward, "Insufficient reward balance");
            rewardToken.safeTransfer(_user, reward);
            emit RewardPaid(_user, rewardToken, reward);
        }
    }

    /// @notice Claim rewards for another user (allow off-chain claiming via bots if needed)
    function claimRewardFor(address _user) external onlyOwner whenNotPaused {
        _claimReward(_user);
    }

    /// @view Get pending rewards for a user
    function pendingRewardsOf(address _user) external view returns (uint256) {
        if (totalStaked == 0) return 0;
        uint256 accRewardPerToken = rewardPerTokenStored + ((block.timestamp - lastUpdateTime) * rewardRate * 1e18) / totalStaked;
        uint256 userReward = ((userStaked[_user] * accRewardPerToken) / 1e18) - userRewardPerTokenPaid[_user];
        return pendingRewards[_user] + userReward;
    }

    // ==================== PAUSE & EMERGENCY ====================
    function pause() external onlyOwner {
        require(!paused, "Already paused");
        _pause();
        emit Paused();
    }

    function unpause() external onlyOwner {
        require(paused, "Not paused");
        _unpause();
        emit Unpaused();
    }

    // ==================== VIEW HELPERS ====================
    function getStakedBalance(address _user) external view returns (uint256) {
        return userStaked[_user];
    }

    function getTotalStaked() external view returns (uint256) {
        return totalStaked;
    }

    function getRewardRate() external view returns (uint256) {
        return rewardRate;
    }

    function getRewardToken() external view returns (IERC20) {
        return rewardToken;
    }
}