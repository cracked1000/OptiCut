
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OptiCut is ERC1155, AccessControl, ReentrancyGuard {
    using Strings for uint256;

    bytes32 public constant NGJA_ADMIN_ROLE = keccak256("NGJA_ADMIN_ROLE");
    bytes32 public constant LAB_ROLE = keccak256("LAB_ROLE");

    uint256 private _currentId;

    enum Status { Active, Pending, Burned }

    struct Stone {
        uint256 parentTokenId;
        uint256 weight;
        string stoneState;
        string ipfsUri;
        Status status;
        uint256 timestamp;
        address custodian;
    }

    struct AuthorizedLab {
        address lab;
        string name;
        address authorizedBy;
        uint256 timestamp;
        // ✅ NEW: revocation is now a FLAG, not a deletion. This keeps revoked labs
        // in the list so the NGJA admin panel can display them and recover their gems.
        bool revoked;
        uint256 revokedAt;
    }

    mapping(uint256 => Stone) public stones;
    mapping(uint256 => uint256[]) public children;

    AuthorizedLab[] private _authorizedLabs;
    mapping(address => uint256) private _authorizedLabIndexPlusOne;

    // ✅ NEW: on-chain index of every stone a lab has ever custodied via minting.
    // Lets the admin panel list "all gems produced by lab X" without scanning eth_getLogs
    // (which is unreliable on Polygon Amoy's Bor node). A stone is appended here the
    // moment the lab mints it (genesis or transformation child). It is NOT removed on
    // transfer — it records production history; check stones[id].custodian for who holds it now.
    mapping(address => uint256[]) private _stonesMintedByLab;

    event StoneCertified(uint256 indexed tokenId, uint256 weight, string stoneState, string uri);
    event TransformationRequested(uint256 indexed tokenId, address byLab);
    event StoneTransformed(
        uint256 indexed parentTokenId,
        uint256[] newTokenIds,
        uint256[] newWeights,
        string[] newStates,
        string[] newUris
    );
    event LabAuthorized(address indexed lab, string name, address indexed authorizedBy, uint256 timestamp);
    event LabRevoked(address indexed lab, address indexed revokedBy, uint256 timestamp);
    // ✅ NEW: recovery events for stones stuck in Pending (e.g. after a lab was revoked).
    event TransformationCancelled(uint256 indexed tokenId, address indexed by, uint256 timestamp);
    event StoneReassigned(uint256 indexed tokenId, address indexed from, address indexed to, address by, uint256 timestamp);

    constructor() ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(NGJA_ADMIN_ROLE, msg.sender);
    }

    function supportsInterface(bytes4 interfaceId)
        public view
        virtual
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function registerGenesis(
        string memory uri_,
        uint256 weight,
        string memory stoneState
    ) external onlyRole(LAB_ROLE) nonReentrant returns (uint256) {
        require(weight > 0, "Weight must be positive");
        require(bytes(uri_).length > 0, "URI required");

        _currentId++;
        uint256 newId = _currentId;

        stones[newId] = Stone({
            parentTokenId: 0,
            weight: weight,
            stoneState: stoneState,
            ipfsUri: uri_,
            status: Status.Active,
            timestamp: block.timestamp,
            custodian: msg.sender
        });

        _mint(msg.sender, newId, 1, "");
        _setTokenURI(newId, uri_);

        _stonesMintedByLab[msg.sender].push(newId); // ✅ NEW: track for admin recovery panel

        emit StoneCertified(newId, weight, stoneState, uri_);
        return newId;
    }

    function requestTransformation(uint256 tokenId) external onlyRole(LAB_ROLE) nonReentrant {
        require(balanceOf(msg.sender, tokenId) == 1, "Lab does not hold token");

        Stone storage stone = stones[tokenId];
        require(stone.status == Status.Active, "Token not active");

        stone.status = Status.Pending;

        emit TransformationRequested(tokenId, msg.sender);
    }

    function completeTransformation(
        uint256 parentTokenId,
        uint256[] calldata newWeights,
        string[] calldata newStates,
        string[] calldata newUris
    ) external onlyRole(LAB_ROLE) nonReentrant returns (uint256[] memory) {
        require(
            newWeights.length == newStates.length &&
            newWeights.length == newUris.length &&
            newWeights.length > 0,
            "Array lengths mismatch or zero children"
        );

        Stone storage parent = stones[parentTokenId];

        require(parent.status == Status.Pending, "Parent not in Pending state");
        require(balanceOf(msg.sender, parentTokenId) == 1, "Lab does not hold parent token");

        uint256 totalChildWeight = 0;
        uint256 childrenCount = newWeights.length;

        for (uint256 i = 0; i < childrenCount; i++) {
            totalChildWeight += newWeights[i];
        }

        require(totalChildWeight <= parent.weight, "Child weights exceed parent weight");

        _burn(msg.sender, parentTokenId, 1);
        parent.status = Status.Burned;

        uint256[] memory childIds = new uint256[](childrenCount);

        for (uint256 i = 0; i < childrenCount; i++) {
            require(newWeights[i] > 0, "Child weight must be > 0");
            require(bytes(newUris[i]).length > 0, "Child URI required");

            _currentId++;
            uint256 childId = _currentId;

            stones[childId] = Stone({
                parentTokenId: parentTokenId,
                weight: newWeights[i],
                stoneState: newStates[i],
                ipfsUri: newUris[i],
                status: Status.Active,
                timestamp: block.timestamp,
                custodian: msg.sender
            });

            _mint(msg.sender, childId, 1, "");
            _setTokenURI(childId, newUris[i]);
            children[parentTokenId].push(childId);

            _stonesMintedByLab[msg.sender].push(childId); // ✅ NEW: track for admin recovery panel

            childIds[i] = childId;
        }

        emit StoneTransformed(parentTokenId, childIds, newWeights, newStates, newUris);

        return childIds;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ✅ NEW: RECOVERY FUNCTIONS
    //
    // Bug fixed: if a lab locked a gem via requestTransformation() (status = Pending)
    // and NGJA then revoked that lab, the gem was permanently frozen:
    //   • completeTransformation() needs LAB_ROLE + the token → revoked lab can't call it
    //   • safeTransferFrom() requires status == Active → a Pending token can't be moved out
    //   • no function existed to leave the Pending state
    // These two functions provide the escape hatch.
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Release a stone stuck in Pending back to Active.
    /// @dev Callable by the current custodian (if they still hold LAB_ROLE) to
    ///      self-cancel, OR by an NGJA admin to rescue a gem whose lab was revoked.
    function cancelTransformation(uint256 tokenId) external {
        Stone storage s = stones[tokenId];
        require(s.status == Status.Pending, "Stone not pending");

        bool isNgja = hasRole(NGJA_ADMIN_ROLE, msg.sender);
        bool isHolder = hasRole(LAB_ROLE, msg.sender) && balanceOf(msg.sender, tokenId) == 1;
        require(isNgja || isHolder, "Not authorized to cancel");

        s.status = Status.Active;

        emit TransformationCancelled(tokenId, msg.sender, block.timestamp);
    }

    /// @notice NGJA-only forced move of a stone to another lab or to the NGJA admin itself.
    /// @dev Bypasses the public safeTransferFrom Active-only guard by using the internal
    ///      _safeTransferFrom, so it works even on a Pending stone held by a revoked/lost
    ///      lab wallet. Always leaves the stone Active under the new custodian.
    /// @param tokenId The stone to reassign.
    /// @param to      New custodian. Must be an authorized lab, or an NGJA admin (parking).
    function adminReassignStone(uint256 tokenId, address to)
        external
        onlyRole(NGJA_ADMIN_ROLE)
        nonReentrant
    {
        require(to != address(0), "Invalid destination");
        require(
            hasRole(LAB_ROLE, to) || hasRole(NGJA_ADMIN_ROLE, to),
            "Destination must be a lab or NGJA admin"
        );

        Stone storage s = stones[tokenId];
        require(s.status != Status.Burned, "Stone is burned");

        address from = s.custodian;
        require(from != address(0), "Stone not minted");
        require(balanceOf(from, tokenId) == 1, "Custodian no longer holds token");

        if (from != to) {
            // Internal transfer — skips the public override's Status.Active requirement,
            // which is exactly what lets us rescue a Pending token.
            _safeTransferFrom(from, to, tokenId, 1, "");
            s.custodian = to;
        }

        // Whether reassigned or just released in place, the gem becomes workable again.
        s.status = Status.Active;

        emit StoneReassigned(tokenId, from, to, msg.sender, block.timestamp);
    }

    /// @notice All stone IDs ever minted by a given lab (production history).
    /// @dev Use stones[id].custodian / .status to see current ownership & state.
    function getStonesMintedByLab(address lab) external view returns (uint256[] memory) {
        return _stonesMintedByLab[lab];
    }

    function getChildIds(uint256 parentId) external view returns (uint256[] memory) {
        return children[parentId];
    }

    function getStone(uint256 tokenId)
        external
        view
        returns (
            uint256 parentTokenId,
            uint256 weight,
            string memory stoneState,
            string memory ipfsUri,
            uint8 status,
            uint256 timestamp,
            address custodian
        )
    {
        Stone storage s = stones[tokenId];

        return (
            s.parentTokenId,
            s.weight,
            s.stoneState,
            s.ipfsUri,
            uint8(s.status),
            s.timestamp,
            s.custodian
        );
    }

    /// @notice Returns ALL lab records — both active and revoked (check .revoked).
    function getAuthorizedLabs() external view returns (AuthorizedLab[] memory) {
        return _authorizedLabs;
    }

    /// @notice ✅ NEW: only labs that currently hold LAB_ROLE (not revoked).
    function getActiveLabs() external view returns (AuthorizedLab[] memory) {
        return _filterLabs(false);
    }

    /// @notice ✅ NEW: only labs that have been revoked — powers the recovery panel.
    function getRevokedLabs() external view returns (AuthorizedLab[] memory) {
        return _filterLabs(true);
    }

    function _filterLabs(bool wantRevoked) private view returns (AuthorizedLab[] memory) {
        uint256 labsLength = _authorizedLabs.length;
        uint256 count = 0;
        for (uint256 i = 0; i < labsLength; i++) {
            if (_authorizedLabs[i].revoked == wantRevoked) count++;
        }
        AuthorizedLab[] memory out = new AuthorizedLab[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < labsLength; i++) {
            if (_authorizedLabs[i].revoked == wantRevoked) {
                out[j] = _authorizedLabs[i];
                j++;
            }
        }
        return out;
    }

    /// @notice Total number of lab records (active + revoked).
    function getAuthorizedLabCount() external view returns (uint256) {
        return _authorizedLabs.length;
    }

    function isAuthorizedLab(address lab) external view returns (bool) {
        return hasRole(LAB_ROLE, lab);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override nonReentrant {
        require(stones[id].status == Status.Active, "Cannot transfer a non-active token");

        super.safeTransferFrom(from, to, id, amount, data);

        stones[id].custodian = to;
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override nonReentrant {
        for (uint256 i = 0; i < ids.length; i++) {
            require(stones[ids[i]].status == Status.Active, "Cannot transfer a non-active token");
        }

        super.safeBatchTransferFrom(from, to, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; i++) {
            stones[ids[i]].custodian = to;
        }
    }

    mapping(uint256 => string) private _tokenURIs;

    function _setTokenURI(uint256 tokenId, string memory uri_) private {
        _tokenURIs[tokenId] = uri_;
        emit URI(uri_, tokenId);
    }

    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        string memory tokenURI = _tokenURIs[tokenId];

        if (bytes(tokenURI).length > 0) {
            return tokenURI;
        }

        return super.uri(tokenId);
    }

    function grantLabRole(address lab, string memory name) external onlyRole(NGJA_ADMIN_ROLE) {
        require(lab != address(0), "Invalid lab address");

        _grantRole(LAB_ROLE, lab);

        uint256 indexPlusOne = _authorizedLabIndexPlusOne[lab];

        if (indexPlusOne == 0) {
            _authorizedLabs.push(AuthorizedLab({
                lab: lab,
                name: name,
                authorizedBy: msg.sender,
                timestamp: block.timestamp,
                revoked: false,      // ✅ NEW
                revokedAt: 0         // ✅ NEW
            }));

            _authorizedLabIndexPlusOne[lab] = _authorizedLabs.length;
        } else {
            // ✅ UPDATED: re-authorizing a previously-revoked lab clears the flag.
            AuthorizedLab storage existingLab = _authorizedLabs[indexPlusOne - 1];
            existingLab.name = name;
            existingLab.authorizedBy = msg.sender;
            existingLab.timestamp = block.timestamp;
            existingLab.revoked = false;
            existingLab.revokedAt = 0;
        }

        emit LabAuthorized(lab, name, msg.sender, block.timestamp);
    }

    function revokeLabRole(address lab) external onlyRole(NGJA_ADMIN_ROLE) {
        require(lab != address(0), "Invalid lab address");

        _revokeRole(LAB_ROLE, lab);

        // ✅ UPDATED: revocation is now a soft flag instead of a hard delete.
        // Previously we swap-and-pop()'d the lab out of _authorizedLabs, which erased
        // all trace of it — the admin panel then had no way to list a revoked lab or
        // recover the gems it left in Pending. We now keep the record and mark it revoked.
        uint256 indexPlusOne = _authorizedLabIndexPlusOne[lab];

        if (indexPlusOne != 0) {
            AuthorizedLab storage existingLab = _authorizedLabs[indexPlusOne - 1];
            existingLab.revoked = true;
            existingLab.revokedAt = block.timestamp;
        }

        emit LabRevoked(lab, msg.sender, block.timestamp);
    }
}

