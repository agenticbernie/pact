/**
 * H2 Arc owner-agent scoping (supplement §3–§5, amended §9).
 *
 * Allows `owner != agent` in the Arc lane through an explicit,
 * provenance-anchored `OwnerAuthorization`. Single-wallet (`owner == agent`)
 * remains valid without any authorization; the legacy CTC lane never
 * consults the registry and keeps byte-identical behavior.
 *
 * Trust anchor (non-synthetic): production authorization is derived from the
 * seeded card row (recorded from on-chain `CardCreated` events) and
 * cross-checked against that row AND the lane constants on every read —
 * never from a pinned intent id. Static fixture registries live only under
 * `_shared/test/arc-owner-fixtures.ts` (regression/migration scope).
 * Nothing here moves funds, signs, or widens the static-call surface.
 * Deno-safe: no Node imports.
 */
import type { AgentIntent } from "../../../packages/domain/src/types.ts";
import type { CardStore } from "./card-store.ts";
import type { IntentStoreAdapter } from "./intent-store.ts";
import type { LaneConfig } from "./lane-config.ts";

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;

export type OwnerAuthorization = {
  intentId: string;
  ownerAddress: string;
  agentId: string;
  cardId: string;
  chainId: number;
  asset: string;
  controller: string;
  issuedBy: string;
  policyVersion: number;
  allowlistHash: string;
  sourceBlock: number;
  sourceTxHash: string;
  expiresAtMs: number;
};

export type OwnerAuthorizationRegistry = {
  findAuthorization(input: {
    intentId: string;
    agentId: string;
    chainId: number;
  }): Promise<OwnerAuthorization | null>;
};

export type OwnerAuthCheck =
  | { ok: true }
  | { ok: false; code: "CARD_NOT_ELIGIBLE" | "PREFLIGHT_DECLINED" };

export type H2ValidationRecord = {
  principal: string;
  owner: string;
  agent: string;
  sessionWallet: string;
  cardId: string;
  controller: string;
  chainId: number;
  asset: string;
  ownerAuthorization:
    | { mode: "single-wallet" }
    | {
      mode: "authorized";
      issuedBy: string;
      sourceBlock: number;
      sourceTxHash: string;
      expiresAtMs: number;
    };
  policyVersion: number;
  allowlistHash: string;
  decision: "would_settle" | "declined";
  reasonCode?: string;
  evaluatedAt: string;
  intentExpiresAt: string;
  sourceBlock: number;
  sourceTxHash: string;
  intentHash: string;
};

function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && EVM_ADDRESS.test(value.toLowerCase());
}

function isTxHash(value: unknown): value is string {
  return typeof value === "string" && TX_HASH.test(value.toLowerCase());
}

/**
 * Fail-closed owner-authorization validation. Missing/malformed/expired maps
 * to PREFLIGHT_DECLINED (unusable); every binding mismatch maps to
 * CARD_NOT_ELIGIBLE. Never throws for lane data; throws nothing at all.
 */
