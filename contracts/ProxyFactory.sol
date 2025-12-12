// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./BioVaultV2.sol";

contract ProxyFactory {
    address public immutable implementation;
    address public immutable oracleAddress;

    mapping(address => address[]) public userVaults;
    event VaultCreated(address indexed user, address vault);

    // Pass the Oracle address when YOU deploy the Factory
    constructor(address _oracle) {
        implementation = address(new BioVaultV2());
        oracleAddress = _oracle; 
    }

    // No arguments needed! Matches your website perfectly.
    function createVault() external returns (address) {
        address clone = Clones.clone(implementation);
        
        // Use the stored oracle address automatically
        BioVaultV2(payable(clone)).initialize(msg.sender, oracleAddress);
        
        userVaults[msg.sender].push(clone);
        emit VaultCreated(msg.sender, clone);
        return clone;
    }

    function getMyVaults(address _user) external view returns (address[] memory) {
        return userVaults[_user];
    }
}
