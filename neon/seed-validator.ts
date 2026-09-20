/**
 * Bounded-seed payload validator (Arc lane, Neon target).
 *
 * Pure, side-effect-free gate for the exact two-row seed (card `1` +
 * `intent-req-1`). Recomputes the canonical intent hash with the CURRENT
 * implementation — never copies a hash — and checks every identity,
 * binding, provenance, and lane rule before any INSERT. Returns the hash
 * for the insert on success.
 *
 * Merchant rule (honest limitation): the on-chain allowlist holds a raw
 * bytes32 with no logical preimage, so the validator requires a non-empty
 * lane merchant ID and recomputes over it (disclosed), but cannot prove
 * allowlist membership — that verdict belongs to the on-chain static
 * preflight at H2 time.
 */
import { canonicalIntentHash } from "../packages/domain/src/canonical-hash.ts";

export type SeedCardInput = {
  card_id: string;
  controller_address: string;
  owner_address: string;
  agent_id: string;
  asset: string;
  chain_id: number;
  status: string;
  owner_configured_cap: string;
  per_transaction_limit: string;
  verified_credit: string;
  verified_credit_expires_at: string;
  spent: string;
  expires_at: string;
  policy_version: number;
  allowlist_hash: string;
  source_block: number;
  source_tx_hash: string;
};

export type SeedIntentInput = {
  intent_id: string;
  card_id: string;
  agent_id: string;
  merchant_id: string;
  amount_base_units: string;
  asset: string;
  chain_id: number;
  purpose: string;
  confidence: number;
  provider: string;
  model: string;
  policy_version: number;
  created_at: string;
  expires_at: string;
  request_id: string;
  idempotency_key: string;
};

export type SeedValidation =
  | { ok: true; canonicalHash: string }
  | { ok: false; reason: string };

const EVM = /^0x[0-9a-f]{40}$/;
const TX = /^0x[0-9a-f]{64}$/;
const UINT = /^(0|[1-9][0-9]*)$/;

const ARC_CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
const ARC_OWNER = "0xb8bdcc633cd8e67250358d807918f99dc0c14d52";
const ARC_AGENT = "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682";
const ARC_CARD_CREATION_BLOCK = 62948913;
const ARC_CARD_CREATION_TX = "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb";

export function validateSeedPayloads(input: {
  card: SeedCardInput;
  intent: SeedIntentInput;
  nowMs?: number;
}): SeedValidation {
  const now = input.nowMs ?? Date.now();
  const { card, intent } = input;
  const no = (reason: string): SeedValidation => ({ ok: false, reason });

  // Lane pair (Arc only; CTC disguise rejected here, not at the DB).
  if (card.chain_id !== 5042002 || card.asset !== "arc-testnet-usdc") return no("card-lane");
  if (intent.chain_id !== 5042002 || intent.asset !== "arc-testnet-usdc") return no("intent-lane");
  // Identity formats.
  if (card.card_id !== "1") return no("card-id");
  if (!EVM.test(card.controller_address.toLowerCase())) return no("controller-format");
  if (card.controller_address.toLowerCase() !== ARC_CONTROLLER) return no("controller-binding");
  if (!EVM.test(card.owner_address.toLowerCase())) return no("owner-format");
  if (!EVM.test(card.agent_id.toLowerCase())) return no("agent-format");
  if (!EVM.test(intent.agent_id.toLowerCase())) return no("intent-agent-format");
  // Role bindings (verified lane facts: deployer-owner, burner-agent).
  if (card.owner_address.toLowerCase() !== ARC_OWNER) return no("owner-binding");
  if (card.agent_id.toLowerCase() !== ARC_AGENT) return no("agent-binding");
  if (!TX.test(card.source_tx_hash.toLowerCase())) return no("source-tx-format");
  if (!TX.test(card.allowlist_hash.toLowerCase())) return no("allowlist-format");
  if (!Number.isInteger(card.source_block) || card.source_block < 0) return no("source-block");
  // Creation-event anchor (verified lane facts, same class as controller).
  if (card.source_block !== ARC_CARD_CREATION_BLOCK) return no("source-block");
  if (card.source_tx_hash.toLowerCase() !== ARC_CARD_CREATION_TX) return no("source-tx");
  // Numeric fields.
  for (const [name, value] of [
    ["cap", card.owner_configured_cap],
    ["limit", card.per_transaction_limit],
    ["credit", card.verified_credit],
    ["spent", card.spent],
    ["amount", intent.amount_base_units],
  ] as Array<[string, string]>) {
    if (!UINT.test(value)) return no(`numeric-${name}`);
  }
  if (!Number.isInteger(card.policy_version) || card.policy_version < 0) return no("policy-version");
  // Cross bindings.
  if (intent.card_id !== card.card_id) return no("intent-card-link");
  if (intent.agent_id.toLowerCase() !== card.agent_id.toLowerCase()) return no("agent-binding");
  if (intent.policy_version !== card.policy_version) return no("policy-binding");
  if (card.status !== "ACTIVE" && card.status !== "ISSUED") return no("card-status");
  // Expiry: card unexpired, intent window inside [now, card expiry].
  const cardExp = Date.parse(card.expires_at);
  const intentExp = Date.parse(intent.expires_at);
  const intentCreated = Date.parse(intent.created_at);
  if (!Number.isFinite(cardExp) || cardExp <= now) return no("card-expired");
  if (!Number.isFinite(intentExp) || intentExp <= now) return no("intent-expired");
  if (!Number.isFinite(intentCreated) || intentExp <= intentCreated) return no("intent-window");
  if (intentExp > cardExp) return no("intent-beyond-card");
  // Lane merchant disclosure (no preimage proof possible).
  if (intent.merchant_id.trim().length === 0) return no("merchant-empty");
  if (intent.purpose.length === 0 || intent.purpose.length > 160) return no("purpose");
  if (!(intent.confidence >= 0 && intent.confidence <= 1)) return no("confidence");
  if (intent.provider !== "openai" || intent.model !== "gpt-5.6-luna") return no("provider-pin");
  if (intent.intent_id !== "intent-req-1") return no("intent-id");
  if (intent.idempotency_key.length === 0 || intent.request_id.length === 0) return no("idempotency");
  // Canonical hash recomputed (throws on schema violation → invalid).
  let canonicalHash: string;
  try {
    canonicalHash = canonicalIntentHash({
      cardId: intent.card_id,
      agentId: intent.agent_id,
      merchantId: intent.merchant_id,
      amountBaseUnits: intent.amount_base_units,
      asset: intent.asset,
      purpose: intent.purpose,
      expiresAt: intent.expires_at,
      policyVersion: intent.policy_version,
    });
  } catch {
    return no("hash-recompute");
  }
  return { ok: true, canonicalHash };
}
