// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCreditASC} from "../src/PactCreditASC.sol";
import {PactCreditSource} from "../src/PactCreditSource.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {PactErrors} from "../src/PactErrors.sol";
import {MockNativeVerifier} from "./mocks/MockNativeVerifier.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/write-ability/common/INativeQueryVerifier.sol";

contract PactCreditASCTest is Test {
    address constant VERIFIER = 0x0000000000000000000000000000000000000FD2;

    PactCreditASC asc;
    PactCreditSource source;
    PactCardController controller;
    PactCreditPool pool;
    MerchantSimulator merchant;

    bytes32 constant EVIDENCE = keccak256(bytes("evidence-1"));
    bytes32 constant CREDIT_SIG = keccak256("CreditGranted(bytes32,address,uint256,uint64)");
    address agent = address(0xA6E17);
    uint64 constant SOURCE_KEY = 1;

    INativeQueryVerifier.MerkleProofEntry[] siblings;
    bytes32[] continuityRoots;

    function setUp() public {
        merchant = new MerchantSimulator();
        pool = new PactCreditPool(address(merchant));
        controller = new PactCardController(address(pool), address(merchant));
        merchant.setPool(address(pool));
        pool.setController(address(controller));
        source = new PactCreditSource();
        asc = new PactCreditASC(address(controller));
        controller.setAscAuthority(address(asc));
        asc.registerSourceCreditContract(SOURCE_KEY, address(source));
        bytes32[] memory list = new bytes32[](1);
        list[0] = keccak256(bytes("coffee-demo"));
        controller.createCard(agent, 1000, 100, uint64(block.timestamp + 10000), list);
        controller.activateCard(1);
        _etchMock(true, 7);
    }

    function _etchMock(bool result, uint64 txIndex) internal {
        MockNativeVerifier mock = new MockNativeVerifier(result, txIndex);
        vm.etch(VERIFIER, address(mock).code);
    }

    function _topics(bytes32 evidenceId, address beneficiary) internal pure returns (bytes32[] memory t) {
        t = new bytes32[](3);
        t[0] = CREDIT_SIG;
        t[1] = evidenceId;
        t[2] = bytes32(uint256(uint160(beneficiary)));
    }

    function _encodeTx(uint8 status, bytes32[] memory topics, bytes memory data)
        internal
        view
        returns (bytes memory)
    {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({
            address_: address(source),
            topics: topics,
            data: data
        });
        bytes[] memory chunks = new bytes[](3);
        chunks[2] = abi.encode(status, uint64(21000), logs, hex"");
        return abi.encode(uint8(2), chunks);
    }

    function _validTx() internal view returns (bytes memory) {
        return _encodeTx(1, _topics(EVIDENCE, agent), abi.encode(uint256(500), uint64(block.timestamp + 5000)));
    }

    function _execute(bytes memory encodedTx)
        internal
        returns (bool)
    {
        return asc.execute(0, SOURCE_KEY, 100, encodedTx, bytes32(uint256(1)), siblings, bytes32(uint256(2)), continuityRoots);
    }

    function test_ValidProofAppliesCredit() public {
        assertTrue(_execute(_validTx()));
        assertTrue(controller.availableCredit(1) == 500);
        assertTrue(asc.processedEvidenceIds(EVIDENCE));
    }

    function test_UnsupportedActionReverts() public {
        vm.expectRevert(abi.encodeWithSelector(PactCreditASC.InvalidAction.selector, 9));
        asc.execute(9, SOURCE_KEY, 100, _validTx(), bytes32(uint256(1)), siblings, bytes32(uint256(2)), continuityRoots);
    }

    function test_FailedVerificationReverts() public {
        _etchMock(false, 7);
        vm.expectRevert(bytes("Proof of inclusion verification failed"));
        _execute(_validTx());
        assertTrue(controller.availableCredit(1) == 0);
    }

    function test_FailedReceiptReverts() public {
        bytes memory bad = _encodeTx(0, _topics(EVIDENCE, agent), abi.encode(uint256(500), uint64(block.timestamp + 5000)));
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        _execute(bad);
    }

    function test_MissingEventReverts() public {
        bytes32[] memory noTopics = new bytes32[](0);
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: address(source), topics: noTopics, data: ""});
        bytes[] memory chunks = new bytes[](3);
        chunks[2] = abi.encode(uint8(1), uint64(21000), logs, hex"");
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        _execute(abi.encode(uint8(2), chunks));
    }

    function test_WrongEmitterReverts() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({
            address_: address(0xBAD),
            topics: _topics(EVIDENCE, agent),
            data: abi.encode(uint256(500), uint64(block.timestamp + 5000))
        });
        bytes[] memory chunks = new bytes[](3);
        chunks[2] = abi.encode(uint8(1), uint64(21000), logs, hex"");
        vm.expectRevert(PactCreditASC.UnregisteredSource.selector);
        _execute(abi.encode(uint8(2), chunks));
    }

    function test_BadTopicCountReverts() public {
        bytes32[] memory two = new bytes32[](2);
        two[0] = CREDIT_SIG;
        two[1] = EVIDENCE;
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        _execute(_encodeTx(1, two, abi.encode(uint256(500), uint64(block.timestamp + 5000))));
    }

    function test_BadDataLengthReverts() public {
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        _execute(_encodeTx(1, _topics(EVIDENCE, agent), abi.encode(uint256(500))));
    }

    function test_UnknownBeneficiaryPropagates() public {
        vm.expectRevert(PactErrors.UnknownAgent.selector);
        _execute(_encodeTx(1, _topics(EVIDENCE, address(0xDEAD)), abi.encode(uint256(500), uint64(block.timestamp + 5000))));
    }

    function test_ExpiredCreditReverts() public {
        vm.expectRevert(PactCreditASC.InvalidProof.selector);
        _execute(_encodeTx(1, _topics(EVIDENCE, agent), abi.encode(uint256(500), uint64(block.timestamp - 1))));
    }

    function test_EvidenceReplayRejected() public {
        assertTrue(_execute(_validTx()));
        // Same evidence under a NEW query (different block height) passes base
        // dedupe and must stop at the application-level evidence check.
        vm.expectRevert(PactErrors.EvidenceAlreadyApplied.selector);
        asc.execute(0, SOURCE_KEY, 101, _validTx(), bytes32(uint256(9)), siblings, bytes32(uint256(2)), continuityRoots);
    }

    function test_QueryReplayRejected() public {
        assertTrue(_execute(_validTx()));
        bytes memory other = _encodeTx(1, _topics(keccak256(bytes("ev2")), agent), abi.encode(uint256(10), uint64(block.timestamp + 5000)));
        vm.expectRevert(bytes("Query already processed"));
        asc.execute(0, SOURCE_KEY, 100, other, bytes32(uint256(1)), siblings, bytes32(uint256(2)), continuityRoots);
    }

    function test_RegisterNonOwnerReverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        asc.registerSourceCreditContract(2, address(0xCAFE));
    }

    function test_RegisterZeroSourceReverts() public {
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        asc.registerSourceCreditContract(2, address(0));
    }

    function test_RegisterOverwritesBinding() public {
        address second = address(0x5EC0);
        asc.registerSourceCreditContract(2, second);
        assertTrue(asc.sourceChainKey() == 2);
        assertTrue(asc.sourceContract() == second);
    }

    function test_SecondEvidenceApplies() public {
        assertTrue(_execute(_validTx()));
        bytes32 ev2 = keccak256(bytes("ev2"));
        bytes memory tx2 = _encodeTx(1, _topics(ev2, agent), abi.encode(uint256(300), uint64(block.timestamp + 5000)));
        assertTrue(asc.execute(0, SOURCE_KEY, 101, tx2, bytes32(uint256(9)), siblings, bytes32(uint256(2)), continuityRoots));
        assertTrue(controller.availableCredit(1) == 300);
    }

    function test_RenounceDisabled() public {
        vm.expectRevert(PactErrors.RenounceDisabled.selector);
        asc.renounceOwnership();
    }
}
