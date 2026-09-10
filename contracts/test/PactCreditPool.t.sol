// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {PactErrors} from "../src/PactErrors.sol";

contract PactCreditPoolTest is Test {
    PactCreditPool pool;
    MerchantSimulator merchant;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));
    address payable recipient = payable(address(0xBEEF));

    function setUp() public {
        vm.deal(address(this), 100 ether);
        merchant = new MerchantSimulator();
        pool = new PactCreditPool(address(merchant));
        merchant.setPool(address(pool));
        pool.setController(address(this));
        merchant.registerMerchant(COFFEE, recipient);
    }

    function test_OwnerFundsPool() public {
        pool.fundPool{value: 1000}();
        assertTrue(pool.availableBalance() == 1000);
    }

    function test_NonOwnerCannotFund() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        pool.fundPool{value: 1}();
    }

    function test_DirectDepositReverts() public {
        (bool ok,) = address(pool).call{value: 1}("");
        assertFalse(ok);
        assertTrue(pool.availableBalance() == 0);
    }

    function test_ControllerSettles() public {
        pool.fundPool{value: 500}();
        uint256 before = recipient.balance;
        pool.settleNative(COFFEE, 200);
        assertTrue(recipient.balance == before + 200);
        assertTrue(pool.availableBalance() == 300);
    }

    function test_NonControllerCannotSettle() public {
        pool.fundPool{value: 500}();
        vm.prank(address(0xBAD));
        vm.expectRevert(PactErrors.UnauthorizedCaller.selector);
        pool.settleNative(COFFEE, 100);
    }

    function test_LowBalanceReverts() public {
        pool.fundPool{value: 50}();
        vm.expectRevert(PactErrors.PoolBalanceLow.selector);
        pool.settleNative(COFFEE, 51);
    }

    function test_OwnerWithdraws() public {
        pool.fundPool{value: 400}();
        address payable to = payable(address(0xCAFE));
        uint256 before = to.balance;
        pool.withdraw(to, 150);
        assertTrue(to.balance == before + 150);
        assertTrue(pool.availableBalance() == 250);
    }

    function test_NonOwnerCannotWithdraw() public {
        pool.fundPool{value: 400}();
        vm.prank(address(0xBAD));
        vm.expectRevert();
        pool.withdraw(payable(address(0xCAFE)), 10);
    }

    function test_WithdrawOverBalanceReverts() public {
        pool.fundPool{value: 10}();
        vm.expectRevert(PactErrors.PoolBalanceLow.selector);
        pool.withdraw(payable(address(0xCAFE)), 11);
    }

    function test_SetControllerOneTime() public {
        vm.expectRevert(PactErrors.AuthorityAlreadySet.selector);
        pool.setController(address(0xCAFE));
    }

    function test_RenounceDisabled() public {
        vm.expectRevert(PactErrors.RenounceDisabled.selector);
        pool.renounceOwnership();
    }

    receive() external payable {}
}
