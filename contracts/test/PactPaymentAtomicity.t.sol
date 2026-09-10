// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";

contract RevertingMerchantRecipient {
    receive() external payable {
        revert("merchant recipient always reverts");
    }
}

contract PactPaymentAtomicityTest is Test {
    PactCardController controller;
    PactCreditPool pool;
    MerchantSimulator merchant;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));
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
        RevertingMerchantRecipient sink = new RevertingMerchantRecipient();
        merchant.registerMerchant(COFFEE, payable(address(sink)));
        pool.fundPool{value: 10 ether}();
        bytes32[] memory list = new bytes32[](1);
        list[0] = COFFEE;
        cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), list);
        controller.activateCard(cardId);
        vm.prank(asc);
        controller.applyVerifiedCreditForAgent(agent, keccak256(bytes("ev")), 800, uint64(block.timestamp + 800));
        deadline = uint64(block.timestamp + 500);
    }

    function snapshot()
        internal
        view
        returns (uint256 spent, uint256 poolBalance, uint256 merchantTotal, bool nonceUsed)
    {
        (,,,,,, spent,,,,) = controller.cards(cardId);
        poolBalance = pool.availableBalance();
        (,, merchantTotal) = merchant.merchants(COFFEE);
        nonceUsed = controller.usedNonces(cardId, 1);
    }

    function test_RevertingMerchantPreservesAllState() public {
        (uint256 spentBefore, uint256 poolBefore, uint256 totalBefore, bool nonceBefore) = snapshot();
        vm.prank(agent);
        vm.expectRevert();
        controller.pay(cardId, COFFEE, 50, address(0), 1, deadline, bytes32(uint256(1)));
        (uint256 spentAfter, uint256 poolAfter, uint256 totalAfter, bool nonceAfter) = snapshot();
        assertTrue(spentAfter == spentBefore);
        assertTrue(poolAfter == poolBefore);
        assertTrue(totalAfter == totalBefore);
        assertTrue(nonceAfter == nonceBefore);
        assertTrue(controller.availableCredit(cardId) == 800);
    }
}
