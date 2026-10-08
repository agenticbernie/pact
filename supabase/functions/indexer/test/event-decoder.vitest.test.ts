import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import { PACT_ABI } from "../../../../packages/pact-sdk/src/abi.ts";
import { createPactEventDecoder } from "../event-decoder.ts";
import type { ChainLog } from "../types.ts";

const CHAIN_ID = 5042002;
const CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
const POOL = "0x5e1771de29bd1a084900d032fd4db2ac7c7528b";
const MERCHANT = "0xac030ddaa1fc29c1738332c3b9524ecfd0b4174f";

const decoder = createPactEventDecoder({
  chainId: CHAIN_ID,
  addresses: { controller: CONTROLLER, pool: POOL, merchant: MERCHANT },
});

function encode(abi: readonly unknown[], event: string, args: readonly unknown[]) {
  const iface = new Interface(abi as never);
  const fragment = iface.getEvent(event);
  if (fragment === null) throw new Error(`missing event ${event}`);
  return iface.encodeEventLog(fragment, args);
}

function baseLog(overrides: Partial<ChainLog>): ChainLog {
  return {
    address: CONTROLLER,
    topics: [],
    data: "0x",
    blockNumber: 66170486n,
    blockHash: "0x" + "ab".repeat(32),
    transactionHash: "0x" + "cd".repeat(32),
    logIndex: 3,
    ...overrides,
  };
}

function paymentSettledLog(overrides: Partial<ChainLog> = {}): ChainLog {
  const encoded = encode(PACT_ABI.controller, "PaymentSettled", [
    1n,
    "0x" + "11".repeat(32),
    5n,
    7n,
    "0x" + "22".repeat(32),
  ]);
  return baseLog({ topics: encoded.topics, data: encoded.data, ...overrides });
}

describe("Phase 05 event decoder", () => {
  it("decodes an allowlisted PaymentSettled with normalized payload", () => {
    const decoded = decoder.decode(paymentSettledLog());
    expect(decoded).not.toBeNull();
    expect(decoded?.eventType).toBe("PaymentSettled");
    expect(decoded?.chainId).toBe(CHAIN_ID);
    expect(decoded?.txHash).toBe("0x" + "cd".repeat(32));
    expect(decoded?.logIndex).toBe(3);
    expect(decoded?.payload).toMatchObject({ cardId: "1", amount: "5", nonce: "7" });
  });

  it("hashes the payload deterministically across replays", () => {
    const first = decoder.decode(paymentSettledLog());
    const second = decoder.decode(paymentSettledLog());
    expect(first?.payloadHash).toBe(second?.payloadHash);
    expect(first?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores a log from a non-allowlisted contract address", () => {
    const decoded = decoder.decode(
      paymentSettledLog({ address: "0x000000000000000000000000000000000000dead" }),
    );
    expect(decoded).toBeNull();
  });

  it("ignores an unknown event topic", () => {
    const decoded = decoder.decode(
      paymentSettledLog({ topics: ["0x" + "ff".repeat(32)] }),
    );
    expect(decoded).toBeNull();
  });

  it("ignores malformed topics/data", () => {
    const decoded = decoder.decode(paymentSettledLog({ data: "0x1234" }));
    expect(decoded).toBeNull();
  });

  it("ignores a reorged (removed) log", () => {
    const decoded = decoder.decode(paymentSettledLog({ removed: true }));
    expect(decoded).toBeNull();
  });

  it("rejects a controller event shipped from the merchant address", () => {
    const decoded = decoder.decode(paymentSettledLog({ address: MERCHANT }));
    expect(decoded).toBeNull();
  });

  it("decodes a MerchantPaymentReceived from the merchant contract", () => {
    const encoded = encode(PACT_ABI.merchantSimulator, "MerchantPaymentReceived", [
      "0x" + "11".repeat(32),
      5n,
      5n,
    ]);
    const decoded = decoder.decode(
      baseLog({ address: MERCHANT, topics: encoded.topics, data: encoded.data }),
    );
    expect(decoded?.eventType).toBe("MerchantPaymentReceived");
    expect(decoded?.payload).toMatchObject({ amount: "5", totalReceived: "5" });
  });
});
