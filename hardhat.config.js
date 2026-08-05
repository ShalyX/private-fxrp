require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("chai-as-promised");

const networks = {};
if (process.env.COSTON2_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) {
  networks.coston2 = {
    url: process.env.COSTON2_RPC_URL,
    chainId: 114,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY]
  };
}

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks,
  mocha: {
    timeout: 20000
  }
};
