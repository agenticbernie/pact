// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";

contract PayHandler is Test {
    PactCardController controller;
    uint256 cardId;
    bytes32 merchantId;
    address agent;
    uint64 deadline;
    uint256 public ghostSpent;
    uint256 public nextNonce = 1;

    constructor(
        PactCardController controller_,
        uint256 cardId_,
        bytes32 merchantId_,
        address agent_,
        uint64 deadline_
    ) {
        controller = controller_;
        cardId = cardId_;
        merchantId = merchantId_;
        agent = agent_;
        deadline = deadline_;
    }

    function payOnce(uint256 amount) external {
        amount = bound(amount, 1, 50);
        uint256 nonce = nextNonce;
        nextNonce += 1;
        vm.prank(agent);
        controller.pay(cardId, merchantId, amount, address(0), nonce, deadline, bytes32(uint256(nonce)));
        ghostSpent += amount;
    }

    function payReplay(uint256 nonceSeed) external {
        if (nextNonce == 1) {
            return;
        }
        uint256 used = (nonceSeed % (nextNonce - 1)) + 1;
        vm.prank(agent);
        vm.expectRevert();
        controller.pay(cardId, merchantId, 1, address(0), used, deadline, bytes32(uint256(used)));
    }
}

contract PactPaymentInvariantTest is Test {
    PactCardController controller;
    PactCreditPool pool;
    MerchantSimulator merchant;
    PayHandler handler;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));
    address agent = address(0xA6E17);
    address asc = address(0xA5C);
    uint256 cardId;

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
        bytes32[] memory list = new bytes32[](1);
        list[0] = COFFEE;
        cardId = controller.createCard(agent, 1 ether, 50, uint64(block.timestamp + 100000), list);
        controller.activateCard(cardId);
        vm.prank(asc);
        controller.applyVerifiedCreditForAgent(agent, keccak256(bytes("ev")), 1 ether, uint64(block.timestamp + 50000));
        handler = new PayHandler(controller, cardId, COFFEE, agent, uint64(block.timestamp + 10000));
        targetContract(address(handler));
    }

    function invariant_SpentMatchesGhost() public view {
        (,,,,,, uint256 spent,,,,) = controller.cards(cardId);
        assertTrue(spent == handler.ghostSpent());
    }

    function invariant_SpentWithinEffectiveLimit() public view {
        (,,, uint256 cap, uint256 credit,,,,,,) = controller.cards(cardId);
        (,,,,,, uint256 spent,,,,) = controller.cards(cardId);
        uint256 effective = cap < credit ? cap : credit;
        assertTrue(spent <= effective);
    }

    function invariant_UsedNoncesStayUsed() public view {
        uint256 used = handler.nextNonce() - 1;
        uint256 checked = used > 20 ? 20 : used;
        for (uint256 n = 1; n <= checked; n++) {
            assertTrue(controller.usedNonces(cardId, n));
        }
    }
}
