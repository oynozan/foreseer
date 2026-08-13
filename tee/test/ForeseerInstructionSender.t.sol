// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Test } from "forge-std/Test.sol";
import { ForeseerInstructionSender } from "../contracts/ForeseerInstructionSender.sol";
import { ITeeExtensionRegistry } from "../contracts/interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "../contracts/interfaces/ITeeMachineRegistry.sol";

contract MockRegistries is ITeeExtensionRegistry, ITeeMachineRegistry {
    uint256 public receivedValue;
    bytes32 public lastOpCommand;
    bytes public lastMessage;
    address public sender;

    function setSender(address _sender) external {
        sender = _sender;
    }

    function sendInstructions(
        address[] calldata,
        TeeInstructionParams calldata _params
    ) external payable returns (bytes32) {
        receivedValue += msg.value;
        lastOpCommand = _params.opCommand;
        lastMessage = _params.message;
        return bytes32(uint256(1));
    }

    function nextPublicExtensionId() external pure returns (uint256) {
        return 0x10001;
    }

    function getTeeExtensionInstructionsSender(uint256 _extensionId) external view returns (address) {
        return _extensionId == 0x10000 ? sender : address(0);
    }

    function getRandomTeeIds(uint256, uint256) external pure returns (address[] memory teeIds) {
        teeIds = new address[](1);
        teeIds[0] = address(0xBEEF);
    }
}

