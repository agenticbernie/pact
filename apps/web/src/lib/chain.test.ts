/**
 * Issuance must never report "not created" for a card the chain confirmed.
 *
 * Regression: `issueCard` used to end with an on-chain `cards(cardId)` re-read
 * whose failure was thrown out of the whole call. Both receipts were already
 * asserted at that point, so a transient RPC failure on that advisory read
 * reached the user as the "Card not created" banner over a card that exists on
 * chain — and suppressed the success panel that carries the tx hashes.
 */
import { Contract, Interface, type ContractRunner } from "ethers";
import { describe, expect, it } from "vitest";
import { CARD_CONTROLLER_ABI } from "./controller-abi";
import { issueCard, readConfirmedCard, type IssuedCard } from "./chain";
import type { CardDraft } from "./card-policy";

const CONTROLLER = "0x7A474c005433DEf5fC496D2016F6Ae794EDFC423";
const OWNER = "0x576476f0367A64C9Eb7037b2450E9A96C1D3247E";
const AGENT = "0x830B58769CE9097abB4885C86E84803Ac0e68A18";
const ASSET = "0x0000000000000000000000000000000000000000";
const CREATE_TX = `0x${"11".repeat(32)}`;
const ACTIVATE_TX = `0x${"22".repeat(32)}`;

const iface = new Interface(CARD_CONTROLLER_ABI);
const cardsSelector = iface.getFunction("cards")!.selector;
const agentActiveCardSelector = iface.getFunction("agentActiveCard")!.selector;

const DRAFT: CardDraft = {
  agent: AGENT,
  ownerConfiguredCap: 100000000000000000n,
  perTransactionLimit: 10000000000000000n,
  expiresAtSeconds: 1792151400n,
  merchants: ["coffee-demo"],
};

/** A mined receipt in the shape ethers' `getTransactionReceipt` must return. */
function receiptFor(hash: string, event: "CardCreated" | "CardActivated" | null) {
  const logs: { address: string; topics: string[]; data: string }[] = [];
  if (event !== null) {
    const fragment = iface.getEvent(event)!;
    const args: unknown[] =
      event === "CardCreated"
        ? [4n, OWNER, AGENT, 100000000000000000n, 10000000000000000n, 1792151400n]
        : [4n];
    const encoded = iface.encodeEventLog(fragment, args);
    logs.push({ address: CONTROLLER, topics: [...encoded.topics], data: encoded.data });
  }
  return {
    hash,
    status: 1,
    to: CONTROLLER,
    from: OWNER,
    contractAddress: null,
    index: 0,
    blockNumber: 1,
    blockHash: `0x${"aa".repeat(32)}`,
    logsBloom: `0x${"00".repeat(256)}`,
    gasUsed: 21000n,
    cumulativeGasUsed: 21000n,
    gasPrice: 1n,
    blobGasUsed: null,
    blobGasPrice: null,
    type: 0,
    root: null,
    logs: logs.map((log, i) => ({
      ...log,
      blockNumber: 1,
      transactionHash: hash,
      index: i,
      removed: false,
    })),
  };
}

/**
 * A contract runner whose `createCard`/`activateCard` sends confirm, and whose
 * `cards(cardId)` READ fails — the exact shape of the race that produced the
 * false "Card not created".
 *
 * `tx.wait()` on a contract response goes through the runner's `provider`
 * (`getTransactionReceipt`), so the stub supplies a mined receipt there.
 */
function runnerWithFailingCardRead(
  brokenRead: boolean,
  createEvent: "CardCreated" | null = "CardCreated",
): ContractRunner {
  const receipts = new Map<string, unknown>();
  return {
    provider: {
      async getTransactionReceipt(hash: string) {
        return receipts.get(hash) ?? null;
      },
    },
    async call(tx: { data: string; to: string }) {
      if (tx.data.startsWith(agentActiveCardSelector)) {
        return iface.encodeFunctionResult("agentActiveCard", [0n]);
      }
      if (tx.data.startsWith(cardsSelector)) {
        if (brokenRead) throw new Error("could not coalesce error: rate limit exceeded");
        return iface.encodeFunctionResult("cards", [
          OWNER,
          AGENT,
          ASSET,
          100000000000000000n,
          0n,
          0n,
          0n,
          10000000000000000n,
          1792151400n,
          1,
          1,
        ]);
      }
      return "0x";
    },
    async sendTransaction(tx: { data: string }) {
      const isCreate = tx.data.startsWith(iface.getFunction("createCard")!.selector);
      const hash = isCreate ? CREATE_TX : ACTIVATE_TX;
      receipts.set(hash, receiptFor(hash, isCreate ? createEvent : "CardActivated"));
      return { hash };
    },
  } as unknown as ContractRunner;
}

async function issue(brokenRead: boolean): Promise<IssuedCard> {
  const runner = runnerWithFailingCardRead(brokenRead);
  return issueCard({
    runner,
    // `issueCard` only forwards this to the Contract constructor; every write
    // goes through the same runner, so one stub serves both roles.
    signer: runner as never,
    controller: CONTROLLER,
    draft: DRAFT,
  });
}

describe("readConfirmedCard", () => {
  it("returns null when the advisory read fails instead of throwing", async () => {
    const card = await readConfirmedCard(runnerWithFailingCardRead(true), CONTROLLER, "4");
    expect(card).toBeNull();
  });

  it("still returns the snapshot when the read answers", async () => {
    const card = await readConfirmedCard(runnerWithFailingCardRead(false), CONTROLLER, "4");
    expect(card?.agent).toBe(AGENT);
    expect(card?.status).toBe(1);
  });
});

describe("issueCard", () => {
  it("reports the confirmed card even when the post-confirmation read fails", async () => {
    const issued = await issue(true);
    expect(issued.cardId).toBe("4");
    expect(issued.createTxHash).toBe(CREATE_TX);
    expect(issued.activateTxHash).toBe(ACTIVATE_TX);
    expect(issued.card).toBeNull();
  });

  it("enriches the result with the card snapshot when the read answers", async () => {
    const issued = await issue(false);
    expect(issued.cardId).toBe("4");
    expect(issued.card?.owner).toBe(OWNER);
  });

  it("still fails closed when the creation receipt carries no CardCreated event", async () => {
    const runner = runnerWithFailingCardRead(false, null);
    await expect(
      issueCard({
        runner,
        signer: runner as never,
        controller: CONTROLLER,
        draft: DRAFT,
      }),
    ).rejects.toThrow(/CardCreated/);
  });
});

/** The contract used to parse the stub's events is the console's own ABI. */
it("stubs with the console ABI", () => {
  expect(new Contract(CONTROLLER, CARD_CONTROLLER_ABI).interface.getEvent("CardCreated")).not.toBeNull();
});
