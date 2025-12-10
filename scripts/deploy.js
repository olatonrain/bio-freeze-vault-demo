const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  // For this test, your Deployer Wallet acts as both Oracle and Guardian
  const oracleAddress = deployer.address;
  const guardianAddress = deployer.address;

  const factory = await hre.ethers.deployContract("VaultFactory", [oracleAddress, guardianAddress]);

  await factory.waitForDeployment();

  console.log(`✅ VaultFactory deployed to: ${factory.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
