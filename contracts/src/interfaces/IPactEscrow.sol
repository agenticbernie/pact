// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPactEscrow {
    enum Priority { SPEED, COST }

    struct PaymentIntent {
        address sender;
        address tokenIn;
        uint256 amountIn;
        uint256 targetChainId;
        address receiver;
        address tokenOut;
        Priority priority;
        bytes32 hashLock;
        uint256 deadline;
        uint256 feePaid;
        bool isFulfilled;
    }

    event PaymentIntentCreated(
        bytes32 indexed intentId,
        address indexed sender,
        uint256 indexed targetChainId,
        address receiver,
        address tokenIn,
        uint256 amountIn,
        uint256 feePaid,
        Priority priority,
        bytes32 hashLock,
        uint256 deadline
    );

    event PaymentSettled(bytes32 indexed intentId, address indexed relayer, string secret);
    event PaymentRefunded(bytes32 indexed intentId, address indexed sender);

    function createIntent(
        address tokenIn,
        uint256 amountIn,
        uint256 targetChainId,
        address receiver,
        address tokenOut,
        Priority priority,
        bytes32 hashLock,
        uint256 deadline
    ) external payable returns (bytes32 intentId);

    function claimEscrow(bytes32 intentId, string calldata secret) external;
    function refund(bytes32 intentId) external;
}
