/**
 * DEEP TEST SUITE — Lineage & query views.
 * getChildIds, getStonesMintedByLab, lab lists, and the exact semantics
 * the frontend relies on (sequential ids, burned stones keep timestamps…).
 */
import { expect } from "chai";
import { deployFixture, expectRevert } from "./helpers.js";

describe("OptiCut :: Lineage & Queries", function () {
  let opticut, lab, other, ngjaAdmin, stranger, ethers;

  beforeEach(async function () {
    ({ opticut, lab, other, ngjaAdmin, stranger, ethers } = await deployFixture());
    await opticut.connect(ngjaAdmin).grantLabRole(other.address, "Second Lab");
  });

  describe("getChildIds", function () {
    it("returns [] for a genesis stone", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      expect((await opticut.getChildIds(1)).length).to.equal(0);
    });

    it("returns [] for a never-minted id", async function () {
      expect((await opticut.getChildIds(777)).length).to.equal(0);
    });

    it("returns children in mint order", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 20, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [8, 12], ["A", "B"], ["ipfs://a", "ipfs://b"]);
      const ids = await opticut.getChildIds(1);
      expect(ids.map(String)).to.deep.equal(["2", "3"]);
    });

    it("children of children are linked (grandchildren)", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 20, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [20], ["A"], ["ipfs://a"]);
      await opticut.connect(lab).requestTransformation(2);
      await opticut.connect(lab).completeTransformation(2, [9, 11], ["B", "C"], ["ipfs://b", "ipfs://c"]);
      expect((await opticut.getChildIds(2)).map(String)).to.deep.equal(["3", "4"]);
      expect((await opticut.getChildIds(1)).map(String)).to.deep.equal(["2"]);
    });
  });

  describe("burned stones keep their record (frontend dependency)", function () {
    it("stones() still returns burned data with timestamp preserved", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      const before = await opticut.stones(1);
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      const after = await opticut.stones(1);
      expect(after.status).to.equal(2n);
      expect(after.timestamp).to.equal(before.timestamp); // unchanged → frontend still lists it
      expect(after.weight).to.equal(10n);
      expect(after.parentTokenId).to.equal(0n);
    });

    it("custodian of a burned stone is untouched by the burn", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      expect((await opticut.stones(1)).custodian).to.equal(lab.address);
    });
  });

  describe("id space & boundaries", function () {
    it("genesis ids never collide with child ids", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g1", 5, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [5], ["Cut"], ["ipfs://c"]);
      await opticut.connect(lab).registerGenesis("ipfs://g2", 5, "Rough"); // id 3
      expect((await opticut.stones(1)).status).to.equal(2n);
      expect((await opticut.stones(2)).parentTokenId).to.equal(1n);
      expect((await opticut.stones(3)).parentTokenId).to.equal(0n);
      expect(await opticut.balanceOf(lab.address, 3)).to.equal(1n);
    });

    it("100 sequential genesis mints produce unique sequential ids", async function () {
      for (let i = 1; i <= 100; i++) {
        await opticut.connect(lab).registerGenesis(`ipfs://s${i}`, 1, "Rough");
      }
      expect((await opticut.stones(100)).weight).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 100)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 101)).to.equal(0n);
      expect((await opticut.getStonesMintedByLab(lab.address)).length).to.equal(100);
    });
  });

  describe("lab list views", function () {
    it("getAuthorizedLabs returns all labs incl. revoked", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Doomed");
      await opticut.connect(ngjaAdmin).revokeLabRole(stranger.address);
      const labs = await opticut.getAuthorizedLabs();
      expect(labs.length).to.equal(3);
    });

    it("getAuthorizedLabs preserves registration order", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab C");
      const names = (await opticut.getAuthorizedLabs()).map((l) => l.name);
      expect(names).to.deep.equal(["Primary Lab", "Second Lab", "Lab C"]);
    });

    it("lab records carry authorizedBy and timestamp", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab C");
      const rec = (await opticut.getAuthorizedLabs()).find((l) => l.lab === stranger.address);
      expect(rec.authorizedBy).to.equal(ngjaAdmin.address);
      expect(Number(rec.timestamp)).to.be.gt(0);
    });

    it("getAuthorizedLabCount tracks total records", async function () {
      expect(await opticut.getAuthorizedLabCount()).to.equal(2n);
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab C");
      expect(await opticut.getAuthorizedLabCount()).to.equal(3n);
      await opticut.connect(ngjaAdmin).revokeLabRole(stranger.address);
      expect(await opticut.getAuthorizedLabCount()).to.equal(3n); // soft-revoke keeps the record
    });

    it("granting the same lab twice does not duplicate the record", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab C");
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab C renamed");
      const labs = await opticut.getAuthorizedLabs();
      expect(labs.filter((l) => l.lab === stranger.address).length).to.equal(1);
      expect(await opticut.getAuthorizedLabCount()).to.equal(3n);
    });
  });

  describe("lineage accuracy with multiple children", function () {
    it("child list content matches the minted children exactly (3-child cut)", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 30, "Rough"); // id 1
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(
        1, [10, 12, 8], ["A", "B", "C"], ["ipfs://a", "ipfs://b", "ipfs://c"]
      );

      const childIds = await opticut.getChildIds(1);
      expect(childIds.map(String)).to.deep.equal(["2", "3", "4"]);

      // every child points back to parent 1, with its own weight/state preserved
      for (const [i, expectedWeight] of [[0, 10n], [1, 12n], [2, 8n]]) {
        const child = await opticut.stones(childIds[i]);
        expect(child.parentTokenId).to.equal(1n);
        expect(child.weight).to.equal(expectedWeight);
        expect(child.status).to.equal(0n);
      }

      // siblings share the same parent; no cross-links between children
      expect((await opticut.getChildIds(2)).length).to.equal(0);
      expect((await opticut.getChildIds(3)).length).to.equal(0);
      expect((await opticut.getChildIds(4)).length).to.equal(0);
    });

    it("reconstructs a full 3-generation chain from a deep leaf", async function () {
      // tree: 1(100) → [2(60), 3(40)]; 2(60) → [4(25), 5(35)]; 5(35) → [6(15), 7(20)]
      await opticut.connect(lab).registerGenesis("ipfs://g", 100, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [60, 40], ["A", "B"], ["ipfs://a", "ipfs://b"]);
      await opticut.connect(lab).requestTransformation(2);
      await opticut.connect(lab).completeTransformation(2, [25, 35], ["C", "D"], ["ipfs://c", "ipfs://d"]);
      await opticut.connect(lab).requestTransformation(5);
      await opticut.connect(lab).completeTransformation(5, [15, 20], ["E", "F"], ["ipfs://e", "ipfs://f"]);

      // walk the chain from leaf #7 exactly as the frontend getLineage() does
      const chain = [];
      let cur = 7n;
      while (cur !== 0n) {
        chain.push(cur);
        cur = (await opticut.stones(cur)).parentTokenId;
      }
      expect(chain.map(String)).to.deep.equal(["7", "5", "2", "1"]);

      // ancestors burned, leaf active; weights non-increasing along the path
      expect((await opticut.stones(1)).status).to.equal(2n);
      expect((await opticut.stones(2)).status).to.equal(2n);
      expect((await opticut.stones(5)).status).to.equal(2n);
      expect((await opticut.stones(7)).status).to.equal(0n);
      expect((await opticut.stones(7)).weight).to.equal(20n);
      expect((await opticut.stones(5)).weight).to.equal(35n);
      expect((await opticut.stones(2)).weight).to.equal(60n);
      expect((await opticut.stones(1)).weight).to.equal(100n);
    });

    it("every child in a parent's list is unique and points to that exact parent", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 40, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(
        1, [5, 5, 10, 20], ["A", "B", "C", "D"], ["ipfs://a", "ipfs://b", "ipfs://c", "ipfs://d"]
      );

      const childIds = await opticut.getChildIds(1);
      expect(childIds.map(String)).to.deep.equal(["2", "3", "4", "5"]);
      // no duplicates
      expect(new Set(childIds.map(String)).size).to.equal(childIds.length);
      for (const id of childIds) {
        expect((await opticut.stones(id)).parentTokenId).to.equal(1n);
      }
      // equal weights still produce distinct stones
      expect((await opticut.stones(2)).weight).to.equal(5n);
      expect((await opticut.stones(3)).weight).to.equal(5n);
      expect((await opticut.stones(2)).ipfsUri).to.equal("ipfs://a");
      expect((await opticut.stones(3)).ipfsUri).to.equal("ipfs://b");
    });

    it("children are appended only at completion — a Pending parent lists none", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      expect((await opticut.getChildIds(1)).length).to.equal(0);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      expect((await opticut.getChildIds(1)).map(String)).to.deep.equal(["2"]);
    });

    it("a genesis stone's lineage is exactly [itself] and terminates", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      const chain = [];
      let cur = 1n;
      while (cur !== 0n) {
        chain.push(cur);
        cur = (await opticut.stones(cur)).parentTokenId;
      }
      expect(chain.map(String)).to.deep.equal(["1"]);
    });
  });

  describe("role queries", function () {
    it("hasRole works for both roles", async function () {
      const roles = {
        lab: ethers.keccak256(ethers.toUtf8Bytes("LAB_ROLE")),
        admin: ethers.keccak256(ethers.toUtf8Bytes("NGJA_ADMIN_ROLE")),
      };
      expect(await opticut.hasRole(roles.lab, lab.address)).to.be.true;
      expect(await opticut.hasRole(roles.admin, ngjaAdmin.address)).to.be.true;
      expect(await opticut.hasRole(roles.admin, lab.address)).to.be.false;
      expect(await opticut.hasRole(roles.lab, stranger.address)).to.be.false;
    });
  });
});
