require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "./.env" });

// Debug Log
if (!process.env.PRIVATE_KEY) {
  console.error("⚠️  ERROR: PRIVATE_KEY is missing!");
} else {
  console.log("✅ Loaded Key");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // UPGRADE TO 0.8.20
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // CRITICAL: Use 'paris' to ensure compatibility with all chains
      evmVersion: "paris",
    },
  },
  networks: {
    humanodeTestnet: {
      url: "https://explorer-rpc-http.testnet5.stages.humanode.io",
      chainId: 14853,
      accounts: [process.env.PRIVATE_KEY],
    },
    humanodeMainnet: {
      url: "https://explorer-rpc-http.mainnet.stages.humanode.io",
      chainId: 5234,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
