// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployPaymentSystem} from "./DeployPaymentSystem.s.sol";
import {PactCardController} from "../src/PactCardController.sol";
import {PactCreditPool} from "../src/PactCreditPool.sol";
import {MerchantSimulator} from "../src/MerchantSimulator.sol";
import {PactErrors} from "../src/PactErrors.sol";

contract DeployPaymentSystemTest is Test {
    DeployPaymentSystem deployer;
    bytes32 constant COFFEE = keccak256(bytes("coffee-demo"));

    function setUp() public {
        vm.deal(address(this), 100 ether);
        deployer = new DeployPaymentSystem();
    }

    function test_DeployWireFundReadback() public {
        (MerchantSimulator merchant, PactCreditPool pool, PactCardController controller) =
            deployer.deployAll(address(0xBEEF), COFFEE, address(this));
        pool.fundPool{value: 5 ether}();
        assertTrue(merchant.owner() == address(this));
        assertTrue(pool.owner() == address(this));
        assertTrue(controller.owner() == address(this));
        assertTrue(merchant.pool() == address(pool));
        assertTrue(pool.controller() == address(controller));
        assertTrue(address(pool.merchant()) == address(merchant));
        assertTrue(address(controller.pool()) == address(pool));
        assertTrue(address(controller.merchant()) == address(merchant));
        assertTrue(merchant.isMerchantActive(COFFEE));
        assertTrue(pool.availableBalance() == 5 ether);
        uint256 cardId =
            controller.createCard(address(0xA6E17), 1000, 100, uint64(block.timestamp + 1000), _allowlist());
        controller.activateCard(cardId);
        (address cardOwner, address cardAgent,,,,,,,,,) = controller.cards(cardId);
        assertTrue(cardOwner == address(this));
        assertTrue(cardAgent == address(0xA6E17));
    }

    function test_MainnetChainGuard() public {
        vm.chainId(1);
        vm.expectRevert(PactErrors.InvalidPolicy.selector);
        deployer.deployAll(address(0xBEEF), COFFEE, address(this));
    }

    function test_ZeroRecipientGuard() public {
        vm.expectRevert();
        deployer.deployAll(address(0), COFFEE, address(this));
    }

    function _allowlist() internal pure returns (bytes32[] memory list) {
        list = new bytes32[](1);
        list[0] = COFFEE;
    }
}
