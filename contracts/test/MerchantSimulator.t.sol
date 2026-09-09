// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {PactErrors} from "../src/PactErrors.sol";

contract RevertingRecipient {
    receive() external payable {
        revert("recipient always reverts");
    }
}

contract MerchantSimulatorTest is Test {
    MerchantSimulator merchant;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));
    address payable recipient = payable(address(0xBEEF));

    function setUp() public {
        vm.deal(address(this), 100 ether);
        merchant = new MerchantSimulator();
        merchant.setPool(address(this));
    }

    function test_OwnerRegistersMerchant() public {
        merchant.registerMerchant(COFFEE, recipient);
        assertTrue(merchant.isMerchantActive(COFFEE));
        (address got, bool active,) = merchant.merchants(COFFEE);
        assertTrue(got == recipient);
        assertTrue(active);
    }

    function test_NonOwnerCannotRegister() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        merchant.registerMerchant(COFFEE, recipient);
    }

    function test_ZeroMerchantRejected() public {
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        merchant.registerMerchant(bytes32(0), recipient);
    }

    function test_ZeroRecipientRejected() public {
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        merchant.registerMerchant(COFFEE, payable(address(0)));
    }

    function test_DuplicateMerchantRejected() public {
        merchant.registerMerchant(COFFEE, recipient);
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        merchant.registerMerchant(COFFEE, recipient);
    }

    function test_InactiveMerchantRejected() public {
        merchant.registerMerchant(COFFEE, recipient);
        merchant.setMerchantActive(COFFEE, false);
        assertFalse(merchant.isMerchantActive(COFFEE));
        vm.expectRevert(PactErrors.MerchantInactive.selector);
        merchant.receivePayment{value: 1}(COFFEE);
    }

    function test_ReceivePaymentForwardsToRecipient() public {
        merchant.registerMerchant(COFFEE, recipient);
        uint256 before = recipient.balance;
        merchant.receivePayment{value: 100}(COFFEE);
        assertTrue(recipient.balance == before + 100);
        (,, uint256 total) = merchant.merchants(COFFEE);
        assertTrue(total == 100);
    }

    function test_NonPoolCannotReceive() public {
        merchant.registerMerchant(COFFEE, recipient);
        vm.deal(address(0xBAD), 10);
        vm.prank(address(0xBAD));
        vm.expectRevert(PactErrors.UnauthorizedCaller.selector);
        merchant.receivePayment{value: 1}(COFFEE);
    }

    function test_RevertingRecipientRevertsAll() public {
        RevertingRecipient sink = new RevertingRecipient();
        merchant.registerMerchant(COFFEE, payable(address(sink)));
        vm.expectRevert();
        merchant.receivePayment{value: 10}(COFFEE);
        (,, uint256 total) = merchant.merchants(COFFEE);
        assertTrue(total == 0);
    }

    function test_SetPoolOneTime() public {
        vm.expectRevert(PactErrors.AuthorityAlreadySet.selector);
        merchant.setPool(address(0xCAFE));
    }

    function test_RenounceDisabled() public {
        vm.expectRevert(PactErrors.RenounceDisabled.selector);
        merchant.renounceOwnership();
    }

    receive() external payable {}
}
