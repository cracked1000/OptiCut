// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * STATEFUL HANDLER for OptiCut invariant testing.
 *
 * Forge calls these functions in random order with random arguments, simulating
 * months of real-world usage in seconds. The handler keeps GHOST VARIABLES —
 * an independent, expected model of the state — which the invariant tests use
 * to cross-check the contract's real storage after every call sequence.
 *
 * Every operation is guarded so it only runs when valid, meaning the state
 * machine genuinely progresses during each run.
 */
import {Test} from "forge-std/Test.sol";
import {OptiCut} from "../../../contracts/OptiCut.sol";

contract OptiCutHandler is Test {
    OptiCut internal immutable cut;

    address[] internal labs;
    address internal admin;

    // ── ghost variables (independent model) ──
    uint256 internal mintedCount; // number of stones ever minted (ids 1..mintedCount)
    uint256 internal totalMintedWeight; // sum of weights of all genesis + child mints
    mapping(address => uint256) internal labMintCount; // per-lab mint ledger (ghost)
    mapping(uint256 => address) internal holderGhost; // who we believe holds each id
    mapping(uint256 => uint256) internal balanceSumGhost; // sum of balances across actor set
    mapping(uint256 => uint256) internal childCountGhost; // children per parent (ghost)
    uint256[] internal parentsWithChildren;

    uint256 internal opCount;

    constructor(OptiCut _cut, address[] memory _labs, address _admin) {
        cut = _cut;
        labs = _labs;
        admin = _admin;
    }

    // ── public getters for invariant assertions ──
    function mintedCountGhost() external view returns (uint256) { return mintedCount; }
    function totalMintedWeightGhost() external view returns (uint256) { return totalMintedWeight; }
    function labMintCountGhost(address l) external view returns (uint256) { return labMintCount[l]; }
    function holderOf(uint256 id) external view returns (address) { return holderGhost[id]; }
    function balanceSumOf(uint256 id) external view returns (uint256) { return balanceSumGhost[id]; }
    function childCountOf(uint256 id) external view returns (uint256) { return childCountGhost[id]; }
    function parentCount() external view returns (uint256) { return parentsWithChildren.length; }
    function parentAt(uint256 i) external view returns (uint256) { return parentsWithChildren[i]; }
    function totalOps() external view returns (uint256) { return opCount; }

    function _status(uint256 id) internal view returns (uint8) {
        (, , , , OptiCut.Status st, , ) = cut.stones(id);
        return uint8(st);
    }

    function _weight(uint256 id) internal view returns (uint256) {
        (, uint256 w, , , , , ) = cut.stones(id);
        return w;
    }

    function _rand(uint256 seed, uint256 bound) internal view returns (uint256) {
        if (bound == 0) return 0;
        return uint256(keccak256(abi.encode(seed, opCount, block.timestamp))) % bound;
    }

    function _labAt(uint256 seed) internal view returns (address) {
        return labs[_rand(seed, labs.length)];
    }

    function _recordMint(address minter, uint256 id, uint256 weight) internal {
        mintedCount = id;
        totalMintedWeight += weight;
        labMintCount[minter]++;
        holderGhost[id] = minter;
        balanceSumGhost[id] = 1;
        opCount++;
    }

    // ── operations ──
    function mint(uint256 seed) external {
        address lab = _labAt(seed);
        uint256 weight = _rand(seed, 500) + 1; // 1..500
        vm.prank(lab);
        uint256 id = cut.registerGenesis("ipfs://h", weight, "Rough");
        _recordMint(lab, id, weight);
    }

    function requestTransformation(uint256 seed) external {
        if (mintedCount == 0) return;
        uint256 id = _rand(seed, mintedCount) + 1;
        address holder = holderGhost[id];
        // only Active stones held by a current lab can be requested
        if (uint8(_status(id)) != 0) return;
        if (!cut.isAuthorizedLab(holder)) return;
        vm.prank(holder);
        cut.requestTransformation(id);
        opCount++;
    }

    function completeTransformation(uint256 seed) external {
        if (mintedCount == 0) return;
        uint256 id = _rand(seed, mintedCount) + 1;
        if (uint8(_status(id)) != 1) return; // must be Pending
        address holder = holderGhost[id];
        if (!cut.isAuthorizedLab(holder)) return; // custodian must still be an active lab
        uint256 parentWeight = _weight(id);
        if (parentWeight < 2) return;

        // split into 2..min(4, weight) children summing EXACTLY to parentWeight
        uint256 k = _rand(seed, 3) + 2;
        if (k > parentWeight) k = parentWeight;
        uint256[] memory weights = _split(parentWeight, k, seed);

        vm.prank(holder);
        uint256[] memory childIds = cut.completeTransformation(
            id, weights, _states(k), _uris(k)
        );

        // update ghosts
        uint256 sum;
        for (uint256 i = 0; i < childIds.length; i++) {
            sum += weights[i];
            _recordMint(holder, childIds[i], weights[i]);
        }
        require(sum == parentWeight, "handler split bug");
        childCountGhost[id] = childIds.length;
        parentsWithChildren.push(id);
        holderGhost[id] = address(0); // burned — no holder
        balanceSumGhost[id] = 0;
        opCount++;
    }

    function cancelTransformation(uint256 seed) external {
        if (mintedCount == 0) return;
        uint256 id = _rand(seed, mintedCount) + 1;
        if (uint8(_status(id)) != 1) return;
        address holder = holderGhost[id];
        if (cut.isAuthorizedLab(holder)) {
            vm.prank(holder);
            cut.cancelTransformation(id);
        } else {
            vm.prank(admin);
            cut.cancelTransformation(id);
        }
        opCount++;
    }

    function adminReassign(uint256 seed) external {
        if (mintedCount == 0) return;
        uint256 id = _rand(seed, mintedCount) + 1;
        if (uint8(_status(id)) == 2) return; // can't reassign burned
        address dest = _rand(seed, 2) == 0 ? _labAt(seed + 1) : admin;
        vm.prank(admin);
        cut.adminReassignStone(id, dest);

        // ghosts: if moved, the new holder takes custody
        if (holderGhost[id] != address(0)) {
            balanceSumGhost[id] = 1;
            holderGhost[id] = dest;
        }
        opCount++;
    }

    function transfer(uint256 seed) external {
        if (mintedCount == 0) return;
        uint256 id = _rand(seed, mintedCount) + 1;
        if (uint8(_status(id)) != 0) return; // only Active
        address holder = holderGhost[id];
        if (holder == address(0)) return;
        address dest = _labAt(seed + 2);
        if (dest == holder) return;
        vm.prank(holder);
        cut.safeTransferFrom(holder, dest, id, 1, "");
        holderGhost[id] = dest;
        balanceSumGhost[id] = 1;
        opCount++;
    }

    function grantLab(uint256 seed) external {
        address lab = _labAt(seed + 3);
        vm.prank(admin);
        cut.grantLabRole(lab, "Re-granted");
        opCount++;
    }

    function revokeLab(uint256 seed) external {
        address lab = _labAt(seed + 4);
        vm.prank(admin);
        cut.revokeLabRole(lab);
        opCount++;
    }

    // ── split helper: k positive parts summing exactly to total ──
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

    function _states(uint256 n) internal pure returns (string[] memory s) {
        s = new string[](n);
        for (uint256 i = 0; i < n; i++) s[i] = "Cut";
    }

    function _uris(uint256 n) internal pure returns (string[] memory s) {
        s = new string[](n);
        for (uint256 i = 0; i < n; i++) s[i] = "ipfs://h";
    }
}
