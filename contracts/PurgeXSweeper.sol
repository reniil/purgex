// SPDX-License-Identifier: MIT
// PurgeX Sweeper - ERC20 dust consolidator (Remix-ready)
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant DEFAULT_FEE_BPS = 500;
    uint256 public constant BONUS_PER_TOKEN = 100 * 1e18;
    uint256 public constant FEE_BURN_PERCENT = 50;
    uint256 public constant FEE_TREASURY_PERCENT = 30;

    // ========== STATE ==========
    address public prgxToken;
    address public pulseXRouter;
    address public wpls;
    uint256 public protocolFeeBps;
    address public feeRecipient;
    address public bonusWallet;

    mapping(address => address) public tokenDestinations;

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

    function _sweepToken(address user, address token, uint256 minOut) internal {
        uint256 bal = IERC20(token).balanceOf(user);
        uint256 allow = IERC20(token).allowance(user, address(this));

        require(bal > 0, "No balance");
        require(allow > 0, "No allowance");

        uint256 sweepAmt = bal < allow ? bal : allow;

        uint256 fee = (sweepAmt * protocolFeeBps) / 10000;
        require(sweepAmt > fee, "Amount too small");
        uint256 netAmt = sweepAmt - fee;

        if (fee > 0) {
            IERC20(token).safeTransferFrom(user, feeRecipient, fee);
            emit ProtocolFee(token, fee, protocolFeeBps);
        }

        IERC20(token).safeTransferFrom(user, address(this), netAmt);
        IERC20(token).approve(pulseXRouter, netAmt);

        address[] memory swapPath = getSwapPath(token);
        address recipient = tokenDestinations[user];
        if (recipient == address(0)) recipient = user;

        uint256[] memory amounts = IPulseXRouter(pulseXRouter).swapExactTokensForTokens(
            netAmt,
            minOut,
            swapPath,
            recipient,
            block.timestamp + 3600
        );

        uint256 prgxOut = amounts[amounts.length - 1];

        if (fee > 0) {
            _distributeFees(token, fee);
        }
        _mintBonus(user, 1);

        emit Sweep(user, token, sweepAmt, prgxOut, recipient);
    }

    function _distributeFees(address token, uint256 feeAmount) internal {
        uint256 burnAmount = (feeAmount * FEE_BURN_PERCENT) / 100;
        uint256 treasuryAmount = (feeAmount * FEE_TREASURY_PERCENT) / 100;
        uint256 stakingAmount = feeAmount - burnAmount - treasuryAmount;

        if (burnAmount > 0) {
            IERC20(token).transferFrom(feeRecipient, address(0), burnAmount);
        }

        if (stakingAmount > 0) {
            IERC20(token).safeTransferFrom(feeRecipient, address(this), stakingAmount);
        }

        emit FeeDistributed(token, burnAmount, treasuryAmount, stakingAmount);
    }

    function _mintBonus(address user, uint256 tokenCount) internal {
        require(bonusWallet != address(0), "Bonus wallet not set");

        uint256 bonusAmount = tokenCount * BONUS_PER_TOKEN;
        IERC20(prgxToken).transferFrom(bonusWallet, user, bonusAmount);

        emit BonusMinted(user, tokenCount, bonusAmount);
    }

    function mintBonus(address user) external {
        require(msg.sender == address(this), "Only sweeper");
        _mintBonus(user, 1);
    }

    /**
     * @dev Get best swap path for token → PRGX
     */
    function getSwapPath(address token) public view returns (address[] memory path) {
        if (token == wpls) {
            path = new address[](2);
            path[0] = wpls;
            path[1] = prgxToken;
            return path;
        }

        address factory = IPulseXRouter(pulseXRouter).factory();
        address directPair = IPulseXFactory(factory).getPair(token, prgxToken);

        if (directPair != address(0)) {
            path = new address[](2);
            path[0] = token;
            path[1] = prgxToken;
            return path;
        }

        path = new address[](3);
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
