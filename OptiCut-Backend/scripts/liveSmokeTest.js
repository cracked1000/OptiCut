/**
 * LIVE TESTNET VIABILITY SMOKE TEST
 *
 * Connects to the OptiCut contract deployed on Polygon Amoy and performs
 * the exact read operations the frontend performs — proving the deployed
 * system is alive and its data is coherent. Read-only: spends no gas.
 *
 * Run:  node scripts/liveSmokeTest.js
 */
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "amoy.json"), "utf8")
  );
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "artifacts", "contracts", "OptiCut.sol", "OptiCut.json"),
      "utf8"
    )
  );

  console.log("═══ OPTICUT LIVE SMOKE TEST — Polygon Amoy ═══");
  console.log(`Contract: ${deployment.contractAddress}`);
  console.log(`Deployed: ${deployment.deployedAt} (block ${deployment.deploymentBlock})`);
  console.log("");

  const provider = new ethers.JsonRpcProvider(deployment.rpcUrl);
  const contract = new ethers.Contract(deployment.contractAddress, artifact.abi, provider);

  const checks = [];
  const ok = (name, detail = "") => checks.push({ name, pass: true, detail });
  const fail = (name, detail = "") => checks.push({ name, pass: false, detail });

  try {
    const latest = await provider.getBlockNumber();
    console.log(`Latest block:            ${latest.toLocaleString()}`);
    ok("RPC reachable & current", `block ${latest}`);
  } catch (e) {
    fail("RPC reachable", e.message);
  }

  // ── Lab registry views (what the admin panel renders) ──
  try {
    const [all, active, revoked, count] = await Promise.all([
      contract.getAuthorizedLabs(),
      contract.getActiveLabs(),
      contract.getRevokedLabs(),
      contract.getAuthorizedLabCount(),
    ]);
    ok(
      "getAuthorizedLabs",
      `${all.length} record(s): ${all.map((l) => l.name || "(unnamed)").join(", ")}`
    );
    ok("getActiveLabs", `${active.length} active`);
    ok("getRevokedLabs", `${revoked.length} revoked`);
    ok("getAuthorizedLabCount", `count=${count} (matches ${all.length}) ${count === BigInt(all.length) ? "✓" : "✗ MISMATCH"}`);
    if (count !== BigInt(all.length)) fail("lab count consistency");
  } catch (e) {
    fail("lab registry views", e.message);
  }

  // ── Stone scan — mirror of frontend getStonesForAccount logic ──
  try {
    const BATCH = 10;
    const MAX_ID = 200;
    let stones = [];
    let done = false;
    for (let start = 1; start <= MAX_ID && !done; start += BATCH) {
      const ids = Array.from({ length: Math.min(BATCH, MAX_ID - start + 1) }, (_, i) => start + i);
      const batch = await Promise.all(
        ids.map((id) => contract.stones(BigInt(id)).catch(() => null))
      );
      for (let i = 0; i < batch.length; i++) {
        const s = batch[i];
        if (!s || Number(s.timestamp) === 0) {
          done = true;
          break;
        }
        // NOTE: do NOT spread `s` — ethers Result objects lose their named
        // properties when spread (they are non-enumerable). Read fields directly.
        stones.push({
          id: ids[i],
          parentTokenId: s.parentTokenId,
          weight: s.weight,
          stoneState: s.stoneState,
          ipfsUri: s.ipfsUri,
          status: s.status,
          timestamp: s.timestamp,
          custodian: s.custodian,
        });
      }
    }
    ok("stone scan", `${stones.length} stone(s) found (scanning 1..${MAX_ID})`);

    // integrity checks
    let invalid = 0;
    for (const st of stones) {
      const status = Number(st.status);
      if (![0, 1, 2].includes(status)) invalid++;
      if (st.custodian === "0x0000000000000000000000000000000000000000" && status !== 2) invalid++;
    }
    if (invalid > 0) fail("stone data integrity", `${invalid} invalid record(s)`);
    else ok("stone data integrity", "all records have valid status + custodian");

    const byStatus = { 0: 0, 1: 0, 2: 0 };
    stones.forEach((s) => byStatus[Number(s.status)]++);
    console.log(`  statuses → Active: ${byStatus[0]}, Pending: ${byStatus[1]}, Burned: ${byStatus[2]}`);

    if (stones.length > 0) {
      // walk one lineage chain as StoneViewer does
      let cur = stones[stones.length - 1].id;
      const chain = [];
      while (cur !== 0) {
        const s = await contract.stones(BigInt(cur));
        if (Number(s.timestamp) === 0) break;
        chain.unshift(cur);
        cur = Number(s.parentTokenId);
      }
      ok("lineage walk", `stone #${stones[stones.length - 1].id} → chain depth ${chain.length}`);
    }
  } catch (e) {
    fail("stone scan", e.message);
  }

  // ── Function availability (ABI-compatibility of the deployed bytecode) ──
  try {
    await contract.getStonesMintedByLab(deployment.deployerAddress);
    ok("getStonesMintedByLab available");
  } catch (e) {
    fail("getStonesMintedByLab available", e.message.slice(0, 120));
  }

  console.log("");
  console.log("═══ RESULTS ═══");
  const passed = checks.filter((c) => c.pass).length;
  for (const c of checks) {
    console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? " — " + c.detail : ""}`);
  }
  console.log(`\n${passed}/${checks.length} checks passed`);

  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
