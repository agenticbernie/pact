// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPactEscrow} from "./interfaces/IPactEscrow.sol";

/// @title PactEscrow
/// @notice Intent escrow on Avalanche Fuji. Locks `amountIn + feePaid` (native AVAX or ERC-20),
///         releases it to the Relayer on a valid `secret` preimage before the deadline, or refunds
///         100% to the sender after the deadline (docs/pact_docs.md FR-06, FR-09, FR-10).
contract PactEscrow is IPactEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants (docs/pact_docs.md §1.3, §1.4; docs/phase0_spec_lock.md §2.2)
    // ---------------------------------------------------------------------

    uint256 public constant ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;

    /// @dev $15.00 in 6-decimal USDC units.
    uint256 public constant LIGHTNING_THRESHOLD = 15_000_000;
    /// @dev $0.05 flat Lightning fee for amounts >= threshold.
    uint256 public constant LIGHTNING_FLAT_FEE = 50_000;
    /// @dev 0.30% Lightning fee for amounts < threshold.
    uint256 public constant LIGHTNING_BPS = 30;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @dev $0.005 flat Economy fee.
    uint256 public constant ECONOMY_FLAT_FEE = 5_000;

    /// @dev Default intent lifetime: 15 minutes (§1.4).
    uint256 public constant DEFAULT_DEADLINE_SECONDS = 900;
    /// @dev Tolerance for client/chain clock skew when validating the requested deadline.
    uint256 public constant DEADLINE_SKEW_TOLERANCE = 120;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error UnsupportedTargetChain(uint256 targetChainId);
    error ZeroAmount();
    error ZeroAddress();
    error InvalidDeadline(uint256 deadline);
    error HashLockAlreadyUsed(bytes32 hashLock);
    error IncorrectNativeValue(uint256 expected, uint256 actual);
    error UnexpectedNativeValue();
    error UnexpectedTokenAmountReceived(uint256 expected, uint256 actual);
    error IntentNotFound(bytes32 intentId);
    error IntentAlreadyClosed(bytes32 intentId);
    error IntentExpired(bytes32 intentId);
    error IntentNotExpired(bytes32 intentId);
    error InvalidSecret();
    error NotSender();
    error NativeTransferFailed();

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(bytes32 => PaymentIntent) private _intents;
    /// @dev Tracked separately from `isFulfilled` so a refund is never reported as a settlement.
    mapping(bytes32 => bool) private _refunded;
    mapping(bytes32 => bool) private _hashLockUsed;
    uint256 public intentNonce;

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Deterministic on-chain fee (6-decimal USDC units) per docs/pact_docs.md §1.3.
    /// @dev For native AVAX the same formula is applied to the raw wei amount. The MVP flow is USDC.
    function calculateFee(uint256 amountIn, Priority priority) public pure returns (uint256) {
        if (priority == Priority.COST) {
            return ECONOMY_FLAT_FEE;
        }
        if (amountIn >= LIGHTNING_THRESHOLD) {
            return LIGHTNING_FLAT_FEE;
        }
        return (amountIn * LIGHTNING_BPS) / BPS_DENOMINATOR;
    }

    function getIntent(bytes32 intentId) external view returns (PaymentIntent memory) {
        PaymentIntent memory intent = _intents[intentId];
        if (intent.sender == address(0)) revert IntentNotFound(intentId);
        return intent;
    }

    function isRefunded(bytes32 intentId) external view returns (bool) {
        return _refunded[intentId];
    }

    // ---------------------------------------------------------------------
    // FR-06: Escrow intent creation
    // ---------------------------------------------------------------------

    /// @inheritdoc IPactEscrow
    function createIntent(
        address tokenIn,
        uint256 amountIn,
        uint256 targetChainId,
        address receiver,
        address tokenOut,
        Priority priority,
        bytes32 hashLock,
        uint256 deadline
    ) external payable nonReentrant returns (bytes32 intentId) {
        if (targetChainId != ARBITRUM_SEPOLIA_CHAIN_ID && targetChainId != BASE_SEPOLIA_CHAIN_ID) {
            revert UnsupportedTargetChain(targetChainId);
        }
        if (amountIn == 0) revert ZeroAmount();
        if (receiver == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (deadline <= block.timestamp || deadline > block.timestamp + DEFAULT_DEADLINE_SECONDS + DEADLINE_SKEW_TOLERANCE) {
            revert InvalidDeadline(deadline);
        }
        if (_hashLockUsed[hashLock]) revert HashLockAlreadyUsed(hashLock);
        _hashLockUsed[hashLock] = true;

        uint256 feePaid = calculateFee(amountIn, priority);
        uint256 totalDeposit = amountIn + feePaid;

        intentId = keccak256(
            abi.encodePacked(
                msg.sender,
                tokenIn,
                amountIn,
                targetChainId,
                receiver,
                tokenOut,
                priority,
                hashLock,
                deadline,
                block.chainid,
                intentNonce++
            )
        );

        _intents[intentId] = PaymentIntent({
            sender: msg.sender,
            tokenIn: tokenIn,
            amountIn: amountIn,
            targetChainId: targetChainId,
            receiver: receiver,
            tokenOut: tokenOut,
            priority: priority,
            hashLock: hashLock,
            deadline: deadline,
            feePaid: feePaid,
            isFulfilled: false
        });

        if (tokenIn == address(0)) {
            if (msg.value != totalDeposit) revert IncorrectNativeValue(totalDeposit, msg.value);
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            IERC20 token = IERC20(tokenIn);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), totalDeposit);
            uint256 received = token.balanceOf(address(this)) - balanceBefore;
            if (received != totalDeposit) revert UnexpectedTokenAmountReceived(totalDeposit, received);
        }

        emit PaymentIntentCreated(
            intentId,
            msg.sender,
            targetChainId,
            receiver,
            tokenIn,
            amountIn,
            feePaid,
            priority,
            hashLock,
            deadline
        );
    }

    // ---------------------------------------------------------------------
    // FR-09: Cryptographic escrow claim
    // ---------------------------------------------------------------------

    /// @inheritdoc IPactEscrow
    /// @dev Claim is only valid up to and including `deadline`; refund only strictly after it, so the
    ///      two paths are mutually exclusive and the refund guarantee cannot be raced.
    function claimEscrow(bytes32 intentId, string calldata secret) external nonReentrant {
        PaymentIntent storage intent = _intents[intentId];
        if (intent.sender == address(0)) revert IntentNotFound(intentId);
        if (intent.isFulfilled || _refunded[intentId]) revert IntentAlreadyClosed(intentId);
        if (block.timestamp > intent.deadline) revert IntentExpired(intentId);
        if (keccak256(abi.encodePacked(secret)) != intent.hashLock) revert InvalidSecret();

        intent.isFulfilled = true;
        uint256 payout = intent.amountIn + intent.feePaid;

        _payout(intent.tokenIn, msg.sender, payout);

        emit PaymentSettled(intentId, msg.sender, secret);
    }

    // ---------------------------------------------------------------------
    // FR-10: Timeout & user refund
    // ---------------------------------------------------------------------

    /// @inheritdoc IPactEscrow
    function refund(bytes32 intentId) external nonReentrant {
        PaymentIntent storage intent = _intents[intentId];
        if (intent.sender == address(0)) revert IntentNotFound(intentId);
        if (msg.sender != intent.sender) revert NotSender();
        if (intent.isFulfilled || _refunded[intentId]) revert IntentAlreadyClosed(intentId);
        if (block.timestamp <= intent.deadline) revert IntentNotExpired(intentId);

        _refunded[intentId] = true;
        uint256 total = intent.amountIn + intent.feePaid;

        _payout(intent.tokenIn, intent.sender, total);

        emit PaymentRefunded(intentId, intent.sender);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _payout(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
