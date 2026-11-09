// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PactBatchDispatcher} from "../src/PactBatchDispatcher.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract PactBatchDispatcherTest is Test {
    PactBatchDispatcher d;
    MockUSDC usdc;
    address relayer = makeAddr("relayer");
    address m1 = makeAddr("m1");
    address m2 = makeAddr("m2");
    address m3 = makeAddr("m3");

    function setUp() public {
        d = new PactBatchDispatcher();
        usdc = new MockUSDC();
        usdc.transfer(relayer, 1_000e6);
        vm.prank(relayer);
        usdc.approve(address(d), type(uint256).max);
    }

    function _arrays() internal view returns (bytes32[] memory ids, address[] memory rs, uint256[] memory as_) {
        ids = new bytes32[](3);
        rs = new address[](3);
        as_ = new uint256[](3);
        ids[0] = keccak256("1");
        ids[1] = keccak256("2");
        ids[2] = keccak256("3");
        rs[0] = m1;
        rs[1] = m2;
        rs[2] = m3;
        as_[0] = 3_500_000;
        as_[1] = 12_000_000;
        as_[2] = 1;
    }

    function test_BatchPaysAllExactly() public {
        (bytes32[] memory ids, address[] memory rs, uint256[] memory as_) = _arrays();
        vm.prank(relayer);
        d.batchTransfer(address(usdc), ids, rs, as_);
        assertEq(usdc.balanceOf(m1), 3_500_000);
        assertEq(usdc.balanceOf(m2), 12_000_000);
        assertEq(usdc.balanceOf(m3), 1);
        assertEq(usdc.balanceOf(relayer), 1_000e6 - 15_500_001);
        assertEq(usdc.balanceOf(address(d)), 0);
    }

    function test_RevertsLengthMismatchAndEmpty() public {
        (bytes32[] memory ids, address[] memory rs, uint256[] memory as_) = _arrays();
        bytes32[] memory shortIds = new bytes32[](2);
        vm.prank(relayer);
        vm.expectRevert(PactBatchDispatcher.LengthMismatch.selector);
        d.batchTransfer(address(usdc), shortIds, rs, as_);

        vm.prank(relayer);
        vm.expectRevert(PactBatchDispatcher.EmptyBatch.selector);
        d.batchTransfer(address(usdc), new bytes32[](0), new address[](0), new uint256[](0));
        ids;
    }

    function test_AtomicRevertIfOneTransferFails() public {
        (bytes32[] memory ids, address[] memory rs, uint256[] memory as_) = _arrays();
        as_[2] = 2_000e6; // exceeds relayer balance
        vm.prank(relayer);
        vm.expectRevert();
        d.batchTransfer(address(usdc), ids, rs, as_);
        assertEq(usdc.balanceOf(m1), 0); // nothing partially paid
    }

    function test_CannotPullFromOthers() public {
        (bytes32[] memory ids, address[] memory rs, uint256[] memory as_) = _arrays();
        address attacker = makeAddr("attacker");
        vm.prank(attacker); // attacker has no balance/allowance; relayer's approval is irrelevant
        vm.expectRevert();
        d.batchTransfer(address(usdc), ids, rs, as_);
    }
}
