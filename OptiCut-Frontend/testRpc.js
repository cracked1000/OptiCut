import { ethers } from "ethers";
const rpcUrl = "https://rpc-amoy.polygon.technology/";
const provider = new ethers.JsonRpcProvider(rpcUrl);

async function main() {
  const from = "0xd6b91EF935c8bE236eE552497B420446bBA26b57";
  const to = "0x686fC560f47aC52e7750A71f8A971298124Ecb87";
  
  // encode grantLabRole(0xbd113b97B6540c860C06DF962D8348A875beb189)
  const iface = new ethers.Interface([
    "function grantLabRole(address lab)"
  ]);
  const data = iface.encodeFunctionData("grantLabRole", ["0xbd113b97B6540c860C06DF962D8348A875beb189"]);

  try {
    const gas = await provider.estimateGas({
      from,
      to,
      data
    });
    console.log("Estimated Gas:", gas.toString());
  } catch (err) {
    console.error("Error estimating gas:", err);
  }
}

main();


