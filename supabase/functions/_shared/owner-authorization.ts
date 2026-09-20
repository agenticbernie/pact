/**
 * H2 Arc owner-agent scoping (supplement §3–§5, amended §9).
 *
 * Allows `owner != agent` in the Arc lane through an explicit,
 * provenance-anchored `OwnerAuthorization`. Single-wallet (`owner == agent`)
 * remains valid without any authorization; the legacy CTC lane never
 * consults the registry and keeps byte-identical behavior.
 *
 * Trust anchor (non-synthetic): every entry reproduces a card's on-chain
 * creation facts and is cross-checked against the seeded card row AND the
 * lane constants on every read. Nothing here moves funds, signs, or widens
 * the static-call surface. Deno-safe: no Node imports.
 */
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

function staticRegistry(entries: OwnerAuthorization[]): OwnerAuthorizationRegistry {
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
 * Default Arc card-1 registry. Owner/agent/creation facts reproduce the
 * on-chain record (Arc closeout §8 + first-payment evidence); the allowlist
 * anchor is the lane-test merchant derivation (deterministic, re-derivable),
 * not on-chain truth. Operator-approved lane configuration; cross-checked
 * against the seeded row and lane constants on every read.
 */
export function createArcCard1OwnerRegistry(): OwnerAuthorizationRegistry {
  return staticRegistry([
    {
      intentId: "intent-req-1",
      ownerAddress: "0xb8bdcc633cd8e67250358d807918f99dc0c14d52",
      agentId: "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682",
      cardId: "1",
      chainId: 5042002,
      asset: "arc-testnet-usdc",
      controller: "0x7a474c005433def5fc496d2016f6ae794edfc423",
      issuedBy: "0xb8bdcc633cd8e67250358d807918f99dc0c14d52",
      policyVersion: 1,
      allowlistHash: "0x50ac913d8071d2c6532044666a6fdf27b3548ceb0856c45289610034a0c93152",
      sourceBlock: 62948913,
      sourceTxHash: "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb",
      expiresAtMs: Date.parse("2027-09-19T00:00:00.000Z"),
    },
  ]);
}
