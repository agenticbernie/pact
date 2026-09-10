// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCreditASCHarness} from "./harness/PactCreditASCHarness.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {PactCreditASC} from "../src/PactCreditASC.sol";
import {PactErrors} from "../src/PactErrors.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/common/EvmV1Decoder.sol";

/// @notice Deterministic unit matrix for evidence processing without a verifier.
/// Mirrors the official example harness pattern: hand-built log structures exercise
/// the handler while the mock-backed suite covers the full execute() path.
contract PactCreditASCHarnessTest is Test {
    PactCreditASCHarness harness;
    PactCardController controller;
    PactCreditPool pool;
    MerchantSimulator merchant;

    bytes32 constant EVIDENCE = keccak256(bytes("evidence-1"));
    bytes32 constant CREDIT_SIG = keccak256("CreditGranted(bytes32,address,uint256,uint64)");
    address agent = address(0xA6E17);
    address sourceAddr = address(0x5012CE);

    function setUp() public {
        merchant = new MerchantSimulator();
        pool = new PactCreditPool(address(merchant));
        controller = new PactCardController(address(pool), address(merchant));
        merchant.setPool(address(pool));
        pool.setController(address(controller));
        harness = new PactCreditASCHarness(address(controller));
        controller.setAscAuthority(address(harness));
        harness.registerSourceCreditContract(1, sourceAddr);
        bytes32[] memory list = new bytes32[](1);
        list[0] = keccak256(bytes("coffee-demo"));
        controller.createCard(agent, 1000, 100, uint64(block.timestamp + 10000), list);
        controller.activateCard(1);
    }

    function _topics(bytes32 evidenceId, address beneficiary) internal pure returns (bytes32[] memory t) {
        t = new bytes32[](3);
        t[0] = CREDIT_SIG;
        t[1] = evidenceId;
        t[2] = bytes32(uint256(uint160(beneficiary)));
    }

    function _encodeTx(address emitter, bytes32[] memory topics, bytes memory data, uint8 status)
        internal
        pure
        returns (bytes memory)
    {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: data});
        bytes[] memory chunks = new bytes[](3);
        chunks[2] = abi.encode(status, uint64(21000), logs, hex"");
        return abi.encode(uint8(2), chunks);
    }

    function _validTx() internal view returns (bytes memory) {
        return
            _encodeTx(sourceAddr, _topics(EVIDENCE, agent), abi.encode(uint256(500), uint64(block.timestamp + 5000)), 1);
    }

    function test_ValidEvidenceApplies() public {
        harness.exposedProcessEvidence(_validTx());
        assertTrue(controller.availableCredit(1) == 500);
    }

    function test_BadTxTypeReverts() public {
        bytes[] memory chunks = new bytes[](3);
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(abi.encode(uint8(9), chunks));
    }

    function test_EmptyChunksRevert() public {
        vm.expectRevert();
        harness.exposedProcessEvidence(abi.encode(uint8(2), new bytes[](0)));
    }

    function test_BadReceiptReverts() public {
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(
            _encodeTx(sourceAddr, _topics(EVIDENCE, agent), abi.encode(uint256(500), uint64(block.timestamp + 5000)), 0)
        );
    }

    function test_MissingEventReverts() public {
        bytes32[] memory noTopics = new bytes32[](0);
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(_encodeTx(sourceAddr, noTopics, "", 1));
    }

    function test_WrongEmitterReverts() public {
        vm.expectRevert(PactCreditASC.UnregisteredSource.selector);
        harness.exposedProcessEvidence(
            _encodeTx(
                address(0xBAD), _topics(EVIDENCE, agent), abi.encode(uint256(500), uint64(block.timestamp + 5000)), 1
            )
        );
    }

    function test_UnregisteredSourceReverts() public {
        PactCreditASCHarness fresh = new PactCreditASCHarness(address(controller));
        vm.expectRevert(PactCreditASC.UnregisteredSource.selector);
        fresh.exposedProcessEvidence(_validTx());
    }

    function test_BadTopicsReverts() public {
        bytes32[] memory two = new bytes32[](2);
        two[0] = CREDIT_SIG;
        two[1] = EVIDENCE;
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(
            _encodeTx(sourceAddr, two, abi.encode(uint256(500), uint64(block.timestamp + 5000)), 1)
        );
    }

    function test_BadDataReverts() public {
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(_encodeTx(sourceAddr, _topics(EVIDENCE, agent), abi.encode(uint256(500)), 1));
    }

    function test_ZeroBeneficiaryReverts() public {
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(
            _encodeTx(
                sourceAddr, _topics(EVIDENCE, address(0)), abi.encode(uint256(500), uint64(block.timestamp + 5000)), 1
            )
        );
    }

    function test_ZeroAmountReverts() public {
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(
            _encodeTx(sourceAddr, _topics(EVIDENCE, agent), abi.encode(uint256(0), uint64(block.timestamp + 5000)), 1)
        );
    }

    function test_ExpiredCreditReverts() public {
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        harness.exposedProcessEvidence(
            _encodeTx(sourceAddr, _topics(EVIDENCE, agent), abi.encode(uint256(500), uint64(block.timestamp - 1)), 1)
        );
    }

    function test_ReplayReverts() public {
        harness.exposedProcessEvidence(_validTx());
        vm.expectRevert(PactErrors.EvidenceAlreadyApplied.selector);
        harness.exposedProcessEvidence(_validTx());
    }
}
