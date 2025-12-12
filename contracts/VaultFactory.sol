// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BioVault.sol";

contract VaultFactory {
    // --- EVENTS ---
    event VaultCreated(address indexed owner, address vaultAddress, uint256 timestamp);

    // --- CONFIGURATION ---
    // These are YOUR addresses (Server & Bot) that manage the security
    address public oracleAddress; 
    address public guardianAddress; 

    // --- TRACKING ---
    // Maps User Address -> List of their Vaults
    mapping(address => address[]) public userVaults;
    
    // Keep a list of ALL vaults (so you can calculate Total Value Locked later)
    address[] public allVaults;

    constructor(address _oracle, address _guardian) {
        oracleAddress = _oracle;
        guardianAddress = _guardian;
    }

    // --- THE MAGIC BUTTON ---
    function createVault() external {
        // 1. Deploy a new BioVault contract
        // We pass 'msg.sender' so the User becomes the Owner immediately
        BioVault newVault = new BioVault(
            msg.sender,      // The User
            oracleAddress,   // Your Server (Oracle)
            guardianAddress  // Your Bot (Guardian)
        );

        // 2. Save the record
        userVaults[msg.sender].push(address(newVault));
        allVaults.push(address(newVault));

        emit VaultCreated(msg.sender, address(newVault), block.timestamp);
    }

    // --- VIEW FUNCTIONS ---
    function getMyVaults(address _user) external view returns (address[] memory) {
        return userVaults[_user];
    }
    
    function totalVaults() external view returns (uint256) {
        return allVaults.length;
    }
}
