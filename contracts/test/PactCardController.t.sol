// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {PactErrors} from "../src/PactErrors.sol";

contract PactCardControllerTest is Test {
    PactCardController controller;
    PactCreditPool pool;
    MerchantSimulator merchant;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));
    bytes32 constant EVIDENCE = keccak256(bytes("evidence-1"));
    address agent = address(0xA6E17);
    address asc = address(0xA5C);

    function setUp() public {
        merchant = new MerchantSimulator();
        pool = new PactCreditPool(address(merchant));
        controller = new PactCardController(address(pool), address(merchant));
        merchant.setPool(address(pool));
        pool.setController(address(controller));
        controller.setAscAuthority(asc);
    }

    function allowlist() internal pure returns (bytes32[] memory list) {
        list = new bytes32[](1);
        list[0] = COFFEE;
    }

    function makeCard() internal returns (uint256) {
        return controller.createCard(agent, 1000, 100, uint64(block.timestamp + 1000), allowlist());
    }

    function test_ApplyCreditAscOnly() public {
        makeCard();
        vm.prank(address(0xBAD));
        vm.expectRevert(PactErrors.UnauthorizedCaller.selector);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 500, uint64(block.timestamp + 500));
    }

    function test_ApplyCreditUpdatesState() public {
        uint256 cardId = makeCard();
        vm.prank(asc);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 500, uint64(block.timestamp + 500));
        (,,,, uint256 credit, uint64 creditExpiry,,,,,) = controller.cards(cardId);
        assertTrue(credit == 500);
        assertTrue(creditExpiry == uint64(block.timestamp + 500));
        assertTrue(controller.availableCredit(cardId) == 500);
    }

    function test_ApplyCreditZeroAmountOrPastExpiry() public {
        makeCard();
        vm.startPrank(asc);
        vm.expectRevert(PactErrors.InvalidAmount.selector);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 0, uint64(block.timestamp + 500));
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 500, uint64(block.timestamp - 1));
        vm.stopPrank();
    }

    function test_EvidenceReplayRejected() public {
        makeCard();
        vm.startPrank(asc);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 500, uint64(block.timestamp + 500));
        vm.expectRevert(PactErrors.EvidenceAlreadyApplied.selector);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 600, uint64(block.timestamp + 600));
        vm.stopPrank();
    }

    function test_UnknownAgentRejected() public {
        vm.prank(asc);
        vm.expectRevert(PactErrors.UnknownAgent.selector);
        controller.applyVerifiedCreditForAgent(address(0xDEAD), EVIDENCE, 500, uint64(block.timestamp + 500));
    }

    function test_NewerEvidenceReplaces() public {
        uint256 cardId = makeCard();
        bytes32 second = keccak256(bytes("evidence-2"));
        vm.startPrank(asc);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 500, uint64(block.timestamp + 500));
        controller.applyVerifiedCreditForAgent(agent, second, 900, uint64(block.timestamp + 900));
        vm.stopPrank();
        (,,,, uint256 credit,,,,,,) = controller.cards(cardId);
        assertTrue(credit == 900);
    }

    function test_SetAscAuthorityOneTime() public {
        vm.expectRevert(PactErrors.AuthorityAlreadySet.selector);
        controller.setAscAuthority(address(0xCAFE));
    }

    function test_EffectiveCreditIsMin() public {
        uint256 cardId = makeCard();
        vm.prank(asc);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 5000, uint64(block.timestamp + 500));
        assertTrue(controller.availableCredit(cardId) == 1000);
    }

    function test_ExpiredEvidenceYieldsZero() public {
        uint256 cardId = makeCard();
        vm.prank(asc);
        controller.applyVerifiedCreditForAgent(agent, EVIDENCE, 500, uint64(block.timestamp + 500));
        vm.warp(block.timestamp + 501);
        assertTrue(controller.availableCredit(cardId) == 0);
    }

    function test_RenounceDisabled() public {
        vm.expectRevert(PactErrors.RenounceDisabled.selector);
        controller.renounceOwnership();
    }
}
