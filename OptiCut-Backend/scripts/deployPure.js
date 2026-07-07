import fs from 'fs';
import { ethers } from 'ethers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

  // Use Hardhat default account 0 for local testing only
  // Load from environment variables with fallback to Hardhat default accounts
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const lab1Key = process.env.LAB_PRIVATE_KEY || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  const deployer = new ethers.Wallet(deployerKey, provider);
  const lab1 = new ethers.Wallet(lab1Key, provider);
  
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "OptiCut.sol", "OptiCut.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  console.log("Deploying contract directly to local node...");
  
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  
  console.log("Deployed OptiCut to:", address);

  const NGJA_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("NGJA_ADMIN_ROLE"));
  const LAB_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LAB_ROLE"));

  let deployerNonce = await provider.getTransactionCount(deployer.address);

  const tx1 = await contract.grantRole(NGJA_ADMIN_ROLE, deployer.address, { nonce: deployerNonce++ });
  await tx1.wait();
  
  const tx2 = await contract.grantRole(LAB_ROLE, lab1.address, { nonce: deployerNonce++ });
  await tx2.wait();
  
  console.log(`Granted NGJA_ADMIN_ROLE to ${deployer.address}`);
  console.log(`Granted LAB_ROLE to ${lab1.address}`);

  const frontendDir = path.join(__dirname, "..", "..", "OptiCut-Frontend", "src", "contracts");
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }
  
  const frontendFile = path.join(frontendDir, "OptiCut.json");
  fs.writeFileSync(frontendFile, JSON.stringify({ address, abi: artifact.abi }, null, 2));

  console.log("Frontend ABI and address exported successfully to", frontendFile);
}

main().catch(console.error);
