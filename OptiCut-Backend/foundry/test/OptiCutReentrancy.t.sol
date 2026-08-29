// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * REENTRANCY ATTACK SIMULATIONS.
 *
 * The strongest single-vulnerability class for token contracts: an attacker
 * uses the ERC1155 receiver callback (onERC1155Received) to reenter the
 * contract while a state-changing operation is mid-flight.
 *
 * Attack surfaces tested:
 *   A) A malicious RECEIVER contract gets a token via safeTransferFrom and
 *      tries to reenter the contract from inside the callback.
 *   B) A malicious LAB (labs may legally be contracts) tries to reenter
 *      requestTransformation / registerGenesis from inside
 *      completeTransformation's mint callbacks.
 *
 * Every reentrant attempt must be blocked while normal transfers still work.
 */
import {Test} from "forge-std/Test.sol";
import {OptiCut} from "../../contracts/OptiCut.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

/// Attack A — a receiver that reenters the token contract on every callback.
contract MaliciousReceiver is IERC1155Receiver {
    OptiCut public target;
    bool public doReenter;

    bytes4 internal constant RECV = IERC1155Receiver.onERC1155Received.selector;
    bytes4 internal constant BRECV = IERC1155Receiver.onERC1155BatchReceived.selector;

    constructor(OptiCut t) {
        target = t;
    }

    function setAttack(bool on) external {
        doReenter = on;
    }

    function onERC1155Received(address, address, uint256 id, uint256, bytes calldata)
        external
        returns (bytes4)
    {
        if (doReenter) {
            // attempt to reenter safeTransferFrom (guarded) from inside the callback
            target.safeTransferFrom(address(this), address(0xdead), id, 1, "");
        }
        return RECV;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        returns (bytes4)
    {
        if (doReenter) {
            target.safeBatchTransferFrom(address(this), address(0xdead), new uint256[](1), new uint256[](1), "");
        }
        return BRECV;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }
}

/// Attack B — a malicious LAB contract that reenters during completeTransformation.
contract MaliciousLab is IERC1155Receiver {
    OptiCut public target;
    bool public doReenter;
    bool public requestBlocked;   // was the requestTransformation reentry blocked?
    bool public genesisBlocked;   // was the registerGenesis reentry blocked?

    bytes4 internal constant RECV = IERC1155Receiver.onERC1155Received.selector;
    bytes4 internal constant BRECV = IERC1155Receiver.onERC1155BatchReceived.selector;

    constructor(OptiCut t) {
        target = t;
    }

    function setAttack(bool on) external {
        doReenter = on;
    }

    function attackCompleteTransformation(
        uint256 parent,
        uint256[] calldata weights,
        string[] calldata states,
        string[] calldata uris
    ) external returns (uint256[] memory) {
        return target.completeTransformation(parent, weights, states, uris);
    }

    function onERC1155Received(address, address, uint256 id, uint256, bytes calldata)
        external
        returns (bytes4)
    {
        if (doReenter) {
            // attempt 1: lock the just-minted child (requestTransformation)
            try target.requestTransformation(id) {
                requestBlocked = false; // NOT blocked → vulnerability
            } catch {
                requestBlocked = true; // blocked ✓
            }
            // attempt 2: inject an out-of-band genesis stone mid-transaction
            try target.registerGenesis("ipfs://evil", 999, "Evil") {
                genesisBlocked = false; // NOT blocked → vulnerability
            } catch {
                genesisBlocked = true; // blocked ✓
            }
        }
        return RECV;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        returns (bytes4)
    {
        return BRECV;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }
}

/// A benign receiver — must still work when transfers are reentrancy-guarded.
contract BenignReceiver is IERC1155Receiver {
    bytes4 internal constant RECV = IERC1155Receiver.onERC1155Received.selector;
    bytes4 internal constant BRECV = IERC1155Receiver.onERC1155BatchReceived.selector;

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return RECV;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return BRECV;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }
}

contract OptiCutReentrancyTest is Test {
    OptiCut internal cut;
    MaliciousReceiver internal attacker;
    MaliciousLab internal badLab;
    BenignReceiver internal benign;

    address internal admin = address(0xA11CE);
    address internal lab = address(0x1AB);
    bytes32 internal constant NGJA_ADMIN_ROLE = keccak256("NGJA_ADMIN_ROLE");

    function setUp() public {
        cut = new OptiCut();
        cut.grantRole(NGJA_ADMIN_ROLE, admin);
        vm.prank(admin);
        cut.grantLabRole(lab, "Good Lab");

        attacker = new MaliciousReceiver(cut);
        badLab = new MaliciousLab(cut);
        benign = new BenignReceiver();
        vm.prank(admin);
        cut.grantLabRole(address(badLab), "Contract Lab");
    }

    function _status(uint256 id) internal view returns (uint8) {
        (, , , , OptiCut.Status st, , ) = cut.stones(id);
        return uint8(st);
    }

    // ── Attack A: malicious receiver during transfer ──
    function test_reentrantReceiverIsBlockedOnSingleTransfer() public {
        vm.startPrank(lab);
        cut.registerGenesis("ipfs://g", 10, "Rough");
        vm.stopPrank();

        attacker.setAttack(true);
        vm.expectRevert();
        vm.prank(lab);
        cut.safeTransferFrom(lab, address(attacker), 1, 1, "");
    }

    function test_reentrantReceiverIsBlockedOnBatchTransfer() public {
        vm.startPrank(lab);
        cut.registerGenesis("ipfs://g1", 5, "A");
        cut.registerGenesis("ipfs://g2", 5, "B");
        vm.stopPrank();

        attacker.setAttack(true);
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;
        vm.expectRevert();
        vm.prank(lab);
        cut.safeBatchTransferFrom(lab, address(attacker), ids, amounts, "");
    }

    function test_benignReceiverTransferStillWorks() public {
        vm.startPrank(lab);
        cut.registerGenesis("ipfs://g", 10, "Rough");
        cut.safeTransferFrom(lab, address(benign), 1, 1, "");
        vm.stopPrank();

        assertEq(cut.balanceOf(address(benign), 1), 1, "benign receiver must receive the token");
        (, , , , , , address custodian) = cut.stones(1);
        assertEq(custodian, address(benign), "custodian must be updated for benign receiver");
    }

    // ── Attack B: malicious contract-lab during completeTransformation ──
    function test_contractLabCannotReenterDuringComplete() public {
        vm.startPrank(address(badLab));
        uint256 parent = cut.registerGenesis("ipfs://p", 10, "Rough");
        cut.requestTransformation(parent);
        vm.stopPrank();

        badLab.setAttack(true);

        uint256[] memory w = new uint256[](2);
        w[0] = 5;
        w[1] = 5;
        string[] memory s = new string[](2);
        s[0] = "A";
        s[1] = "B";
        string[] memory u = new string[](2);
        u[0] = "ipfs://a";
        u[1] = "ipfs://b";

        badLab.attackCompleteTransformation(parent, w, s, u);

        // both reentrant attempts must have been blocked
        assertTrue(badLab.requestBlocked(), "requestTransformation reentry was NOT blocked");
        assertTrue(badLab.genesisBlocked(), "registerGenesis reentry was NOT blocked");
        // and the children are Active (nobody locked them mid-transaction)
        assertEq(_status(parent + 1), 0, "child 1 must remain Active");
        assertEq(_status(parent + 2), 0, "child 2 must remain Active");
        // no out-of-band stone was minted
        assertEq(cut.balanceOf(address(badLab), parent + 3), 0, "no extra id must exist");
    }
}
