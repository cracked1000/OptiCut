/**
 * DEEP TEST SUITE — Access control matrix.
 *
 * Every role-gated function is tested against every caller class:
 *   lab (authorized), ngjaAdmin (authorized), deployer (DEFAULT_ADMIN),
 *   other (a different authorized lab), stranger (no roles).
 */
import { expect } from "chai";
import { deployFixture, expectRevert } from "./helpers.js";

describe("OptiCut :: Access Control Matrix", function () {
  let opticut, deployer, ngjaAdmin, lab, other, stranger, roles;

  beforeEach(async function () {
    ({ opticut, deployer, ngjaAdmin, lab, other, stranger, roles } = await deployFixture());
    // Make `other` a second authorized lab so we can test lab-vs-lab conflicts.
    await opticut.connect(ngjaAdmin).grantLabRole(other.address, "Second Lab");
  });

  describe("constructor", function () {
    it("deployer holds DEFAULT_ADMIN_ROLE", async function () {
      expect(await opticut.hasRole(roles.DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("deployer automatically holds NGJA_ADMIN_ROLE (constructor grants it)", async function () {
      // Design decision worth documenting: the constructor grants BOTH
      // DEFAULT_ADMIN_ROLE and NGJA_ADMIN_ROLE to the deployer.
      expect(await opticut.hasRole(roles.NGJA_ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("deployer does NOT automatically hold LAB_ROLE", async function () {
      expect(await opticut.hasRole(roles.LAB_ROLE, deployer.address)).to.be.false;
    });

    it("roles are the keccak256 of the role names", async function () {
      expect(roles.LAB_ROLE).to.equal(
        "0x" + (await opticut.LAB_ROLE()).slice(2).toLowerCase()
      );
      expect(roles.NGJA_ADMIN_ROLE).to.equal(
        "0x" + (await opticut.NGJA_ADMIN_ROLE()).slice(2).toLowerCase()
      );
    });

    it("an NGJA admin is not automatically a lab, and vice versa", async function () {
      expect(await opticut.hasRole(roles.LAB_ROLE, ngjaAdmin.address)).to.be.false;
      expect(await opticut.hasRole(roles.NGJA_ADMIN_ROLE, lab.address)).to.be.false;
    });
  });

  describe("registerGenesis — only LAB_ROLE", function () {
    it("allows an authorized lab", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(1n);
    });

    it("rejects NGJA admin", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).registerGenesis("ipfs://g", 10, "Rough"),
        "AccessControl"
      );
    });

    it("rejects DEFAULT_ADMIN (deployer)", async function () {
      await expectRevert(
        () => opticut.connect(deployer).registerGenesis("ipfs://g", 10, "Rough"),
        "AccessControl"
      );
    });

    it("rejects a stranger with no roles", async function () {
      await expectRevert(
        () => opticut.connect(stranger).registerGenesis("ipfs://g", 10, "Rough"),
        "AccessControl"
      );
    });

    it("rejects a revoked lab (role removed)", async function () {
      await opticut.connect(ngjaAdmin).revokeLabRole(other.address);
      await expectRevert(
        () => opticut.connect(other).registerGenesis("ipfs://g", 10, "Rough"),
        "AccessControl"
      );
    });
  });

  describe("requestTransformation — only LAB_ROLE", function () {
    beforeEach(async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
    });

    it("allows the custodian lab", async function () {
      await opticut.connect(lab).requestTransformation(1);
      expect((await opticut.stones(1)).status).to.equal(1n);
    });

    it("allows a lab that holds the token via transfer", async function () {
      await opticut.connect(lab).safeTransferFrom(lab.address, other.address, 1, 1, "0x");
      await opticut.connect(other).requestTransformation(1);
      expect((await opticut.stones(1)).status).to.equal(1n);
    });

    it("rejects a lab that does NOT hold the token", async function () {
      await expectRevert(
        () => opticut.connect(other).requestTransformation(1),
        "Lab does not hold token"
      );
    });

    it("rejects NGJA admin even though it can manage roles", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).requestTransformation(1),
        "AccessControl"
      );
    });

    it("rejects a stranger", async function () {
      await expectRevert(
        () => opticut.connect(stranger).requestTransformation(1),
        "AccessControl"
      );
    });
  });

  describe("completeTransformation — only LAB_ROLE", function () {
    beforeEach(async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await opticut.connect(lab).requestTransformation(1);
    });

    it("allows the custodian lab", async function () {
      await opticut.connect(lab).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]);
      expect((await opticut.stones(1)).status).to.equal(2n);
    });

    it("rejects NGJA admin", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]),
        "AccessControl"
      );
    });

    it("rejects a lab that does not hold the parent", async function () {
      await expectRevert(
        () => opticut.connect(other).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]),
        "Lab does not hold parent token"
      );
    });

    it("rejects a stranger", async function () {
      await expectRevert(
        () => opticut.connect(stranger).completeTransformation(1, [10], ["Cut"], ["ipfs://c"]),
        "AccessControl"
      );
    });
  });

  describe("grantLabRole — only NGJA_ADMIN_ROLE", function () {
    it("allows NGJA admin", async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Stranger Lab");
      expect(await opticut.hasRole(roles.LAB_ROLE, stranger.address)).to.be.true;
    });

    it("rejects a lab", async function () {
      await expectRevert(
        () => opticut.connect(lab).grantLabRole(stranger.address, "Nope"),
        "AccessControl"
      );
    });

    it("deployer can grant too (constructor NGJA_ADMIN_ROLE)", async function () {
      await opticut.connect(deployer).grantLabRole(stranger.address, "Deployer-granted");
      expect(await opticut.hasRole(roles.LAB_ROLE, stranger.address)).to.be.true;
    });

    it("rejects a stranger", async function () {
      await expectRevert(
        () => opticut.connect(stranger).grantLabRole(other.address, "Nope"),
        "AccessControl"
      );
    });

    it("rejects address(0)", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).grantLabRole("0x0000000000000000000000000000000000000000", "Zero"),
        "Invalid lab address"
      );
    });
  });

  describe("revokeLabRole — only NGJA_ADMIN_ROLE", function () {
    beforeEach(async function () {
      await opticut.connect(ngjaAdmin).grantLabRole(stranger.address, "Doomed Lab");
    });

    it("allows NGJA admin", async function () {
      await opticut.connect(ngjaAdmin).revokeLabRole(stranger.address);
      expect(await opticut.hasRole(roles.LAB_ROLE, stranger.address)).to.be.false;
    });

    it("rejects a lab", async function () {
      await expectRevert(
        () => opticut.connect(lab).revokeLabRole(stranger.address),
        "AccessControl"
      );
    });

    it("deployer can revoke too (constructor NGJA_ADMIN_ROLE)", async function () {
      await opticut.connect(deployer).revokeLabRole(stranger.address);
      expect(await opticut.hasRole(roles.LAB_ROLE, stranger.address)).to.be.false;
    });

    it("rejects address(0)", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).revokeLabRole("0x0000000000000000000000000000000000000000"),
        "Invalid lab address"
      );
    });
  });

  describe("cancelTransformation — NGJA or the holding lab", function () {
    beforeEach(async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await opticut.connect(lab).requestTransformation(1);
    });

    it("allows the holding lab to self-cancel", async function () {
      await opticut.connect(lab).cancelTransformation(1);
      expect((await opticut.stones(1)).status).to.equal(0n);
    });

    it("allows NGJA admin to cancel", async function () {
      await opticut.connect(ngjaAdmin).cancelTransformation(1);
      expect((await opticut.stones(1)).status).to.equal(0n);
    });

    it("rejects a different authorized lab", async function () {
      await expectRevert(
        () => opticut.connect(other).cancelTransformation(1),
        "Not authorized to cancel"
      );
    });

    it("rejects a stranger", async function () {
      await expectRevert(
        () => opticut.connect(stranger).cancelTransformation(1),
        "Not authorized to cancel"
      );
    });

    it("rejects a revoked lab that still holds the token", async function () {
      await opticut.connect(ngjaAdmin).revokeLabRole(lab.address);
      await expectRevert(
        () => opticut.connect(lab).cancelTransformation(1),
        "Not authorized to cancel"
      );
    });
  });

  describe("adminReassignStone — only NGJA_ADMIN_ROLE", function () {
    beforeEach(async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await opticut.connect(lab).requestTransformation(1); // now Pending
    });

    it("allows NGJA admin", async function () {
      await opticut.connect(ngjaAdmin).adminReassignStone(1, other.address);
      expect(await opticut.balanceOf(other.address, 1)).to.equal(1n);
      expect((await opticut.stones(1)).status).to.equal(0n);
    });

    it("rejects a lab", async function () {
      await expectRevert(
        () => opticut.connect(lab).adminReassignStone(1, other.address),
        "AccessControl"
      );
    });

    it("deployer can reassign too (constructor NGJA_ADMIN_ROLE)", async function () {
      await opticut.connect(deployer).adminReassignStone(1, other.address);
      expect(await opticut.balanceOf(other.address, 1)).to.equal(1n);
    });

    it("rejects a stranger", async function () {
      await expectRevert(
        () => opticut.connect(stranger).adminReassignStone(1, other.address),
        "AccessControl"
      );
    });
  });

  describe("raw OZ role management — DEFAULT_ADMIN only", function () {
    it("deployer can grant NGJA_ADMIN_ROLE (admin of admins)", async function () {
      await opticut.connect(deployer).grantRole(roles.NGJA_ADMIN_ROLE, stranger.address);
      expect(await opticut.hasRole(roles.NGJA_ADMIN_ROLE, stranger.address)).to.be.true;
    });

    it("a lab cannot grant NGJA_ADMIN_ROLE", async function () {
      await expectRevert(
        () => opticut.connect(lab).grantRole(roles.NGJA_ADMIN_ROLE, stranger.address),
        "AccessControl"
      );
    });

    it("an NGJA admin cannot grant DEFAULT_ADMIN_ROLE", async function () {
      await expectRevert(
        () => opticut.connect(ngjaAdmin).grantRole(roles.DEFAULT_ADMIN_ROLE, stranger.address),
        "AccessControl"
      );
    });

    it("renounceRole is guarded by AccessControl", async function () {
      await opticut.connect(deployer).grantRole(roles.NGJA_ADMIN_ROLE, stranger.address);
      await opticut.connect(stranger).renounceRole(roles.NGJA_ADMIN_ROLE, stranger.address);
      expect(await opticut.hasRole(roles.NGJA_ADMIN_ROLE, stranger.address)).to.be.false;
    });
  });

  describe("supportsInterface", function () {
    const ERC1155_ID = "0xd9b67a26"; // IERC1155
    const ERC1155_TOKEN_RECEIVER_ID = "0x4e2312e0"; // IERC1155Receiver
    const ACL_ID = "0x7965db0b"; // IAccessControl
    const ERC165_ID = "0x01ffc9a7"; // IERC165

    it("supports ERC1155 interface", async function () {
      expect(await opticut.supportsInterface(ERC1155_ID)).to.be.true;
    });

    it("does NOT claim to be an ERC1155Receiver (it's the token, not a recipient)", async function () {
      expect(await opticut.supportsInterface(ERC1155_TOKEN_RECEIVER_ID)).to.be.false;
    });

    it("supports AccessControl interface", async function () {
      expect(await opticut.supportsInterface(ACL_ID)).to.be.true;
    });

    it("supports ERC165 interface", async function () {
      expect(await opticut.supportsInterface(ERC165_ID)).to.be.true;
    });

    it("does not support a random interface id", async function () {
      expect(await opticut.supportsInterface("0xffffffff")).to.be.false;
    });
  });
});
