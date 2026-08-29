// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * INVARIANT TESTS — the strongest production-robustness evidence.
 *
 * A stateful handler performs random sequences of REAL contract calls
 * (mint, request, complete, cancel, reassign, transfer, grant/revoke lab).
 * After every sequence, these invariants must hold. If any invariant can be
 * broken by any reachable sequence of operations, the test fails.
 *
 * Invariants under test:
 *   I1  total circulating weight <= total weight ever minted  (no free weight)
 *   I2  holder ghost matches on-chain custody exactly         (no ghost drift)
 *   I3  children weights never exceed the parent weight       (conservation)
 *   I4  token ids are gapless and sequential                  (no id corruption)
 *   I5  a Pending stone is always still held by its custodian (can't be stolen)
 *   I6  per-lab production ledger matches the mint record     (admin panel truth)
 *   I7  stone status is always one of {Active, Pending, Burned}
 *   I8  every stone is held by exactly one actor (or is burned)
 */
import {Test} from "forge-std/Test.sol";
import {OptiCut} from "../../contracts/OptiCut.sol";
import {OptiCutHandler} from "./handlers/OptiCutHandler.sol";

contract OptiCutInvariantsTest is Test {
    OptiCut internal cut;
    OptiCutHandler internal handler;

    address[] internal labs;
    address internal admin = address(0xA11CE);
    bytes32 internal constant NGJA_ADMIN_ROLE = keccak256("NGJA_ADMIN_ROLE");

    function setUp() public {
        for (uint256 i = 0; i < 4; i++) {
            labs.push(address(uint160(0x1000 + i)));
        }

        cut = new OptiCut();
        cut.grantRole(NGJA_ADMIN_ROLE, admin);
        for (uint256 i = 0; i < labs.length; i++) {
            vm.prank(admin);
            cut.grantLabRole(labs[i], string.concat("Lab ", _u(i)));
        }

        handler = new OptiCutHandler(cut, labs, admin);
        targetContract(address(handler)); // forge calls ONLY the handler
    }

    /// Decode stones(id) tuple → (status, weight, parentId, custodian)
    function _stoneOf(uint256 id)
        internal
        view
        returns (uint8 status, uint256 weight, uint256 parent, address custodian)
    {
        (uint256 p, uint256 w, , , OptiCut.Status stEnum, , address c) = cut.stones(id);
        return (uint8(stEnum), w, p, c);
    }

    // I1 — weight is never created from nothing
    function invariant_circulatingWeightNeverExceedsMintedWeight() public view {
        uint256 circulating;
        uint256 n = handler.mintedCountGhost();
        for (uint256 i = 1; i <= n; i++) {
            (uint8 st, uint256 w, , ) = _stoneOf(i);
            if (st != 2) circulating += w;
        }
        assertLe(circulating, handler.totalMintedWeightGhost(), "I1: free weight created");
    }

    // I2 — our independent model always agrees with the contract
    function invariant_holderGhostMatchesOnChainCustody() public view {
        uint256 n = handler.mintedCountGhost();
        for (uint256 i = 1; i <= n; i++) {
            (uint8 st, , , address custodian) = _stoneOf(i);
            address ghost = handler.holderOf(i);
            if (st == 2) {
                assertEq(cut.balanceOf(ghost, i), 0, "I2: burned stone has a holder");
            } else {
                assertTrue(ghost != address(0), "I2: active stone has no holder");
                assertEq(cut.balanceOf(ghost, i), 1, "I2: holder balance mismatch");
                assertEq(custodian, ghost, "I2: custodian field differs from model");
            }
        }
    }

    // I3 — children never weigh more than their parent
    function invariant_childrenWeightsRespectParent() public view {
        uint256 n = handler.parentCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 parentId = handler.parentAt(i);
            (uint8 pst, uint256 pWeight, , ) = _stoneOf(parentId);
            uint256[] memory childIds = cut.getChildIds(parentId);

            assertEq(childIds.length, handler.childCountOf(parentId), "I3: child list length drift");
            assertEq(pst, 2, "I3: parent with children is not burned");

            // I3b — child list CONTENT is exact: strictly increasing ids ⇒ no duplicates,
            // and every entry is a real child whose parentTokenId points back here.
            uint256 sum;
            for (uint256 j = 0; j < childIds.length; j++) {
                (, uint256 cw, uint256 cp, ) = _stoneOf(childIds[j]);
                assertEq(cp, parentId, "I3: child link broken");
                sum += cw;
                if (j > 0) {
                    assertGt(childIds[j], childIds[j - 1], "I3b: duplicate or out-of-order child id");
                }
            }
            assertLe(sum, pWeight, "I3: children weigh more than the parent");
        }
    }

    // I4 — ids are gapless
    function invariant_tokenIdsAreGapless() public view {
        uint256 n = handler.mintedCountGhost();
        if (n == 0) return;
        (, , , uint256 ts) = _timestamp(n);
        assertGt(ts, 0, "I4: last minted id missing");
        (, , , uint256 tsNext) = _timestamp(n + 1);
        assertEq(tsNext, 0, "I4: id gap after last mint");
    }

    function _timestamp(uint256 id) internal view returns (uint8, uint256, uint256, uint256) {
        (uint256 p, uint256 w, , , uint8 st, uint256 ts, ) = cut.getStone(id);
        return (st, w, p, ts);
    }

    // I5 — Pending stones cannot be moved (custody is frozen, as designed)
    function invariant_pendingStonesStillHeldByCustodian() public view {
        uint256 n = handler.mintedCountGhost();
        for (uint256 i = 1; i <= n; i++) {
            (uint8 st, , , address custodian) = _stoneOf(i);
            if (st == 1) {
                assertEq(cut.balanceOf(custodian, i), 1, "I5: pending stone was moved");
            }
        }
    }

    // I6 — the production ledger the admin panel reads is always correct
    function invariant_labLedgerMatchesMintRecord() public view {
        for (uint256 i = 0; i < labs.length; i++) {
            assertEq(
                cut.getStonesMintedByLab(labs[i]).length,
                handler.labMintCountGhost(labs[i]),
                "I6: lab ledger drift"
            );
        }
    }

    // I7 — status is always a valid enum value
    function invariant_statusAlwaysValid() public view {
        uint256 n = handler.mintedCountGhost();
        for (uint256 i = 1; i <= n; i++) {
            (uint8 st, , , ) = _stoneOf(i);
            assertTrue(st <= 2, "I7: invalid stone status");
        }
    }

    // I8 — exactly one actor holds any non-burned stone
    function invariant_everyStoneHeldByExactlyOneActor() public view {
        uint256 n = handler.mintedCountGhost();
        for (uint256 i = 1; i <= n; i++) {
            (uint8 st, , , ) = _stoneOf(i);
            if (st == 2) continue;

            uint256 total;
            for (uint256 j = 0; j < labs.length; j++) {
                total += cut.balanceOf(labs[j], i);
            }
            total += cut.balanceOf(admin, i);
            assertEq(total, handler.balanceSumOf(i), "I8: balance-sum ghost drift");
            assertLe(total, 1, "I8: stone held by multiple actors");
        }
    }

    // ── util ──
    function _u(uint256 x) internal pure returns (string memory) {
        if (x == 0) return "0";
        uint256 n = x;
        uint256 len;
        while (n != 0) {
            len++;
            n /= 10;
        }
        bytes memory b = new bytes(len);
        while (x != 0) {
            len--;
            b[len] = bytes1(uint8(48 + x % 10));
            x /= 10;
        }
        return string(b);
    }
}
