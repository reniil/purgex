// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
//  Simple Multisig Treasury — Remix-ready  |  OpenZeppelin v5.x
//  PRGX treasury multisig: submit → confirm → execute
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SimpleMultisig is ReentrancyGuard {

    // ══════════════════════════════════════════════════════════
    //  EVENTS
    // ══════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════
    //  MODIFIERS
    // ══════════════════════════════════════════════════════════

    modifier onlyMultisig() {
        require(isOwner[msg.sender], "Not a multisig owner");
        _;
    }

    /// @dev Used to gate governance functions — must be called via executeTransaction
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

    // ══════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ══════════════════════════════════════════════════════════

    constructor(address[] memory _owners, uint256 _numConfirmationsRequired) {
        require(_owners.length > 0, "At least one owner required");
        require(
            _numConfirmationsRequired > 0 && _numConfirmationsRequired <= _owners.length,
            "Invalid confirmation threshold"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "Invalid owner: zero address");
            require(!isOwner[owner], "Invalid owner: duplicate");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
    }

    // ══════════════════════════════════════════════════════════
    //  RECEIVE
    // ══════════════════════════════════════════════════════════

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    // ══════════════════════════════════════════════════════════
    //  SUBMIT
    //  Auto-confirms for the submitter (saves one extra tx call)
    // ══════════════════════════════════════════════════════════

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

        // Auto-confirm on behalf of the submitter
        _confirm(txIndex);
    }

    // ══════════════════════════════════════════════════════════
    //  CONFIRM
    // ══════════════════════════════════════════════════════════

    function confirmTransaction(uint256 _txIndex)
        public
        onlyMultisig
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        _confirm(_txIndex);
    }

    /// @dev Internal confirm logic — reused by submitTransaction auto-confirm
    function _confirm(uint256 _txIndex) internal {
        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations += 1;
        confirmations[_txIndex][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, _txIndex);
    }

    // ══════════════════════════════════════════════════════════
    //  EXECUTE
    // ══════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════
    //  REVOKE
    // ══════════════════════════════════════════════════════════

    function revokeConfirmation(uint256 _txIndex)
        public
        onlyMultisig
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(confirmations[_txIndex][msg.sender], "Tx not confirmed by you");

        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations -= 1;
        confirmations[_txIndex][msg.sender] = false;

        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    // ══════════════════════════════════════════════════════════
    //  GOVERNANCE  (must be called via executeTransaction)
    // ══════════════════════════════════════════════════════════

    /// @notice Add a new owner. Must be proposed and executed as a multisig tx.
    function addOwner(address _newOwner) external onlySelf {
        require(_newOwner != address(0), "Invalid owner: zero address");
        require(!isOwner[_newOwner], "Already an owner");

        isOwner[_newOwner] = true;
        owners.push(_newOwner);

        emit OwnerAdded(_newOwner);
    }

    /// @notice Remove an existing owner. Threshold must remain satisfiable.
    function removeOwner(address _owner) external onlySelf {
        require(isOwner[_owner], "Not an owner");
        require(owners.length - 1 >= numConfirmationsRequired, "Would break threshold");

        isOwner[_owner] = false;

        // Swap-and-pop to avoid shifting the whole array
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == _owner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }

        emit OwnerRemoved(_owner);
    }

    /// @notice Change the confirmation threshold. Must be proposed as a multisig tx.
    function changeRequirement(uint256 _required) external onlySelf {
        require(_required > 0 && _required <= owners.length, "Invalid threshold");
        numConfirmationsRequired = _required;
        emit RequirementChanged(_required);
    }

    // ══════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════

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

    /// @notice Returns the contract's current ETH balance
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
