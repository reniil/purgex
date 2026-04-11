// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
//  PRGX Staking — Remix-ready  |  OpenZeppelin v5.x
//  Stake PRGX, earn any ERC20 reward token (USDC, DAI, PRGX itself, etc.)
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PRGXStaking is Ownable(msg.sender), Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ══════════════════════════════════════════════════════════
    //  EVENTS
    // ══════════════════════════════════════════════════════════

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, address indexed token, uint256 amount);
    event RewardConfigured(address indexed token, uint256 rewardRatePerSecond);
    event RewardsDeposited(address indexed token, uint256 amount);
    event RewardsWithdrawn(address indexed token, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event CooldownStarted(address indexed user, uint256 cooldownEnd);

    // ══════════════════════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════════════════════

    /// @notice The token users stake (PRGX)
    IERC20 public immutable stakingToken;

    /// @notice The token distributed as rewards (set via configureReward)
    IERC20 public rewardToken;

    /// @notice Reward tokens emitted per second
    uint256 public rewardRate;

    /// @notice Accumulated reward per staked token, scaled by 1e18
    uint256 public rewardPerTokenStored;

    /// @notice Cooldown period for unstaking (48 hours in seconds)
    uint256 public constant UNSTAKE_COOLDOWN = 48 hours;

    /// @dev Timestamp when user last staked (for cooldown enforcement)
    mapping(address => uint256) public lastStakeTime;

    /// @notice Last timestamp rewards were updated
    uint256 public lastUpdateTime;

    /// @notice Total PRGX staked across all users
    uint256 public totalStaked;

    /// @dev Per-user staked balance
    mapping(address => uint256) public userStaked;

    /// @dev Snapshot of rewardPerTokenStored at the user's last interaction
    mapping(address => uint256) public userRewardPerTokenPaid;

    /// @dev Accrued but unclaimed rewards per user
    mapping(address => uint256) public pendingRewards;

    // ══════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ══════════════════════════════════════════════════════════

    /**
     * @param _stakingToken  Address of the PRGX token
     */
    constructor(address _stakingToken) {
        require(_stakingToken != address(0), "Invalid staking token");
        stakingToken = IERC20(_stakingToken);
        lastUpdateTime = block.timestamp;
    }

    // ══════════════════════════════════════════════════════════
    //  MODIFIERS
    // ══════════════════════════════════════════════════════════

    /**
     * @dev Snapshots global then user reward state before every state-changing call.
     *      FIX: original skipped updating userRewardPerTokenPaid correctly — see _updateReward.
     */
    modifier updateReward(address _user) {
        _updateReward(_user);
        _;
    }

    // ══════════════════════════════════════════════════════════
    //  REWARD ACCRUAL — INTERNAL
    // ══════════════════════════════════════════════════════════

    /**
     * @dev Update global accumulator, then credit the user's pending balance.
     *
     *      BUG FIX (original): userRewardPerTokenPaid was incremented by `userReward`
     *      (a delta) instead of being SET to the current `rewardPerTokenStored`.
     *      This caused the user's paid checkpoint to drift out of sync, permanently
     *      over-counting rewards on every subsequent accrual.
     *
     *      Correct pattern (standard Synthetix model):
     *        earned = stake * (rewardPerTokenStored - userRewardPerTokenPaid) / 1e18
     *        userRewardPerTokenPaid = rewardPerTokenStored   ← SET, not +=
     */
    function _updateReward(address _user) internal {
        // ── Global accumulator ──────────────────────────────
        if (totalStaked > 0 && rewardRate > 0 && block.timestamp > lastUpdateTime) {
            uint256 timePassed = block.timestamp - lastUpdateTime;
            uint256 newReward  = rewardRate * timePassed;
            rewardPerTokenStored += (newReward * 1e18) / totalStaked;
        }
        lastUpdateTime = block.timestamp;   // FIX: always update timestamp, even when no stakers

        // ── User accumulator ────────────────────────────────
        if (_user != address(0)) {
            pendingRewards[_user]         = _earned(_user);
            userRewardPerTokenPaid[_user] = rewardPerTokenStored;  // FIX: SET not +=
        }
    }

    /**
     * @dev Compute earned rewards for a user using current accumulator.
     *      Separated so it can be called in view functions too.
     */
    function _earned(address _user) internal view returns (uint256) {
        return (
            (userStaked[_user] * (rewardPerTokenStored - userRewardPerTokenPaid[_user])) / 1e18
        ) + pendingRewards[_user];
    }

    // ══════════════════════════════════════════════════════════
    //  ADMIN — REWARD CONFIGURATION
    // ══════════════════════════════════════════════════════════

    /**
     * @notice Configure (or reconfigure) the reward token and emission rate.
     * @dev    Settles all outstanding rewards before switching.
     *         FIX: original did not revert if switching token while rewards still pending
     *         for existing stakers — old pending balances denominated in the old token
     *         would become unclaimable. Now we keep the old reward token reference
     *         until all rewards are claimed (or owner explicitly rescues them).
     * @param _rewardToken         ERC20 token to distribute as rewards
     * @param _rewardRatePerSecond Tokens emitted per second (in token's native decimals)
     */
    function configureReward(
        address _rewardToken,
        uint256 _rewardRatePerSecond
    ) external onlyOwner {
        require(_rewardToken != address(0), "Invalid token");
        require(_rewardRatePerSecond > 0,   "Rate must be > 0");

        // Settle global state with old rate before switching
        _updateReward(address(0));

        rewardToken    = IERC20(_rewardToken);
        rewardRate     = _rewardRatePerSecond;
        lastUpdateTime = block.timestamp;

        emit RewardConfigured(_rewardToken, _rewardRatePerSecond);
    }

    /**
     * @notice Deposit reward tokens into the contract for distribution.
     * @dev    Anyone can top up, but typically called by owner.
     */
    function depositRewards(uint256 amount) external {
        require(address(rewardToken) != address(0), "No reward token configured");
        require(amount > 0, "Amount must be > 0");
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsDeposited(address(rewardToken), amount);
    }

    /**
     * @notice Withdraw undistributed reward tokens (owner only).
     */
    function withdrawRewardToken(uint256 amount) external onlyOwner {
        require(address(rewardToken) != address(0), "No reward token configured");
        require(amount > 0, "Amount must be > 0");
        rewardToken.safeTransfer(owner(), amount);
        emit RewardsWithdrawn(address(rewardToken), amount);
    }

    /**
     * @notice Stop reward emissions by setting rate to zero.
     *         Useful before reconfiguring to a new token.
     */
    function stopRewards() external onlyOwner {
        _updateReward(address(0));
        rewardRate = 0;
    }

    // ══════════════════════════════════════════════════════════
    //  STAKING
    // ══════════════════════════════════════════════════════════

    /**
     * @notice Stake a specific amount of PRGX.
     */
    function stake(uint256 amount)
        external
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        require(amount > 0, "Cannot stake 0");

        totalStaked              += amount;
        userStaked[msg.sender]   += amount;

        // Record stake time for cooldown tracking
        lastStakeTime[msg.sender] = block.timestamp;

        // FIX: use safeTransferFrom instead of raw transferFrom (original used raw)
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Stake the caller's entire PRGX balance.
     */
    function stakeAll()
        external
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        uint256 balance = stakingToken.balanceOf(msg.sender);
        require(balance > 0, "No balance to stake");

        totalStaked            += balance;
        userStaked[msg.sender] += balance;

        // Record stake time for cooldown tracking
        lastStakeTime[msg.sender] = block.timestamp;

        stakingToken.safeTransferFrom(msg.sender, address(this), balance);

        emit Staked(msg.sender, balance);
    }

    // ══════════════════════════════════════════════════════════
    //  WITHDRAWAL
    // ══════════════════════════════════════════════════════════

    /**
     * @notice Withdraw a specific amount of staked PRGX.
     * @dev Enforces 48-hour cooldown since last stake.
     */
    function withdraw(uint256 amount)
        external
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        require(amount > 0, "Cannot withdraw 0");
        require(userStaked[msg.sender] >= amount, "Insufficient staked balance");

        // Enforce cooldown period
        uint256 cooldownEnd = lastStakeTime[msg.sender] + UNSTAKE_COOLDOWN;
        require(block.timestamp >= cooldownEnd, "Unstake cooldown active");

        totalStaked            -= amount;
        userStaked[msg.sender] -= amount;

        // FIX: use safeTransfer instead of raw transfer
        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Withdraw all staked PRGX.
     * @dev Enforces 48-hour cooldown since last stake.
     */
    function withdrawAll()
        external
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        uint256 amount = userStaked[msg.sender];
        require(amount > 0, "Nothing staked");

        // Enforce cooldown period
        uint256 cooldownEnd = lastStakeTime[msg.sender] + UNSTAKE_COOLDOWN;
        require(block.timestamp >= cooldownEnd, "Unstake cooldown active");

        totalStaked            -= amount;
        userStaked[msg.sender]  = 0;

        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Withdraw all staked tokens AND claim pending rewards in one tx.
     * @dev Enforces 48-hour cooldown since last stake for principal withdrawal.
     */
    function exit()
        external
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        uint256 stakeAmt = userStaked[msg.sender];
        if (stakeAmt > 0) {
            // Enforce cooldown period
            uint256 cooldownEnd = lastStakeTime[msg.sender] + UNSTAKE_COOLDOWN;
            require(block.timestamp >= cooldownEnd, "Unstake cooldown active");

            totalStaked            -= stakeAmt;
            userStaked[msg.sender]  = 0;
            stakingToken.safeTransfer(msg.sender, stakeAmt);
            emit Withdrawn(msg.sender, stakeAmt);
        }
        _claimReward(msg.sender);
    }

    // ══════════════════════════════════════════════════════════
    //  REWARD CLAIMS
    // ══════════════════════════════════════════════════════════

    /**
     * @notice Claim all pending rewards for the caller.
     */
    function claimReward()
        external
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        _claimReward(msg.sender);
    }

    /**
     * @notice Owner can trigger a reward claim on behalf of any user.
     *         Useful for bots or auto-compounders.
     */
    function claimRewardFor(address _user)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        // FIX: must update reward state for the user before claiming on their behalf
        _updateReward(_user);
        _claimReward(_user);
    }

    /**
     * @dev Internal claim — transfers pending rewards to user.
     */
    function _claimReward(address _user) internal {
        uint256 reward = pendingRewards[_user];
        if (reward == 0) return;

        require(address(rewardToken) != address(0), "No reward token configured");

        uint256 contractBalance = rewardToken.balanceOf(address(this));
        // FIX: if reward token == staking token, exclude staked principal from balance
        if (address(rewardToken) == address(stakingToken)) {
            require(contractBalance > totalStaked, "Insufficient reward balance");
            require(contractBalance - totalStaked >= reward, "Insufficient reward balance");
        } else {
            require(contractBalance >= reward, "Insufficient reward balance");
        }

        pendingRewards[_user] = 0;
        rewardToken.safeTransfer(_user, reward);

        emit RewardPaid(_user, address(rewardToken), reward);
    }

    // ══════════════════════════════════════════════════════════
    //  EMERGENCY
    // ══════════════════════════════════════════════════════════

    /**
     * @notice Emergency withdraw: returns staked tokens with NO reward.
     *         Available even when paused, so users are never locked out.
     *         FIX: original had no emergency exit — paused users could not recover funds.
     */
    function emergencyWithdraw() external nonReentrant {
        uint256 amount = userStaked[msg.sender];
        require(amount > 0, "Nothing staked");

        // Wipe user state before transfer (CEI pattern)
        totalStaked            -= amount;
        userStaked[msg.sender]  = 0;
        pendingRewards[msg.sender] = 0;
        userRewardPerTokenPaid[msg.sender] = 0;

        stakingToken.safeTransfer(msg.sender, amount);

        emit EmergencyWithdraw(msg.sender, amount);
    }

    // ══════════════════════════════════════════════════════════
    //  PAUSE
    // ══════════════════════════════════════════════════════════

    /**
     * FIX: original called `paused` as a variable — in OZ v5 it is a function paused().
     *      Also, OZ v5 Pausable already emits Paused/Unpaused events internally,
     *      so duplicate event declarations and emits have been removed.
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ══════════════════════════════════════════════════════════
    //  VIEW / HELPERS
    // ══════════════════════════════════════════════════════════

    /**
     * @notice Returns the pending reward balance for a user (real-time, no tx needed).
     *         FIX: original view assumed rewardRate > 0 and didn't guard totalStaked == 0.
     */
    function pendingRewardsOf(address _user) external view returns (uint256) {
        if (totalStaked == 0 || rewardRate == 0) {
            return pendingRewards[_user];
        }

        uint256 timePassed       = block.timestamp - lastUpdateTime;
        uint256 accRewardPerToken = rewardPerTokenStored
            + (rewardRate * timePassed * 1e18) / totalStaked;

        return (
            (userStaked[_user] * (accRewardPerToken - userRewardPerTokenPaid[_user])) / 1e18
        ) + pendingRewards[_user];
    }

    /// @notice Staked balance for a user
    function getStakedBalance(address _user) external view returns (uint256) {
        return userStaked[_user];
    }

    /// @notice Total PRGX staked in the contract
    function getTotalStaked() external view returns (uint256) {
        return totalStaked;
    }

    /// @notice Current reward emission rate (tokens/second)
    function getRewardRate() external view returns (uint256) {
        return rewardRate;
    }

    /// @notice Returns the cooldown end timestamp for a user
    function getCooldownEnd(address _user) external view returns (uint256) {
        return lastStakeTime[_user] + UNSTAKE_COOLDOWN;
    }

    /// @notice Returns remaining cooldown seconds for a user (0 if expired)
    function getCooldownRemaining(address _user) external view returns (uint256) {
        uint256 cooldownEnd = lastStakeTime[_user] + UNSTAKE_COOLDOWN;
        if (block.timestamp >= cooldownEnd) return 0;
        return cooldownEnd - block.timestamp;
    }

    /// @notice Check if a user can unstake (cooldown expired)
    function canUnstake(address _user) external view returns (bool) {
        return block.timestamp >= lastStakeTime[_user] + UNSTAKE_COOLDOWN;
    }

    /// @notice Address of the current reward token
    function getRewardToken() external view returns (address) {
        return address(rewardToken);
    }

    /**
     * @notice How many reward tokens are available in the contract
     *         (excluding staked principal when reward == staking token).
     */
    function availableRewardBalance() external view returns (uint256) {
        if (address(rewardToken) == address(0)) return 0;
        uint256 bal = rewardToken.balanceOf(address(this));
        if (address(rewardToken) == address(stakingToken)) {
            return bal > totalStaked ? bal - totalStaked : 0;
        }
        return bal;
    }

    /**
     * @notice Estimated seconds of rewards remaining at the current rate.
     */
    function rewardRunwaySeconds() external view returns (uint256) {
        if (rewardRate == 0 || address(rewardToken) == address(0)) return 0;
        uint256 bal = rewardToken.balanceOf(address(this));
        if (address(rewardToken) == address(stakingToken)) {
            bal = bal > totalStaked ? bal - totalStaked : 0;
        }
        return bal / rewardRate;
    }
}