/**
 * Phase 05 policy-version reconciler (projection placeholder -> chain truth).
 *
 * `cards.policy_version` cannot be derived from the decoded card events — the
 * controller emits no policy version with them — so the projection writes the
 * placeholder `0`. The controller's `cards(uint256)` view is authoritative, so
 * this reconciler reads it (read-only `eth_call`, no signer, no broadcast) and
 * records the value *with its provenance* so the read API can tell `unknown`,
 * `stale` and `verified` apart instead of presenting the placeholder as a
 * verified policy version.
 *
 * Rules:
 * - only rows that need a read are scanned: never read (`PROJECTION`), or read
 *   at a block older than the newest indexed card event for that card (the
 *   policy may have moved on — this is also what makes a reorg-triggered
 *   reprojection refresh the value).
 * - unreadable RPC (`null`) writes NOTHING. An absent answer is never turned
 *   into a fabricated version and never into `verified`.
 * - the write is monotonic: `policy_version_block <= $observedBlock`, so an
 *   older observation can never overwrite a newer authoritative one.
 * - idempotent: re-running at the same confirmed block re-writes the same
 *   value (the guard admits `<=`); the projection's own `CardCreated` insert
 *   never clobbers an observed row.
 */
import type { IndexerQueryFn } from "./cursor-store.ts";
import type { PolicyVersionReader } from "../_shared/policy-version.ts";

export const DEFAULT_RECONCILE_LIMIT = 50;

export type PolicyVersionReconcileSummary = {
  /** Rows selected for an authoritative read. */
  scanned: number;
  /** Rows the chain answered for (written with `CHAIN` provenance). */
  verified: number;
  /** Rows the chain did not answer for (left exactly as they were). */
  unreadable: number;
  /**
   * Rows whose stored observation turned out to be NEWER than this read, so the
   * monotonic guard refused the write. Expected only when a caller reconciles
   * an older block than the row already carries; never a regression.
   */
  superseded: number;
};

export type PolicyVersionReconciler = {
  reconcile(confirmedBlock: bigint): Promise<PolicyVersionReconcileSummary>;
};

const PENDING_SQL =
  "select c.card_id, c.policy_version, c.policy_version_source, c.policy_version_block, " +
  "coalesce((select max(e.block_number) from chain_events e " +
  "where e.chain_id = c.chain_id and e.payload ->> 'cardId' = c.card_id), 0) as latest_event_block " +
  "from cards c " +
  "where c.chain_id = $1 " +
  "and (c.policy_version_source <> 'CHAIN' or c.policy_version_block < " +
  "coalesce((select max(e.block_number) from chain_events e " +
  "where e.chain_id = c.chain_id and e.payload ->> 'cardId' = c.card_id), 0)) " +
  "order by c.card_id limit $2";

const OBSERVE_SQL =
  "update cards set policy_version = $3, policy_version_source = 'CHAIN', " +
  "policy_version_block = $4::bigint, policy_version_observed_at = now(), updated_at = now() " +
  "where card_id = $1 and chain_id = $2 and policy_version_block <= $4::bigint";

export function createPolicyVersionReconciler(input: {
  query: IndexerQueryFn;
  readPolicyVersion: PolicyVersionReader;
  chainId: number;
  limit?: number;
}): PolicyVersionReconciler {
  const limit = input.limit ?? DEFAULT_RECONCILE_LIMIT;

  return {
    async reconcile(confirmedBlock: bigint): Promise<PolicyVersionReconcileSummary> {
      const pending = await input.query(PENDING_SQL, [input.chainId, limit]);
      const observedBlock = confirmedBlock.toString();
      let verified = 0;
      let unreadable = 0;
      let superseded = 0;
      for (const row of pending.rows) {
        const cardId = String(row["card_id"] ?? "");
        if (cardId.length === 0) continue;
        const version = await input.readPolicyVersion(cardId);
        if (version === null) {
          unreadable += 1;
          continue;
        }
        const result = await input.query(OBSERVE_SQL, [cardId, input.chainId, version, observedBlock]);
        if (result.rowCount === 1) verified += 1;
        else superseded += 1;
      }
      return { scanned: pending.rows.length, verified, unreadable, superseded };
    },
  };
}
