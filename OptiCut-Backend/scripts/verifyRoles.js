import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkRoles() {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Read ABI and Address
    const artifactPath = path.join(__dirname, "..", "..", "OptiCut-Frontend", "src", "contracts", "OptiCut.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    
    const contract = new ethers.Contract(artifact.address, artifact.abi, provider);
    
    const NGJA_ROLE = ethers.id("NGJA_ROLE");
    const LAB_ROLE = ethers.id("LAB_ROLE");
    
    const deployer = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
    const lab = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
    
    console.log(`Checking roles on contract directly via node for ADDRESS: ${artifact.address}`);
    
    const hasNgja = await contract.hasRole(NGJA_ROLE, deployer);
    console.log(`Deployer (${deployer}) has NGJA_ROLE: ${hasNgja}`);
    
    const hasLab = await contract.hasRole(LAB_ROLE, lab);
    console.log(`Lab (${lab}) has LAB_ROLE: ${hasLab}`);
}

checkRoles().catch(console.error);
