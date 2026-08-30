const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying OptiCut...");

  const [deployer, lab1] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const OptiCut = await hre.ethers.getContractFactory("OptiCut");
  const opticut = await OptiCut.deploy();

  await opticut.waitForDeployment();
  const address = await opticut.getAddress();

  console.log("OptiCut deployed to:", address);

  const NGJA_ADMIN_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("NGJA_ADMIN_ROLE"));
  const LAB_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("LAB_ROLE"));

  await opticut.grantRole(NGJA_ADMIN_ROLE, deployer.address);
  await opticut.grantRole(LAB_ROLE, lab1.address);
  console.log(`Granted NGJA_ADMIN_ROLE to ${deployer.address}`);
  console.log(`Granted LAB_ROLE to ${lab1.address}`);

  await saveFrontendFiles(address);
}

async function saveFrontendFiles(contractAddress) {
  const contractsDir = path.join(__dirname, "..", "..", "OptiCut-Frontend", "src", "contracts");

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  // Hardhat 3 removed readArtifactSync — artifact reads are async-only now.
  const ContractArtifact = await hre.artifacts.readArtifact("OptiCut");

  fs.writeFileSync(
    path.join(contractsDir, "OptiCut.json"),
    JSON.stringify({ address: contractAddress, abi: ContractArtifact.abi }, null, 2)
  );

  console.log("Frontend ABI and address exported successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});