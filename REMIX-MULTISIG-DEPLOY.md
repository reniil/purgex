# Deploy Multisig on Remix (PulseChain)

## Step 1: Deploy SimpleMultisig Contract

Go to https://remix.ethereum.org

### Copy this contract:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/ReentrancyGuard.sol";

contract SimpleMultisig is ReentrancyGuard {

    event Deposit(address indexed sender, uint256 amount);
    event SubmitTransaction(
        address indexed submitter,
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        bytes data
    );
    event ConfirmTransaction(address indexed owner, uint256 indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint256 indexed txIndex);
    event ExecuteTransaction(
        address indexed executor,
        uint256 indexed txIndex,
        address indexed to,
        uint256 value
    );
    event OwnerAdded(address indexed newOwner);
    event OwnerRemoved(address indexed removedOwner);
    event RequirementChanged(uint256 newRequirement);

    struct Transaction {
        address to;
        uint256 value;
        bytes   data;
        bool    executed;
        uint256 numConfirmations;
    }

    address[]  public owners;
    mapping(address => bool) public isOwner;
    uint256 public numConfirmationsRequired;

    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;

    modifier onlyMultisig() {
        require(isOwner[msg.sender], "Not a multisig owner");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "Only via multisig execution");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "Tx does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "Already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!confirmations[_txIndex][msg.sender], "Already confirmed");
        _;
    }

    constructor(address[] memory _owners, uint256 _numConfirmationsRequired) {
        require(_owners.length > 0, "At least one owner required");
        require(
            _numConfirmationsRequired > 0 && _numConfirmationsRequired <= _owners.length,
            "Invalid confirmation threshold"
        );

        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "Invalid owner: zero address");
            require(!isOwner[owner], "Invalid owner: duplicate");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) public onlyMultisig {
        uint256 txIndex = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                numConfirmations: 0
            })
        );

        emit SubmitTransaction(msg.sender, txIndex, _to, _value, _data);
    }

    function confirmTransaction(uint256 _txIndex)
        public
        onlyMultisig
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations += 1;
        confirmations[_txIndex][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, _txIndex);
    }

    function executeTransaction(uint256 _txIndex)
        public
        onlyMultisig
        txExists(_txIndex)
        notExecuted(_txIndex)
        nonReentrant
    {
        Transaction storage transaction = transactions[_txIndex];

        require(
            transaction.numConfirmations >= numConfirmationsRequired,
            "Not enough confirmations"
        );

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(transaction.data);
        require(success, "Transaction execution failed");

        emit ExecuteTransaction(msg.sender, _txIndex, transaction.to, transaction.value);
    }

    function revokeConfirmation(uint256 _txIndex)
        public
        onlyMultisig
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];
        require(confirmations[_txIndex][msg.sender], "Tx not confirmed by you");

        transaction.numConfirmations -= 1;
        confirmations[_txIndex][msg.sender] = false;

        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 _txIndex)
        public
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations
        )
    {
        Transaction storage transaction = transactions[_txIndex];
        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numConfirmations
        );
    }

    function isConfirmed(uint256 _txIndex, address _owner) public view returns (bool) {
        return confirmations[_txIndex][_owner];
    }
}
```

## Step 2: Compile & Deploy

1. **Select compiler:** Solidity 0.8.20
2. **Select environment:** Injected Provider (MetaMask) - PulseChain
3. **Connect wallet:** Make sure you're connected to PulseChain
4. **Deploy with constructor arguments:**

```javascript
// Owners array (5 signers):
[
  "0x26eCfe27327bbe20be6DEbFeb71319c22F8B36B3",  // Ralph
  "0x4Bc71089B98092Bf0E5a1B77ca992f204b685311",  // Ben
  "0xEdD5CbBc7f414F7B77f5e381431EcA7D13EBFCc8",  // Emma
  "0xbbF1ABA72793efcBc871f2Db4B19e59d1F44eb5c",  // Noah
  "0x06275119be938A032e33cb28aa35DEdB3fEBDF08"   // Pepe
]

// Required confirmations:
3
```

## Step 3: Copy the Deployed Address

After deployment, you'll get the multisig contract address. Save it!

## Step 4: Transfer 250M PRGX to Multisig

Use this function call:
```solidity
// Token: PRGX (0x352b08bD0d62D49911F1Efb9CDE9184e332A07d0)
// Transfer 250,000,000 PRGX to the new multisig address
```

## Step 5: Update Sweeper Fee Recipient

Call on Sweeper contract (0xc6735B24D5A082E0A75637179A76ecE8a1aE1575):
```solidity
changeFeeRecipient("0x...your-new-multisig-address...")
```

## Transaction Info for Reference

**Pending Hardhat transaction:**
- Hash: `0xc9d002d61671cd3369cdecf336ca2b7b947c8a6e6d2503a9c1d766a5ecb7fb46`
- Nonce: 59
- Status: Stuck in mempool

You can either wait for it to drop or ignore it and deploy fresh on Remix.

---

**Estimated gas cost:** ~0.5 - 1 PLS

**Contract address after deployment:** [Will appear in Remix console]
