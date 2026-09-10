// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Shared custom errors for the Pact payment contracts.
library PactErrors {
    error UnauthorizedCaller();
    error InvalidCardStatus();
    error InvalidAmount();
    error InvalidAsset();
    error MerchantNotAllowed();
    error CreditExceeded();
    error CardExpired();
    error PaymentDeadlineExpired();
    error NonceAlreadyUsed();
    error PoolBalanceLow();
    error MerchantInactive();
    error EvidenceAlreadyApplied();
    error InvalidPolicy();
    error UnknownAgent();
    error AuthorityAlreadySet();
    error RenounceDisabled();
}
