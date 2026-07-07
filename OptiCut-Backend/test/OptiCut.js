import { expect } from "chai";
import hre from "hardhat";

// Hardhat 3: ethers is accessed via network.connect()
// hre.network.connect() returns a network with ethers attached
describe("OptiCut (Lab-only model)", function () {
  let opticut;
  let deployer, lab, ngjaAdmin, anotherLab;
  let LAB_ROLE, NGJA_ADMIN_ROLE;
  let ethers;

  beforeEach(async function () {
    const networkConnection = await hre.network.connect();
    ethers = networkConnection.ethers;

    [deployer, lab, ngjaAdmin, anotherLab] = await ethers.getSigners();
    LAB_ROLE = ethers.keccak256(ethers.toUtf8Bytes("LAB_ROLE"));
    NGJA_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("NGJA_ADMIN_ROLE"));

    const OptiCut = await ethers.getContractFactory("OptiCut");
    opticut = await OptiCut.deploy();

    await opticut.grantRole(NGJA_ADMIN_ROLE, ngjaAdmin.address);
    await opticut.grantRole(LAB_ROLE, lab.address);
  });

  describe("Deployment & Access Control", function () {
    it("should assign roles correctly", async function () {
      expect(await opticut.hasRole(LAB_ROLE, lab.address)).to.be.true;
      expect(await opticut.hasRole(NGJA_ADMIN_ROLE, ngjaAdmin.address)).to.be.true;
    });

    // ✅ FIX: grantLabRole now requires (address, name) — name param added
    it("should allow NGJA_ADMIN to grant LAB_ROLE", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(anotherLab.address, "Test Lab Alpha");
      expect(await opticut.hasRole(LAB_ROLE, anotherLab.address)).to.be.true;
    });

    // ✅ FIX: grantLabRole now requires (address, name) — name param added
    it("should allow NGJA_ADMIN to revoke LAB_ROLE", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(anotherLab.address, "Test Lab Alpha");
      await opticut.connect(ngjaAdmin).revokeLabRole(anotherLab.address);
      expect(await opticut.hasRole(LAB_ROLE, anotherLab.address)).to.be.false;
    });

    // ✅ FIX: grantLabRole now requires (address, name) — name param added
    it("should emit LabAuthorized event on grantLabRole", async function () {
      const tx = await opticut.connect(ngjaAdmin).grantLabRole(anotherLab.address, "Test Lab Alpha");
      const receipt = await tx.wait();
      const labAuthorizedEvent = receipt.logs.find(log => {
        try {
          const parsed = opticut.interface.parseLog(log);
          return parsed && parsed.name === 'LabAuthorized';
        } catch { return false; }
      });
      expect(labAuthorizedEvent).to.not.be.undefined;
    });

    // ✅ FIX: grantLabRole now requires (address, name) — name param added
    it("should emit LabRevoked event on revokeLabRole", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(anotherLab.address, "Test Lab Alpha");
      const tx = await opticut.connect(ngjaAdmin).revokeLabRole(anotherLab.address);
      const receipt = await tx.wait();
      const labRevokedEvent = receipt.logs.find(log => {
        try {
          const parsed = opticut.interface.parseLog(log);
          return parsed && parsed.name === 'LabRevoked';
        } catch { return false; }
      });
      expect(labRevokedEvent).to.not.be.undefined;
    });
  });

  describe("Genesis Registration", function () {
    it("should allow a lab to register a new stone", async function () {
      const tx = await opticut.connect(lab).registerGenesis("ipfs://gen1", 10, "Rough");
      const receipt = await tx.wait();
      const stoneCertified = receipt.logs.find(log => {
        try {
          const parsed = opticut.interface.parseLog(log);
          return parsed && parsed.name === 'StoneCertified';
        } catch { return false; }
      });
      expect(stoneCertified).to.not.be.undefined;

      const stone = await opticut.stones(1);
      expect(stone.parentTokenId).to.equal(0n);
      expect(stone.weight).to.equal(10n);
      expect(stone.stoneState).to.equal("Rough");
      expect(stone.status).to.equal(0n);
      expect(stone.custodian).to.equal(lab.address);
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(1n);
    });

    it("should reject registration from non-lab", async function () {
      let reverted = false;
      try {
        await opticut.connect(anotherLab).registerGenesis("ipfs://bad", 5, "Rough");
      } catch (err) {
        reverted = true;
        expect(err.message).to.match(/AccessControl/);
      }
      expect(reverted).to.be.true;
    });

    it("should return full stone details via getStone", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://gen1", 520, "Rough");
      const [parentId, weight, stoneState, ipfsUri, status] = await opticut.getStone(1);
      expect(parentId).to.equal(0n);
      expect(weight).to.equal(520n);
      expect(stoneState).to.equal("Rough");
      expect(ipfsUri).to.equal("ipfs://gen1");
      expect(status).to.equal(0n);
    });
  });

  describe("Two‑phase Transformation", function () {
    beforeEach(async function () {
      await opticut.connect(lab).registerGenesis("ipfs://gen", 10, "Rough");
    });

    it("should complete full transformation with multiple children", async function () {
      const parentId = 1;
      await opticut.connect(lab).requestTransformation(parentId);
      let parent = await opticut.stones(parentId);
      expect(parent.status).to.equal(1n);

      const tx = await opticut.connect(lab).completeTransformation(
        parentId, [4, 5], ["Cut A", "Cut B"], ["ipfs://childA", "ipfs://childB"]
      );
      await tx.wait();

      expect(await opticut.balanceOf(lab.address, parentId)).to.equal(0n);
      parent = await opticut.stones(parentId);
      expect(parent.status).to.equal(2n);

      expect(await opticut.balanceOf(lab.address, 2)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 3)).to.equal(1n);

      const c1 = await opticut.stones(2);
      expect(c1.parentTokenId).to.equal(BigInt(parentId));
      expect(c1.weight).to.equal(4n);

      const childIds = await opticut.getChildIds(parentId);
      expect(childIds.length).to.equal(2);
    });

    it("should reject if child weights exceed parent weight", async function () {
      await opticut.connect(lab).requestTransformation(1);
      let reverted = false;
      try {
        await opticut.connect(lab).completeTransformation(1, [6, 6], ["Cut", "Cut"], ["ipfs://a", "ipfs://b"]);
      } catch (err) {
        reverted = true;
        expect(err.message).to.include("Child weights exceed parent weight");
      }
      expect(reverted).to.be.true;
    });

    it("should reject completing if parent not Pending", async function () {
      let reverted = false;
      try {
        await opticut.connect(lab).completeTransformation(1, [5], ["Cut"], ["ipfs://cut"]);
      } catch (err) {
        reverted = true;
        expect(err.message).to.include("Parent not in Pending state");
      }
      expect(reverted).to.be.true;
    });

    it("should reject transformation by non‑custodian lab", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.grantRole(LAB_ROLE, anotherLab.address);
      let reverted = false;
      try {
        await opticut.connect(anotherLab).completeTransformation(1, [5], ["Cut"], ["ipfs://cut"]);
      } catch (err) {
        reverted = true;
        expect(err.message).to.include("Lab does not hold parent token");
      }
      expect(reverted).to.be.true;
    });

    it("should block transfer of a Pending token", async function () {
      await opticut.connect(lab).requestTransformation(1);
      let reverted = false;
      try {
        await opticut.connect(lab).safeTransferFrom(lab.address, anotherLab.address, 1, 1, "0x");
      } catch (err) {
        reverted = true;
        expect(err.message).to.include("Cannot transfer a non-active token");
      }
      expect(reverted).to.be.true;
    });

    it("should return child IDs via getChildIds", async function () {
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [4, 5], ["Cut", "Polished"], ["ipfs://a", "ipfs://b"]);
      const childIds = await opticut.getChildIds(1);
      expect(childIds.length).to.equal(2);
      expect(Number(childIds[0])).to.equal(2);
      expect(Number(childIds[1])).to.equal(3);
    });
  });

  describe("Lineage reconstruction", function () {
    it("should traverse parent chain correctly", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await opticut.connect(lab).requestTransformation(1);
      await opticut.connect(lab).completeTransformation(1, [6], ["Cut"], ["ipfs://c"]);
      const child = await opticut.stones(2);
      expect(child.parentTokenId).to.equal(1n);
    });
  });
});