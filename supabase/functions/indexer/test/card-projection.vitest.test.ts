import { describe, expect, it } from "vitest";
import { createSqlCardProjector } from "../card-projection.ts";
import type { IndexerQueryResult } from "../cursor-store.ts";
import type { DecodedPactEvent, PactEventType } from "../types.ts";

const CHAIN_ID = 5042002;
const CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
const OWNER = "0xfda82d8911f43a93b4d5d5ce9fffce4ad7f88435";
const AGENT = "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682";
const TX = "0x" + "11".repeat(32);

type Call = { text: string; params: unknown[] };

function recorder(): { calls: Call[]; query: (text: string, params: unknown[]) => Promise<IndexerQueryResult> } {
  const calls: Call[] = [];
  return {
    calls,
    async query(text: string, params: unknown[]): Promise<IndexerQueryResult> {
      calls.push({ text, params });
      return { rows: [], rowCount: 0 };
    },
  };
}

function event(
  eventType: PactEventType,
  payload: Record<string, unknown>,
  blockNumber = 66251752n,
): DecodedPactEvent {
  return {
    chainId: CHAIN_ID,
    txHash: TX,
    logIndex: 5,
    blockNumber,
    blockHash: "0x" + "ab".repeat(32),
    contractAddress: CONTROLLER,
    eventType,
    payload,
    payloadHash: "0".repeat(64),
  };
}

describe("Phase 05 card projection", () => {
  it("inserts an ISSUED card row for CardCreated with the lane asset", async () => {
    const { calls, query } = recorder();
    await createSqlCardProjector(query).project(
      event("CardCreated", {
        cardId: "3",
        owner: OWNER,
        agent: AGENT,
        ownerConfiguredCap: "5000000000000000000",
        perTransactionLimit: "5000000000000000000",
        expiresAt: "1791780420",
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("insert into cards");
    expect(calls[0].text).toContain("on conflict (card_id) do nothing");
    expect(calls[0].text).toContain("'ISSUED'");
    expect(calls[0].params).toEqual([
      "3",
      CONTROLLER,
      OWNER,
      AGENT,
      "arc-testnet-usdc",
      CHAIN_ID,
      "5000000000000000000",
      "5000000000000000000",
      "1791780420",
      "",
      "66251752",
      TX,
    ]);
  });

  it("applies each lifecycle event as a monotonic status update", async () => {
    const expected: ReadonlyArray<[PactEventType, string, bigint]> = [
      ["CardActivated", "ACTIVE", 66251779n],
      ["CardSuspended", "SUSPENDED", 66251790n],
      ["CardResumed", "ACTIVE", 66251800n],
      ["CardClosed", "CLOSED", 66251810n],
    ];
    for (const [eventType, status, block] of expected) {
      const { calls, query } = recorder();
      await createSqlCardProjector(query).project(event(eventType, { cardId: "3" }, block));
      expect(calls).toHaveLength(1);
      expect(calls[0].text).toContain("update cards set status = $3");
      expect(calls[0].text).toContain("source_block <= $4::bigint");
      expect(calls[0].params).toEqual(["3", CHAIN_ID, status, block.toString(), TX]);
    }
  });

  it("sets verified credit from CreditVerified", async () => {
    const { calls, query } = recorder();
    await createSqlCardProjector(query).project(
      event("CreditVerified", {
        cardId: "3",
        agent: AGENT,
        evidenceId: "0x" + "22".repeat(32),
        amount: "100000000000000000",
        expiresAt: "1791780420",
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("verified_credit = $3");
    expect(calls[0].params.slice(0, 4)).toEqual(["3", CHAIN_ID, "100000000000000000", "1791780420"]);
  });

  it("updates policy columns from PolicyUpdated", async () => {
    const { calls, query } = recorder();
    await createSqlCardProjector(query).project(
      event("PolicyUpdated", {
        cardId: "3",
        ownerConfiguredCap: "2000000000000000000",
        perTransactionLimit: "100000000000000000",
        expiresAt: "1791780500",
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].params.slice(0, 5)).toEqual([
      "3",
      CHAIN_ID,
      "2000000000000000000",
      "100000000000000000",
      "1791780500",
    ]);
  });

  it("writes nothing for events with no card columns", async () => {
    const { calls, query } = recorder();
    await createSqlCardProjector(query).project(
      event("PaymentSettled", { cardId: "3", amount: "5" }, 66260000n),
    );
    await createSqlCardProjector(query).project(event("PoolFunded", { amount: "1" }, 66260001n));
    expect(calls).toHaveLength(0);
  });
});
