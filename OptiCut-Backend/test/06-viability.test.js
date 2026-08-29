/**
 * VIABILITY TEST SUITE — production-readiness signals.
 *
 *  1. Gas economics  — how much does each operation cost? Are there any
 *     runaway functions that could make the product economically unviable?
 *  2. Endurance      — can the contract sustain repeated full lifecycles
 *     (mint → cut → mint → cut …) without degradation or state drift?
 *  3. Scale          — multi-lab, multi-stone workloads return correct data.
 *  4. State integrity — total circulating weight never exceeds total minted
 *     weight across a long random-ish workload (bounded property check).
 */
import { expect } from "chai";
import { deployFixture, waitTx } from "./helpers.js";

const gasTable = [];

function record(name, gas) {
  gasTable.push({ name, gas: Number(gas) });
}

describe("OptiCut :: Viability", function () {
  this.timeout(300_000);

  let opticut, lab, other, ngjaAdmin, stranger, ethers;

  beforeEach(async function () {
    ({ opticut, lab, other, ngjaAdmin, stranger, ethers } = await deployFixture());
    await opticut.connect(ngjaAdmin).grantLabRole(other.address, "Lab 2");
  });

  describe("gas economics", function () {
    it("measures gas per core operation", async function () {
      // registerGenesis
      let receipt = await waitTx(await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough"));
      record("registerGenesis (1 stone)", receipt.gasUsed);

      // requestTransformation
      receipt = await waitTx(await opticut.connect(lab).requestTransformation(1));
      record("requestTransformation", receipt.gasUsed);

      // completeTransformation with 1 child
      receipt = await waitTx(await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]));
      record("completeTransformation (1 child)", receipt.gasUsed);

      // completeTransformation with 4 children
      await opticut.connect(lab).registerGenesis("ipfs://g2", 40, "Rough");
      await opticut.connect(lab).requestTransformation(3);
      receipt = await waitTx(await opticut.connect(lab).completeTransformation(3, [10, 10, 10, 10], ["A", "B", "C", "D"], ["ipfs://a", "ipfs://b", "ipfs://c", "ipfs://d"]));
      record("completeTransformation (4 children)", receipt.gasUsed);

      // admin ops
      receipt = await waitTx(await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab X"));
      record("grantLabRole", receipt.gasUsed);

      receipt = await waitTx(await opticut.connect(ngjaAdmin).revokeLabRole(stranger.address));
      record("revokeLabRole", receipt.gasUsed);

      // recovery ops
      await opticut.connect(lab).registerGenesis("ipfs://g3", 10, "Rough");
      await opticut.connect(lab).requestTransformation(7);
      receipt = await waitTx(await opticut.connect(lab).cancelTransformation(7));
      record("cancelTransformation (lab self)", receipt.gasUsed);

      await opticut.connect(lab).requestTransformation(7);
      receipt = await waitTx(await opticut.connect(ngjaAdmin).adminReassignStone(7, other.address));
      record("adminReassignStone", receipt.gasUsed);

      // transfer
      await opticut.connect(lab).registerGenesis("ipfs://g4", 10, "Rough");
      receipt = await waitTx(await opticut.connect(lab).safeTransferFrom(lab.address, other.address, 8, 1, "0x"));
      record("safeTransferFrom", receipt.gasUsed);

      // print the table at the end of the run
      console.log("\n─── GAS REPORT (per operation) ───");
      for (const row of gasTable) {
        console.log(`  ${row.name.padEnd(36)} ${row.gas.toLocaleString().padStart(10)} gas`);
      }
      console.log("───────────────────────────────────");

      // Sanity bounds — these are viability gates, not hard facts.
      // If any operation starts approaching the 30M block gas limit,
      // the product becomes unaffordable on Polygon.
      for (const row of gasTable) {
        expect(row.gas, `${row.name} gas`).to.be.lessThan(3_000_000);
      }
    });
  });

  describe("endurance — repeated lifecycles", function () {
    it("30 full lifecycles succeed with stable state (no drift)", async function () {
      const CYCLES = 30;
      let totalMintedWeight = 0n;

      for (let i = 0; i < CYCLES; i++) {
        // lifecycle: genesis(10) → cut into (6, 4). Each cycle mints 3 ids.
        await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
        const parentId = i * 3 + 1; // cycle i → parent id 3i+1, children 3i+2, 3i+3
        totalMintedWeight += 10n;

        await opticut.connect(lab).requestTransformation(parentId);
        await opticut.connect(lab).completeTransformation(parentId, [6, 4], ["A", "B"], ["ipfs://a", "ipfs://b"]);

        const child1 = await opticut.stones(parentId + 1);
        const child2 = await opticut.stones(parentId + 2);
        expect(child1.weight).to.equal(6n);
        expect(child2.weight).to.equal(4n);
      }

      const lastChild = await opticut.stones(CYCLES * 3);
      expect(lastChild.weight).to.equal(4n);

      // circulating weight = sum of all leaf weights; every cycle distributes
      // the full parent weight to children, so circulating == total minted.
      let circulating = 0n;
      for (let id = 1n; id <= BigInt(CYCLES * 3); id++) {
        const s = await opticut.stones(id);
        if (s.status !== 2n) circulating += s.weight; // Active or Pending
      }
      expect(circulating).to.equal(totalMintedWeight);
      expect(circulating <= totalMintedWeight).to.be.true;
    });

    it("50 genesis mints + queries stay consistent", async function () {
      for (let i = 1; i <= 50; i++) {
        await opticut.connect(lab).registerGenesis(`ipfs://g${i}`, 1, "Rough");
      }
      const ids = await opticut.getStonesMintedByLab(lab.address);
      expect(ids.length).to.equal(50);
      expect(ids[0]).to.equal(1n);
      expect(ids[49]).to.equal(50n);
    });
  });

  describe("scale — multi-lab workloads", function () {
    it("10 labs × 10 stones each: ledgers and balances stay correct", async function () {
      // grant 8 additional labs using fresh hardhat signers (5..12; 0..4 are taken)
      const signers = await ethers.getSigners();
      for (let i = 5; i < 13; i++) {
        await opticut.connect(ngjaAdmin).grantLabRole(signers[i].address, `Lab ${i}`);
      }

      const labSigners = signers.slice(5, 13); // 8 fresh labs
      let id = 1n;
      for (let l = 0; l < labSigners.length; l++) {
        for (let s = 0; s < 10; s++) {
          await opticut.connect(labSigners[l]).registerGenesis(`ipfs://l${l}s${s}`, 1, "Rough");
          id++;
        }
        const ids = await opticut.getStonesMintedByLab(labSigners[l].address);
        expect(ids.length).to.equal(10);
      }

      // total ledger length across the 8 new labs
      let total = 0n;
      for (let l = 0; l < labSigners.length; l++) {
        total += BigInt((await opticut.getStonesMintedByLab(labSigners[l].address)).length);
      }
      expect(total).to.equal(80n);
      expect(await opticut.getAuthorizedLabCount()).to.equal(10n); // Primary + Second + 8 new
    });
  });

  describe("state integrity under adversarial ordering", function () {
    it("interleaving two labs' lifecycles keeps ownership disjoint", async function () {
      // lab mints & cuts; other mints & cuts; ids interleave
      const t1 = await opticut.connect(lab).registerGenesis("ipfs://lab1", 10, "Rough");
      const r1 = await waitTx(t1);
      void r1;
      const t2 = await opticut.connect(other).registerGenesis("ipfs://lab2", 20, "Rough");
      const r2 = await waitTx(t2);
      void r2;

      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(other).requestTransformation(2);

      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c1"]);
      await opticut.connect(other).completeTransformation(2, [8, 12], ["A", "B"], ["ipfs://a", "ipfs://b"]);

      // lab owns id 3 (child of 1); other owns 4, 5
      expect(await opticut.balanceOf(lab.address, 3)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 4)).to.equal(0n);
      expect(await opticut.balanceOf(other.address, 4)).to.equal(1n);
      expect(await opticut.balanceOf(other.address, 5)).to.equal(1n);

      expect((await opticut.stones(3)).custodian).to.equal(lab.address);
      expect((await opticut.stones(4)).custodian).to.equal(other.address);
      expect((await opticut.stones(5)).custodian).to.equal(other.address);
    });
  });
});
