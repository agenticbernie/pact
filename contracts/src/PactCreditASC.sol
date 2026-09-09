// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ASCBase} from "@gluwa/asc-contracts/readability/ASCBase.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/common/EvmV1Decoder.sol";
import {PactErrors} from "./PactErrors.sol";
import {IPactCardController} from "./IPactCardController.sol";

/// @notice Attestcoin evidence verifier for Pact credit. Proves a Sepolia
/// `CreditGranted` event through the native verifier precompile (0xFD2) and
/// applies it to the beneficiary's card. Evidence verifier only: never moves
/// settlement funds. Single supported action: CREDIT_GRANTED.
contract PactCreditASC is Ownable, ReentrancyGuard, ASCBase {
    uint8 public constant CREDIT_GRANTED = 0;
    bytes32 public constant CREDIT_GRANTED_SIGNATURE =
        keccak256("CreditGranted(bytes32,address,uint256,uint64)");

    error InvalidAction(uint8 action);
    error InvalidProof();
    error UnregisteredSource();

    uint64 public sourceChainKey;
    address public sourceContract;
    IPactCardController public immutable controller;

    mapping(bytes32 => bool) public processedEvidenceIds;

    event SourceCreditContractRegistered(uint64 indexed chainKey, address indexed sourceContract);
    event CreditEvidenceApplied(bytes32 indexed evidenceId, address indexed agent, uint256 amount);

    constructor(address controller_) Ownable(msg.sender) {
        if (controller_ == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        controller = IPactCardController(controller_);
    }

    function renounceOwnership() public override onlyOwner {
        revert PactErrors.RenounceDisabled();
    }

    /// @notice Bind the one source emitter this ASC trusts. Owner-only; the
    /// worker serves only the registered chain (chain binding residual: the
    /// base `execute` cannot observe chainKey in-handler, so registration plus
    /// worker allowlist plus hybrid manifest carry the binding).
    function registerSourceCreditContract(uint64 sourceChainKey_, address sourceContract_)
        external
        onlyOwner
    {
        if (sourceContract_ == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        sourceChainKey = sourceChainKey_;
        sourceContract = sourceContract_;
        emit SourceCreditContractRegistered(sourceChainKey_, sourceContract_);
    }

    function _processAndEmitEvent(uint8 action, bytes32, bytes memory encodedTransaction)
        internal
        override
    {
        if (action != CREDIT_GRANTED) {
            revert InvalidAction(action);
        }
        _processCreditEvidence(encodedTransaction);
    }

    /// @notice Decode, validate, dedupe, and apply one credit evidence event.
    /// Separated for unit-level testing through the harness contract.
    function _processCreditEvidence(bytes memory encodedTransaction) internal {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(txType)) {
            revert InvalidProof();
        }
        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) {
            revert InvalidProof();
        }
        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, CREDIT_GRANTED_SIGNATURE);
        if (logs.length == 0) {
            revert InvalidProof();
        }
        EvmV1Decoder.LogEntry memory log = logs[0];
        if (sourceContract == address(0) || log.address_ != sourceContract) {
            revert UnregisteredSource();
        }
        if (log.topics.length != 3) {
            revert InvalidProof();
        }
        bytes32 evidenceId = log.topics[1];
        address beneficiary = address(uint160(uint256(log.topics[2])));
        if (log.data.length != 64) {
            revert InvalidProof();
        }
        (uint256 amount, uint64 expiresAt) = abi.decode(log.data, (uint256, uint64));
        if (beneficiary == address(0) || amount == 0) {
            revert InvalidProof();
        }
        if (expiresAt <= block.timestamp) {
            revert InvalidProof();
        }
        if (processedEvidenceIds[evidenceId]) {
            revert PactErrors.EvidenceAlreadyApplied();
        }
        processedEvidenceIds[evidenceId] = true;
        controller.applyVerifiedCreditForAgent(beneficiary, evidenceId, amount, expiresAt);
        emit CreditEvidenceApplied(evidenceId, beneficiary, amount);
    }
}