export function validateOwnerAuthorization(
  auth: unknown,
  ctx: {
    sessionWallet: string;
    intent: { intentId: string; agentId: string; cardId: string; policyVersion: number };
    card: {
      card_id: string;
      controller_address: string;
      owner_address: string;
      agent_id: string;
      asset: string;
      chain_id: number;
      policy_version: number;
      allowlist_hash: string;
      source_block: number;
      source_tx_hash: string;
    };
    lane: LaneConfig;
  },
  nowMs: number = Date.now(),
): OwnerAuthCheck {
  const declined: OwnerAuthCheck = { ok: false, code: "PREFLIGHT_DECLINED" };
  const ineligible: OwnerAuthCheck = { ok: false, code: "CARD_NOT_ELIGIBLE" };
  if (auth === null || typeof auth !== "object") return declined;
  const candidate = auth as Record<string, unknown>;
  if (
    typeof candidate["intentId"] !== "string" ||
    candidate["intentId"].length === 0 ||
    !isEvmAddress(candidate["ownerAddress"]) ||
    !isEvmAddress(candidate["agentId"]) ||
    typeof candidate["cardId"] !== "string" ||
    candidate["cardId"].length === 0 ||
    !Number.isInteger(candidate["chainId"]) ||
    typeof candidate["asset"] !== "string" ||
    !isEvmAddress(candidate["controller"]) ||
    !isEvmAddress(candidate["issuedBy"]) ||
    !Number.isInteger(candidate["policyVersion"]) ||
    (candidate["policyVersion"] as number) < 0 ||
    !isTxHash(candidate["allowlistHash"]) ||
    !Number.isInteger(candidate["sourceBlock"]) ||
    (candidate["sourceBlock"] as number) < 0 ||
    !isTxHash(candidate["sourceTxHash"]) ||
    !Number.isFinite(candidate["expiresAtMs"])
  ) {
    return declined;
  }
  if ((candidate["expiresAtMs"] as number) <= nowMs) return declined;
  const owner = String(candidate["ownerAddress"]).toLowerCase();
  const agent = String(candidate["agentId"]).toLowerCase();
  const issuedBy = String(candidate["issuedBy"]).toLowerCase();
  // Agent/session binding: the authorization must name the session wallet
  // as the agent, and the intent must agree.
  if (agent !== ctx.sessionWallet.toLowerCase()) return ineligible;
  if (agent !== ctx.intent.agentId.toLowerCase()) return ineligible;
  // Owner agreement: registry owner must equal the seeded card owner.
  if (owner !== ctx.card.owner_address.toLowerCase()) return ineligible;
  // Card/intent scope.
  if (String(candidate["cardId"]) !== ctx.intent.cardId) return ineligible;
  if (String(candidate["cardId"]) !== ctx.card.card_id) return ineligible;
  if (String(candidate["intentId"]) !== ctx.intent.intentId) return ineligible;
  // Lane binding: chain, asset, controller travel together.
  if (candidate["chainId"] !== ctx.lane.chainId) return ineligible;
  if (candidate["asset"] !== ctx.lane.asset) return ineligible;
  if (ctx.lane.controller !== undefined) {
    if (String(candidate["controller"]).toLowerCase() !== ctx.lane.controller.toLowerCase()) {
      return ineligible;
    }
    if (ctx.card.controller_address.toLowerCase() !== ctx.lane.controller.toLowerCase()) {
      return ineligible;
    }
  }
  // Provenance anchor: the creation event must equal the card row.
  if (candidate["sourceBlock"] !== ctx.card.source_block) return ineligible;
  if (String(candidate["sourceTxHash"]).toLowerCase() !== ctx.card.source_tx_hash.toLowerCase()) {
    return ineligible;
  }
  // Policy/allowlist binding.
  if (candidate["policyVersion"] !== ctx.card.policy_version) return ineligible;
  if (candidate["policyVersion"] !== ctx.intent.policyVersion) return ineligible;
  if (String(candidate["allowlistHash"]).toLowerCase() !== ctx.card.allowlist_hash.toLowerCase()) {
    return ineligible;
  }
  // Anti-self-grant: only the card owner may issue, never the agent.
  if (issuedBy !== owner) return ineligible;
  if (issuedBy === agent) return ineligible;
  return { ok: true };
}

