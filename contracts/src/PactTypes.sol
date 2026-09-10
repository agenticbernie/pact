// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

enum CardStatus {
    Issued,
    Active,
    Suspended,
    Closed
}

struct Card {
    address owner;
    address agent;
    address asset;
    uint256 ownerConfiguredCap;
    uint256 verifiedCredit;
    uint64 verifiedCreditExpiry;
    uint256 spent;
    uint256 perTransactionLimit;
    uint64 expiresAt;
    CardStatus status;
    uint32 policyVersion;
}

/// @notice Stable preflight reason codes shared by `preflightPay` and `pay`.
library PactReasons {
    bytes32 constant OK = bytes32("OK");
    bytes32 constant INACTIVE_CARD = bytes32("INACTIVE_CARD");
    bytes32 constant WRONG_CALLER = bytes32("WRONG_CALLER");
    bytes32 constant MERCHANT_BLOCKED = bytes32("MERCHANT_BLOCKED");
    bytes32 constant WRONG_ASSET = bytes32("WRONG_ASSET");
    bytes32 constant ZERO_AMOUNT = bytes32("ZERO_AMOUNT");
    bytes32 constant OVER_TX_LIMIT = bytes32("OVER_TX_LIMIT");
    bytes32 constant CREDIT_EXCEEDED = bytes32("CREDIT_EXCEEDED");
    bytes32 constant CARD_EXPIRED = bytes32("CARD_EXPIRED");
    bytes32 constant DEADLINE_EXPIRED = bytes32("DEADLINE_EXPIRED");
    bytes32 constant POOL_LOW = bytes32("POOL_LOW");
    bytes32 constant NONCE_USED = bytes32("NONCE_USED");
}
