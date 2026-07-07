import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Hardhat 3: ethers accessed via network.connect()
  const networkConnection = await hre.network.connect();
  const { ethers } = networkConnection;

  console.log("Deploying OptiCut to network:", hre.config.defaultNetwork || "default", "...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer wallet:    ", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:   ", ethers.formatEther(balance), "POL/MATIC");

  if (balance === 0n) {
    throw new Error(
      "Deployer wallet has 0 balance!\n" +
      "Get free test MATIC at: https://faucet.polygon.technology\n" +
      "Wallet address: " + deployer.address
    );
  }

  const OptiCut = await ethers.getContractFactory("OptiCut");
  const opticut = await OptiCut.deploy();

  await opticut.waitForDeployment();
  const address = await opticut.getAddress();

  console.log("\n✓ OptiCut deployed to:", address);

  // Grant NGJA_ADMIN_ROLE to the deployer wallet
  const NGJA_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("NGJA_ADMIN_ROLE"));
  const tx = await opticut.grantRole(NGJA_ADMIN_ROLE, deployer.address);
  await tx.wait();
  console.log("✓ Granted NGJA_ADMIN_ROLE to deployer:", deployer.address);

  console.log("\n─────────────────────────────────────────");
  console.log("NEXT STEPS:");
  console.log("  1. Open OptiCut-Frontend/.env");
  console.log("     Set VITE_CONTRACT_ADDRESS =", address);
  console.log("  2. Run: cd ../OptiCut-Frontend && npm run dev");
  console.log("  3. Connect your deployer wallet → go to /admin");
  console.log("     → Authorize your Lab Wallet from the UI");
  console.log("─────────────────────────────────────────\n");

  // Save ABI + address to frontend
  saveFrontendFiles(address, ethers);
}

function saveFrontendFiles(contractAddress) {
  const contractsDir = path.join(__dirname, "..", "..", "OptiCut-Frontend", "src", "contracts");

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  const ContractArtifact = hre.artifacts.readArtifactSync("OptiCut");

  fs.writeFileSync(
    path.join(contractsDir, "OptiCut.json"),
    JSON.stringify({ address: contractAddress, abi: ContractArtifact.abi }, null, 2)
  );

  // Also write address to a file for easy copy-paste
  fs.writeFileSync(
    path.join(__dirname, "..", ".deploy-address"),
    contractAddress
  );

  console.log("✓ ABI + address saved to OptiCut-Frontend/src/contracts/OptiCut.json");
  console.log("✓ Address also saved to OptiCut-Backend/.deploy-address");
}

main().catch((error) => {
  console.error("\n✗ Deploy failed:", error.message);
  process.exitCode = 1;
});