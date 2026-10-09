/**
 * Phase 05 card projection (decoded chain events -> `cards` read projection).
 *
 * `chain_events` is the append-only ledger; `cards` is the DERIVED projection
 * the read API queries directly (`getCard`/`listCards`) and the console renders.
 * Without this projection a card the chain created and activated never appears
 * in the read model — exactly the "the transaction is confirmed but no card row
 * is indexed yet" state the console reports.
 *
 * Every statement is idempotent and monotonic:
 * - `CardCreated` inserts ONCE (`on conflict (card_id) do nothing`), so a seeded
 *   or already-projected row is never clobbered.
 * - lifecycle/credit/policy updates carry `source_block <= $block`, so a replay
 *   (or an out-of-order scan) can never regress a newer projection.
 *
 * Authority boundary: the projection only records what a confirmed chain log
 * already said. It never authorizes, settles, or raises credit.
 *
 * Columns the chain events do not carry (`policyVersion`, `allowlistHash`) are
 * projection-only placeholders; the controller holds no per-card allowlist hash
 * and the read model never displays either column.
 */
import { laneForChainId, resolveLane } from "../../../packages/domain/src/arc-lane.ts";
import type { IndexerQueryFn } from "./cursor-store.ts";
import type { DecodedPactEvent, PactEventType } from "./types.ts";

export interface CardProjector {
  project(event: DecodedPactEvent): Promise<void>;
}

/** Lifecycle event -> the status the card carries after that event. */
const STATUS_AFTER: Partial<Record<PactEventType, "ACTIVE" | "SUSPENDED" | "CLOSED">> = {
  CardActivated: "ACTIVE",
  CardResumed: "ACTIVE",
  CardSuspended: "SUSPENDED",
  CardClosed: "CLOSED",
};

// `created_at` is set to `least(now(), expires_at - 1s)` so the table's
// `expires_at > created_at` check holds even when an old card is backfilled
// long after its on-chain expiry (index time would otherwise be later).
const CARD_CREATED_SQL =
  "insert into cards (" +
  "card_id, controller_address, owner_address, agent_id, asset, chain_id, status, " +
  "owner_configured_cap, per_transaction_limit, verified_credit, spent, expires_at, " +
  "policy_version, allowlist_hash, source_block, source_tx_hash, created_at, updated_at) " +
  "values ($1,$2,$3,$4,$5,$6,'ISSUED'," +
  "$7,$8,0,0, to_timestamp($9::double precision), 0, $10, $11::bigint, $12, " +
  "least(now(), to_timestamp($9::double precision) - interval '1 second'), now()) " +
  "on conflict (card_id) do nothing";

const CARD_STATUS_SQL =
  "update cards set status = $3, source_block = $4::bigint, source_tx_hash = $5, updated_at = now() " +
  "where card_id = $1 and chain_id = $2 and source_block <= $4::bigint";

const CARD_CREDIT_SQL =
  "update cards set verified_credit = $3, " +
  "verified_credit_expires_at = to_timestamp($4::double precision), " +
  "source_block = $5::bigint, source_tx_hash = $6, updated_at = now() " +
  "where card_id = $1 and chain_id = $2 and source_block <= $5::bigint";

const CARD_POLICY_SQL =
  "update cards set owner_configured_cap = $3, per_transaction_limit = $4, " +
  "expires_at = to_timestamp($5::double precision), " +
  "source_block = $6::bigint, source_tx_hash = $7, updated_at = now() " +
  "where card_id = $1 and chain_id = $2 and source_block <= $6::bigint";

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function cardIdOf(event: DecodedPactEvent): string {
  return text(event.payload["cardId"]);
}

/** The lane asset literal for a chain, so the (chain_id, asset) pair passes the check. */
function assetFor(chainId: number): string {
  return resolveLane(laneForChainId(chainId)).asset;
}

export function createSqlCardProjector(query: IndexerQueryFn): CardProjector {
  return {
    async project(event: DecodedPactEvent): Promise<void> {
      const block = event.blockNumber.toString();

      if (event.eventType === "CardCreated") {
        await query(CARD_CREATED_SQL, [
          cardIdOf(event),
          event.contractAddress,
          text(event.payload["owner"]),
          text(event.payload["agent"]),
          assetFor(event.chainId),
          event.chainId,
          text(event.payload["ownerConfiguredCap"]),
          text(event.payload["perTransactionLimit"]),
          text(event.payload["expiresAt"]),
          "",
          block,
          event.txHash,
        ]);
        return;
      }

      const status = STATUS_AFTER[event.eventType];
      if (status !== undefined) {
        await query(CARD_STATUS_SQL, [
          cardIdOf(event),
          event.chainId,
          status,
          block,
          event.txHash,
        ]);
        return;
      }

      if (event.eventType === "CreditVerified") {
        await query(CARD_CREDIT_SQL, [
          cardIdOf(event),
          event.chainId,
          text(event.payload["amount"]),
          text(event.payload["expiresAt"]),
          block,
          event.txHash,
        ]);
        return;
      }

      if (event.eventType === "PolicyUpdated") {
        await query(CARD_POLICY_SQL, [
          cardIdOf(event),
          event.chainId,
          text(event.payload["ownerConfiguredCap"]),
          text(event.payload["perTransactionLimit"]),
          text(event.payload["expiresAt"]),
          block,
          event.txHash,
        ]);
        return;
      }

      // Payment / pool / merchant events carry no card-projection columns.
    },
  };
}
