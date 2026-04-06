// SPDX-License-Identifier: MIT
// PurgeX Sweeper - ERC20 dust consolidator (Remix-ready)
// Fixed import path for ReentrancyGuard in OZ v5
pragma solidity ^0.8.20;

// Imports for Remix IDE - using raw.githubusercontent.com URLs (OpenZeppelin v5.0.0)
// These fetch directly from GitHub without npm/CDN
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// PulseX V2 interfaces
interface IPulseXRouter {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/**
 * @title PurgeXSweeper
 * @dev Sweeps dust tokens and converts to PRGX via PulseX V2
 */
contract PurgeXSweeper is Ownable(msg.sender), ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========== CONSTANTS ==========
    uint256 public constant MAX_FEE_BPS = 500; // 5% max
    uint256 public constant DEFAULT_FEE_BPS = 500; // 5% default (changed from 1%)

    // ========== STATE ==========
    address public prgxToken;
    address public pulseXRouter;
    address public wpls;
    uint256 public protocolFeeBps;
    address public feeRecipient;
    
    // Per-user custom destinations
    mapping(address => address) public tokenDestinations;
    
    // Dust sweep bonus configuration
    uint256 public constant BONUS_PER_TOKEN = 100 * 1e18; // 100 PRGX per token swept
    address public bonusWallet; // Where bonus PRGX is minted from
    
    // Fee distribution
    uint256 public constant FEE_BURN_PERCENT = 50; // 50% burned
    uint256 public constant FEE_TREASURY_PERCENT = 30; // 30% to treasury
    uint256 public constant FEE_STAKING_PERCENT = 20; // 20% to staking rewards

    // ========== EVENTS ==========
    event Sweep(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountPRGXOut,
        address indexed recipient
    );
    event ProtocolFee(address indexed token, uint256 feeAmount, uint256 feeBps);
    event DestinationSet(address indexed user, address destination);
    event ProtocolFeeUpdated(uint256 newBps);
    event FeeRecipientUpdated(address newRecipient);
    event PRGXTokenUpdated(address newToken);
    event BonusMinted(address indexed user, uint256 tokenCount, uint256 bonusAmount);
    event FeeDistributed(address token, uint256 burnAmount, uint256 treasuryAmount, uint256 stakingAmount);

    // ========== CONSTRUCTOR ==========
    /**
     * @dev Constructor
     * @param _prgxToken PRGX token address (deploy this first!)
     * @param _pulseXRouter PulseX V2 router
     * @param _wpls Wrapped PLS address
     * @param _feeRecipient Where protocol fees go
     */
    constructor(
        address _prgxToken,
        address _pulseXRouter,
        address _wpls,
        address _feeRecipient
    ) {
        require(_prgxToken != address(0), "Invalid PRGX");
        require(_pulseXRouter != address(0), "Invalid router");
        require(_wpls != address(0), "Invalid WPLS");
        require(_feeRecipient != address(0), "Invalid recipient");

        prgxToken = _prgxToken;
        pulseXRouter = _pulseXRouter;
        wpls = _wpls;
        feeRecipient = _feeRecipient;
        protocolFeeBps = DEFAULT_FEE_BPS;
    }

    // ========== MAIN FUNCTIONS ==========

