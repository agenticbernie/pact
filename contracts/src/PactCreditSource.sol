// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PactErrors} from "./PactErrors.sol";

/// @notice Deliberately narrow source-testnet evidence emitter. Records a
/// `CreditGranted` event for later Attestcoin proving. No transfers, no
/// repayment logic, no credit semantics beyond the recorded fields.
contract PactCreditSource is Ownable, ReentrancyGuard {
    event CreditGranted(
        bytes32 indexed evidenceId, address indexed beneficiary, uint256 creditAmount, uint64 expiresAt
    );

    mapping(bytes32 => bool) public usedEvidence;

    constructor() Ownable(msg.sender) {}

    function renounceOwnership() public override onlyOwner {
        revert PactErrors.RenounceDisabled();
    }

    function recordCredit(bytes32 evidenceId, address beneficiary, uint256 creditAmount, uint64 expiresAt)
        external
        onlyOwner
    {
        if (usedEvidence[evidenceId]) {
            revert PactErrors.InvalidPolicy();
        }
        if (beneficiary == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        if (creditAmount == 0) {
            revert PactErrors.InvalidAmount();
        }
        if (expiresAt <= block.timestamp) {
            revert PactErrors.InvalidPolicy();
        }
        usedEvidence[evidenceId] = true;
        emit CreditGranted(evidenceId, beneficiary, creditAmount, expiresAt);
    }
}
