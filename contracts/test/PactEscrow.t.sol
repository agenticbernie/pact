// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PactEscrow} from "../src/PactEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IPactEscrow} from "../src/interfaces/IPactEscrow.sol";

contract PactEscrowTest is Test {
    PactEscrow escrow;
    MockUSDC usdc;

    address payer = makeAddr("payer");
    address relayer = makeAddr("relayer");
    address merchant = makeAddr("merchant");
    address stranger = makeAddr("stranger");

    string constant SECRET = "pact-demo-secret";
    bytes32 hashLock = keccak256(abi.encodePacked(SECRET));
    uint256 constant ARB = 421614;
    uint256 constant BASE = 84532;

    event PaymentIntentCreated(
        bytes32 indexed intentId,
        address indexed sender,
        uint256 indexed targetChainId,
        address receiver,
        address tokenIn,
        uint256 amountIn,
        uint256 feePaid,
        IPactEscrow.Priority priority,
        bytes32 hashLock,
        uint256 deadline
    );
    event PaymentSettled(bytes32 indexed intentId, address indexed relayer, string secret);
    event PaymentRefunded(bytes32 indexed intentId, address indexed sender);

    function setUp() public {
        escrow = new PactEscrow();
        usdc = new MockUSDC();
        vm.startPrank(payer);
        usdc.faucet();
        usdc.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
        vm.deal(payer, 100 ether);
    }

    function _create(uint256 amount, IPactEscrow.Priority p, bytes32 lock) internal returns (bytes32) {
        vm.prank(payer);
        return escrow.createIntent(address(usdc), amount, ARB, merchant, address(0xA11CE), p, lock, block.timestamp + 900);
    }

    // ---- MockUSDC ----

    function test_MockUSDC_decimalsAndFaucet() public {
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.balanceOf(address(this)), 1_000_000 * 1e6);
        assertEq(usdc.balanceOf(payer), 500 * 1e6);
        vm.prank(stranger);
        usdc.faucet();
        assertEq(usdc.balanceOf(stranger), 500 * 1e6);
    }

    // ---- Fees ----

    function test_Fee_lightningBelowThreshold() public view {
        assertEq(escrow.calculateFee(3_500_000, IPactEscrow.Priority.SPEED), 10_500); // 0.30%
    }

    function test_Fee_lightningAtAndAboveThreshold() public view {
        assertEq(escrow.calculateFee(15_000_000, IPactEscrow.Priority.SPEED), 50_000);
        assertEq(escrow.calculateFee(200_000_000, IPactEscrow.Priority.SPEED), 50_000);
        // just below threshold: 14.999999 * 0.3% = 44_999
        assertEq(escrow.calculateFee(14_999_999, IPactEscrow.Priority.SPEED), 44_999);
    }

    function test_Fee_economyFlat() public view {
        assertEq(escrow.calculateFee(1, IPactEscrow.Priority.COST), 5_000);
        assertEq(escrow.calculateFee(500_000_000, IPactEscrow.Priority.COST), 5_000);
    }

    // ---- Create ----

    function test_CreateIntent_locksFundsAndEmits() public {
        uint256 deadline = block.timestamp + 900;
        uint256 fee = 10_500;
        bytes32 expectedId = keccak256(
            abi.encodePacked(
                payer, address(usdc), uint256(3_500_000), ARB, merchant, address(0xA11CE),
                IPactEscrow.Priority.SPEED, hashLock, deadline, block.chainid, uint256(0)
            )
        );

        vm.expectEmit(true, true, true, true, address(escrow));
        emit PaymentIntentCreated(
            expectedId, payer, ARB, merchant, address(usdc), 3_500_000, fee, IPactEscrow.Priority.SPEED, hashLock, deadline
        );
        bytes32 id = _create(3_500_000, IPactEscrow.Priority.SPEED, hashLock);

        assertEq(id, expectedId);
        assertEq(usdc.balanceOf(address(escrow)), 3_500_000 + fee);
        assertEq(usdc.balanceOf(payer), 500 * 1e6 - 3_500_000 - fee);

        IPactEscrow.PaymentIntent memory it = escrow.getIntent(id);
        assertEq(it.sender, payer);
        assertEq(it.amountIn, 3_500_000);
        assertEq(it.feePaid, fee);
        assertEq(it.hashLock, hashLock);
        assertEq(it.deadline, deadline);
        assertFalse(it.isFulfilled);
    }

    function test_CreateIntent_baseSepoliaSupported() public {
        vm.prank(payer);
        escrow.createIntent(address(usdc), 1e6, BASE, merchant, address(1), IPactEscrow.Priority.COST, hashLock, block.timestamp + 900);
    }

    function test_CreateIntent_revertsUnsupportedChain() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.UnsupportedTargetChain.selector, 1));
        escrow.createIntent(address(usdc), 1e6, 1, merchant, address(1), IPactEscrow.Priority.SPEED, hashLock, block.timestamp + 900);
    }

    function test_CreateIntent_revertsZeroAmountAndAddresses() public {
        vm.startPrank(payer);
        vm.expectRevert(PactEscrow.ZeroAmount.selector);
        escrow.createIntent(address(usdc), 0, ARB, merchant, address(1), IPactEscrow.Priority.SPEED, hashLock, block.timestamp + 900);
        vm.expectRevert(PactEscrow.ZeroAddress.selector);
        escrow.createIntent(address(usdc), 1e6, ARB, address(0), address(1), IPactEscrow.Priority.SPEED, hashLock, block.timestamp + 900);
        vm.expectRevert(PactEscrow.ZeroAddress.selector);
        escrow.createIntent(address(usdc), 1e6, ARB, merchant, address(0), IPactEscrow.Priority.SPEED, hashLock, block.timestamp + 900);
        vm.stopPrank();
    }

    function test_CreateIntent_revertsBadDeadline() public {
        vm.startPrank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.InvalidDeadline.selector, block.timestamp));
        escrow.createIntent(address(usdc), 1e6, ARB, merchant, address(1), IPactEscrow.Priority.SPEED, hashLock, block.timestamp);
        uint256 tooFar = block.timestamp + 900 + 121;
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.InvalidDeadline.selector, tooFar));
        escrow.createIntent(address(usdc), 1e6, ARB, merchant, address(1), IPactEscrow.Priority.SPEED, hashLock, tooFar);
        vm.stopPrank();
    }

    function test_CreateIntent_revertsDuplicateHashLock() public {
        _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.HashLockAlreadyUsed.selector, hashLock));
        escrow.createIntent(address(usdc), 1e6, ARB, merchant, address(1), IPactEscrow.Priority.SPEED, hashLock, block.timestamp + 900);
    }

    function test_CreateIntent_revertsNativeValueWithToken() public {
        vm.prank(payer);
        vm.expectRevert(PactEscrow.UnexpectedNativeValue.selector);
        escrow.createIntent{value: 1}(address(usdc), 1e6, ARB, merchant, address(1), IPactEscrow.Priority.SPEED, hashLock, block.timestamp + 900);
    }

    function test_CreateIntent_revertsInsufficientAllowance() public {
        address poor = makeAddr("poor");
        vm.prank(poor);
        usdc.faucet();
        vm.prank(poor);
        vm.expectRevert();
        escrow.createIntent(address(usdc), 1e6, ARB, merchant, address(1), IPactEscrow.Priority.SPEED, hashLock, block.timestamp + 900);
    }

    function test_CreateIntent_uniqueIdsPerNonce() public {
        bytes32 a = _create(1e6, IPactEscrow.Priority.SPEED, keccak256("a"));
        bytes32 b = _create(1e6, IPactEscrow.Priority.SPEED, keccak256("b"));
        assertTrue(a != b);
        assertEq(escrow.intentNonce(), 2);
    }

    // ---- Claim ----

    function test_Claim_paysRelayerAmountPlusFee() public {
        bytes32 id = _create(3_500_000, IPactEscrow.Priority.SPEED, hashLock);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit PaymentSettled(id, relayer, SECRET);
        vm.prank(relayer);
        escrow.claimEscrow(id, SECRET);

        assertEq(usdc.balanceOf(relayer), 3_510_500);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertTrue(escrow.getIntent(id).isFulfilled);
        assertFalse(escrow.isRefunded(id));
    }

    function test_Claim_revertsWrongSecret() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.prank(relayer);
        vm.expectRevert(PactEscrow.InvalidSecret.selector);
        escrow.claimEscrow(id, "wrong");
        assertEq(usdc.balanceOf(address(escrow)), 1e6 + 3_000);
    }

    function test_Claim_revertsDoubleClaim() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.prank(relayer);
        escrow.claimEscrow(id, SECRET);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentAlreadyClosed.selector, id));
        escrow.claimEscrow(id, SECRET);
    }

    function test_Claim_revertsUnknownIntent() public {
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentNotFound.selector, bytes32(uint256(1))));
        escrow.claimEscrow(bytes32(uint256(1)), SECRET);
    }

    function test_Claim_allowedAtDeadlineRevertedAfter() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        uint256 deadline = escrow.getIntent(id).deadline;

        vm.warp(deadline); // inclusive
        uint256 snap = vm.snapshotState();
        vm.prank(relayer);
        escrow.claimEscrow(id, SECRET);
        vm.revertToState(snap);

        vm.warp(deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentExpired.selector, id));
        escrow.claimEscrow(id, SECRET);
    }

    // ---- Refund ----

    function test_Refund_afterDeadlineReturns100Percent() public {
        uint256 before = usdc.balanceOf(payer);
        bytes32 id = _create(3_500_000, IPactEscrow.Priority.SPEED, hashLock);
        vm.warp(block.timestamp + 901);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit PaymentRefunded(id, payer);
        vm.prank(payer);
        escrow.refund(id);

        assertEq(usdc.balanceOf(payer), before);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertTrue(escrow.isRefunded(id));
        assertFalse(escrow.getIntent(id).isFulfilled);
    }

    function test_Refund_revertsBeforeDeadlineAndAtDeadline() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentNotExpired.selector, id));
        escrow.refund(id);

        vm.warp(escrow.getIntent(id).deadline);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentNotExpired.selector, id));
        escrow.refund(id);
    }

    function test_Refund_revertsNonSender() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.warp(block.timestamp + 901);
        vm.prank(stranger);
        vm.expectRevert(PactEscrow.NotSender.selector);
        escrow.refund(id);
    }

    function test_Refund_revertsDoubleRefund() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.warp(block.timestamp + 901);
        vm.prank(payer);
        escrow.refund(id);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentAlreadyClosed.selector, id));
        escrow.refund(id);
    }

    function test_Refund_revertsAfterClaim() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.prank(relayer);
        escrow.claimEscrow(id, SECRET);
        vm.warp(block.timestamp + 901);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentAlreadyClosed.selector, id));
        escrow.refund(id);
    }

    function test_Claim_revertsAfterRefund() public {
        bytes32 id = _create(1e6, IPactEscrow.Priority.SPEED, hashLock);
        vm.warp(block.timestamp + 901);
        vm.prank(payer);
        escrow.refund(id);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IntentAlreadyClosed.selector, id));
        escrow.claimEscrow(id, SECRET);
    }

    // ---- Native AVAX ----

    function _createNative(uint256 amount, uint256 value, bytes32 lock) internal returns (bytes32) {
        vm.prank(payer);
        return escrow.createIntent{value: value}(
            address(0), amount, ARB, merchant, address(1), IPactEscrow.Priority.COST, lock, block.timestamp + 900
        );
    }

    function test_Native_createClaim() public {
        uint256 amount = 1 ether;
        uint256 fee = escrow.calculateFee(amount, IPactEscrow.Priority.COST);
        bytes32 id = _createNative(amount, amount + fee, hashLock);
        assertEq(address(escrow).balance, amount + fee);

        vm.prank(relayer);
        escrow.claimEscrow(id, SECRET);
        assertEq(relayer.balance, amount + fee);
        assertEq(address(escrow).balance, 0);
    }

    function test_Native_refund() public {
        uint256 amount = 1 ether;
        uint256 fee = escrow.calculateFee(amount, IPactEscrow.Priority.COST);
        uint256 before = payer.balance;
        bytes32 id = _createNative(amount, amount + fee, hashLock);
        vm.warp(block.timestamp + 901);
        vm.prank(payer);
        escrow.refund(id);
        assertEq(payer.balance, before);
    }

    function test_Native_revertsWrongValue() public {
        uint256 amount = 1 ether;
        uint256 fee = escrow.calculateFee(amount, IPactEscrow.Priority.COST);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PactEscrow.IncorrectNativeValue.selector, amount + fee, amount));
        escrow.createIntent{value: amount}(
            address(0), amount, ARB, merchant, address(1), IPactEscrow.Priority.COST, hashLock, block.timestamp + 900
        );
    }

    // ---- Fuzz ----

    function testFuzz_FeeNeverExceedsBound(uint96 amount) public view {
        uint256 a = amount;
        uint256 fSpeed = escrow.calculateFee(a, IPactEscrow.Priority.SPEED);
        if (a >= 15_000_000) assertEq(fSpeed, 50_000);
        else assertLe(fSpeed, 45_000);
        assertEq(escrow.calculateFee(a, IPactEscrow.Priority.COST), 5_000);
    }

    function testFuzz_ClaimOrRefundConservesFunds(uint32 amountRaw, bool speed, bool doClaim) public {
        uint256 amount = bound(uint256(amountRaw), 1, 400 * 1e6);
        IPactEscrow.Priority p = speed ? IPactEscrow.Priority.SPEED : IPactEscrow.Priority.COST;
        uint256 fee = escrow.calculateFee(amount, p);

        // Fund payer with enough for any fuzzed amount.
        usdc.transfer(payer, 1_000 * 1e6);
        uint256 payerBefore = usdc.balanceOf(payer);

        bytes32 id = _create(amount, p, hashLock);
        assertEq(usdc.balanceOf(address(escrow)), amount + fee);

        if (doClaim) {
            vm.prank(relayer);
            escrow.claimEscrow(id, SECRET);
            assertEq(usdc.balanceOf(relayer), amount + fee);
            assertEq(usdc.balanceOf(payer), payerBefore - amount - fee);
        } else {
            vm.warp(block.timestamp + 901);
            vm.prank(payer);
            escrow.refund(id);
            assertEq(usdc.balanceOf(payer), payerBefore);
            assertEq(usdc.balanceOf(relayer), 0);
        }
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
