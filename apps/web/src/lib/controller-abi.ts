/**
 * Contract fragments the console needs for its write paths.
 *
 * Source of truth: `packages/pact-sdk/src/abi.ts`, itself generated from the
 * deployed Arc artifacts. The browser bundle does not import the workspace SDK
 * (the console is self-contained by design — see `../api/types.ts` for the same
 * arrangement on the read side), so the fragments are transcribed here and
 * `<lib>/controller-abi.test.ts` asserts each one derives the identical selector
 * as the SDK entry, so the two copies cannot drift silently.
 *
 * Only what the console actually calls or decodes is listed; the generated ABI
 * stays the reference for everything else.
 */

export const CARD_CONTROLLER_ABI = [
  // --- writes -------------------------------------------------------------
  "function createCard(address agent, uint256 ownerConfiguredCap, uint256 perTransactionLimit, uint64 expiresAt, bytes32[] allowlistedMerchants) returns (uint256)",
  "function activateCard(uint256 cardId)",
  "function pay(uint256 cardId, bytes32 merchantId, uint256 amount, address asset, uint256 nonce, uint64 deadline, bytes32 intentHash)",
  // --- reads --------------------------------------------------------------
  "function NATIVE_ASSET() view returns (address)",
  "function POLICY_VERSION() view returns (uint32)",
  "function nextCardId() view returns (uint256)",
  "function owner() view returns (address)",
  "function agentActiveCard(address agent) view returns (uint256)",
  "function isCardExpired(uint256 cardId) view returns (bool)",
  "function availableCredit(uint256 cardId) view returns (uint256)",
  "function cardAllowlist(uint256 cardId, bytes32 merchantId) view returns (bool)",
  "function preflightPay(uint256 cardId, bytes32 merchantId, uint256 amount, address asset, uint256 nonce, uint64 deadline) view returns (bool allowed, bytes32 reason)",
  "function cards(uint256 cardId) view returns (address owner, address agent, address asset, uint256 ownerConfiguredCap, uint256 verifiedCredit, uint64 verifiedCreditExpiry, uint256 spent, uint256 perTransactionLimit, uint64 expiresAt, uint8 status, uint32 policyVersion)",
  // --- events -------------------------------------------------------------
  "event CardCreated(uint256 indexed cardId, address indexed owner, address indexed agent, uint256 ownerConfiguredCap, uint256 perTransactionLimit, uint64 expiresAt)",
  "event CardActivated(uint256 indexed cardId)",
  "event PaymentSettled(uint256 indexed cardId, bytes32 indexed merchantId, uint256 amount, uint256 nonce, bytes32 intentHash)",
  // --- errors -------------------------------------------------------------
  // Revert reasons (`contracts/src/PactErrors.sol` plus the inherited
  // OpenZeppelin ones). Without these fragments ethers cannot decode revert
  // data, and every failure — including `createCard` rejecting an agent that
  // already has an active card — surfaces as the useless
  // "execution reverted (unknown custom error)". Transcribed from
  // `packages/pact-sdk/src/abi.ts`, same as the fragments above.
  "error InvalidPolicy()",
  "error InvalidAmount()",
  "error InvalidCardStatus()",
  "error InvalidAsset()",
  "error MerchantNotAllowed()",
  "error CreditExceeded()",
  "error CardExpired()",
  "error PaymentDeadlineExpired()",
  "error NonceAlreadyUsed()",
  "error PoolBalanceLow()",
  "error MerchantInactive()",
  "error EvidenceAlreadyApplied()",
  "error UnknownAgent()",
  "error UnauthorizedCaller()",
  "error AuthorityAlreadySet()",
  "error RenounceDisabled()",
  "error OwnableUnauthorizedAccount(address account)",
  "error OwnableInvalidOwner(address owner)",
  "error ReentrancyGuardReentrantCall()",
] as const;

export const CREDIT_POOL_ABI = [
  "function availableBalance() view returns (uint256)",
  "function controller() view returns (address)",
] as const;

export const MERCHANT_SIMULATOR_ABI = [
  "function isMerchantActive(bytes32 merchantId) view returns (bool)",
] as const;
