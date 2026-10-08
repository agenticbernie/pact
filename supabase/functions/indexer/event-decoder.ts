/**
 * Phase 05 event decoder.
 *
 * Decodes ONLY known Pact/ASC events, and ONLY from the configured
 * controller/pool/merchant addresses. Anything else (unknown topic, unknown
 * or non-allowlisted address, malformed topics/data, reorged log) returns
 * `null` so the indexer ignores it rather than inventing a record.
 *
 * `payload` is normalized (bigint -> decimal string, addresses lowercased) and
 * hashed deterministically, so a replay of the same log always produces the
 * same `payload_hash`.
 */
import { Interface, sha256, toUtf8Bytes } from "ethers";
import { PACT_ABI } from "../../../packages/pact-sdk/src/abi.ts";
import type { ChainLog, DecodedPactEvent, PactEventDecoder, PactEventType } from "./types.ts";

type DecoderConfig = {
  chainId: number;
  addresses: { controller: string; pool: string; merchant: string };
};

/** Which event names live on which contract (source of truth: the SDK ABIs). */
const SOURCE_EVENTS: Readonly<Record<"controller" | "pool" | "merchantSimulator", readonly PactEventType[]>> = {
  controller: [
    "CardCreated",
    "CardActivated",
    "CardSuspended",
    "CardResumed",
    "CardClosed",
    "CreditVerified",
    "PolicyUpdated",
    "PaymentSettled",
  ],
  pool: ["PoolFunded", "PoolWithdrawn"],
  merchantSimulator: ["MerchantPaymentReceived", "MerchantRegistered"],
};

function sourceInterfaces(): Record<keyof typeof SOURCE_EVENTS, Interface> {
  return {
    controller: new Interface(PACT_ABI.controller),
    pool: new Interface(PACT_ABI.pool),
    merchantSimulator: new Interface(PACT_ABI.merchantSimulator),
  };
}

/** topic0 (lowercase) -> the interface that can parse it, plus the event name. */
function buildTopicIndex(
  interfaces: Record<keyof typeof SOURCE_EVENTS, Interface>,
): Map<string, { iface: Interface; eventType: PactEventType }> {
  const index = new Map<string, { iface: Interface; eventType: PactEventType }>();
  for (const [source, events] of Object.entries(SOURCE_EVENTS) as Array<
    [keyof typeof SOURCE_EVENTS, readonly PactEventType[]]
  >) {
    const iface = interfaces[source];
    for (const eventType of events) {
      const fragment = iface.getEvent(eventType);
      if (fragment === null) continue;
      index.set(fragment.topicHash.toLowerCase(), { iface, eventType });
    }
  }
  return index;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "string") {
    return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : value;
  }
  return value;
}

/** Stable JSON: keys sorted, so equal payloads hash equally. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function payloadHash(payload: Record<string, unknown>): string {
  return sha256(toUtf8Bytes(stableStringify(payload))).slice(2);
}

export function createPactEventDecoder(config: DecoderConfig): PactEventDecoder {
  const interfaces = sourceInterfaces();
  const topicIndex = buildTopicIndex(interfaces);
  const allowed = new Map<string, keyof typeof SOURCE_EVENTS>([
    [config.addresses.controller.toLowerCase(), "controller"],
    [config.addresses.pool.toLowerCase(), "pool"],
    [config.addresses.merchant.toLowerCase(), "merchantSimulator"],
  ]);

  return {
    decode(log: ChainLog): DecodedPactEvent | null {
      if (log.removed === true) return null;

      const address = log.address.toLowerCase();
      const source = allowed.get(address);
      if (source === undefined) return null;

      const topic0 = log.topics[0]?.toLowerCase();
      if (topic0 === undefined) return null;
      const entry = topicIndex.get(topic0);
      if (entry === undefined || entry.iface !== interfaces[source]) return null;

      let parsed: ReturnType<Interface["parseLog"]>;
      try {
        parsed = entry.iface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
      if (parsed === null || parsed.name !== entry.eventType) return null;

      const payload: Record<string, unknown> = {};
      entry.iface.getEvent(entry.eventType)?.inputs.forEach((input, i) => {
        payload[input.name] = normalizeValue(parsed.args[i]);
      });

      return {
        chainId: config.chainId,
        txHash: log.transactionHash.toLowerCase(),
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash.toLowerCase(),
        contractAddress: address,
        eventType: entry.eventType,
        payload,
        payloadHash: payloadHash(payload),
      };
    },
  };
}