export function buildH2ValidationRecord(input: {
  sessionWallet: string;
  intent: {
    intentId: string;
    agentId: string;
    cardId: string;
    merchantId: string;
    amountBaseUnits: string;
    asset: string;
    policyVersion: number;
    intentHash: string;
    expiresAt: string;
  };
  card: {
    card_id: string;
    controller_address: string;
    owner_address: string;
    agent_id: string;
    asset: string;
    chain_id: number;
    policy_version: number;
    allowlist_hash: string;
    source_block: number;
    source_tx_hash: string;
  };
  lane: LaneConfig;
  authorization: OwnerAuthorization | null;
  decision: "would_settle" | "declined";
  reasonCode?: string;
  evaluatedAt: string;
}): H2ValidationRecord {
  const wallet = input.sessionWallet.toLowerCase();
  const owner = input.card.owner_address.toLowerCase();
  const singleWallet = owner === wallet && input.card.agent_id.toLowerCase() === wallet;
  return {
    principal: wallet,
    owner,
    agent: input.card.agent_id.toLowerCase(),
    sessionWallet: wallet,
    cardId: input.card.card_id,
    controller: input.card.controller_address.toLowerCase(),
    chainId: input.lane.chainId,
    asset: input.lane.asset,
    ownerAuthorization:
      singleWallet || input.authorization === null
        ? { mode: "single-wallet" }
        : {
          mode: "authorized",
          issuedBy: String(input.authorization.issuedBy).toLowerCase(),
          sourceBlock: input.authorization.sourceBlock,
          sourceTxHash: String(input.authorization.sourceTxHash).toLowerCase(),
          expiresAtMs: input.authorization.expiresAtMs,
        },
    policyVersion: input.card.policy_version,
    allowlistHash: String(input.card.allowlist_hash).toLowerCase(),
    decision: input.decision,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    evaluatedAt: input.evaluatedAt,
    intentExpiresAt: input.intent.expiresAt,
    sourceBlock: input.card.source_block,
    sourceTxHash: String(input.card.source_tx_hash).toLowerCase(),
    intentHash: String(input.intent.intentHash).toLowerCase(),
  };
}

export function staticRegistry(entries: OwnerAuthorization[]): OwnerAuthorizationRegistry {
  return {
    findAuthorization: async (input) =>
      entries.find(
        (entry) =>
          entry.intentId === input.intentId &&
          entry.agentId.toLowerCase() === input.agentId.toLowerCase() &&
          entry.chainId === input.chainId,
      ) ?? null,
  };
}

/**
 * Dynamic (production) registry: authorization facts are derived from the
 * authoritative persistence rows on every lookup —
 * `intent → card → owner → agent → policy` — never from a pinned intent id.
 * The card row itself is the trust anchor: it was recorded from the on-chain
 * `CardCreated` event (owner, agent, controller, policy version, raw merchant
 * allowlist bytes32, creation block/tx) and `validateOwnerAuthorization`
 * still cross-checks every derived fact against the seeded row and the lane
 * constants on every read. A fresh card needs no registry change.
 */
export type CardBackedOwnerRegistryInput = {
  /** Agent-scoped intent discovery (no owner scoping): see IntentStoreAdapter. */
  intents: Pick<IntentStoreAdapter, "findAgentScoped">;
  /** Card reads; `getById` scopes by (cardId, agentId) and returns the row. */
  cards: Pick<CardStore, "getById">;
  lane: LaneConfig;
};

export function createCardBackedOwnerRegistry(
  input: CardBackedOwnerRegistryInput,
): OwnerAuthorizationRegistry {
  return {
    findAuthorization: async (lookup): Promise<OwnerAuthorization | null> => {
      if (lookup.chainId !== input.lane.chainId) return null;
      if (!isEvmAddress(lookup.agentId)) return null;
      let intent;
      try {
        intent = await input.intents.findAgentScoped({
          intentId: lookup.intentId,
          agentId: lookup.agentId.toLowerCase(),
        });
      } catch {
        return null;
      }
      if (intent === null) return null;
      let card;
      try {
        card = await input.cards.getById({
          cardId: intent.cardId,
          agentId: intent.agentId,
        });
      } catch {
        return null;
      }
      if (card === null) return null;
      if (card.agent_id.toLowerCase() !== intent.agentId.toLowerCase()) return null;
      const expiresAtMs = Date.parse(intent.expiresAt);
      if (!Number.isFinite(expiresAtMs)) return null;
      return {
        intentId: lookup.intentId,
        ownerAddress: card.owner_address.toLowerCase(),
        agentId: card.agent_id.toLowerCase(),
        cardId: card.card_id,
        chainId: card.chain_id,
        asset: card.asset,
        controller: card.controller_address.toLowerCase(),
        issuedBy: card.owner_address.toLowerCase(),
        policyVersion: card.policy_version,
        allowlistHash: card.allowlist_hash.toLowerCase(),
        sourceBlock: card.source_block,
        sourceTxHash: card.source_tx_hash.toLowerCase(),
        expiresAtMs,
      };
    },
  };
}
