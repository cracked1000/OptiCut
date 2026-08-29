/**
 * DEEP TEST SUITE — Genesis registration.
 * Weight/URI validation, id sequencing, on-chain state, events, ledger.
 */
import { expect } from "chai";
import { deployFixture, expectRevert, findEvent, waitTx } from "./helpers.js";

describe("OptiCut :: Genesis Registration", function () {
  let opticut, lab, other, ngjaAdmin, ethers;

  beforeEach(async function () {
    ({ opticut, lab, other, ngjaAdmin, ethers } = await deployFixture());
  });

  describe("validation", function () {
    it("rejects zero weight", async function () {
      await expectRevert(
        () => opticut.connect(lab).registerGenesis("ipfs://g", 0, "Rough"),
        "Weight must be positive"
      );
    });

    it("rejects empty URI", async function () {
      await expectRevert(
        () => opticut.connect(lab).registerGenesis("", 5, "Rough"),
        "URI required"
      );
    });

    it("accepts a minimal stone (weight 1, one-char uri)", async function () {
      const tx = await opticut.connect(lab).registerGenesis("a", 1, "R");
      const receipt = await waitTx(tx);
      expect(findEvent(receipt, opticut, "StoneCertified").tokenId).to.equal(1n);
    });

    it("accepts very large weights (uint256 range)", async function () {
      const big = (1n << 200n) - 1n; // huge but realistic for gas
      await opticut.connect(lab).registerGenesis("ipfs://big", big, "Rough");
      expect((await opticut.stones(1)).weight).to.equal(big);
    });

    it("stores integer weights exactly as given (no scaling at contract level)", async function () {
      // NOTE: the frontend multiplies carats by 100 before calling the contract,
      // so on-chain weights are integers in centi-carat units.
      await opticut.connect(lab).registerGenesis("ipfs://g2", 12345, "Rough");
      expect((await opticut.stones(1)).weight).to.equal(12345n);
    });

    it("accepts empty stoneState (not validated on-chain)", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 5, "");
      expect((await opticut.stones(1)).stoneState).to.equal("");
    });
  });

  describe("id sequencing & state", function () {
    it("starts token ids at 1 and increments", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://1", 1, "A");
      await opticut.connect(lab).registerGenesis("ipfs://2", 1, "B");
      await opticut.connect(lab).registerGenesis("ipfs://3", 1, "C");
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 2)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 3)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 4)).to.equal(0n);
    });

    it("sets parentTokenId=0, status=Active, custodian=minter", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      const s = await opticut.stones(1);
      expect(s.parentTokenId).to.equal(0n);
      expect(s.status).to.equal(0n); // Active
      expect(s.custodian).to.equal(lab.address);
      expect(s.timestamp).to.not.equal(0n);
    });

    it("records the genesis stone in the lab's minted-by ledger", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      const ids = await opticut.getStonesMintedByLab(lab.address);
      expect(ids.map(String)).to.deep.equal(["1"]);
    });

    it("ledgers are per-lab", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://l", 1, "A");
      await opticut.connect(ngjaAdmin).grantLabRole(other.address, "Other Lab");
      await opticut.connect(other).registerGenesis("ipfs://o", 1, "A");
      expect((await opticut.getStonesMintedByLab(lab.address)).map(String)).to.deep.equal(["1"]);
      expect((await opticut.getStonesMintedByLab(other.address)).map(String)).to.deep.equal(["2"]);
    });
  });

  describe("events", function () {
    it("StoneCertified carries tokenId, weight, state, uri", async function () {
      const tx = await opticut.connect(lab).registerGenesis("ipfs://gen1", 520, "Rough");
      const receipt = await waitTx(tx);
      const args = findEvent(receipt, opticut, "StoneCertified");
      expect(args.tokenId).to.equal(1n);
      expect(args.weight).to.equal(520n);
      expect(args.stoneState).to.equal("Rough");
      expect(args.uri).to.equal("ipfs://gen1");
    });

    it("emits Transfer (mint) and URI events", async function () {
      const tx = await opticut.connect(lab).registerGenesis("ipfs://gen1", 520, "Rough");
      const receipt = await waitTx(tx);
      expect(findEvent(receipt, opticut, "TransferSingle")).to.not.be.null;
      expect(findEvent(receipt, opticut, "URI")).to.not.be.null;
    });
  });

  describe("uri() view", function () {
    it("returns the per-token URI", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://mystone", 10, "Rough");
      expect(await opticut.uri(1)).to.equal("ipfs://mystone");
    });

    it("returns empty base URI for unminted ids", async function () {
      expect(await opticut.uri(999)).to.equal("");
    });
  });

  describe("getStone() view", function () {
    it("returns the full tuple", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 123, "Preform");
      const [parentId, weight, state, uri, status, ts, custodian] = await opticut.getStone(1);
      expect(parentId).to.equal(0n);
      expect(weight).to.equal(123n);
      expect(state).to.equal("Preform");
      expect(uri).to.equal("ipfs://g");
      expect(status).to.equal(0n);
      expect(ts).to.not.equal(0n);
      expect(custodian).to.equal(lab.address);
    });

    it("returns zeroed tuple for a never-minted id", async function () {
      const [parentId, weight, state, uri, status, ts, custodian] = await opticut.getStone(0);
      expect(weight).to.equal(0n);
      expect(status).to.equal(0n);
      expect(ts).to.equal(0n);
      expect(custodian).to.equal("0x0000000000000000000000000000000000000000");
    });
  });

  describe("transfer semantics for Active stones", function () {
    it("updates custodian on safeTransferFrom", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await opticut.connect(lab).safeTransferFrom(lab.address, other.address, 1, 1, "0x");
      expect((await opticut.stones(1)).custodian).to.equal(other.address);
      expect(await opticut.balanceOf(other.address, 1)).to.equal(1n);
      expect(await opticut.balanceOf(lab.address, 1)).to.equal(0n);
    });

    it("rejects transfer of a token the sender does not hold", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://g", 10, "Rough");
      await expectRevert(
        () => opticut.connect(other).safeTransferFrom(other.address, lab.address, 1, 1, "0x"),
        "ERC1155InsufficientBalance"
      );
    });

    it("batch transfer updates custodians for all ids", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://1", 5, "A");
      await opticut.connect(lab).registerGenesis("ipfs://2", 5, "B");
      await opticut.connect(lab).safeBatchTransferFrom(lab.address, other.address, [1, 2], [1, 1], "0x");
      expect((await opticut.stones(1)).custodian).to.equal(other.address);
      expect((await opticut.stones(2)).custodian).to.equal(other.address);
      expect(await opticut.balanceOf(other.address, 1)).to.equal(1n);
      expect(await opticut.balanceOf(other.address, 2)).to.equal(1n);
    });

    it("rejects batch transfer when any id is Pending (atomicity)", async function () {
      await opticut.connect(lab).registerGenesis("ipfs://1", 5, "A");
      await opticut.connect(lab).registerGenesis("ipfs://2", 5, "B");
      await opticut.connect(lab).requestTransformation(1); // id 1 becomes Pending
      await expectRevert(
        () => opticut.connect(lab).safeBatchTransferFrom(lab.address, other.address, [1, 2], [1, 1], "0x"),
        "Cannot transfer a non-active token"
      );
      // whole batch reverted atomically — no partial custody change
      expect(await opticut.balanceOf(other.address, 2)).to.equal(0n);
    });
  });
});
