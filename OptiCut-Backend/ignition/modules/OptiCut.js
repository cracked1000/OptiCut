import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("OptiCutModule", (m) => {
  const opticut = m.contract("OptiCut");

  return { opticut };
});
