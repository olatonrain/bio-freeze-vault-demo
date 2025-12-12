// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

// Security libraries from OpenZeppelin
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BioVault is ReentrancyGuard {
    using ECDSA for bytes32;

    // --- CONFIGURATION ---
    address public owner;              // The User (Private Key)
    address public oracleAddress;      // Your Server (Verifies OAuth Face Scan)
    address public guardian;           // Telegram Bot (For Panic Freeze)
    
    // TIMERS (The Rules)
    uint256 public constant WITHDRAWAL_DELAY = 72 hours; // 3 Days to withdraw with Key
    uint256 public constant REPAIR_DELAY = 7 days;       // 7 Days to change Face ID
    uint256 public constant KEY_UNFREEZE_DELAY = 24 hours; // Anti-Hacker Stalemate
    uint256 public constant FEE_PERCENT = 50;            // 0.5% Protocol Fee

    // --- STATE VARIABLES ---
    bool public isFrozen;
    uint256 public frozenTimestamp;

    struct PendingAction {
        uint256 unlockTime;
        uint256 amount;     
        bool active;
    }

    PendingAction public pendingWithdrawal; // The "Slow" Key Withdrawal
    PendingAction public pendingFaceUpdate; // The "Slow" Face Repair

    // --- EVENTS ---
    event Deposit(address indexed sender, uint256 amount);
    event Frozen(uint256 timestamp);
    event Unfrozen(uint256 timestamp);
    event WithdrawalRequested(uint256 amount, uint256 unlockTime);
    event FaceUpdateRequested(uint256 unlockTime);
    event ActionCancelled(string reason);
    event Rescued(address indexed to, uint256 amount);

    // --- MODIFIERS ---
    modifier onlyOwner() {
        require(msg.sender == owner, "Only Owner");
        _;
    }

    modifier notFrozen() {
        require(!isFrozen, "Vault is FROZEN");
        _;
    }

    constructor(address _owner, address _oracle, address _guardian) {
        owner = _owner;
        oracleAddress = _oracle;
        guardian = _guardian;
    }

    // 1. RECEIVE MONEY
    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    // 2. PANIC FREEZE (The Shield)
    // Instantly stops everything. Callable by Owner OR Bot.
    function panicFreeze() external {
        require(msg.sender == owner || msg.sender == guardian, "Unauthorized");
        isFrozen = true;
        frozenTimestamp = block.timestamp;
        
        // Security: Freeze kills any pending hacker withdrawal
        if (pendingWithdrawal.active) {
            pendingWithdrawal.active = false;
            emit ActionCancelled("Withdrawal Cancelled by Freeze");
        }
        
        emit Frozen(block.timestamp);
    }

    // 3. UNFREEZE (The Stalemate)
    function requestUnfreeze() external onlyOwner {
        require(isFrozen, "Not frozen");
        // Must wait 24h to unfreeze with a Key. 
        // This stops a hacker from instantly unfreezing after you freeze them.
        require(block.timestamp >= frozenTimestamp + KEY_UNFREEZE_DELAY, "Wait 24h to unfreeze");
        isFrozen = false;
        emit Unfrozen(block.timestamp);
    }

    // 4. SLOW LANE: KEY WITHDRAWAL
    function requestWithdrawal(uint256 _amount) external onlyOwner notFrozen {
        require(_amount <= address(this).balance, "Insufficient funds");
        require(!pendingWithdrawal.active, "Request already pending");

        pendingWithdrawal = PendingAction({
            unlockTime: block.timestamp + WITHDRAWAL_DELAY,
            amount: _amount,
            active: true
        });

        emit WithdrawalRequested(_amount, pendingWithdrawal.unlockTime);
    }

    function finalizeWithdrawal() external onlyOwner notFrozen {
        require(pendingWithdrawal.active, "No pending request");
        require(block.timestamp >= pendingWithdrawal.unlockTime, "Wait 72 hours");

        uint256 amount = pendingWithdrawal.amount;
        pendingWithdrawal.active = false;

        payable(owner).transfer(amount);
    }

    // 5. SLOW LANE: REPAIR FACE (7 Days)
    function requestFaceUpdate() external onlyOwner {
        require(!pendingFaceUpdate.active, "Update already pending");
        
        pendingFaceUpdate = PendingAction({
            unlockTime: block.timestamp + REPAIR_DELAY,
            amount: 0,
            active: true
        });

        emit FaceUpdateRequested(pendingFaceUpdate.unlockTime);
    }

    // 6. BLOCK BUTTON (Stop the Hacker)
    function blockAction() external {
        require(msg.sender == owner || msg.sender == guardian, "Unauthorized");
        
        if (pendingWithdrawal.active) {
            pendingWithdrawal.active = false;
            emit ActionCancelled("Withdrawal Blocked");
        }
        if (pendingFaceUpdate.active) {
            pendingFaceUpdate.active = false;
            emit ActionCancelled("Face Update Blocked");
        }
    }

    // 7. FAST LANE: BIO-RESCUE (The Oracle)
    // Requires a signature from your server (proving Face Scan)
    function rescueFunds(address payable _to, uint256 _amount, bytes calldata _signature) external nonReentrant {
        // A. Verify the signature comes from YOUR Server
        bytes32 messageHash = keccak256(abi.encodePacked(owner, _to, _amount, address(this)));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        
        address signer = ECDSA.recover(ethSignedMessageHash, _signature);
        require(signer == oracleAddress, "Invalid Bio-Auth Signature");

        // B. Execution
        require(_amount <= address(this).balance, "Insufficient funds");

        uint256 fee = (_amount * FEE_PERCENT) / 10000;
        uint256 sendAmount = _amount - fee;

        // Reset state
        isFrozen = false;
        pendingWithdrawal.active = false;
        pendingFaceUpdate.active = false;

        // Transfer
        payable(oracleAddress).transfer(fee); // Pay You
        _to.transfer(sendAmount);             // Pay User

        emit Rescued(_to, sendAmount);
    }
}
