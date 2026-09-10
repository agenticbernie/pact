// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {CardStatus} from "../src/PactTypes.sol";
import {PactErrors} from "../src/PactErrors.sol";

contract PactCardLifecycleTest is Test {
    PactCardController controller;
    PactCreditPool pool;
    MerchantSimulator merchant;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));
    address agent = address(0xA6E17);

    function setUp() public {
        merchant = new MerchantSimulator();
        pool = new PactCreditPool(address(merchant));
        controller = new PactCardController(address(pool), address(merchant));
        merchant.setPool(address(pool));
        pool.setController(address(controller));
    }

    function allowlist() internal pure returns (bytes32[] memory list) {
        list = new bytes32[](1);
        list[0] = COFFEE;
    }

    function cardStatus(uint256 cardId) internal view returns (CardStatus) {
        (,,,,,,,,, CardStatus status,) = controller.cards(cardId);
        return status;
    }

    function test_CreateAndActivate() public {
        uint256 cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        assertTrue(cardId == 1);
        controller.activateCard(cardId);
        (,,,,,,,, uint64 expiresAt, CardStatus status,) = controller.cards(cardId);
        assertTrue(status == CardStatus.Active);
        assertTrue(expiresAt == uint64(block.timestamp + 1000));
        assertTrue(controller.agentActiveCard(agent) == cardId);
    }

    function test_NonOwnerCannotTransition() public {
        uint256 cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        vm.prank(address(0xBAD));
        vm.expectRevert();
        controller.activateCard(cardId);
        vm.prank(address(0xBAD));
        vm.expectRevert();
        controller.suspendCard(cardId);
    }

    function test_SuspendResume() public {
        uint256 cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        controller.activateCard(cardId);
        controller.suspendCard(cardId);
        assertTrue(cardStatus(cardId) == CardStatus.Suspended);
        controller.resumeCard(cardId);
        assertTrue(cardStatus(cardId) == CardStatus.Active);
    }

    function test_CloseIsTerminal() public {
        uint256 cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        controller.activateCard(cardId);
        controller.closeCard(cardId);
        vm.expectRevert(PactErrors.InvalidCardStatus.selector);
        controller.resumeCard(cardId);
        vm.expectRevert(PactErrors.InvalidCardStatus.selector);
        controller.suspendCard(cardId);
        vm.expectRevert(PactErrors.InvalidCardStatus.selector);
        controller.closeCard(cardId);
        assertTrue(controller.agentActiveCard(agent) == 0);
    }

    function test_ZeroAgentOrCapsRejected() public {
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        controller.createCard(address(0), 1000, 100, uint64(block.timestamp + 1000), allowlist());
        vm.expectRevert(PactErrors.InvalidAmount.selector);
        controller.createCard(agent, 0, 100, uint64(block.timestamp + 1000), allowlist());
        vm.expectRevert(PactErrors.InvalidAmount.selector);
        controller.createCard(agent, 1000, 0, uint64(block.timestamp + 1000), allowlist());
    }

    function test_PastExpiryRejected() public {
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        controller.createCard(agent, 1000, 100, uint64(block.timestamp - 1), allowlist());
    }

    function test_OneActiveCardPerAgent() public {
        controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        controller.createCard(agent, 500, 50, uint64(block.timestamp + 1000), allowlist());
    }

    function test_UpdatePolicy() public {
        uint256 cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        bytes32[] memory empty = new bytes32[](0);
        controller.updatePolicy(cardId, 2000, 200, uint64(block.timestamp + 2000), empty);
        (,,, uint256 cap,,,, uint256 limit,,,) = controller.cards(cardId);
        assertTrue(cap == 2000);
        assertTrue(limit == 200);
        assertFalse(controller.cardAllowlist(cardId, COFFEE));
    }

    function test_UpdatePolicyClosedReverts() public {
        uint256 cardId = controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
        controller.closeCard(cardId);
        vm.expectRevert(PactErrors.InvalidCardStatus.selector);
        controller.updatePolicy(cardId, 2000, 200, uint64(block.timestamp + 2000), allowlist());
    }
}
