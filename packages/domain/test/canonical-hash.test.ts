import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalIntentHash, merchantIdToBytes32 } from "../src/canonical-hash.js";
import type { CanonicalIntentInput } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = resolve(here, "canonical-hash-vectors.json");

interface Vector {
  name: string;
  input: CanonicalIntentInput;
  merchantBytes32: string;
  hash: string;
}

function loadVectors(): Vector[] {
  return JSON.parse(readFileSync(vectorsPath, "utf8")) as Vector[];
}

const BASE: CanonicalIntentInput = {
  cardId: "7",
  agentId: "0x1111111111111111111111111111111111111111",
  merchantId: "coffee-demo",
  amountBaseUnits: "250",
  asset: "native-testnet-ctc",
  purpose: "demo coffee purchase",
  expiresAt: "2026-09-09T00:05:00Z",
  policyVersion: 1,
};

describe("canonicalIntentHash", () => {
  it("is independent of property order", () => {
    const shuffled: CanonicalIntentInput = {
      policyVersion: 1,
      expiresAt: "2026-09-09T00:05:00Z",
      purpose: "demo coffee purchase",
      asset: "native-testnet-ctc",
      amountBaseUnits: "250",
      merchantId: "coffee-demo",
      agentId: "0x1111111111111111111111111111111111111111",
      cardId: "7",
    };
    expect(canonicalIntentHash(shuffled)).toBe(canonicalIntentHash(BASE));
  });

  it("matches every golden vector", () => {
    for (const vector of loadVectors()) {
      expect(canonicalIntentHash(vector.input), vector.name).toBe(vector.hash);
      expect(merchantIdToBytes32(vector.input.merchantId), vector.name).toBe(
        vector.merchantBytes32,
      );
    }
  });

  it("changes when any hashed field changes", () => {
    const baseline = canonicalIntentHash(BASE);
    const mutations: Array<Partial<CanonicalIntentInput>> = [
      { cardId: "8" },
      { agentId: "0x2222222222222222222222222222222222222222" },
      { merchantId: "tea-house" },
      { amountBaseUnits: "251" },
      { purpose: "demo tea purchase" },
      { expiresAt: "2026-09-09T00:06:00Z" },
      { policyVersion: 2 },
    ];
    for (const mutation of mutations) {
      expect(canonicalIntentHash({ ...BASE, ...mutation })).not.toBe(baseline);
    }
  });

  it("treats canonical timestamp forms as stable", () => {
    const withMillis = canonicalIntentHash({ ...BASE, expiresAt: "2026-09-09T00:05:00.000Z" });
    expect(withMillis).toBe(canonicalIntentHash(BASE));
  });

  it("treats checksummed and lowercase addresses as identical", () => {
    const checksummed = canonicalIntentHash({
      ...BASE,
      agentId: "0x1111111111111111111111111111111111111111",
    });
    expect(checksummed).toBe(canonicalIntentHash(BASE));
  });

  it("maps distinct merchant IDs to distinct bytes32 values", () => {
    expect(merchantIdToBytes32("coffee-demo")).toMatch(/^0x[0-9a-f]{64}$/);
    expect(merchantIdToBytes32("coffee-demo")).not.toBe(merchantIdToBytes32("tea-house"));
  });
});
