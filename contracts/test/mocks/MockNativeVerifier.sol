// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {INativeQueryVerifier} from "@gluwa/asc-contracts/write-ability/common/INativeQueryVerifier.sol";

/// @notice Fixture-controlled stand-in for the 0xFD2 native verifier precompile.
/// Immutables are baked into runtime code, so `vm.etch` at 0xFD2 carries the
/// behavior (etched code has no storage of its own). Test-only: never a deployment.
contract MockNativeVerifier {
    bool public immutable VERIFY_RESULT;
    uint64 public immutable TX_INDEX;

    constructor(bool verifyResult_, uint64 txIndex_) {
        VERIFY_RESULT = verifyResult_;
        TX_INDEX = txIndex_;
    }

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external view returns (bool) {
        return VERIFY_RESULT;
    }

    function calculateTxIndex(INativeQueryVerifier.MerkleProof calldata) external view returns (uint64) {
        return TX_INDEX;
    }
}
