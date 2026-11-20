require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

const networks = {
  hardhat: {},
  localhost: { url: "http://127.0.0.1:8545" },
};

if (SEPOLIA_RPC_URL && PRIVATE_KEY) {
  networks.sepolia = { url: SEPOLIA_RPC_URL, accounts: [PRIVATE_KEY] };
}

module.exports = {
  solidity: "0.8.24",
  networks,
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};
