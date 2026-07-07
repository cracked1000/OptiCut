import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [,, address] = process.argv;

if (!address) {
  console.error("Please provide the deployed contract address as an argument.");
  process.exit(1);
}

const sourcePath = path.join(__dirname, "..", "artifacts", "contracts", "OptiCut.sol", "OptiCut.json");
const contractsDir = path.join(__dirname, "..", "..", "OptiCut-Frontend", "src", "contracts");

if (!fs.existsSync(contractsDir)) {
  fs.mkdirSync(contractsDir, { recursive: true });
}

const artifact = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

fs.writeFileSync(
  path.join(contractsDir, "OptiCut.json"),
  JSON.stringify({ address: address, abi: artifact.abi }, null, 2)
);

console.log("Frontend ABI and address exported successfully to", address);
