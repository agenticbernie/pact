// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCreditSource} from "../src/PactCreditSource.sol";
import {PactErrors} from "../src/PactErrors.sol";

contract PactCreditSourceTest is Test {
    PactCreditSource source;
    bytes32 constant EVIDENCE = keccak256(bytes("evidence-1"));
    address beneficiary = address(0xBE9E);

    function setUp() public {
        source = new PactCreditSource();
    }

    function test_OwnerEmitsCredit() public {
        vm.expectEmit(true, true, false, true);
        emit PactCreditSource.CreditGranted(EVIDENCE, beneficiary, 500, uint64(block.timestamp + 500));
        source.recordCredit(EVIDENCE, beneficiary, 500, uint64(block.timestamp + 500));
        assertTrue(source.usedEvidence(EVIDENCE));
    }

    function test_NonOwnerCannotEmit() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        source.recordCredit(EVIDENCE, beneficiary, 500, uint64(block.timestamp + 500));
    }

    function test_DuplicateEvidenceRejected() public {
        source.recordCredit(EVIDENCE, beneficiary, 500, uint64(block.timestamp + 500));
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        source.recordCredit(EVIDENCE, beneficiary, 600, uint64(block.timestamp + 600));
    }

    function test_ZeroBeneficiaryRejected() public {
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        source.recordCredit(EVIDENCE, address(0), 500, uint64(block.timestamp + 500));
    }

    function test_ZeroAmountRejected() public {
        vm.expectRevert(PactErrors.InvalidAmount.selector);
        source.recordCredit(EVIDENCE, beneficiary, 0, uint64(block.timestamp + 500));
    }

    function test_PastExpiryRejected() public {
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        source.recordCredit(EVIDENCE, beneficiary, 500, uint64(block.timestamp - 1));
    }

    function test_RenounceDisabled() public {
        vm.expectRevert(PactErrors.RenounceDisabled.selector);
        source.renounceOwnership();
    }
}
