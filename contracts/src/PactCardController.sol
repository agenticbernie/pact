// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Card, CardStatus, PactReasons} from "./PactTypes.sol";
import {PactErrors} from "./PactErrors.sol";
import {IPactCardController} from "./IPactCardController.sol";
import {IPactCreditPool} from "./IPactCreditPool.sol";
import {IMerchantSimulator} from "./IMerchantSimulator.sol";

/// @notice Owns card state and spending policy. The agent signer can only move
/// funds through `pay` (added in the payment task); the pool never accepts
/// agent calls directly. Expiry is derived from timestamps, never stored.
contract PactCardController is IPactCardController, Ownable, ReentrancyGuard {
    address public constant NATIVE_ASSET = address(0);
    uint32 public constant POLICY_VERSION = 1;

    IPactCreditPool public immutable pool;
    IMerchantSimulator public immutable merchant;

    mapping(uint256 => Card) public cards;
    mapping(uint256 => mapping(bytes32 => bool)) public cardAllowlist;
    mapping(uint256 => bytes32[]) private _cardMerchants;
    mapping(uint256 => mapping(uint256 => bool)) public usedNonces;
    mapping(bytes32 => bool) public usedEvidence;
    mapping(address => uint256) public agentActiveCard;
    uint256 public nextCardId = 1;
    address public ascAuthority;

    constructor(address pool_, address merchant_) Ownable(msg.sender) {
        if (pool_ == address(0) || merchant_ == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        pool = IPactCreditPool(pool_);
        merchant = IMerchantSimulator(merchant_);
    }

    function renounceOwnership() public override onlyOwner {
        revert PactErrors.RenounceDisabled();
    }

    function createCard(
        address agent,
        uint256 ownerConfiguredCap,
        uint256 perTransactionLimit,
        uint64 expiresAt,
        bytes32[] calldata allowlistedMerchants
    ) external returns (uint256) {
        if (agent == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        if (ownerConfiguredCap == 0 || perTransactionLimit == 0) {
            revert PactErrors.InvalidAmount();
        }
        if (expiresAt <= block.timestamp) {
            revert PactErrors.InvalidPolicy();
        }
        if (agentActiveCard[agent] != 0) {
            revert PactErrors.InvalidPolicy();
        }
        uint256 cardId = nextCardId++;
        cards[cardId] = Card({
            owner: msg.sender,
            agent: agent,
            asset: NATIVE_ASSET,
            ownerConfiguredCap: ownerConfiguredCap,
            verifiedCredit: 0,
            verifiedCreditExpiry: 0,
            spent: 0,
            perTransactionLimit: perTransactionLimit,
            expiresAt: expiresAt,
            status: CardStatus.Issued,
            policyVersion: POLICY_VERSION
        });
        _setAllowlist(cardId, allowlistedMerchants);
        agentActiveCard[agent] = cardId;
        emit IPactCardController.CardCreated(
            cardId, msg.sender, agent, ownerConfiguredCap, perTransactionLimit, expiresAt
        );
        return cardId;
    }

    function activateCard(uint256 cardId) external {
        _onlyCardOwner(cardId);
        if (cards[cardId].status != CardStatus.Issued) {
            revert PactErrors.InvalidCardStatus();
        }
        cards[cardId].status = CardStatus.Active;
        emit IPactCardController.CardActivated(cardId);
    }

    function suspendCard(uint256 cardId) external {
        _onlyCardOwner(cardId);
        if (cards[cardId].status != CardStatus.Active) {
            revert PactErrors.InvalidCardStatus();
        }
        cards[cardId].status = CardStatus.Suspended;
        emit IPactCardController.CardSuspended(cardId);
    }

    function resumeCard(uint256 cardId) external {
        _onlyCardOwner(cardId);
        if (cards[cardId].status != CardStatus.Suspended) {
            revert PactErrors.InvalidCardStatus();
        }
        cards[cardId].status = CardStatus.Active;
        emit IPactCardController.CardResumed(cardId);
    }

    function closeCard(uint256 cardId) external {
        _onlyCardOwner(cardId);
        if (cards[cardId].status == CardStatus.Closed) {
            revert PactErrors.InvalidCardStatus();
        }
        address agent = cards[cardId].agent;
        cards[cardId].status = CardStatus.Closed;
        if (agentActiveCard[agent] == cardId) {
            agentActiveCard[agent] = 0;
        }
        emit IPactCardController.CardClosed(cardId);
    }

    function updatePolicy(
        uint256 cardId,
        uint256 ownerConfiguredCap,
        uint256 perTransactionLimit,
        uint64 expiresAt,
        bytes32[] calldata allowlistedMerchants
    ) external {
        _onlyCardOwner(cardId);
        if (cards[cardId].status == CardStatus.Closed) {
            revert PactErrors.InvalidCardStatus();
        }
        if (ownerConfiguredCap == 0 || perTransactionLimit == 0) {
            revert PactErrors.InvalidAmount();
        }
        if (expiresAt <= block.timestamp) {
            revert PactErrors.InvalidPolicy();
        }
        cards[cardId].ownerConfiguredCap = ownerConfiguredCap;
        cards[cardId].perTransactionLimit = perTransactionLimit;
        cards[cardId].expiresAt = expiresAt;
        _setAllowlist(cardId, allowlistedMerchants);
        emit IPactCardController.PolicyUpdated(cardId, ownerConfiguredCap, perTransactionLimit, expiresAt);
    }

    function setAscAuthority(address ascAuthority_) external onlyOwner {
        if (ascAuthority != address(0)) {
            revert PactErrors.AuthorityAlreadySet();
        }
        if (ascAuthority_ == address(0)) {
            revert PactErrors.InvalidPolicy();
        }
        ascAuthority = ascAuthority_;
    }

    /// @notice ASC-only verified-credit application. A subsequent valid evidence
    /// record for the same agent replaces amount and expiry (overwrite-by-new-ID).
    function applyVerifiedCreditForAgent(address agent, bytes32 evidenceId, uint256 amount, uint64 expiresAt) external {
        if (msg.sender != ascAuthority) {
            revert PactErrors.UnauthorizedCaller();
        }
        uint256 cardId = agentActiveCard[agent];
        if (cardId == 0) {
            revert PactErrors.UnknownAgent();
        }
        if (cards[cardId].status == CardStatus.Closed) {
            revert PactErrors.InvalidCardStatus();
        }
        if (usedEvidence[evidenceId]) {
            revert PactErrors.EvidenceAlreadyApplied();
        }
        if (amount == 0) {
            revert PactErrors.InvalidAmount();
        }
        if (expiresAt <= block.timestamp) {
            revert PactErrors.InvalidPolicy();
        }
        usedEvidence[evidenceId] = true;
        cards[cardId].verifiedCredit = amount;
        cards[cardId].verifiedCreditExpiry = expiresAt;
        emit IPactCardController.CreditVerified(cardId, agent, evidenceId, amount, expiresAt);
    }

    /// @notice Spendable amount: min(owner cap, verified credit) minus spent,
    /// or zero once the card or the evidence has expired.
    function availableCredit(uint256 cardId) public view returns (uint256) {
        Card storage card = cards[cardId];
        if (card.owner == address(0)) {
            return 0;
        }
        if (block.timestamp >= card.expiresAt) {
            return 0;
        }
        if (block.timestamp >= card.verifiedCreditExpiry) {
            return 0;
        }
        uint256 limit = _effectiveLimit(card);
        return limit > card.spent ? limit - card.spent : 0;
    }

    function isCardExpired(uint256 cardId) public view returns (bool) {
        Card storage card = cards[cardId];
        return card.owner == address(0) || block.timestamp >= card.expiresAt;
    }

    /// @notice Single settlement entrypoint for the assigned agent. Checks run in
    /// fixed order; the nonce is marked before the external pool call so a
    /// same-transaction reentry through the merchant cannot replay. Any revert
    /// rolls the whole transaction back: spent, balances, totals, and the mark.
    function pay(
        uint256 cardId,
        bytes32 merchantId,
        uint256 amount,
        address asset,
        uint256 nonce,
        uint64 deadline,
        bytes32 intentHash
    ) external nonReentrant {
        Card storage card = cards[cardId];
        if (card.owner == address(0) || msg.sender != card.agent) {
            revert PactErrors.UnauthorizedCaller();
        }
        if (card.status != CardStatus.Active) {
            revert PactErrors.InvalidCardStatus();
        }
        if (block.timestamp >= card.expiresAt) {
            revert PactErrors.CardExpired();
        }
        if (block.timestamp >= deadline) {
            revert PactErrors.PaymentDeadlineExpired();
        }
        if (asset != card.asset) {
            revert PactErrors.InvalidAsset();
        }
        if (!cardAllowlist[cardId][merchantId]) {
            revert PactErrors.MerchantNotAllowed();
        }
        if (!merchant.isMerchantActive(merchantId)) {
            revert PactErrors.MerchantInactive();
        }
        if (amount == 0) {
            revert PactErrors.InvalidAmount();
        }
        if (amount > card.perTransactionLimit) {
            revert PactErrors.CreditExceeded();
        }
        if (card.spent + amount > _effectiveLimit(card)) {
            revert PactErrors.CreditExceeded();
        }
        if (usedNonces[cardId][nonce]) {
            revert PactErrors.NonceAlreadyUsed();
        }
        if (pool.availableBalance() < amount) {
            revert PactErrors.PoolBalanceLow();
        }
        usedNonces[cardId][nonce] = true;
        pool.settleNative(merchantId, amount);
        card.spent += amount;
        emit IPactCardController.PaymentSettled(cardId, merchantId, amount, nonce, intentHash);
    }

    /// @notice Read-only mirror of `pay` for fast off-chain feedback. Same check
    /// order and same outcomes; the caller check reads `msg.sender`, so callers
    /// static-call with `from` set to the agent address. Never authoritative.
    function preflightPay(
        uint256 cardId,
        bytes32 merchantId,
        uint256 amount,
        address asset,
        uint256 nonce,
        uint64 deadline
    ) external view returns (bool allowed, bytes32 reason) {
        Card storage card = cards[cardId];
        if (card.owner == address(0) || msg.sender != card.agent) {
            return (false, PactReasons.WRONG_CALLER);
        }
        if (card.status != CardStatus.Active) {
            return (false, PactReasons.INACTIVE_CARD);
        }
        if (block.timestamp >= card.expiresAt) {
            return (false, PactReasons.CARD_EXPIRED);
        }
        if (block.timestamp >= deadline) {
            return (false, PactReasons.DEADLINE_EXPIRED);
        }
        if (asset != card.asset) {
            return (false, PactReasons.WRONG_ASSET);
        }
        if (!cardAllowlist[cardId][merchantId]) {
            return (false, PactReasons.MERCHANT_BLOCKED);
        }
        if (!merchant.isMerchantActive(merchantId)) {
            return (false, PactReasons.MERCHANT_BLOCKED);
        }
        if (amount == 0) {
            return (false, PactReasons.ZERO_AMOUNT);
        }
        if (amount > card.perTransactionLimit) {
            return (false, PactReasons.OVER_TX_LIMIT);
        }
        if (card.spent + amount > _effectiveLimit(card)) {
            return (false, PactReasons.CREDIT_EXCEEDED);
        }
        if (usedNonces[cardId][nonce]) {
            return (false, PactReasons.NONCE_USED);
        }
        if (pool.availableBalance() < amount) {
            return (false, PactReasons.POOL_LOW);
        }
        return (true, PactReasons.OK);
    }

    function _effectiveLimit(Card storage card) internal view returns (uint256) {
        return card.ownerConfiguredCap < card.verifiedCredit ? card.ownerConfiguredCap : card.verifiedCredit;
    }

    function _onlyCardOwner(uint256 cardId) internal view {
        if (cards[cardId].owner != msg.sender) {
            revert PactErrors.UnauthorizedCaller();
        }
    }

    function _setAllowlist(uint256 cardId, bytes32[] calldata allowlistedMerchants) internal {
        bytes32[] storage current = _cardMerchants[cardId];
        for (uint256 i = 0; i < current.length; i++) {
            cardAllowlist[cardId][current[i]] = false;
        }
        delete _cardMerchants[cardId];
        for (uint256 i = 0; i < allowlistedMerchants.length; i++) {
            cardAllowlist[cardId][allowlistedMerchants[i]] = true;
            _cardMerchants[cardId].push(allowlistedMerchants[i]);
        }
    }
}
