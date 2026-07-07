import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function frontendSim() {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Simulating MetaMask connecting as Account 0
    const testWallet = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
    // Also testing with checksummed address
    const checksummedAddress = ethers.getAddress(testWallet);
    
    const artifactPath = path.join(__dirname, "..", "..", "OptiCut-Frontend", "src", "contracts", "OptiCut.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    
    // Read contract exactly as frontend does
    const contract = new ethers.Contract(artifact.address, artifact.abi, provider);
    
    // Hash roles exactly as the new frontend code does
    const NGJA_ROLE = ethers.keccak256(ethers.toUtf8Bytes("NGJA_ROLE"));
    const LAB_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LAB_ROLE"));
    
    console.log("=== FRONTEND SIMULATION ===");
    console.log("Checking Target Wallet:", testWallet);
    console.log("Checksummed Wallet:", checksummedAddress);
    console.log("Checking Contract Address:", artifact.address);
    console.log("Hashed NGJA_ROLE:", NGJA_ROLE);
    console.log("Hashed LAB_ROLE:", LAB_ROLE);

    try {
        const hasNgjaRaw = await contract.hasRole(NGJA_ROLE, testWallet);
        console.log(`hasRole(NGJA_ROLE, rawWallet): ${hasNgjaRaw}`);
        
        const hasNgjaChecksum = await contract.hasRole(NGJA_ROLE, checksummedAddress);
        console.log(`hasRole(NGJA_ROLE, checksummedAddress): ${hasNgjaChecksum}`);
    } catch (e) {
        console.error("RPC Error during hasRole checks:", e);
    }
}

frontendSim().catch(console.error);
