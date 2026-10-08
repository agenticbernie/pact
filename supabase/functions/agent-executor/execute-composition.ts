/**
 * Execute-path intent resolution (production seam).
 *
 * The preflight composition reads a card/intent pair from persistence; the
 * execute path needs the same owner+agent scoping before it may sign anything.
 * This module holds that resolution in one place, so preflight and execute can
 * never disagree about which intent/owner/agent triple is authoritative.
 *
 * Two shapes:
 * - `createInMemoryIntentResolver` — the injectable test/legacy seam.
 * - `createPersistenceIntentResolver` — Neon/PostgREST backed, with the Arc
 *   split-role authorization re-validated on every read (fail closed).
 *
 * Deno-safe: no Node imports, no environment reads, no signing.
 */
import type { AgentIntent } from "../../../packages/domain/src/types.ts";
import {
  validateOwnerAuthorization,
  type OwnerAuthorization,
  type OwnerAuthorizationRegistry,
} from "../_shared/owner-authorization.ts";
import type { IntentStoreAdapter } from "../_shared/intent-store.ts";
import type { CardStore } from "../_shared/card-store.ts";
import type { LaneConfig } from "../_shared/lane-config.ts";

export type StoredIntent = {
  intentId: string;
  agent: string;
  cardId: string;
  merchantId: string;
  amountBaseUnits: string;
  asset?: "native-testnet-ctc" | "arc-testnet-usdc";
  policyVersion: number;
  expiresAtMs: number;
  /** Canonical intent hash; required before any on-chain `pay`. */
  intentHash?: string;
};

export type IntentResolver = (input: {
  intentId: string;
  /**
   * Session wallet: the agent on both the single-wallet and split-role paths.
   * Absent means no session scope: a persistence-backed resolver then fails
   * closed, while the in-memory seam ignores it.
   */
  sessionWallet?: string;
}) => Promise<StoredIntent | null>;

export function toStoredIntent(intent: AgentIntent): StoredIntent {
  return {
    intentId: intent.intentId,
    agent: intent.agentId,
    cardId: intent.cardId,
    merchantId: intent.merchantId,
    amountBaseUnits: intent.amountBaseUnits,
    asset: intent.asset,
    policyVersion: intent.policyVersion,
    expiresAtMs: Date.parse(intent.expiresAt),
    intentHash: intent.intentHash,
  };
}

export function createInMemoryIntentResolver(
  intents: Map<string, StoredIntent>,
): IntentResolver {
  return async ({ intentId }) => intents.get(intentId) ?? null;
}

/**
 * Single-wallet first, then the split-role Arc path: an `owner != agent`
 * intent resolves only through an explicit authorization, re-read under the
 * authorized owner exactly as the preflight path does.
 */
export async function resolveScopedIntent(input: {
  intentId: string;
  sessionWallet: string;
  lane: LaneConfig;
  intents: Pick<IntentStoreAdapter, "getById">;
  ownerAuthorizations?: OwnerAuthorizationRegistry;
}): Promise<{ intent: AgentIntent; authorization: OwnerAuthorization | null } | null> {
  const single = await input.intents.getById({
    intentId: input.intentId,
    ownerAddress: input.sessionWallet,
    agentId: input.sessionWallet,
  });
  if (single !== null) return { intent: single, authorization: null };
  if (input.lane.controller === undefined || input.ownerAuthorizations === undefined) return null;
  const candidate = await input.ownerAuthorizations.findAuthorization({
    intentId: input.intentId,
    agentId: input.sessionWallet,
    chainId: input.lane.chainId,
  });
  if (candidate === null) return null;
  const reread = await input.intents.getById({
    intentId: input.intentId,
    ownerAddress: candidate.ownerAddress,
    agentId: input.sessionWallet,
  });
  if (reread === null) return null;
  return { intent: reread, authorization: candidate };
}

export function createPersistenceIntentResolver(input: {
  intents: Pick<IntentStoreAdapter, "getById">;
  cards: Pick<CardStore, "getById">;
  lane: LaneConfig;
  ownerAuthorizations?: OwnerAuthorizationRegistry;
}): IntentResolver {
  return async ({ intentId, sessionWallet }) => {
    // No session scope means no authoritative owner+agent pair to read under.
    if (sessionWallet === undefined) return null;
    const scoped = await resolveScopedIntent({
      intentId,
      sessionWallet,
      lane: input.lane,
      intents: input.intents,
      ownerAuthorizations: input.ownerAuthorizations,
    });
    if (scoped === null) return null;
    if (scoped.authorization !== null) {
      // Split-role: the authorization must agree with the session, the intent
      // and the seeded card row before the signer is allowed to submit.
      const card = await input.cards.getById({
        cardId: scoped.intent.cardId,
        ownerAddress: scoped.authorization.ownerAddress,
        agentId: scoped.intent.agentId,
      });
      if (card === null) return null;
      if (
        card.asset !== input.lane.asset ||
        card.chain_id !== input.lane.chainId ||
        card.agent_id.toLowerCase() !== scoped.intent.agentId.toLowerCase() ||
        card.policy_version !== scoped.intent.policyVersion
      ) {
        return null;
      }
      const check = validateOwnerAuthorization(scoped.authorization, {
        sessionWallet,
        intent: {
          intentId: scoped.intent.intentId,
          agentId: scoped.intent.agentId,
          cardId: scoped.intent.cardId,
          policyVersion: scoped.intent.policyVersion,
        },
        card: {
          card_id: card.card_id,
          controller_address: card.controller_address,
          owner_address: card.owner_address,
          agent_id: card.agent_id,
          asset: card.asset,
          chain_id: card.chain_id,
          policy_version: card.policy_version,
          allowlist_hash: card.allowlist_hash,
          source_block: card.source_block,
          source_tx_hash: card.source_tx_hash,
        },
        lane: input.lane,
      });
      if (!check.ok) return null;
    }
    return toStoredIntent(scoped.intent);
  };
}
