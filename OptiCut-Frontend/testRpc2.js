import { ethers } from "ethers";
const rpcUrl = "https://rpc-amoy.polygon.technology/";
const provider = new ethers.JsonRpcProvider(rpcUrl);

async function main() {
  const contractAddress = "0x686fC560f47aC52e7750A71f8A971298124Ecb87";
  const iface = new ethers.Interface([
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function getAuthorizedLabs() view returns (tuple(address lab, address authorizedBy, uint256 timestamp)[])"
  ]);
  const contract = new ethers.Contract(contractAddress, iface, provider);
  
  const LAB_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LAB_ROLE"));
  const hasRole = await contract.hasRole(LAB_ROLE, "0xbd113b97B6540c860C06DF962D8348A875beb189");
  console.log("hasRole:", hasRole);
  
  const labs = await contract.getAuthorizedLabs();
  console.log("labs:", labs);
}
main();


