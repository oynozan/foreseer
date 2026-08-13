// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { ITeeExtensionRegistry } from "./interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "./interfaces/ITeeMachineRegistry.sol";

/// @title ForeseerInstructionSender
/// @notice On-chain entry point for Foreseer: paid epoch opening with fee
/// split, seed commitment storage, and trustless Merkle anchoring verified
/// against the TEE identity per FORESEER-SPEC v0.1 section 6.3.
contract ForeseerInstructionSender {
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_TYPE_FORESEER = bytes32("FORESEER");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_OPEN_EPOCH = bytes32("OPEN_EPOCH");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_PLAY = bytes32("PLAY");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_CLOSE_EPOCH = bytes32("CLOSE_EPOCH");

    // FORESEER-SPEC section 6.3
    bytes32 private constant EPOCH_CLOSE_TYPEHASH =
        keccak256(
            "EpochClose(uint16 specVersion,bytes32 codeVersion,uint64 epochId,bytes32 seedCommit,bytes32 serverSeed,bytes32 merkleRoot,uint64 receiptCount)"
        );
    // FORESEER-SPEC section 5.1
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId)");
    bytes32 private constant NAME_HASH = keccak256(bytes("Foreseer"));
    bytes32 private constant VERSION_HASH = keccak256(bytes("0"));
    // FORESEER-SPEC section 1.2 low-s bound
    uint256 private constant SECP256K1_HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    ITeeExtensionRegistry public immutable TEE_EXTENSION_REGISTRY;
    ITeeMachineRegistry public immutable TEE_MACHINE_REGISTRY;
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    uint256 private _extensionId;

    address public owner;
    /// @notice Attested TEE identity that signs receipts and epoch closes.
    address public teeId;
    /// @notice Relayer allowed to post pre-reveal commitments.
    address public poster;
    address public treasury;
    uint256 public epochFee;
    uint16 public treasuryShareBp;
    uint256 public operatorBalance;

    struct EpochRecord {
        bytes32 seedCommit;
        bytes32 merkleRoot;
        bytes32 serverSeed;
        uint64 receiptCount;
        bool committed;
        bool anchored;
    }
    mapping(uint64 epochId => EpochRecord) public epochs;

    event EpochOpenRequested(address indexed caller, uint256 feePaid);
    event EpochCommitted(uint64 indexed epochId, bytes32 seedCommit);
    event EpochAnchored(uint64 indexed epochId, bytes32 seedCommit, bytes32 merkleRoot, uint64 receiptCount);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(
        ITeeExtensionRegistry _teeExtensionRegistry,
        ITeeMachineRegistry _teeMachineRegistry,
        address _teeId,
        address _treasury,
        uint256 _epochFee,
        uint16 _treasuryShareBp
    ) {
        require(address(_teeExtensionRegistry) != address(0), "TeeExtensionRegistry cannot be zero address");
        require(address(_teeMachineRegistry) != address(0), "TeeMachineRegistry cannot be zero address");
        require(_teeId != address(0), "teeId cannot be zero address");
        require(_treasury != address(0), "treasury cannot be zero address");
        require(_treasuryShareBp <= 10000, "treasury share above 100 percent");
        TEE_EXTENSION_REGISTRY = _teeExtensionRegistry;
        TEE_MACHINE_REGISTRY = _teeMachineRegistry;
        owner = msg.sender;
        poster = msg.sender;
        teeId = _teeId;
        treasury = _treasury;
        epochFee = _epochFee;
        treasuryShareBp = _treasuryShareBp;
    }

    /// DO NOT MODIFY: same discovery flow as the scaffold sender.
    function setExtensionId() external {
        require(_extensionId == 0, "Extension ID already set.");
        uint256 c = TEE_EXTENSION_REGISTRY.nextPublicExtensionId();
        for (uint256 i = FIRST_PUBLIC_EXTENSION_ID; i < c; ++i) {
            if (TEE_EXTENSION_REGISTRY.getTeeExtensionInstructionsSender(i) == address(this)) {
                _extensionId = i;
                return;
            }
        }
        revert("Extension ID not found.");
    }

    /// @notice Opens an epoch. Pays epochFee (split treasury/operator);
    /// anything above epochFee is forwarded as the registry instruction fee.
    function sendOpenEpoch() external payable {
        require(msg.value >= epochFee, "epoch fee not covered");
        uint256 toTreasury = (epochFee * treasuryShareBp) / 10000;
        operatorBalance += epochFee - toTreasury;
        emit EpochOpenRequested(msg.sender, epochFee);
        if (toTreasury > 0) {
            (bool ok, ) = treasury.call{value: toTreasury}("");
            require(ok, "treasury transfer failed");
        }
        _send(OP_COMMAND_OPEN_EPOCH, bytes("{}"), msg.value - epochFee);
    }

    /// @notice Sends a PLAY instruction. Message is the JSON PlayRequest.
    function sendPlay(bytes calldata _message) external payable {
        require(_message.length > 0, "message must not be empty");
        _send(OP_COMMAND_PLAY, _message, msg.value);
    }

    /// @notice Sends a CLOSE_EPOCH instruction.
    function sendCloseEpoch() external payable {
        _send(OP_COMMAND_CLOSE_EPOCH, bytes("{}"), msg.value);
    }

    /// @notice Stores the pre-reveal seed commitment for an epoch.
    /// A dishonest poster is exposed at anchorEpoch: the TEE-signed close
    /// binds the commitment, so a mismatch makes anchoring revert.
    function commitEpoch(uint64 _epochId, bytes32 _seedCommit) external {
        require(msg.sender == poster, "only poster");
        EpochRecord storage rec = epochs[_epochId];
        require(!rec.committed, "epoch already committed");
        rec.seedCommit = _seedCommit;
        rec.committed = true;
        emit EpochCommitted(_epochId, _seedCommit);
    }

    /// @notice Anchors a closed epoch. Trustless: verifies the EIP-712
    /// EpochClose signature against the attested teeId and the seed reveal
    /// against the commitment (FORESEER-SPEC sections 6.1 and 6.3).
    function anchorEpoch(
        uint16 _specVersion,
        bytes32 _codeVersion,
        uint64 _epochId,
        bytes32 _seedCommit,
        bytes32 _serverSeed,
        bytes32 _merkleRoot,
        uint64 _receiptCount,
        bytes calldata _signature
    ) external {
        require(_signature.length == 65, "signature must be 65 bytes");
        bytes32 r = bytes32(_signature[0:32]);
        bytes32 s = bytes32(_signature[32:64]);
        uint8 v = uint8(_signature[64]);
        require(v == 27 || v == 28, "v must be 27 or 28");
        require(uint256(s) > 0 && uint256(s) <= SECP256K1_HALF_N, "high-s signature rejected");

        bytes32 structHash = keccak256(
            abi.encode(
                EPOCH_CLOSE_TYPEHASH,
                _specVersion,
                _codeVersion,
                _epochId,
                _seedCommit,
                _serverSeed,
                _merkleRoot,
                _receiptCount
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == teeId, "not signed by the tee");
        require(sha256(abi.encodePacked(_serverSeed)) == _seedCommit, "seed does not match commitment");

        EpochRecord storage rec = epochs[_epochId];
        if (rec.committed) {
            require(rec.seedCommit == _seedCommit, "commitment mismatch");
        } else {
            rec.seedCommit = _seedCommit;
            rec.committed = true;
        }
        require(!rec.anchored, "epoch already anchored");
        rec.serverSeed = _serverSeed;
        rec.merkleRoot = _merkleRoot;
        rec.receiptCount = _receiptCount;
        rec.anchored = true;
        emit EpochAnchored(_epochId, _seedCommit, _merkleRoot, _receiptCount);
    }

    /// @notice Verifies a receipt digest against an anchored epoch root.
    /// FORESEER-SPEC section 7.2, sorted-pair keccak, OZ MerkleProof shape.
    function verifyReceiptInclusion(
        uint64 _epochId,
        bytes32 _receiptDigest,
        bytes32[] calldata _proof
    ) external view returns (bool) {
        EpochRecord storage rec = epochs[_epochId];
        require(rec.anchored, "epoch not anchored");
        bytes32 h = _receiptDigest;
        for (uint256 i = 0; i < _proof.length; ++i) {
            bytes32 p = _proof[i];
            h = h <= p ? keccak256(abi.encodePacked(h, p)) : keccak256(abi.encodePacked(p, h));
        }
        return h == rec.merkleRoot;
    }

    /// @notice EIP-712 domain separator bound to the current chain.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid));
    }

    function withdrawOperator(address payable _to) external onlyOwner {
        uint256 amount = operatorBalance;
        operatorBalance = 0;
        (bool ok, ) = _to.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function setPoster(address _poster) external onlyOwner {
        poster = _poster;
    }

    function setFees(uint256 _epochFee, uint16 _treasuryShareBp) external onlyOwner {
        require(_treasuryShareBp <= 10000, "treasury share above 100 percent");
        epochFee = _epochFee;
        treasuryShareBp = _treasuryShareBp;
    }

    function _send(bytes32 _opCommand, bytes memory _message, uint256 _value) private {
        address[] memory teeIds = TEE_MACHINE_REGISTRY.getRandomTeeIds(_getExtensionId(), 1);
        address[] memory cosigners = new address[](0);
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: OP_TYPE_FORESEER,
            opCommand: _opCommand,
            message: _message,
            cosigners: cosigners,
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });
        TEE_EXTENSION_REGISTRY.sendInstructions{value: _value}(teeIds, params);
    }

    function _getExtensionId() internal view returns (uint256) {
        require(_extensionId != 0, "Extension ID is not set.");
        return _extensionId;
    }
}
