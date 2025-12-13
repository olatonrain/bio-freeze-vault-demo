require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "./.env" }); // <--- CRITICAL: Forces loading .env

// Debug: Check if key is loaded
if (!process.env.PRIVATE_KEY) {
  console.error("⚠️  ERROR: PRIVATE_KEY is missing from .env file!");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20", // Must match your contracts
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris", // Critical for Humanode compatibility
    },
  },
  networks: {
    humanodeTestnet: {
      url: "https://explorer-rpc-http.testnet5.stages.humanode.io",
      chainId: 14853,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    humanodeMainnet: {
      url: "https://explorer-rpc-http.mainnet.stages.humanode.io",
      chainId: 5234,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      humanodeMainnet: "empty", // Blockscout doesn't need a real key
    },
    customChains: [
      {
        network: "humanodeMainnet",
        chainId: 5234,
        urls: {
          apiURL: "https://explorer.humanode.io/api",
          browserURL: "https://explorer.humanode.io",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};
