const hre = require("hardhat");

async function main() {
  // 1. Get your wallet
  const [deployer] = await hre.ethers.getSigners();
  
  // 2. The Factory Address you just deployed
  const factoryAddress = "0x1ccaB40f0981a9D42Eea3770F4E9c7149277b1D8"; 

  console.log("Connecting to Factory at:", factoryAddress);
  const factory = await hre.ethers.getContractAt("VaultFactory", factoryAddress);

  // 3. Call the "Create Vault" function
  console.log("Creating a new BioVault...");
  const tx = await factory.createVault();
  await tx.wait(); // Wait for block confirmation

  // 4. Get the new Vault Address
  const myVaults = await factory.getMyVaults(deployer.address);
  const newVaultAddress = myVaults[myVaults.length - 1]; // Get the latest one

  console.log("------------------------------------------------");
  console.log("✅ SUCCESS! Your Personal BioVault is ready.");
  console.log("📜 Vault Address:", newVaultAddress);
  console.log("------------------------------------------------");
  console.log("👉 COPY THIS ADDRESS! You need to paste it into your Telegram Bot.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
