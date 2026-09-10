// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPactCardController {
    event CardCreated(
        uint256 indexed cardId,
        address indexed owner,
        address indexed agent,
        uint256 ownerConfiguredCap,
        uint256 perTransactionLimit,
        uint64 expiresAt
    );
    event CardActivated(uint256 indexed cardId);
    event CardSuspended(uint256 indexed cardId);
    event CardResumed(uint256 indexed cardId);
    event CardClosed(uint256 indexed cardId);
    event PolicyUpdated(
        uint256 indexed cardId, uint256 ownerConfiguredCap, uint256 perTransactionLimit, uint64 expiresAt
    );
    event CreditVerified(
        uint256 indexed cardId, address indexed agent, bytes32 indexed evidenceId, uint256 amount, uint64 expiresAt
    );
    event PaymentSettled(
        uint256 indexed cardId, bytes32 indexed merchantId, uint256 amount, uint256 nonce, bytes32 intentHash
    );

    function createCard(
        address agent,
        uint256 ownerConfiguredCap,
        uint256 perTransactionLimit,
        uint64 expiresAt,
        bytes32[] calldata allowlistedMerchants
    ) external returns (uint256);

    function activateCard(uint256 cardId) external;
    function suspendCard(uint256 cardId) external;
    function resumeCard(uint256 cardId) external;
    function closeCard(uint256 cardId) external;

    function updatePolicy(
        uint256 cardId,
        uint256 ownerConfiguredCap,
        uint256 perTransactionLimit,
        uint64 expiresAt,
        bytes32[] calldata allowlistedMerchants
    ) external;

    function setAscAuthority(address ascAuthority) external;

    function applyVerifiedCreditForAgent(address agent, bytes32 evidenceId, uint256 amount, uint64 expiresAt) external;

    function pay(
        uint256 cardId,
        bytes32 merchantId,
        uint256 amount,
        address asset,
        uint256 nonce,
        uint64 deadline,
        bytes32 intentHash
    ) external;

    function preflightPay(
        uint256 cardId,
        bytes32 merchantId,
        uint256 amount,
        address asset,
        uint256 nonce,
        uint64 deadline
    ) external view returns (bool allowed, bytes32 reason);

    function availableCredit(uint256 cardId) external view returns (uint256);

    function isCardExpired(uint256 cardId) external view returns (bool);
}
