const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  // 1. Setup Addresses
  // For this test, your Deployer Wallet acts as both the Oracle and the Guardian
  // In production, these would be different addresses for security
  const oracleAddress = deployer.address;
  const guardianAddress = deployer.address;

  // 2. Deploy Factory
  const factory = await hre.ethers.deployContract("VaultFactory", [oracleAddress, guardianAddress]);

  await factory.waitForDeployment();

  console.log(`✅ VaultFactory deployed to: ${factory.target}`);
  console.log(`   Oracle Address set to: ${oracleAddress}`);
  console.log(`   Guardian Address set to: ${guardianAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
