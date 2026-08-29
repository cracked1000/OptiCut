/**
 * Shared helpers for the OptiCut test suite.
 * Hardhat 3 exposes ethers via hre.network.connect().
 */
import hre from "hardhat";

export async function getEthers() {
  const networkConnection = await hre.network.connect();
  return networkConnection.ethers;
}

export function roleHashes(ethers) {
  return {
    LAB_ROLE: ethers.keccak256(ethers.toUtf8Bytes("LAB_ROLE")),
    NGJA_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("NGJA_ADMIN_ROLE")),
    DEFAULT_ADMIN_ROLE: ethers.ZeroHash,
  };
}

/**
 * Deploy a fresh OptiCut contract and grant the roles used by tests.
 * @returns {{opticut, deployer, ngjaAdmin, lab, other, roles, ethers}}
 */
export async function deployFixture() {
  const ethers = await getEthers();
  const [deployer, ngjaAdmin, lab, other, stranger] = await ethers.getSigners();
  const roles = roleHashes(ethers);

  const OptiCut = await ethers.getContractFactory("OptiCut");
  const opticut = await OptiCut.deploy();

  // deployer is DEFAULT_ADMIN by the constructor; grant NGJA + LAB explicitly.
  // NOTE: the lab is registered through grantLabRole (as the UI does) so it also
  // appears in the on-chain lab registry — raw grantRole(LAB_ROLE, …) does NOT
  // create a registry record (documented behaviour difference).
  await opticut.grantRole(roles.NGJA_ADMIN_ROLE, ngjaAdmin.address);
  await opticut.connect(ngjaAdmin).grantLabRole(lab.address, "Primary Lab");

  return { opticut, deployer, ngjaAdmin, lab, other, stranger, roles, ethers };
}

/**
 * Assert that `fn()` reverts, and that the error message matches `pattern`
 * if provided. Works with plain chai (no hardhat-chai-matchers needed).
 */
export async function expectRevert(fn, pattern) {
  let reverted = false;
  try {
    await fn();
  } catch (err) {
    reverted = true;
    if (pattern) {
      const msg = err?.reason || err?.message || String(err);
      if (!msg.includes(pattern)) {
        throw new Error(`Expected revert message to include "${pattern}" but got: ${msg}`);
      }
    }
  }
  if (!reverted) {
    throw new Error("Expected transaction to revert, but it did not.");
  }
}

/** Find a parsed event of `name` in a receipt and return its args (or null). */
export function findEvent(receipt, contract, name) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === name) return parsed.args;
    } catch {
      /* ignore unrelated logs */
    }
  }
  return null;
}

export async function waitTx(tx) {
  return await tx.wait();
}
