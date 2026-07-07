import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatIgnition from "@nomicfoundation/hardhat-ignition";
import "dotenv/config";

// Note: @nomicfoundation/hardhat-chai-matchers@3 is not compatible with Hardhat 3.
// Chai matchers (revertedWith, emit, etc.) require installing the hh2 tagged version:
// npm install --save-dev "@nomicfoundation/hardhat-chai-matchers@hh2"
// Then add it to the plugins array below.

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

// Hardhat requires a valid 32-byte hex string for private keys.
const isValidPrivateKey = DEPLOYER_PRIVATE_KEY.length === 64 || DEPLOYER_PRIVATE_KEY.length === 66;

export default defineConfig({
  plugins: [hardhatEthers, hardhatMocha, hardhatIgnition],
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local Hardhat node (for development)
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },
    // Polygon Amoy Testnet (persistent, free)
    amoy: {
      type: "http",
      url: ALCHEMY_API_KEY
        ? `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
        : "https://rpc-amoy.polygon.technology/",
      accounts: isValidPrivateKey ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 80002,
    },
  },
  test: {
    mocha: {
      timeout: 60_000,
    },
  },
});