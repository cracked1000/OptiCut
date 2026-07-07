import { ethers } from "ethers";
import fs from "fs";
import { fileURLToPath } from 'url';
import path from 'path';

const rpcUrl = "https://polygon-amoy.g.alchemy.com/v2/9Fhjjb3J1ADJds89SZpKs";
const provider = new ethers.JsonRpcProvider(rpcUrl);

const contractAddress = "0x686fC560f47aC52e7750A71f8A971298124Ecb87";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactPath = path.join(__dirname, 'artifacts', 'contracts', 'OptiCut.sol', 'OptiCut.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

async function main() {
  const deployer = "0xd6b91EF935c8bE236eE552497B420446bBA26b57";
  const NGJA_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('NGJA_ADMIN_ROLE'));
  const hasAdmin = await contract.hasRole(NGJA_ADMIN_ROLE, deployer);
  console.log("hasAdmin:", hasAdmin);

  try {
      const data = contract.interface.encodeFunctionData("grantLabRole", ["0xbd113b97B6540c860C06DF962D8348A875beb189"]);
      console.log("Simulating grantLabRole...");
      const result = await provider.call({
          to: contractAddress,
          from: deployer,
          data: data
      });
      console.log("Result:", result);
  } catch (e) {
      console.error("Simulation failed:", e);
  }
}
main();
