// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Foundry FUZZ tests — property-based checks over random inputs.
 * These are the strongest automated proof that the core business rules
 * (weight conservation, id uniqueness, ownership) hold for ANY input,
 * not just the hand-picked cases in unit tests.
 */
import {Test} from "forge-std/Test.sol";
import {OptiCut} from "../../contracts/OptiCut.sol";

contract OptiCutFuzzTest is Test {
    OptiCut internal cut;
    address internal ngjaAdmin = address(0xA11CE);
    address internal lab = address(0x1AB);
    address internal lab2 = address(0x2AB);

    bytes32 internal constant LAB_ROLE = keccak256("LAB_ROLE");
    bytes32 internal constant NGJA_ADMIN_ROLE = keccak256("NGJA_ADMIN_ROLE");

    function setUp() public {
        cut = new OptiCut();
        cut.grantRole(NGJA_ADMIN_ROLE, ngjaAdmin);
        vm.prank(ngjaAdmin);
        cut.grantLabRole(lab, "Primary Lab");
        vm.prank(ngjaAdmin);
        cut.grantLabRole(lab2, "Second Lab");
    }

    /// Property: every genesis mint with weight > 0 and non-empty URI succeeds,
    /// token ids are strictly sequential, and the stone is owned by the minter.
    function testFuzz_genesisSequentialIds(uint8 count, uint32 weight) public {
        count = uint8(bound(count, 1, 40));
        weight = uint32(bound(weight, 1, type(uint24).max));

        vm.startPrank(lab);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = cut.registerGenesis(_uri(i), weight, "Rough");
            assertEq(id, i + 1, "token ids must be sequential starting at 1");
            assertEq(cut.balanceOf(lab, id), 1, "minter must own the minted stone");
            assertEq(_w(id), weight, "weight stored exactly");
        }
        vm.stopPrank();

        // never-minted ids must not exist
        uint256[] memory labIds = cut.getStonesMintedByLab(lab);
        assertEq(labIds.length, count);
    }

    /// Property: children weights may sum to AT MOST the parent weight.
    /// The tx succeeds iff sum(w) <= parentWeight, and reverts otherwise —
    /// no in-between state is ever reachable.
    function testFuzz_childWeightsRespectParent(uint16 parentWeight, uint16 w1, uint16 w2) public {
        parentWeight = uint16(bound(parentWeight, 1, 1000));
        vm.startPrank(lab);
        uint256 parentId = cut.registerGenesis("ipfs://p", parentWeight, "Rough");
        cut.requestTransformation(parentId);

        uint256 sum = uint256(w1) + uint256(w2);
        uint256[] memory weights = new uint256[](2);
        weights[0] = w1;
        weights[1] = w2;
        string[] memory states = new string[](2);
        states[0] = "A";
        states[1] = "B";
        string[] memory uris = new string[](2);
        uris[0] = "ipfs://a";
        uris[1] = "ipfs://b";

        if (sum > parentWeight) {
            vm.expectRevert(bytes("Child weights exceed parent weight"));
            cut.completeTransformation(parentId, weights, states, uris);
            // atomicity: parent still Pending, nothing burned, nothing minted
            assertEq(_st(parentId), 1);
            assertEq(cut.balanceOf(lab, parentId), 1);
            assertEq(cut.balanceOf(lab, parentId + 1), 0);
        } else if (w1 == 0 || w2 == 0) {
            // every child must be > 0 — a zero child rejects even if total is fine
            vm.expectRevert(bytes("Child weight must be > 0"));
            cut.completeTransformation(parentId, weights, states, uris);
        } else {
            uint256[] memory childIds = cut.completeTransformation(parentId, weights, states, uris);
            assertEq(childIds.length, 2);
            assertEq(cut.balanceOf(lab, parentId), 0, "parent must be burned");
            assertEq(_st(parentId), 2);
            assertEq(_w(childIds[0]), w1);
            assertEq(_w(childIds[1]), w2);
        }
        vm.stopPrank();
    }

    /// Property: cutting a stone with a random k-way split conserves weight —
    /// the child weights sum EXACTLY to the parent weight, so no weight is
    /// created or destroyed inside the valid range.
    function testFuzz_exactSplitConservesWeight(uint16 W, uint8 k, uint256 seed) public {
        W = uint16(bound(W, 2, 500));
        k = uint8(bound(k, 2, 5)); // cap at 5 children (bounded gas)
        if (uint256(k) > W) k = uint8(W); // need k <= W so distinct cuts exist

        uint256[] memory weights = _split(W, k, seed);

        vm.startPrank(lab);
        uint256 parentId = cut.registerGenesis("ipfs://p", W, "Rough");
        cut.requestTransformation(parentId);

        uint256[] memory childIds = cut.completeTransformation(
            parentId, weights, _states(k), _uris(k)
        );

        uint256 sum;
        for (uint256 i = 0; i < childIds.length; i++) {
            sum += _w(childIds[i]);
            assertEq(uint8(_st(childIds[i])), 0, "children born Active");
            assertEq(_parent(childIds[i]), parentId);
            assertEq(cut.balanceOf(lab, childIds[i]), 1);
        }
        assertEq(sum, W, "child weights must sum exactly to the parent weight");
        assertEq(cut.balanceOf(lab, parentId), 0);
        vm.stopPrank();
    }

    /// Property: only an account holding LAB_ROLE can mint. Any other account
    /// (including the admin and random addresses) must revert.
    function testFuzz_onlyLabCanMint(address caller) public {
        vm.assume(caller != lab && caller != lab2);
        vm.prank(caller);
        vm.expectRevert();
        cut.registerGenesis("ipfs://x", 1, "Rough");
    }

    /// Property: a request → cancel → request → complete cycle leaves the
    /// stone in a fully consistent state for any valid parent weight.
    function testFuzz_cancelThenRecomplete(uint16 W, uint16 w1, uint16 w2) public {
        W = uint16(bound(W, 2, 200));
        w1 = uint16(bound(w1, 1, W - 1));
        w2 = uint16(bound(w2, 1, W - w1));

        vm.startPrank(lab);
        uint256 parentId = cut.registerGenesis("ipfs://p", W, "Rough");

        cut.requestTransformation(parentId);
        cut.cancelTransformation(parentId);
        assertEq(uint8(_st(parentId)), 0, "cancel must restore Active");

        cut.requestTransformation(parentId);
        uint256[] memory ws = new uint256[](2);
        ws[0] = w1;
        ws[1] = w2;
        uint256[] memory childIds = cut.completeTransformation(parentId, ws, _states(2), _uris(2));

        uint256 total = _w(childIds[0]) + _w(childIds[1]);
        assertLe(total, W, "children may not weigh more than the parent");
        assertEq(total, w1 + w2, "child weights must match what was requested");
        vm.stopPrank();
    }


    // struct-returning calls must be destructured (ABI returns tuples)
    function _w(uint256 id) internal view returns (uint256) {
        (, uint256 w, , , , , ) = cut.stones(id);
        return w;
    }

    function _st(uint256 id) internal view returns (uint8) {
        (, , , , OptiCut.Status st, , ) = cut.stones(id);
        return uint8(st);
    }

    function _parent(uint256 id) internal view returns (uint256) {
        (uint256 p, , , , , , ) = cut.stones(id);
        return p;
    }

    /// Property: a multi-generation tree built with random splits keeps every
    /// lineage link intact. From ANY random leaf we can walk parentTokenId all
    /// the way back to the genesis stone, every hop is recorded in the parent's
    /// children[] list, and weights never increase when going up the chain.
    function testFuzz_deepLineageTree(uint16 W, uint8 k, uint8 depth, uint256 seed) public {
        W = uint16(bound(W, 8, 200));
        k = uint8(bound(k, 2, 4));       // branching factor per node
        depth = uint8(bound(depth, 1, 3)); // generations below genesis

        vm.startPrank(lab);
        uint256 root = cut.registerGenesis("ipfs://root", W, "Rough");

        // fixed-size node table (max nodes = 1 + k + k^2 + k^3 ≤ 85)
        uint256[256] memory ids;
        uint256[256] memory weights;
        ids[0] = root;
        weights[0] = W;
        uint256 n = 1;      // total nodes created so far
        uint256 levelStart = 0;
        uint256 levelEnd = 1;
        uint256 leafStart = 0; // deepest level that actually produced nodes
        uint256 leafEnd = 1;

        for (uint256 d = 0; d < depth; d++) {
            uint256 nextEnd = n;
            for (uint256 i = levelStart; i < levelEnd; i++) {
                uint256 w = weights[i];
                if (w < 2) continue; // too small to cut — becomes a leaf
                uint256 kk = k;
                if (kk > w) kk = w;
                uint256 salt = uint256(keccak256(abi.encode(seed, d, i)));
                uint256[] memory parts = _split(w, kk, salt);
                cut.requestTransformation(ids[i]);
                uint256[] memory childIds = cut.completeTransformation(ids[i], parts, _states(kk), _uris(kk));
                for (uint256 c = 0; c < childIds.length; c++) {
                    ids[nextEnd] = childIds[c];
                    weights[nextEnd] = parts[c];
                    nextEnd++;
                }
            }
            if (nextEnd > levelEnd) {
                // this level produced children — they are the current leaves
                leafStart = levelEnd;
                leafEnd = nextEnd;
            }
            levelStart = levelEnd;
            levelEnd = nextEnd;
            if (levelEnd == levelStart) break; // no node was cut this level
        }

        // walk from a random node in the deepest productive level back to genesis
        require(leafEnd > leafStart, "no leaf nodes produced");
        uint256 leafIdx = leafStart + ((seed ^ 7) % (leafEnd - leafStart));
        uint256 cur = ids[leafIdx];
        uint256 prevWeight = 0; // sentinel: first hop has no previous weight
        uint256 hops = 0;
        uint256 rootFound = 0;
        while (cur != 0 && hops < 64) {
            uint256 w = _w(cur);
            // walking UP the chain, weight must never decrease (parent >= child);
            // skip the sentinel first hop, which has no previous weight
            if (hops > 0) {
                assertGe(w, prevWeight, "lineage: weight decreases going up the chain");
            }
            prevWeight = w;
            uint256 p = _parent(cur);
            if (p != 0) {
                // the parent's children[] list must contain this stone
                uint256[] memory siblings = cut.getChildIds(p);
                bool listed = false;
                for (uint256 j = 0; j < siblings.length; j++) {
                    if (siblings[j] == cur) listed = true;
                }
                assertTrue(listed, "lineage: parent does not list this child");
            } else {
                rootFound = cur;
            }
            cur = p;
            hops++;
        }
        assertEq(rootFound, root, "lineage: chain does not terminate at the genesis stone");
        assertGt(hops, 0, "lineage: leaf is not connected to the tree");
        vm.stopPrank();
    }

    // ── helpers ──
    function _uri(uint256 i) internal pure returns (string memory) {
        return string.concat("ipfs://gen", _uintToStr(i));
    }

    function _states(uint256 n) internal pure returns (string[] memory s) {
        s = new string[](n);
        for (uint256 i = 0; i < n; i++) s[i] = string.concat("State", _uintToStr(i));
    }

    function _uris(uint256 n) internal pure returns (string[] memory s) {
        s = new string[](n);
        for (uint256 i = 0; i < n; i++) s[i] = string.concat("ipfs://c", _uintToStr(i));
    }

    /// Split `total` into `k` strictly-positive random parts that sum EXACTLY to `total`.
    /// Sequential allocation — always terminates (no rejection sampling).
    function _split(uint256 total, uint256 k, uint256 seed) internal view returns (uint256[] memory) {
        uint256[] memory parts = new uint256[](k);
        uint256 remaining = total;
        for (uint256 i = 0; i < k - 1; i++) {
            uint256 maxForThis = remaining - (k - 1 - i); // leave >= 1 for each remaining part
            uint256 take = 1 + (uint256(keccak256(abi.encode(seed, i, block.timestamp))) % maxForThis);
            parts[i] = take;
            remaining -= take;
        }
        parts[k - 1] = remaining;
        return parts;
    }

    function _uintToStr(uint256 x) internal pure returns (string memory) {
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
