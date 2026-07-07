// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
    }

    mapping(uint256 => Stone) public stones;
    mapping(uint256 => uint256[]) public children;

    AuthorizedLab[] private _authorizedLabs;
    mapping(address => uint256) private _authorizedLabIndexPlusOne;

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
    ) external onlyRole(LAB_ROLE) returns (uint256) {
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

        emit StoneCertified(newId, weight, stoneState, uri_);
        return newId;
    }

    function requestTransformation(uint256 tokenId) external onlyRole(LAB_ROLE) {
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

            childIds[i] = childId;
        }

        emit StoneTransformed(parentTokenId, childIds, newWeights, newStates, newUris);

        return childIds;
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

    function getAuthorizedLabs() external view returns (AuthorizedLab[] memory) {
        return _authorizedLabs;
    }

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
    ) public virtual override {
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
    ) public virtual override {
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
                timestamp: block.timestamp
            }));

            _authorizedLabIndexPlusOne[lab] = _authorizedLabs.length;
        } else {
            AuthorizedLab storage existingLab = _authorizedLabs[indexPlusOne - 1];
            existingLab.name = name;
            existingLab.authorizedBy = msg.sender;
            existingLab.timestamp = block.timestamp;
        }

        emit LabAuthorized(lab, name, msg.sender, block.timestamp);
    }

    function revokeLabRole(address lab) external onlyRole(NGJA_ADMIN_ROLE) {
        require(lab != address(0), "Invalid lab address");

        _revokeRole(LAB_ROLE, lab);

        uint256 indexPlusOne = _authorizedLabIndexPlusOne[lab];

        if (indexPlusOne != 0) {
            uint256 removeIndex = indexPlusOne - 1;
            uint256 lastIndex = _authorizedLabs.length - 1;

            if (removeIndex != lastIndex) {
                AuthorizedLab memory lastLab = _authorizedLabs[lastIndex];
                _authorizedLabs[removeIndex] = lastLab;
                _authorizedLabIndexPlusOne[lastLab.lab] = removeIndex + 1;
            }

            _authorizedLabs.pop();
            delete _authorizedLabIndexPlusOne[lab];
        }

        emit LabRevoked(lab, msg.sender, block.timestamp);
    }
}