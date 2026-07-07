import { network } from "hardhat";

async function main() {

  console.log("--- Starting OptiCut Logic Test ---");

  const { ethers } = await network.connect();

  // 1. Setup
  const [ngjaAccount] = await ethers.getSigners();
  const OptiCut = await ethers.getContractFactory("OptiCut");

  console.log("Deploying contract...");
  const optiCut = await OptiCut.deploy();
  await optiCut.waitForDeployment();
  console.log("Contract deployed to:", await optiCut.getAddress());

  // 2. Mint Stone #1
  console.log("\nAction: NGJA recording 50ct Rough Stone...");
  await (await optiCut.recordNewCertificate(50n, "Rough", "ipfs://rough")).wait();

  const gem1 = await optiCut.gemstones(1n);
  console.log(`Result: Stone #1 created. Weight: ${gem1.weightInCarats}ct`);

  // 3. Recut (ID #1 -> ID #2)
  console.log("\nAction: Transforming ID #1 into 20ct Oval...");
  await (await optiCut.recordTransformation(1n, 20n, "Oval", "ipfs://oval")).wait();

  const gem2 = await optiCut.gemstones(2n);
  console.log(`Result: Stone #2 created. Parent ID: ${gem2.parentTokenId}`);

  if (gem2.parentTokenId === 1n) {
    console.log("\n✅ SUCCESS: Blockchain lineage preserved on-chain!");
  }
  
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});