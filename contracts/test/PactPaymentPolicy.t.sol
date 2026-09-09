// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {IPactCardController} from "../src/IPactCardController.sol";
import {PactReasons} from "../src/PactTypes.sol";
import {PactErrors} from "../src/PactErrors.sol";

contract PactPaymentPolicyTest is Test {
    PactCardController controller;
    PactCreditPool pool;
    MerchantSimulator merchant;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));
    bytes32 constant TEA = keccak256(bytes("tea-house"));
    address agent = address(0xA6E17);
    address asc = address(0xA5C);
    uint256 cardId;
    uint64 deadline;

    function setUp() public {
        vm.deal(address(this), 100 ether);
        merchant = new MerchantSimulator();
        pool = new PactCreditPool(address(merchant));
        controller = new PactCardController(address(pool), address(merchant));
        merchant.setPool(address(pool));
        pool.setController(address(controller));
        controller.setAscAuthority(asc);
        merchant.registerMerchant(COFFEE, payable(address(0xBEEF)));
        pool.fundPool{value: 10 ether}();
        cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        controller.activateCard(cardId);
        vm.prank(asc);
        controller.applyVerifiedCreditForAgent(agent, keccak256(bytes("ev")), 800, uint64(block.timestamp + 800));
        deadline = uint64(block.timestamp + 500);
    }

    function allowlist() internal pure returns (bytes32[] memory list) {
        list = new bytes32[](1);
        list[0] = COFFEE;
    }

    function payAsAgent(uint256 nonce, bytes32 m, uint256 amount, address asset, uint64 dl)
        internal
        returns (bool, bytes32)
    {
        vm.prank(agent);
        return controller.preflightPay(cardId, m, amount, asset, nonce, dl);
    }

    function doPay(uint256 nonce, bytes32 m, uint256 amount, address asset, uint64 dl) internal {
        vm.prank(agent);
        controller.pay(cardId, m, amount, asset, nonce, dl, bytes32(uint256(nonce + 1)));
    }

    function test_AllowedMirrors() public {
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 50, address(0), deadline);
        assertTrue(allowed);
        assertTrue(reason == PactReasons.OK);
    }

    function test_InactiveCard() public {
        controller.suspendCard(cardId);
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 50, address(0), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.INACTIVE_CARD);
        vm.expectRevert(PactErrors.InvalidCardStatus.selector);
        doPay(1, COFFEE, 50, address(0), deadline);
    }

    function test_WrongCaller() public {
        vm.prank(address(0xBAD));
        (bool allowed, bytes32 reason) = controller.preflightPay(cardId, COFFEE, 50, address(0), 1, deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.WRONG_CALLER);
        vm.prank(address(0xBAD));
        vm.expectRevert(PactErrors.UnauthorizedCaller.selector);
        controller.pay(cardId, COFFEE, 50, address(0), 1, deadline, bytes32(uint256(2)));
    }

    function test_MerchantNotAllowlisted() public {
        (bool allowed, bytes32 reason) = payAsAgent(1, TEA, 50, address(0), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.MERCHANT_BLOCKED);
        vm.expectRevert(PactErrors.MerchantNotAllowed.selector);
        doPay(1, TEA, 50, address(0), deadline);
    }

    function test_MerchantInactive() public {
        merchant.setMerchantActive(COFFEE, false);
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 50, address(0), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.MERCHANT_BLOCKED);
        vm.expectRevert(PactErrors.MerchantInactive.selector);
        doPay(1, COFFEE, 50, address(0), deadline);
    }

    function test_WrongAsset() public {
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 50, address(0xBAD), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.WRONG_ASSET);
        vm.expectRevert(PactErrors.InvalidAsset.selector);
        doPay(1, COFFEE, 50, address(0xBAD), deadline);
    }

    function test_ZeroAmount() public {
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 0, address(0), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.ZERO_AMOUNT);
        vm.expectRevert(PactErrors.InvalidAmount.selector);
        doPay(1, COFFEE, 0, address(0), deadline);
    }

    function test_OverTxLimit() public {
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 101, address(0), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.OVER_TX_LIMIT);
        vm.expectRevert(PactErrors.CreditExceeded.selector);
        doPay(1, COFFEE, 101, address(0), deadline);
    }

    function test_OverEffectiveCredit() public {
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 100, address(0), deadline);
        assertTrue(allowed);
        doPay(1, COFFEE, 100, address(0), deadline);
        (bool allowed2, bytes32 reason2) = payAsAgent(2, COFFEE, 100, address(0), deadline);
        assertTrue(allowed2);
        doPay(2, COFFEE, 100, address(0), deadline);
        // spent is now 200 of 800 available; a 601 payment exceeds the remainder
        doPay(3, COFFEE, 100, address(0), deadline);
        doPay(4, COFFEE, 100, address(0), deadline);
        doPay(5, COFFEE, 100, address(0), deadline);
        doPay(6, COFFEE, 100, address(0), deadline);
        doPay(7, COFFEE, 100, address(0), deadline);
        // spent 700, remaining 100; per-tx limit is 100 so 100 still fits
        (bool allowed3, bytes32 reason3) = payAsAgent(8, COFFEE, 100, address(0), deadline);
        assertTrue(allowed3);
        assertTrue(reason3 == PactReasons.OK);
        doPay(8, COFFEE, 100, address(0), deadline);
        // spent 800 == effective credit: anything further exceeds
        (bool allowed4, bytes32 reason4) = payAsAgent(9, COFFEE, 1, address(0), deadline);
        assertFalse(allowed4);
        assertTrue(reason4 == PactReasons.CREDIT_EXCEEDED);
        vm.expectRevert(PactErrors.CreditExceeded.selector);
        doPay(9, COFFEE, 1, address(0), deadline);
    }

    function test_CardExpired() public {
        vm.warp(block.timestamp + 1001);
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 50, address(0), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.CARD_EXPIRED);
        vm.expectRevert(PactErrors.CardExpired.selector);
        doPay(1, COFFEE, 50, address(0), deadline);
    }

    function test_DeadlineExpired() public {
        uint64 past = uint64(block.timestamp - 1);
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 50, address(0), past);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.DEADLINE_EXPIRED);
        vm.expectRevert(PactErrors.PaymentDeadlineExpired.selector);
        doPay(1, COFFEE, 50, address(0), past);
    }

    function test_PoolLow() public {
        PactCreditPool thin = new PactCreditPool(address(merchant));
        PactCardController thinController = new PactCardController(address(thin), address(merchant));
        thin.setController(address(thinController));
        thinController.createCard(agent, 100000, 100000, uint64(block.timestamp + 1000), allowlist());
        thinController.activateCard(1);
        thinController.setAscAuthority(asc);
        vm.prank(asc);
        thinController.applyVerifiedCreditForAgent(
            agent, keccak256(bytes("thin-ev")), 100000, uint64(block.timestamp + 1000)
        );
        vm.prank(agent);
        (bool allowed, bytes32 reason) = thinController.preflightPay(1, COFFEE, 100, address(0), 1, deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.POOL_LOW);
    }

    function test_NonceReuse() public {
        doPay(1, COFFEE, 50, address(0), deadline);
        (bool allowed, bytes32 reason) = payAsAgent(1, COFFEE, 50, address(0), deadline);
        assertFalse(allowed);
        assertTrue(reason == PactReasons.NONCE_USED);
        vm.expectRevert(PactErrors.NonceAlreadyUsed.selector);
        doPay(1, COFFEE, 50, address(0), deadline);
    }

    function test_SuccessEmitsAndIncrements() public {
        bytes32 intentHash = keccak256(bytes("intent-1"));
        vm.expectEmit(true, true, false, true);
        emit IPactCardController.PaymentSettled(cardId, COFFEE, 50, 7, intentHash);
        vm.prank(agent);
        controller.pay(cardId, COFFEE, 50, address(0), 7, deadline, intentHash);
        (,,,,,, uint256 spent,,,,) = controller.cards(cardId);
        assertTrue(spent == 50);
        assertTrue(controller.availableCredit(cardId) == 750);
    }
}
