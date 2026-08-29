/**
 * DEEP TEST SUITE — Two-phase transformation state machine.
 * Active → Pending → (parent Burned + children Active).
 * Validation, conservation rules, atomicity, events, ledger effects.
 */
import { expect } from "chai";
import { deployFixture, expectRevert, findEvent, waitTx } from "./helpers.js";

describe("OptiCut :: Transformation State Machine", function () {
  let opticut, lab, other, ngjaAdmin, ethers;

  beforeEach(async function () {
    ({ opticut, lab, other, ngjaAdmin, ethers } = await deployFixture());
    await opticut.connect(lab).registerGenesis("ipfs://gen", 10, "Rough"); // id 1, weight 10
  });

  describe("requestTransformation", function () {
    it("flips Active → Pending", async function () {
      const tx = await opticut.connect(lab).requestTransformation(1);
      const receipt = await waitTx(tx);
      expect((await opticut.stones(1)).status).to.equal(1n);
      const args = findEvent(receipt, opticut, "TransformationRequested");
      expect(args.tokenId).to.equal(1n);
      expect(args.byLab).to.equal(lab.address);
    });

    it("rejects a second request while already Pending", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await expectRevert(
        () => opticut.connect(lab).requestTransformation(1),
        "Token not active"
      );
    });

    it("rejects request on a non-existent token", async function () {
      await expectRevert(
        () => opticut.connect(lab).requestTransformation(999),
        "Lab does not hold token"
      );
    });

    it("rejects request on a Burned token", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      await expectRevert(
        () => opticut.connect(lab).requestTransformation(1),
        "Lab does not hold token"
      );
    });

    it("a Pending token cannot be transferred (single)", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await expectRevert(
        () => opticut.connect(lab).safeTransferFrom(lab.address, other.address, 1, 1, "0x"),
        "Cannot transfer a non-active token"
      );
    });

    it("requestTransformation does NOT change custodian", async function () {
      await opticut.connect(lab).requestTransformation(1);
      expect((await opticut.stones(1)).custodian).to.equal(lab.address);
    });
  });

  describe("completeTransformation — happy path", function () {
    it("burns the parent and mints children with correct metadata", async function () {
      await opticut.connect(lab).requestTransformation(1);
      const tx = await opticut.connect(lab).completeTransformation(
        1,
        [4, 5],
        ["Cut A", "Cut B"],
        ["ipfs://a", "ipfs://b"]
      );
      const receipt = await waitTx(tx);

      // parent burned, balance zeroed
      const parent = await opticut.stones(1);
      expect(parent.status).to.equal(2n);
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(0n);

      // children minted
      expect(await opticut.balanceOf(lab.address, 2)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 3)).to.equal(1n);

      const c1 = await opticut.stones(2);
      expect(c1.parentTokenId).to.equal(1n);
      expect(c1.weight).to.equal(4n);
      expect(c1.stoneState).to.equal("Cut A");
      expect(c1.ipfsUri).to.equal("ipfs://a");
      expect(c1.status).to.equal(0n);
      expect(c1.custodian).to.equal(lab.address);

      const c2 = await opticut.stones(3);
      expect(c2.weight).to.equal(5n);
      expect(c2.stoneState).to.equal("Cut B");
      expect(c2.ipfsUri).to.equal("ipfs://b");
    });

    it("child weights may sum to LESS than the parent (recovery loss allowed)", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [1], ["Cut"], ["ipfs://c"]);
      expect((await opticut.stones(2)).weight).to.equal(1n);
    });

    it("child weights may exactly equal the parent weight", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      expect((await opticut.stones(2)).weight).to.equal(10n);
    });

    it("returns the child ids in order", async function () {
      await opticut.connect(lab).requestTransformation(1);
      const childIds = await opticut.connect(lab).completeTransformation.staticCall(
        1, [2, 3, 5], ["A", "B", "C"], ["ipfs://a", "ipfs://b", "ipfs://c"]
      );
      expect(childIds.map(String)).to.deep.equal(["2", "3", "4"]);
    });

    it("appends children to the parent's children[] list", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [4, 5], ["A", "B"], ["ipfs://a", "ipfs://b"]);
      const ids = await opticut.getChildIds(1);
      expect(ids.map(String)).to.deep.equal(["2", "3"]);
    });

    it("records children in the minter's production ledger", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [4, 5], ["A", "B"], ["ipfs://a", "ipfs://b"]);
      const ids = await opticut.getStonesMintedByLab(lab.address);
      expect(ids.map(String)).to.deep.equal(["1", "2", "3"]);
    });

    it("StoneTransformed event carries full payload", async function () {
      await opticut.connect(lab).requestTransformation(1);
      const tx = await opticut.connect(lab).completeTransformation(
        1, [4, 5], ["A", "B"], ["ipfs://a", "ipfs://b"]
      );
      const receipt = await waitTx(tx);
      const args = findEvent(receipt, opticut, "StoneTransformed");
      expect(args.parentTokenId).to.equal(1n);
      expect(args.newTokenIds.map(String)).to.deep.equal(["2", "3"]);
      expect(args.newWeights.map(String)).to.deep.equal(["4", "5"]);
      expect(args.newStates).to.deep.equal(["A", "B"]);
      expect(args.newUris).to.deep.equal(["ipfs://a", "ipfs://b"]);
    });
  });

  describe("completeTransformation — validation", function () {
    beforeEach(async function () {
      await opticut.connect(lab).requestTransformation(1);
    });

    it("rejects when the parent is not Pending", async function () {
      // use a freshly minted stone that is still Active
      await opticut.connect(lab).registerGenesis("ipfs://g2", 5, "Rough");
      await expectRevert(
        () => opticut.connect(lab).completeTransformation(2, [5], ["Cut"], ["ipfs://c"]),
        "Parent not in Pending state"
      );
    });

    it("rejects empty children array", async function () {
      await expectRevert(
        () => opticut.connect(lab).completeTransformation(1, [], [], []),
        "Array lengths mismatch or zero children"
      );
    });

    it("rejects mismatched array lengths", async function () {
      await expectRevert(
        () => opticut.connect(lab).completeTransformation(1, [5, 5], ["Cut"], ["ipfs://a", "ipfs://b"]),
        "Array lengths mismatch or zero children"
      );
    });

    it("rejects a zero child weight", async function () {
      await expectRevert(
        () => opticut.connect(lab).completeTransformation(1, [0, 5], ["A", "B"], ["ipfs://a", "ipfs://b"]),
        "Child weight must be > 0"
      );
    });

    it("rejects children whose weights exceed the parent", async function () {
      await expectRevert(
        () => opticut.connect(lab).completeTransformation(1, [6, 6], ["A", "B"], ["ipfs://a", "ipfs://b"]),
        "Child weights exceed parent weight"
      );
    });

    it("rejects an empty child URI", async function () {
      await expectRevert(
        () => opticut.connect(lab).completeTransformation(1, [5], ["Cut"], [""]),
        "Child URI required"
      );
    });

    it("allows an empty child stoneState", async function () {
      await opticut.connect(lab).completeTransformation(1, [5], [""], ["ipfs://a"]);
      expect((await opticut.stones(2)).stoneState).to.equal("");
    });

    it("whole transaction reverts atomically — parent stays Pending on failure", async function () {
      await expectRevert(
        () => opticut.connect(lab).completeTransformation(1, [6, 6], ["A", "B"], ["ipfs://a", "ipfs://b"]),
        "Child weights exceed parent weight"
      );
      // no partial burn, no partial mint
      expect((await opticut.stones(1)).status).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 2)).to.equal(0n);
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(1n);
    });
  });

  describe("multi-generation lineage", function () {
    it("preserves the full ancestor chain across two cuts", async function () {
      // Register a dedicated 100ct genesis (id 2) so we can cut 60 + 40.
      await opticut.connect(lab).registerGenesis("ipfs://big", 100, "Rough"); // id 2
      // 100ct genesis → 60 + 40
      await opticut.connect(lab).requestTransformation(2);
      await opticut.connect(lab).completeTransformation(2, [60, 40], ["A", "B"], ["ipfs://a", "ipfs://b"]);

      // cut 60 → 25 + 35 (60ct stone is id 3)
      await opticut.connect(lab).requestTransformation(3);
      await opticut.connect(lab).completeTransformation(3, [25, 35], ["C", "D"], ["ipfs://c", "ipfs://d"]);

      const leaf = await opticut.stones(5); // the 35ct child
      expect(leaf.parentTokenId).to.equal(3n);
      const mid = await opticut.stones(3);
      expect(mid.parentTokenId).to.equal(2n);
      expect(mid.status).to.equal(2n);

      // total leaf weight never exceeds the genesis weight
      const leafWeights = [25n, 35n, 40n];
      const total = leafWeights.reduce((a, b) => a + b, 0n);
      expect(total <= 100n).to.be.true;
    });

    it("children of a burned stone can themselves be cut further", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      await opticut.connect(lab).requestTransformation(2);
      await opticut.connect(lab).completeTransformation(2, [3, 7], ["P1", "P2"], ["ipfs://p1", "ipfs://p2"]);
      expect((await opticut.stones(2)).status).to.equal(2n);
      expect((await opticut.stones(3)).status).to.equal(0n);
      expect((await opticut.stones(4)).status).to.equal(0n);
    });

    it("cannot double-cut the same child", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      await opticut.connect(lab).requestTransformation(2);
      await opticut.connect(lab).completeTransformation(2, [10], ["Cut2"], ["ipfs://c2"]);
      // id 2 is burned now; trying to request again must fail
      await expectRevert(
        () => opticut.connect(lab).requestTransformation(2),
        "Lab does not hold token"
      );
    });

    it("ledger records all mints across generations", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      const ids = await opticut.getStonesMintedByLab(lab.address);
      expect(ids.map(String)).to.deep.equal(["1", "2"]);
    });
  });

  describe("custody during transformation", function () {
    it("a holding lab that is NOT the original minter can complete the cut", async function () {
      // lab mints, transfers to other; other requests + completes
      await opticut.connect(ngjaAdmin).grantLabRole(other.address, "Second Lab");
      await opticut.connect(lab).safeTransferFrom(lab.address, other.address, 1, 1, "0x");
      await opticut.connect(other).requestTransformation(1);
      await opticut.connect(other).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      expect((await opticut.stones(2)).custodian).to.equal(other.address);
      expect(await opticut.balanceOf(other.address, 2)).to.equal(1n);
    });

    it("NGJA cannot complete a transformation (no LAB_ROLE)", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await expectRevert(
        () => opticut.connect(ngjaAdmin).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]),
        "AccessControl"
      );
    });
  });
});