    /**
     * @dev Sweep tokens to PRGX
     * @param tokenAddresses Array of tokens to sweep
     * @param minAmountsOut Minimum PRGX to receive (0 = accept any)
     */
    function sweepTokens(
        address[] calldata tokenAddresses,
        uint256[] calldata minAmountsOut
    ) external nonReentrant {
        require(tokenAddresses.length == minAmountsOut.length, "Length mismatch");
        require(tokenAddresses.length > 0, "Empty array");

        address user = msg.sender;

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            _sweepToken(user, tokenAddresses[i], minAmountsOut[i]);
        }
    }

    /**
     * @dev Internal: sweep single token
     */
    function _sweepToken(address user, address token, uint256 minOut) internal {
        // Get balances
        uint256 balance = IERC20(token).balanceOf(user);
        uint256 allowance = IERC20(token).allowance(user, address(this));
        
        require(balance > 0, "No balance");
        require(allowance > 0, "No allowance");

        // Calculate sweep amount
        uint256 sweepAmount = balance < allowance ? balance : allowance;

        // Calculate fee
        uint256 fee = (sweepAmount * protocolFeeBps) / 10000;
        require(sweepAmount > fee, "Amount too small");
        uint256 netAmount = sweepAmount - fee;

        // Transfer fee to recipient
        if (fee > 0) {
            IERC20(token).safeTransferFrom(user, feeRecipient, fee);
            emit ProtocolFee(token, fee, protocolFeeBps);
        }

        // Transfer net to sweeper
        IERC20(token).safeTransferFrom(user, address(this), netAmount);

        // Approve router
        IERC20(token).approve(pulseXRouter, netAmount);

        // Build swap path
        address[] memory path = getSwapPath(token);

        // Execute swap
        uint256[] memory amounts = IPulseXRouter(pulseXRouter).swapExactTokensForTokens(
            netAmount,
            minOut,
            path,
            tokenDestinations[user] == address(0) ? user : tokenDestinations[user],
            block.timestamp + 3600 // 1 hour deadline
        );

        uint256 prgxOut = amounts[amounts.length - 1];
        
        // Distribute fees according to the new model
        if (fee > 0) {
            _distributeFees(token, fee);
        }
        
        // Mint bonus to user (100 PRGX per token swept)
        _mintBonus(user, 1); // 1 token count per sweep call
        
        emit Sweep(user, token, sweepAmount, prgxOut, tokenDestinations[user] == address(0) ? user : tokenDestinations[user]);
    }
    
    /**
     * @dev Internal: distribute collected fees
     * 50% burned, 50% to treasury (30% direct + 20% staking rewards pool)
     * Note: fee already transferred to feeRecipient in _sweepToken
     */
    function _distributeFees(address token, uint256 feeAmount) internal {
        uint256 burnAmount = (feeAmount * FEE_BURN_PERCENT) / 100;
        uint256 treasuryAmount = (feeAmount * FEE_TREASURY_PERCENT) / 100;
        uint256 stakingAmount = feeAmount - burnAmount - treasuryAmount;
        
        // Burn portion: transfer from feeRecipient to address(0)
        if (burnAmount > 0) {
            IERC20(token).transferFrom(feeRecipient, address(0), burnAmount);
        }
        
        // Treasury portion: keep in feeRecipient (it's already there from _sweepToken)
        // Optionally could transfer to separate treasury wallet
        
        // Staking portion: transfer from feeRecipient to this contract (staking rewards pool)
        if (stakingAmount > 0) {
            IERC20(token).safeTransferFrom(feeRecipient, address(this), stakingAmount);
            // This contract now holds staking rewards to distribute
        }
        
        emit FeeDistributed(token, burnAmount, treasuryAmount, stakingAmount);
    }
    
    /**
     * @dev Mint bonus PRGX to user (100 PRGX per token swept)
     */
    function _mintBonus(address user, uint256 tokenCount) internal {
        require(bonusWallet != address(0), "Bonus wallet not set");
        
        uint256 bonusAmount = tokenCount * BONUS_PER_TOKEN;
        
        // Mint PRGX to user (assuming PRGX has mint function or we hold enough supply)
        // Since we can't mint arbitrary ERC20, we transfer from bonus wallet instead
        IERC20(prgxToken).transferFrom(bonusWallet, user, bonusAmount);
        
        emit BonusMinted(user, tokenCount, bonusAmount);
    }

    /**
     * @dev Public: mint bonus for a user (callable by sweeper)
     */
    function mintBonus(address user) external {
        require(msg.sender == address(this), "Only sweeper");
        _mintBonus(user, 1);
    }

    /**
     * @dev Get best swap path for token → PRGX
     */
    function getSwapPath(address token) public view returns (address[] memory) {
        // If token is WPLS, direct swap
        if (token == wpls) {
            address[] memory path = new address[](2);
            path[0] = wpls;
            path[1] = prgxToken;
            return path;
        }

        // Check for direct pair
        address factory = IPulseXRouter(pulseXRouter).factory();
        address directPair = IPulseXFactory(factory).getPair(token, prgxToken);
        
        if (directPair != address(0)) {
            address[] memory path = new address[](2);
            path[0] = token;
            path[1] = prgxToken;
            return path;
        }

        // Two-hop via WPLS
        address[] memory path = new address[](3);
        path[0] = token;
        path[1] = wpls;
        path[2] = prgxToken;
        return path;
    }

    // ========== ADMIN FUNCTIONS ==========

    function setProtocolFee(uint256 bps) external onlyOwner {
        require(bps <= MAX_FEE_BPS, "Fee too high");
        protocolFeeBps = bps;
        emit ProtocolFeeUpdated(bps);
    }
    
    /**
     * @dev Get current protocol fee percentage
     */
    function getProtocolFee() external view returns (uint256) {
        return protocolFeeBps;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid address");
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    function setPRGXToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        prgxToken = token;
        emit PRGXTokenUpdated(token);
    }

    function setDestination(address destination) external {
        require(destination != address(0), "Invalid address");
        tokenDestinations[msg.sender] = destination;
        emit DestinationSet(msg.sender, destination);
    }

    function setBonusWallet(address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid wallet");
        bonusWallet = wallet;
    }

    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    receive() external payable {}
}
