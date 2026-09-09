// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PactCreditASC} from "../../src/PactCreditASC.sol";

/// @notice Exposes the evidence-processing core for deterministic unit tests
/// without a verifier. Mirrors the official example harness pattern.
contract PactCreditASCHarness is PactCreditASC {
    constructor(address controller) PactCreditASC(controller) {}

    function exposedProcessEvidence(bytes memory encodedTransaction) external {
        _processCreditEvidence(encodedTransaction);
    }
}
