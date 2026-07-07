import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_ADDRESS =
  process.env.TARGET_ADDRESS || '0xd6b91ef935c8be236ee552497b420446bba26b57';

async function main() {
  const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
  const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

  if (!ALCHEMY_API_KEY || !DEPLOYER_PRIVATE_KEY) {
    throw new Error('Set ALCHEMY_API_KEY and DEPLOYER_PRIVATE_KEY in OptiCut-Backend/.env');
  }

  const privateKey = DEPLOYER_PRIVATE_KEY.startsWith('0x')
    ? DEPLOYER_PRIVATE_KEY
    : `0x${DEPLOYER_PRIVATE_KEY}`;

  const rpcUrl = `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  const contractsFile = path.join(
    __dirname,
    '..',
    '..',
    'OptiCut-Frontend',
    'src',
    'contracts',
    'OptiCut.json'
  );

  const { address, abi } = JSON.parse(fs.readFileSync(contractsFile, 'utf8'));

  const contract = new ethers.Contract(address, abi, deployer);

  const NGJA_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('NGJA_ADMIN_ROLE'));

  console.log('Using deployer:', deployer.address);
  console.log('Contract address:', address);
  console.log('Target admin:', TARGET_ADDRESS);

  const alreadyHasRole = await contract.hasRole(NGJA_ADMIN_ROLE, TARGET_ADDRESS);

  if (alreadyHasRole) {
    console.log(`✓ ${TARGET_ADDRESS} already has NGJA_ADMIN_ROLE`);
    return;
  }

  const tx = await contract.grantRole(NGJA_ADMIN_ROLE, TARGET_ADDRESS);
  await tx.wait();

  console.log(`✓ Done. Tx hash: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});