contract ForeseerInstructionSenderTest is Test {
    // Golden values from spec/vectors/e2e.json (FORESEER-SPEC section 9)
    address constant TEE_ID = 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf;
    bytes32 constant CODE_VERSION = 0x6094010faf9dafee4b20d2dd6d5bc2ffcbb480ee3d8f3226c5625d5076f7a28b;
    bytes32 constant SEED_COMMIT = 0x630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd;
    bytes32 constant SERVER_SEED = 0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f;
    bytes32 constant MERKLE_ROOT = 0x6c4fd3095720b35bba7b5379fa23f575fc82b81edb2e8e4e1fabb3ec296b4c5e;
    uint64 constant EPOCH_ID = 1;
    uint64 constant RECEIPT_COUNT = 12;
    bytes CLOSE_SIG =
        hex"357997c8407631114659a390996e355a5da6dd6742c60d101233f1aa11dcd201219812f3e07a1b1b32beff76b548c1b05e2e590e541ebfccec076e6bc6e18f6e1b";
    bytes32 constant RECEIPT0_DIGEST = 0x31e44b718b9091453582d848cd3a60f3a3dc980a740776bc727bae4655558a4a;
    uint256 constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    MockRegistries registries;
    ForeseerInstructionSender fis;
    address treasury = address(0x7EA);
    address player = address(0xABCD);

    function setUp() public {
        vm.chainId(114);
        registries = new MockRegistries();
        fis = new ForeseerInstructionSender(
            ITeeExtensionRegistry(address(registries)),
            ITeeMachineRegistry(address(registries)),
            TEE_ID,
            treasury,
            1 ether,
            2000
        );
        registries.setSender(address(fis));
        fis.setExtensionId();
        vm.deal(player, 100 ether);
    }

    function receipt0Proof() internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](4);
        proof[0] = 0x33b89a3fcc8d413a675f2f7f6b7ec658bc44d8b5783238edbeb1ba9dca90e78a;
        proof[1] = 0x574db63f5f16d6f76275ca28f1c2d54a29d1886bf33c521496f46d568a2303fd;
        proof[2] = 0xcf03ae5b5f992a5457b6311ad67be5edccf0d8b9fc7098bd70634b975bcc52da;
        proof[3] = 0xb906a8f3a0bd7751442143a59697cb5dc09484c1df899752cdfe373d447a7d63;
    }

    function anchorGolden() internal {
        fis.anchorEpoch(1, CODE_VERSION, EPOCH_ID, SEED_COMMIT, SERVER_SEED, MERKLE_ROOT, RECEIPT_COUNT, CLOSE_SIG);
    }

    function test_AnchorAcceptsGoldenClose() public {
        fis.commitEpoch(EPOCH_ID, SEED_COMMIT);
        anchorGolden();
        (bytes32 commit, bytes32 root, bytes32 seed, uint64 count, bool committed, bool anchored) = fis.epochs(EPOCH_ID);
        assertEq(commit, SEED_COMMIT);
        assertEq(root, MERKLE_ROOT);
        assertEq(seed, SERVER_SEED);
        assertEq(count, RECEIPT_COUNT);
        assertTrue(committed);
        assertTrue(anchored);
        assertTrue(fis.verifyReceiptInclusion(EPOCH_ID, RECEIPT0_DIGEST, receipt0Proof()));
        assertFalse(fis.verifyReceiptInclusion(EPOCH_ID, bytes32(uint256(1)), receipt0Proof()));
    }

    function test_AnchorWithoutPriorCommitStoresCommitment() public {
        anchorGolden();
        (bytes32 commit, , , , bool committed, bool anchored) = fis.epochs(EPOCH_ID);
        assertEq(commit, SEED_COMMIT);
        assertTrue(committed && anchored);
    }

    function test_AnchorRejectsTamperedRoot() public {
        vm.expectRevert("not signed by the tee");
        fis.anchorEpoch(
            1,
            CODE_VERSION,
            EPOCH_ID,
            SEED_COMMIT,
            SERVER_SEED,
            bytes32(uint256(MERKLE_ROOT) ^ 1),
            RECEIPT_COUNT,
            CLOSE_SIG
        );
    }

    function test_AnchorRejectsWrongChain() public {
        vm.chainId(14);
        vm.expectRevert("not signed by the tee");
        anchorGolden();
    }

    function test_AnchorRejectsHighS() public {
        bytes memory sig = CLOSE_SIG;
        uint256 s;
        assembly {
            s := mload(add(sig, 64))
        }
        uint256 highS = SECP256K1_N - s;
        uint8 v = uint8(sig[64]) == 27 ? 28 : 27;
        bytes memory tampered = bytes.concat(bytes32(0), bytes32(highS), bytes1(v));
        assembly {
            mstore(add(tampered, 32), mload(add(sig, 32)))
        }
        vm.expectRevert("high-s signature rejected");
        fis.anchorEpoch(1, CODE_VERSION, EPOCH_ID, SEED_COMMIT, SERVER_SEED, MERKLE_ROOT, RECEIPT_COUNT, tampered);
    }

    function test_AnchorRejectsMismatchedCommit() public {
        fis.commitEpoch(EPOCH_ID, bytes32(uint256(42)));
        vm.expectRevert("commitment mismatch");
        anchorGolden();
    }

    function test_AnchorRejectsWrongSeedReveal() public {
        vm.expectRevert("not signed by the tee");
        fis.anchorEpoch(
            1,
            CODE_VERSION,
            EPOCH_ID,
            SEED_COMMIT,
            bytes32(uint256(SERVER_SEED) ^ 1),
            MERKLE_ROOT,
            RECEIPT_COUNT,
            CLOSE_SIG
        );
    }

    function test_AnchorRejectsDoubleAnchor() public {
        anchorGolden();
        vm.expectRevert("epoch already anchored");
        anchorGolden();
    }

    function test_OnlyPosterCommits() public {
        vm.prank(player);
        vm.expectRevert("only poster");
        fis.commitEpoch(EPOCH_ID, SEED_COMMIT);
    }

    function test_OpenEpochSplitsFee() public {
        vm.prank(player);
        fis.sendOpenEpoch{ value: 1.5 ether }();
        assertEq(treasury.balance, 0.2 ether);
        assertEq(fis.operatorBalance(), 0.8 ether);
        assertEq(registries.receivedValue(), 0.5 ether);
        assertEq(registries.lastOpCommand(), bytes32("OPEN_EPOCH"));

        address payable sink = payable(address(0x51));
        fis.withdrawOperator(sink);
        assertEq(sink.balance, 0.8 ether);
        assertEq(fis.operatorBalance(), 0);
    }

    function test_OpenEpochRejectsUnderpayment() public {
        vm.prank(player);
        vm.expectRevert("epoch fee not covered");
        fis.sendOpenEpoch{ value: 0.5 ether }();
    }

    function test_PlayForwardsMessage() public {
        vm.prank(player);
        fis.sendPlay{ value: 0.01 ether }(bytes('{"clientSeed":"alice"}'));
        assertEq(registries.lastOpCommand(), bytes32("PLAY"));
        assertEq(registries.receivedValue(), 0.01 ether);
        vm.prank(player);
        vm.expectRevert("message must not be empty");
        fis.sendPlay("");
    }
}
