/**
 * DEEP TEST SUITE — Recovery functions.
 * These exist because a Pending stone held by a revoked lab used to be
 * permanently frozen. Test every escape hatch thoroughly.
 */
import { expect } from "chai";
import { deployFixture, expectRevert, findEvent, waitTx } from "./helpers.js";

describe("OptiCut :: Recovery (cancel / reassign)", function () {
  let opticut, deployer, lab, other, ngjaAdmin, stranger, ethers;

  beforeEach(async function () {
    ({ opticut, deployer, lab, other, ngjaAdmin, stranger, ethers } = await deployFixture());
    await opticut.connect(ngjaAdmin).grantLabRole(other.address, "Second Lab");
    await opticut.connect(lab).registerGenesis("ipfs://gen", 10, "Rough"); // id 1
  });

  describe("cancelTransformation", function () {
    describe("state machine", function () {
      it("releases a Pending stone back to Active (self-cancel by holding lab)", async function () {
        await opticut.connect(lab).requestTransformation(1);
        const tx = await opticut.connect(lab).cancelTransformation(1);
        const receipt = await waitTx(tx);
        expect((await opticut.stones(1)).status).to.equal(0n);
        expect(await opticut.balanceOf(lab.address, 1)).to.equal(1n);
        const args = findEvent(receipt, opticut, "TransformationCancelled");
        expect(args.tokenId).to.equal(1n);
        expect(args.by).to.equal(lab.address);
      });

      it("releases a Pending stone via NGJA admin", async function () {
        await opticut.connect(lab).requestTransformation(1);
        await opticut.connect(ngjaAdmin).cancelTransformation(1);
        expect((await opticut.stones(1)).status).to.equal(0n);
      });

      it("rejects cancellation of an Active stone", async function () {
        await expectRevert(
          () => opticut.connect(lab).cancelTransformation(1),
          "Stone not pending"
        );
      });

      it("rejects cancellation of a non-existent stone", async function () {
        await expectRevert(
          () => opticut.connect(ngjaAdmin).cancelTransformation(999),
          "Stone not pending"
        );
      });

      it("rejects cancellation of a Burned stone", async function () {
        await opticut.connect(lab).requestTransformation(1);
        await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
        await expectRevert(
          () => opticut.connect(lab).cancelTransformation(1),
          "Stone not pending"
        );
      });

      it("cancel is idempotent-safe: after cancel, the lab can request again", async function () {
        await opticut.connect(lab).requestTransformation(1);
        await opticut.connect(lab).cancelTransformation(1);
        await opticut.connect(lab).requestTransformation(1); // works again
        expect((await opticut.stones(1)).status).to.equal(1n);
      });
    });

    describe("authorization", function () {
      it("rejects a revoked lab that still holds the token", async function () {
        await opticut.connect(lab).requestTransformation(1);
        await opticut.connect(ngjaAdmin).revokeLabRole(lab.address);
        await expectRevert(
          () => opticut.connect(lab).cancelTransformation(1),
          "Not authorized to cancel"
        );
      });

      it("NGJA can still cancel after revoking the holding lab (the rescue case)", async function () {
        await opticut.connect(lab).requestTransformation(1);
        await opticut.connect(ngjaAdmin).revokeLabRole(lab.address);
        await opticut.connect(ngjaAdmin).cancelTransformation(1);
        expect((await opticut.stones(1)).status).to.equal(0n);
        expect((await opticut.stones(1)).custodian).to.equal(lab.address);
      });

      it("rejects a lab that holds no token", async function () {
        await opticut.connect(lab).requestTransformation(1);
        await expectRevert(
          () => opticut.connect(other).cancelTransformation(1),
          "Not authorized to cancel"
        );
      });
    });
  });

  describe("adminReassignStone", function () {
    it("rescues a Pending stone from a revoked lab to a new lab", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(ngjaAdmin).revokeLabRole(lab.address);

      const tx = await opticut.connect(ngjaAdmin).adminReassignStone(1, other.address);
      const receipt = await waitTx(tx);

      expect(await opticut.balanceOf(other.address, 1)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(0n);
      const s = await opticut.stones(1);
      expect(s.status).to.equal(0n); // workable again
      expect(s.custodian).to.equal(other.address);

      const args = findEvent(receipt, opticut, "StoneReassigned");
      expect(args.tokenId).to.equal(1n);
      expect(args.from).to.equal(lab.address);
      expect(args.to).to.equal(other.address);
      expect(args.by).to.equal(ngjaAdmin.address);
    });

    it("can park a stone with the NGJA admin address itself", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(ngjaAdmin).adminReassignStone(1, ngjaAdmin.address);
      expect(await opticut.balanceOf(ngjaAdmin.address, 1)).to.equal(1n);
      expect((await opticut.stones(1)).custodian).to.equal(ngjaAdmin.address);
      expect((await opticut.stones(1)).status).to.equal(0n);
    });

    it("reassigning to the current custodian is a no-op transfer but resets to Active", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(ngjaAdmin).adminReassignStone(1, lab.address);
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(1n);
      expect((await opticut.stones(1)).status).to.equal(0n);
    });

    it("can also move an Active stone (emergency power)", async function () {
      await opticut.connect(ngjaAdmin).adminReassignStone(1, other.address);
      expect(await opticut.balanceOf(other.address, 1)).to.equal(1n);
      expect((await opticut.stones(1)).custodian).to.equal(other.address);
    });

    it("rejects address(0) as destination", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).adminReassignStone(1, "0x0000000000000000000000000000000000000000"),
        "Invalid destination"
      );
    });

    it("rejects a destination that is neither lab nor NGJA admin", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).adminReassignStone(1, stranger.address),
        "Destination must be a lab or NGJA admin"
      );
    });

    it("rejects a revoked lab as destination", async function () {
      await opticut.connect(ngjaAdmin).revokeLabRole(other.address);
      await expectRevert(
        () => opticut.connect(ngjaAdmin).adminReassignStone(1, other.address),
        "Destination must be a lab or NGJA admin"
      );
    });

    it("rejects reassigning a Burned stone", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      await expectRevert(
        () => opticut.connect(ngjaAdmin).adminReassignStone(1, other.address),
        "Stone is burned"
      );
    });

    it("rejects reassigning a non-existent stone", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).adminReassignStone(999, other.address),
        "Stone not minted"
      );
    });

    it("a reassigned stone keeps its original metadata and parent link", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(ngjaAdmin).adminReassignStone(1, other.address);
      const s = await opticut.stones(1);
      expect(s.weight).to.equal(10n);
      expect(s.parentTokenId).to.equal(0n);
      expect(s.stoneState).to.equal("Rough");
    });

    it("the recipient can immediately continue the transformation lifecycle", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(ngjaAdmin).revokeLabRole(lab.address);
      await opticut.connect(ngjaAdmin).adminReassignStone(1, other.address);
      // other lab now requests + completes
      await opticut.connect(other).requestTransformation(1);
      await opticut.connect(other).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      expect((await opticut.stones(2)).custodian).to.equal(other.address);
      expect((await opticut.stones(2)).status).to.equal(0n);
    });
  });

  describe("production-history ledger semantics", function () {
    it("getStonesMintedByLab keeps mint history even after transfers/reassignment", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g2", 5, "Rough"); // id 2
      await opticut.connect(lab).safeTransferFrom(lab.address, other.address, 2, 1, "0x");
      // history is preserved — this is by design (production records)
      const ids = await opticut.getStonesMintedByLab(lab.address);
      expect(ids.map(String)).to.deep.equal(["1", "2"]);
    });

    it("a reassigned stone still counts toward the original minter's history", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(ngjaAdmin).adminReassignStone(1, other.address);
      const ids = await opticut.getStonesMintedByLab(lab.address);
      expect(ids.map(String)).to.deep.equal(["1"]);
      // and NOT toward the new custodian's history (it didn't mint it)
      expect((await opticut.getStonesMintedByLab(other.address)).length).to.equal(0);
    });
  });

  describe("re-authorization after revocation", function () {
    it("grantLabRole again clears the revoked flag without duplicating the record", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab X");
      await opticut.connect(ngjaAdmin).revokeLabRole(stranger.address);

      let labs = await opticut.getAuthorizedLabs();
      const revokedOne = labs.find((l) => l.lab.toLowerCase() === stranger.address.toLowerCase());
      expect(revokedOne.revoked).to.be.true;
      expect(Number(revokedOne.revokedAt)).to.be.gt(0);
      expect(await opticut.getAuthorizedLabCount()).to.equal(3n); // lab, other, stranger

      // re-grant
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab X v2");
      labs = await opticut.getAuthorizedLabs();
      const reGranted = labs.filter((l) => l.lab.toLowerCase() === stranger.address.toLowerCase());
      expect(reGranted.length).to.equal(1); // no duplicate
      expect(reGranted[0].revoked).to.be.false;
      expect(Number(reGranted[0].revokedAt)).to.equal(0);
      expect(reGranted[0].name).to.equal("Lab X v2");
      expect(await opticut.getAuthorizedLabCount()).to.equal(3n); // still 3, not 4
    });

    it("getActiveLabs / getRevokedLabs partition correctly", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Lab X");
      await opticut.connect(ngjaAdmin).revokeLabRole(stranger.address);

      const active = await opticut.getActiveLabs();
      const revoked = await opticut.getRevokedLabs();
      expect(active.length).to.equal(2); // Primary Lab, Second Lab
      expect(revoked.length).to.equal(1);
      expect(revoked[0].lab.toLowerCase()).to.equal(stranger.address.toLowerCase());
      // no overlap
      const activeAddrs = new Set(active.map((l) => l.lab.toLowerCase()));
      expect(activeAddrs.has(stranger.address.toLowerCase())).to.be.false;
    });

    it("isAuthorizedLab reflects revocation", async function () {
      expect(await opticut.isAuthorizedLab(other.address)).to.be.true;
      await opticut.connect(ngjaAdmin).revokeLabRole(other.address);
      expect(await opticut.isAuthorizedLab(other.address)).to.be.false;
    });
  });
});
