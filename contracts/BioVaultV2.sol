// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 1. IMPORT STANDARD LIBRARIES
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract BioVaultV2 is ReentrancyGuard, Initializable {
    
    // STATE VARIABLES
    address public owner;
    address public oracleAddress;
    uint256 public constant TIMELOCK_DURATION = 72 hours;
    uint256 public constant GRACE_PERIOD = 24 hours;

    // WITHDRAWAL STATE
    struct WithdrawalRequest {
        uint256 amount;
        uint256 unlockTime;
        bool active;
    }
    WithdrawalRequest public request;
    bool public isFrozen;

    // EVENTS
    event Deposited(address indexed from, uint256 amount);
    event WithdrawalRequested(uint256 amount, uint256 unlockTime);
    event WithdrawalFinalized(uint256 amount);
    event VaultFrozen(string reason);
    event FundsRescued(address indexed to, uint256 amount);

    // MODIFIERS
    modifier onlyOwner() {
        require(msg.sender == owner, "Not Owner");
        _;
    }

    modifier notFrozen() {
        require(!isFrozen, "Vault Frozen");
        _;
    }

    // 2. REPLACE CONSTRUCTOR WITH INITIALIZER
    // "initializer" ensures this runs only once per clone
    function initialize(address _owner, address _oracle) external initializer {
        owner = _owner;
        oracleAddress = _oracle;
        isFrozen = false;
    }

    // --- SAME LOGIC AS BEFORE ---

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // A. SLOW WITHDRAWAL (72 Hours)
    function requestWithdrawal(uint256 _amount) external onlyOwner notFrozen {
        require(address(this).balance >= _amount, "Insufficient funds");
        request = WithdrawalRequest({
            amount: _amount,
            unlockTime: block.timestamp + TIMELOCK_DURATION,
            active: true
        });
        emit WithdrawalRequested(_amount, request.unlockTime);
    }

    function finalizeWithdrawal() external onlyOwner notFrozen nonReentrant {
        require(request.active, "No active request");
        require(block.timestamp >= request.unlockTime, "Timelock active");
        require(block.timestamp <= request.unlockTime + GRACE_PERIOD, "Request expired");

        uint256 amount = request.amount;
        request.active = false;

        payable(owner).transfer(amount);
        emit WithdrawalFinalized(amount);
    }

    // B. SECURITY FEATURES
    function panicFreeze() external {
        // Anyone can freeze if they suspect a hack (Community Defense)
        // Or restrict to owner/oracle if preferred
        isFrozen = true;
        emit VaultFrozen("Panic Button Triggered");
    }

    // C. INSTANT RESCUE (The "Immune" System)
    // Verifies the Oracle Signature (Face Scan)
    function rescueFunds(address _to, uint256 _amount, bytes calldata _signature) external nonReentrant {
        // 1. Recreate the hash
        bytes32 messageHash = keccak256(abi.encodePacked(owner, owner, _amount, address(this)));
        bytes32 ethSignedMessageHash = toEthSignedMessageHash(messageHash);

        // 2. Recover Signer
        address signer = recoverSigner(ethSignedMessageHash, _signature);
        require(signer == oracleAddress, "Invalid Bio-Auth Signature");

        // 3. Reset and Transfer
        isFrozen = false; 
        request.active = false; // Cancel any pending hacker withdrawals

        payable(_to).transfer(_amount);
        emit FundsRescued(_to, _amount);
    }

    // --- CRYPTO HELPERS ---
    function toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
