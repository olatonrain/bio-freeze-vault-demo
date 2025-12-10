require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "./backend/.env" }); // Load keys from backend/.env

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
  humanodeMainnet: {
  url: "https://explorer-rpc-http.mainnet.stages.humanode.io",
  chainId: 5234,
  accounts: [process.env.PRIVATE_KEY], // Your wallet will deploy the contracts
    },
  },
};
