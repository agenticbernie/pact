import { describe, expect, it } from "vitest";
import { createPolicyVersionReconciler } from "../policy-version-reconciler.ts";
import type { IndexerQueryResult } from "../cursor-store.ts";

const CHAIN_ID = 5042002;
const HEAD = 66251752n;

type Call = { text: string; params: unknown[] };

function pendingRow(input: {
  cardId: string;
  policyVersion?: number;
  source?: string;
  block?: number;
  latestEventBlock?: number;
}): Record<string, unknown> {
  return {
    card_id: input.cardId,
    policy_version: input.policyVersion ?? 0,
    policy_version_source: input.source ?? "PROJECTION",
    policy_version_block: input.block ?? 0,
    latest_event_block: input.latestEventBlock ?? 0,
  };
}

function harness(input: {
  pending: Record<string, unknown>[];
  rowCount?: number;
  readPolicyVersion: (cardId: string) => Promise<number | null>;
}) {
  const calls: Call[] = [];
  const reconciler = createPolicyVersionReconciler({
    chainId: CHAIN_ID,
    readPolicyVersion: input.readPolicyVersion,
    async query(text: string, params: unknown[]): Promise<IndexerQueryResult> {
      calls.push({ text, params });
      if (text.startsWith("select")) return { rows: input.pending, rowCount: input.pending.length };
      return { rows: [], rowCount: input.rowCount ?? 1 };
    },
  });
  return { calls, reconciler, updates: () => calls.filter((call) => call.text.startsWith("update")) };
}

describe("policy-version reconciler (projection placeholder -> chain truth)", () => {
  it("reads the controller for a never-observed card and records provenance", async () => {
    const rows = [pendingRow({ cardId: "3" })];
    const h = harness({ pending: rows, readPolicyVersion: () => Promise.resolve(1) });
    const summary = await h.reconciler.reconcile(HEAD);

    expect(summary).toEqual({ scanned: 1, verified: 1, unreadable: 0, superseded: 0 });
    expect(h.updates()).toHaveLength(1);
    const [update] = h.updates();
    expect(update.text).toContain("policy_version_source = 'CHAIN'");
    expect(update.text).toContain("policy_version_observed_at = now()");
    expect(update.params).toEqual(["3", CHAIN_ID, 1, HEAD.toString()]);
    // Card id travels in params, never in the query text.
    expect(update.text).not.toContain("'3'");
  });

  it("writes nothing when the chain does not answer (never a fabricated version)", async () => {
    const rows = [pendingRow({ cardId: "3" }), pendingRow({ cardId: "4" })];
    const h = harness({ pending: rows, readPolicyVersion: () => Promise.resolve(null) });
    const summary = await h.reconciler.reconcile(HEAD);

    expect(summary).toEqual({ scanned: 2, verified: 0, unreadable: 2, superseded: 0 });
    expect(h.updates()).toHaveLength(0);
  });

  it("re-reads a card whose newest indexed event is newer than its observation", async () => {
    const rows = [
      pendingRow({ cardId: "5", policyVersion: 1, source: "CHAIN", block: 100, latestEventBlock: 200 }),
    ];
    const h = harness({ pending: rows, readPolicyVersion: () => Promise.resolve(2) });
    const summary = await h.reconciler.reconcile(HEAD);

    expect(summary.verified).toBe(1);
    expect(h.updates()[0].params).toEqual(["5", CHAIN_ID, 2, HEAD.toString()]);
    // The queue itself is what excludes already-verified rows.
    const select = h.calls[0];
    expect(select.text).toContain("policy_version_source <> 'CHAIN'");
    expect(select.text).toContain("policy_version_block < ");
    expect(select.params).toEqual([CHAIN_ID, 50]);
  });

  it("refuses to overwrite a newer authoritative value (monotonic guard)", async () => {
    const rows = [pendingRow({ cardId: "6" })];
    const h = harness({
      pending: rows,
      rowCount: 0,
      readPolicyVersion: () => Promise.resolve(7),
    });
    const summary = await h.reconciler.reconcile(1n);

    expect(summary).toEqual({ scanned: 1, verified: 0, unreadable: 0, superseded: 1 });
    expect(h.updates()[0].text).toContain("policy_version_block <= $4::bigint");
  });

  it("is idempotent: the same head writes the same observation twice", async () => {
    const rows = [pendingRow({ cardId: "3" })];
    const h = harness({ pending: rows, readPolicyVersion: () => Promise.resolve(1) });

    await h.reconciler.reconcile(HEAD);
    await h.reconciler.reconcile(HEAD);

    const [first, second] = h.updates();
    expect(first.params).toEqual(second.params);
    expect(first.text).toBe(second.text);
  });
});
