const hre = require("hardhat");

async function main() {
  // 1. YOUR ORACLE ADDRESS (Your Server Wallet)
  // Check your .env for the PRIVATE_KEY address, or paste the public address here
  const ORACLE_ADDRESS = "0xF588fB2de859d8aef8759468DF60049a77E1e5Ac"; 

  console.log("Deploying Industry Standard Factory...");

  const Factory = await hre.ethers.getContractFactory("ProxyFactory");
  const factory = await Factory.deploy(ORACLE_ADDRESS);
  await factory.waitForDeployment();

  console.log("🏭 Proxy Factory Deployed to:", await factory.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
