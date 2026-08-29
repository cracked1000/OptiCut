// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Foundry UNIT tests — parity with the Hardhat/Mocha suite.
 * Running the same behavioural assertions in two independent test runners
 * (mocha+ethers and foundry+forge) is itself a robustness signal.
 */
import {Test} from "forge-std/Test.sol";
import {OptiCut} from "../../contracts/OptiCut.sol";

contract OptiCutUnitTest is Test {
    OptiCut internal cut;
    address internal ngjaAdmin = address(0xA11CE);
    address internal lab = address(0x1AB);
    address internal lab2 = address(0x2AB);
    address internal stranger = address(0xB0B);

    bytes32 internal constant LAB_ROLE = keccak256("LAB_ROLE");
    bytes32 internal constant NGJA_ADMIN_ROLE = keccak256("NGJA_ADMIN_ROLE");

    function setUp() public {
        cut = new OptiCut();
        vm.prank(address(this)); // deployer is this test contract (DEFAULT_ADMIN + NGJA_ADMIN)
        cut.grantRole(NGJA_ADMIN_ROLE, ngjaAdmin);
        vm.prank(ngjaAdmin);
        cut.grantLabRole(lab, "Primary Lab");
        vm.prank(ngjaAdmin);
        cut.grantLabRole(lab2, "Second Lab");
    }

    function _asLab() internal {
        vm.startPrank(lab);
    }

    function _asAdmin() internal {
        vm.startPrank(ngjaAdmin);
    }

    function _w2(uint256 a, uint256 b) internal pure returns (uint256[] memory w) {
        w = new uint256[](2);
        w[0] = a;
        w[1] = b;
    }

    function _w1(uint256 a) internal pure returns (uint256[] memory w) {
        w = new uint256[](1);
        w[0] = a;
    }

    function _s2(string memory a, string memory b) internal pure returns (string[] memory s) {
        s = new string[](2);
        s[0] = a;
        s[1] = b;
    }

    function _s1(string memory a) internal pure returns (string[] memory s) {
        s = new string[](1);
        s[0] = a;
    }

    function _u2(string memory a, string memory b) internal pure returns (string[] memory u) {
        u = new string[](2);
        u[0] = a;
        u[1] = b;
    }

    function _u1(string memory a) internal pure returns (string[] memory u) {
        u = new string[](1);
        u[0] = a;
    }

    // ── Access control ──
    function test_onlyLabCanRegisterGenesis() public {
        vm.expectRevert();
        cut.registerGenesis("ipfs://x", 1, "Rough");
        _asLab();
        cut.registerGenesis("ipfs://x", 1, "Rough");
        assertEq(cut.balanceOf(lab, 1), 1);
    }

    function test_onlyAdminCanGrantLabRole() public {
        _asLab();
        vm.expectRevert();
        cut.grantLabRole(stranger, "Nope");
    }

    function test_deployerIsNgjaAdminByConstructor() public {
        assertTrue(cut.hasRole(NGJA_ADMIN_ROLE, address(this)));
    }

    // ── Genesis ──
    function test_genesisValidation() public {
        _asLab();
        vm.expectRevert(bytes("Weight must be positive"));
        cut.registerGenesis("ipfs://x", 0, "Rough");
        vm.expectRevert(bytes("URI required"));
        cut.registerGenesis("", 5, "Rough");
    }

    function test_genesisStateAndId() public {
        _asLab();
        uint256 id = cut.registerGenesis("ipfs://gen", 520, "Rough");
        assertEq(id, 1);
        (uint256 parent, uint256 weight, string memory state, string memory uri, uint8 status, uint256 ts, address custodian) =
            cut.getStone(1);
        assertEq(parent, 0);
        assertEq(weight, 520);
        assertEq(state, "Rough");
        assertEq(uri, "ipfs://gen");
        assertEq(status, 0); // Active
        assertGt(ts, 0);
        assertEq(custodian, lab);
        assertEq(cut.uri(1), "ipfs://gen");
    }

    // ── Transformation ──
    function test_fullTransformationFlow() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        cut.requestTransformation(1);
        (,,,, uint8 st1,,) = cut.getStone(1);
        assertEq(st1, 1); // Pending

        uint256[] memory childIds = cut.completeTransformation(1, _w2(4, 5), _s2("CutA", "CutB"), _u2("ipfs://a", "ipfs://b"));
        assertEq(childIds.length, 2);
        assertEq(childIds[0], 2);
        assertEq(childIds[1], 3);

        (,,,, uint8 stParent,,) = cut.getStone(1);
        assertEq(stParent, 2); // Burned
        assertEq(cut.balanceOf(lab, 1), 0);
        assertEq(cut.balanceOf(lab, 2), 1);

        uint256[] memory children = cut.getChildIds(1);
        assertEq(children.length, 2);
    }

    function test_completeRequiresPending() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        vm.expectRevert(bytes("Parent not in Pending state"));
        cut.completeTransformation(1, _w1(10), _s1("Cut"), _u1("ipfs://c"));
    }

    function test_weightsCannotExceedParent() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        cut.requestTransformation(1);
        vm.expectRevert(bytes("Child weights exceed parent weight"));
        cut.completeTransformation(1, _w2(6, 6), _s2("A", "B"), _u2("ipfs://a", "ipfs://b"));
    }

    function test_pendingTokenCannotTransfer() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        cut.requestTransformation(1);
        vm.expectRevert(bytes("Cannot transfer a non-active token"));
        cut.safeTransferFrom(lab, lab2, 1, 1, "");
    }

    function test_custodianUpdatesOnTransfer() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        cut.safeTransferFrom(lab, lab2, 1, 1, "");
        (,,,,,, address custodian) = cut.getStone(1);
        assertEq(custodian, lab2);
        assertEq(cut.balanceOf(lab2, 1), 1);
    }

    // ── Recovery ──
    function test_cancelByHolder() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        cut.requestTransformation(1);
        cut.cancelTransformation(1);
        (,,,, uint8 st,,) = cut.getStone(1);
        assertEq(st, 0); // Active again
    }

    function test_cancelByAdminAfterRevoke() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        cut.requestTransformation(1);
        vm.stopPrank();
        vm.prank(ngjaAdmin);
        cut.revokeLabRole(lab);
        vm.prank(ngjaAdmin);
        cut.cancelTransformation(1);
        (,,,, uint8 st,,) = cut.getStone(1);
        assertEq(st, 0);
    }

    function test_adminReassignRescuesPending() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        cut.requestTransformation(1);
        vm.stopPrank();
        vm.prank(ngjaAdmin);
        cut.revokeLabRole(lab);
        vm.prank(ngjaAdmin);
        cut.adminReassignStone(1, lab2);
        assertEq(cut.balanceOf(lab2, 1), 1);
        (,,,, uint8 st,, address custodian) = cut.getStone(1);
        assertEq(st, 0);
        assertEq(custodian, lab2);
    }

    function test_reassignRequiresLabOrAdminDestination() public {
        _asLab();
        cut.registerGenesis("ipfs://gen", 10, "Rough");
        vm.stopPrank();
        vm.prank(ngjaAdmin);
        vm.expectRevert(bytes("Destination must be a lab or NGJA admin"));
        cut.adminReassignStone(1, stranger);
    }

    // ── Lab registry ──
    function test_softRevokeKeepsRecord() public {
        vm.prank(ngjaAdmin);
        cut.revokeLabRole(lab2);
        OptiCut.AuthorizedLab[] memory all = cut.getAuthorizedLabs();
        assertEq(all.length, 2);
        OptiCut.AuthorizedLab[] memory active = cut.getActiveLabs();
        assertEq(active.length, 1);
        OptiCut.AuthorizedLab[] memory revoked = cut.getRevokedLabs();
        assertEq(revoked.length, 1);
        assertEq(revoked[0].lab, lab2);
        assertTrue(revoked[0].revoked);
        assertFalse(cut.isAuthorizedLab(lab2));
    }

    function test_mintedByLabLedger() public {
        _asLab();
        cut.registerGenesis("ipfs://a", 1, "Rough");
        cut.registerGenesis("ipfs://b", 1, "Rough");
        uint256[] memory ids = cut.getStonesMintedByLab(lab);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }
}
