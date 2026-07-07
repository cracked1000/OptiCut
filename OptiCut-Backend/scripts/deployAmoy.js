import fs from 'fs';
import { ethers } from 'ethers';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
  const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

  if (!ALCHEMY_API_KEY || ALCHEMY_API_KEY === 'YOUR_ALCHEMY_API_KEY_HERE') {
    console.error('❌ Please set your ALCHEMY_API_KEY in OptiCut-Backend/.env');
    process.exit(1);
  }

  if (!DEPLOYER_PRIVATE_KEY || DEPLOYER_PRIVATE_KEY === 'YOUR_PRIVATE_KEY_HERE') {
    console.error('❌ Please set your DEPLOYER_PRIVATE_KEY in OptiCut-Backend/.env');
    process.exit(1);
  }

  const privateKey = DEPLOYER_PRIVATE_KEY.startsWith('0x')
    ? DEPLOYER_PRIVATE_KEY
    : `0x${DEPLOYER_PRIVATE_KEY}`;

  const rpcUrl = `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

  console.log('🔗 Connecting to Polygon Amoy Testnet...');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(deployer.address);

  console.log(`💰 Deployer Address: ${deployer.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} POL`);

  if (balance === 0n) {
    console.error('❌ No POL balance. Add test POL to the deployer wallet first.');
    process.exit(1);
  }

  const artifactPath = path.join(
    __dirname,
    '..',
    'artifacts',
    'contracts',
    'OptiCut.sol',
    'OptiCut.json'
  );

  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Contract not compiled. Run: npx hardhat compile');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  console.log('🚀 Deploying OptiCut contract to Polygon Amoy...');

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy();

  const deployReceipt = await contract.deploymentTransaction().wait();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deploymentBlock = deployReceipt.blockNumber;

  console.log(`✅ OptiCut deployed to: ${address}`);
  console.log(`✅ Deployment block: ${deploymentBlock}`);

  const NGJA_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('NGJA_ADMIN_ROLE'));

  const hasAdmin = await contract.hasRole(NGJA_ADMIN_ROLE, deployer.address);

  if (!hasAdmin) {
    console.log('🔑 Granting NGJA_ADMIN_ROLE to deployer...');

    const tx = await contract.grantRole(NGJA_ADMIN_ROLE, deployer.address);
    await tx.wait();
  }

  console.log(`✅ NGJA admin wallet: ${deployer.address}`);

  console.log('🔬 Registering deployer as initial lab...');

  const labTx = await contract.grantLabRole(deployer.address, "Genesis Lab");
  await labTx.wait();

  console.log(`✅ Initial lab registered: ${deployer.address}`);

  const frontendDir = path.join(
    __dirname,
    '..',
    '..',
    'OptiCut-Frontend',
    'src',
    'contracts'
  );

  fs.mkdirSync(frontendDir, { recursive: true });

  const frontendFile = path.join(frontendDir, 'OptiCut.json');

  fs.writeFileSync(
    frontendFile,
    JSON.stringify({ address, abi: artifact.abi }, null, 2)
  );

  console.log(`📦 Frontend ABI exported to: ${frontendFile}`);

  const deploymentInfo = {
    network: 'Polygon Amoy Testnet',
    chainId: 80002,
    contractAddress: address,
    deployerAddress: deployer.address,
    deploymentBlock,
    deployedAt: new Date().toISOString(),
    explorerUrl: `https://amoy.polygonscan.com/address/${address}`,
    rpcUrl,
  };

  const deploymentFile = path.join(__dirname, '..', 'deployments', 'amoy.json');

  fs.mkdirSync(path.dirname(deploymentFile), { recursive: true });

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  const frontendEnvPath = path.join(
    __dirname,
    '..',
    '..',
    'OptiCut-Frontend',
    '.env.local'
  );

  fs.writeFileSync(
    frontendEnvPath,
    [
      `VITE_CONTRACT_ADDRESS=${address}`,
      `VITE_RPC_URL=${rpcUrl}`,
      `VITE_DEPLOYMENT_BLOCK=${deploymentBlock}`,
      '',
    ].join('\n')
  );

  console.log(`🧩 Frontend env written to: ${frontendEnvPath}`);

  console.log('\n🎉 Deployment Complete!');
  console.log('═══════════════════════════════════════');
  console.log(`📍 Contract: ${address}`);
  console.log(`🧱 Block:    ${deploymentBlock}`);
  console.log(`🔍 Explorer: ${deploymentInfo.explorerUrl}`);
  console.log('═══════════════════════════════════════');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});