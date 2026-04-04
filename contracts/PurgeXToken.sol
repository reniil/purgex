// SPDX-License-Identifier: MIT
// PurgeX Token (PRGX) - Fixed supply ERC20 with burn
// For Remix: Use compiler 0.8.20+, import OpenZeppelin from GitHub
pragma solidity ^0.8.20;

// Imports for Remix IDE - using GitHub raw URLs (OpenZeppelin v5.0.0)
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.0/contracts/token/ERC20/ERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.0/contracts/access/Ownable.sol";

/**
 * @title PurgeX Token
 * @dev ERC20 token with mint/burn functionality
 * Total supply: 1,000,000,000 PRGX (1 billion)
 */
contract PurgeXToken is ERC20, Ownable {
    // Token metadata
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;

    // Events
    event TokensBurned(address indexed account, uint256 amount);

    /**
     * @dev Constructor mints total supply to deployer
     * No arguments needed - name/symbol are hardcoded
     */
    constructor() ERC20("PurgeX Token", "PRGX") Ownable(msg.sender) {
        _mint(msg.sender, MAX_SUPPLY);
    }

    /**
     * @dev Burn own tokens
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    /**
     * @dev Burn tokens from specific account (owner only)
     * @param account Account to burn from
     * @param amount Amount to burn
     */
    function burnFrom(address account, uint256 amount) external onlyOwner {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
        emit TokensBurned(account, amount);
    }
}
