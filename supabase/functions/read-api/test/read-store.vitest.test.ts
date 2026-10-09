import { describe, expect, it } from "vitest";
import { createSqlReadStore, policyVersionStatus } from "../read-store.ts";
import type { ReadQueryResult } from "../read-store.ts";

type Call = { text: string; params: unknown[] };

function recorder(rows: Record<string, unknown>[] = []): {
  calls: Call[];
  query: (text: string, params: unknown[]) => Promise<ReadQueryResult>;
} {
  const calls: Call[] = [];
  return {
    calls,
    async query(text: string, params: unknown[]): Promise<ReadQueryResult> {
      calls.push({ text, params });
      return { rows, rowCount: rows.length };
    },
  };
}

function cardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    card_id: "3",
    controller_address: "0x7a474c005433def5fc496d2016f6ae794edfc423",
    owner_address: "0xfda82d8911f43a93b4d5d5ce9fffce4ad7f88435",
    agent_id: "0xc289b3c8e2eb1b3b6b1b3e4f0a9f2a5f6b7c8d9e",
    asset: "arc-testnet-usdc",
    status: "ACTIVE",
    owner_configured_cap: "1000000",
    per_transaction_limit: "100000",
    verified_credit: "0",
    spent: "0",
    expires_at: "2026-12-01T00:00:00.000Z",
    policy_version: 1,
    policy_version_source: "CHAIN",
    policy_version_block: 66251752,
    policy_version_event_block: 66251700,
    source_block: 66251700,
    updated_at: "2026-10-09T07:00:00.000Z",
    ...overrides,
  };
}

describe("policy-version provenance (unknown / stale / verified)", () => {
  it("reports a projection placeholder as unknown, never as verified", () => {
    expect(policyVersionStatus({ source: "PROJECTION", observedBlock: 0, latestEventBlock: 0 })).toBe("unknown");
    expect(policyVersionStatus({ source: "CHAIN", observedBlock: 0, latestEventBlock: null })).toBe("unknown");
    expect(policyVersionStatus({ source: null, observedBlock: null, latestEventBlock: null })).toBe("unknown");
  });

  it("reports a verified value when the observation covers the newest card event", () => {
    expect(policyVersionStatus({ source: "CHAIN", observedBlock: 66251752, latestEventBlock: 66251752 })).toBe("verified");
    expect(policyVersionStatus({ source: "CHAIN", observedBlock: 66251752, latestEventBlock: 66251700 })).toBe("verified");
    // No indexed card event at all: the observation is still the newest truth.
    expect(policyVersionStatus({ source: "CHAIN", observedBlock: 66251752, latestEventBlock: null })).toBe("verified");
  });

  it("reports stale when a newer card event was indexed after the observation", () => {
    expect(policyVersionStatus({ source: "CHAIN", observedBlock: 66251700, latestEventBlock: 66251752 })).toBe("stale");
  });
});

describe("read store card projection", () => {
  it("carries the provenance columns into the card payload", async () => {
    const { query } = recorder([cardRow()]);
    const card = await createSqlReadStore(query).getCard("3", "0xfda8");

    expect(card?.policyVersion).toBe(1);
    expect(card?.policyVersionSource).toBe("CHAIN");
    expect(card?.policyVersionStatus).toBe("verified");
    expect(card?.policyVersionBlock).toBe(66251752);
  });

  it("keeps the owner scope and the card id in params, never in the query text", async () => {
    const { calls, query } = recorder([cardRow()]);
    await createSqlReadStore(query).getCard("3", "0xfda82d8911f43a93b4d5d5ce9fffce4ad7f88435");

    expect(calls[0].params).toEqual(["3", "0xfda82d8911f43a93b4d5d5ce9fffce4ad7f88435"]);
    expect(calls[0].text).toContain("lower(c.owner_address) = lower($2)");
    expect(calls[0].text).toContain("policy_version_event_block");
    expect(calls[0].text).not.toContain("0xfda8");
  });
});

describe("read store intent projection", () => {
  it("reads one intent under the session's owner scope", async () => {
    const { calls, query } = recorder([
      {
        intent_id: "intent-req-b05e4d86",
        card_id: "3",
        agent_id: "0xc289b3c8e2eb1b3b6b1b3e4f0a9f2a5f6b7c8d9e",
        merchant_id: "coffee-demo",
        amount_base_units: "1000000",
        asset: "arc-testnet-usdc",
        chain_id: 5042002,
        status: "ready",
        policy_version: 1,
        intent_hash: "0x" + "11".repeat(32),
        request_id: "req-b05e4d86",
        created_at: "2026-10-09T07:00:00.000Z",
        expires_at: "2026-10-09T07:15:00.000Z",
      },
    ]);
    const intent = await createSqlReadStore(query).getIntent("intent-req-b05e4d86", "0xfda8");

    expect(intent?.intentId).toBe("intent-req-b05e4d86");
    expect(intent?.agentId).toBe("0xc289b3c8e2eb1b3b6b1b3e4f0a9f2a5f6b7c8d9e");
    expect(intent?.policyVersion).toBe(1);
    expect(calls[0].text).toContain("lower(c.owner_address) = lower($2)");
    expect(calls[0].params).toEqual(["intent-req-b05e4d86", "0xfda8"]);
  });

  it("returns null when the session owns no such intent", async () => {
    const { query } = recorder([]);
    expect(await createSqlReadStore(query).getIntent("intent-x", "0xfda8")).toBeNull();
  });
});
