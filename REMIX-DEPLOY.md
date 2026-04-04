# PurgeX - Remix Deployment Guide

## ⚡ Quick Deploy on Remix IDE

### Step 1: Open Remix
Go to https://remix.ethereum.org/

### Step 2: Create Files

**File 1: PurgeXToken.sol**

Paste this code (simplified for Remix):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@5.0.0/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts@5.0.0/access/Ownable.sol";

contract PurgeXToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;
    event TokensBurned(address indexed account, uint256 amount);

    constructor() ERC20("PurgeX Token", "PRGX") Ownable(msg.sender) {
        _mint(msg.sender, MAX_SUPPLY);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max");
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) external onlyOwner {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
        emit TokensBurned(account, amount);
    }
}
```

**File 2: PurgeXSweeper.sol**

Paste this code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@5.0.0/access/Ownable.sol";
import "@openzeppelin/contracts@5.0.0/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts@5.0.0/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@5.0.0/token/ERC20/utils/SafeERC20.sol";

interface IPulseXRouter {
    function factory() external pure returns (address);
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

contract PurgeXSweeper is Ownable(msg.sender), ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant DEFAULT_FEE_BPS = 100;

    address public prgxToken;
    address public pulseXRouter;
    address public wpls;
    uint256 public protocolFeeBps;
    address public feeRecipient;
    mapping(address => address) public tokenDestinations;

    event Sweep(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 amountPRGXOut, address indexed recipient);
    event ProtocolFee(address indexed token, uint256 feeAmount, uint256 feeBps);

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

    function sweepTokens(address[] calldata tokenAddresses, uint256[] calldata minAmountsOut) 
        external nonReentrant {
        require(tokenAddresses.length == minAmountsOut.length, "Length mismatch");
        require(tokenAddresses.length > 0, "Empty");

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            _sweepToken(msg.sender, tokenAddresses[i], minAmountsOut[i]);
        }
    }

    function _sweepToken(address user, address token, uint256 minOut) internal {
        uint256 balance = IERC20(token).balanceOf(user);
        uint256 allowance = IERC20(token).allowance(user, address(this));
        require(balance > 0, "No balance");
        require(allowance > 0, "No allowance");

        uint256 sweepAmount = balance < allowance ? balance : allowance;
        uint256 fee = (sweepAmount * protocolFeeBps) / 10000;
        require(sweepAmount > fee, "Too small");
        uint256 netAmount = sweepAmount - fee;

        if (fee > 0) {
            IERC20(token).safeTransferFrom(user, feeRecipient, fee);
            emit ProtocolFee(token, fee, protocolFeeBps);
        }

        IERC20(token).safeTransferFrom(user, address(this), netAmount);
        IERC20(token).approve(pulseXRouter, netAmount);

        address[] memory path = getSwapPath(token);
        uint256[] memory amounts = IPulseXRouter(pulseXRouter).swapExactTokensForTokens(
            netAmount,
            minOut,
            path,
            tokenDestinations[user] == address(0) ? user : tokenDestinations[user],
            block.timestamp + 3600
        );

        emit Sweep(user, token, sweepAmount, amounts[amounts.length - 1], 
            tokenDestinations[user] == address(0) ? user : tokenDestinations[user]);
    }

    function getSwapPath(address token) public view returns (address[] memory) {
        if (token == wpls) {
            address[] memory path = new address[](2);
            path[0] = wpls;
            path[1] = prgxToken;
            return path;
        }

        address factory = IPulseXRouter(pulseXRouter).factory();
        address directPair = IPulseXFactory(factory).getPair(token, prgxToken);
        
        if (directPair != address(0)) {
            address[] memory path = new address[](2);
            path[0] = token;
            path[1] = prgxToken;
            return path;
        }

        address[] memory path = new address[](3);
        path[0] = token;
        path[1] = wpls;
        path[2] = prgxToken;
        return path;
    }

    function setProtocolFee(uint256 bps) external onlyOwner {
        require(bps <= MAX_FEE_BPS, "Too high");
        protocolFeeBps = bps;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid");
        feeRecipient = recipient;
    }

    function setPRGXToken(address token) external onlyOwner {
        require(token != address(0), "Invalid");
        prgxToken = token;
    }

    function setDestination(address destination) external {
        require(destination != address(0), "Invalid");
        tokenDestinations[msg.sender] = destination;
    }

    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    receive() external payable {}
}
```

### Step 3: Compile

1. Select compiler version: **0.8.20** (or higher)
2. Click "Compile PurgeXToken.sol"
3. Click "Compile PurgeXSweeper.sol"

**✅ Should compile without errors**

### Step 4: Deploy to PulseChain

**Connect MetaMask to PulseChain:**
- Network Name: PulseChain
- RPC URL: https://rpc.pulsechain.com
- Chain ID: 369
- Symbol: PLS
- Explorer: https://scan.pulsechain.com

**Deploy PurgeXToken:**
1. Go to "Deploy & Run Transactions" tab
2. Environment: Injected Provider (MetaMask)
3. Select contract: PurgeXToken
4. Click "Deploy"
5. Confirm transaction in MetaMask
6. Save the deployed address!

**Deploy PurgeXSweeper:**
1. Copy these PulseX addresses:
   ```
   PulseX Router: 0x165C3410fC91EF562C50559f7d2289fEbed552d9
   WPLS: 0xA1077a294dDE1B09bB078844df40758a5D0f9a27
   ```
2. Constructor args (in order):
   - `_prgxToken`: [Your deployed PurgeXToken address]
   - `_pulseXRouter`: 0x165C3410fC91EF562C50559f7d2289fEbed552d9
   - `_wpls`: 0xA1077a294dDE1B09bB078844df40758a5D0f9a27
   - `_feeRecipient`: [Your wallet address]
3. Select PurgeXSweeper
4. Fill in constructor arguments
5. Click "Deploy"
6. Save the deployed address!

### Step 5: Verify

1. Go to https://scan.pulsechain.com
2. Search for your contracts
3. Click "Verify & Publish"
4. Upload source code
5. Select compiler 0.8.20
6. Submit

### Step 6: Test

1. Add PRGX token to MetaMask:
   - Token Contract Address: [your PurgeXToken address]
   - Token Symbol: PRGX
   - Decimals: 18

2. Sweep test:
   - Get some PLSX or other tokens on PulseChain
   - Approve the Sweeper contract
   - Call sweepTokens with token address

## ⚠️ Important Notes

- **No `bigint` issues**: All uint256 math uses standard Solidity
- **No array size problems**: Arrays are dynamically sized
- **Constructor**: Sweeper needs 4 arguments - deploy token FIRST
- **Gas**: PulseChain gas is cheap (~700,000 Beats = 0.0007 PLS)

## 📋 Deployment Checklist

- [ ] Deploy PurgeXToken on PulseChain
- [ ] Copy token address
- [ ] Deploy PurgeXSweeper with correct constructor args
- [ ] Copy sweeper address
- [ ] Verify both contracts on PulseXScan
- [ ] Add PRGX token to MetaMask
- [ ] Test sweep functionality

## 🔗 Useful Links

- Remix IDE: https://remix.ethereum.org/
- PulseXScan: https://scan.pulsechain.com
- PulseX Info: https://app.pulsex.com

---

**Contract files are ready in:**
- `/home/ralph/.openclaw/workspace/purgex/contracts/PurgeXToken-Remix.sol`
- `/home/ralph/.openclaw/workspace/purgex/contracts/PurgeXSweeper-Remix.sol`
