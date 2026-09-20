import { describe, expect, it } from "vitest";
import {
  validateSeedPayloads,
  type SeedCardInput,
  type SeedIntentInput,
} from "../seed-validator.ts";

const CARD: SeedCardInput = {
  card_id: "1",
  controller_address: "0x7a474c005433def5fc496d2016f6ae794edfc423",
  owner_address: "0xb8bdcc633cd8e67250358d807918f99dc0c14d52",
  agent_id: "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682",
  asset: "arc-testnet-usdc",
  chain_id: 5042002,
  status: "ACTIVE",
  owner_configured_cap: "100000000000000000",
  per_transaction_limit: "10000000000000000",
  verified_credit: "100000000000000000",
  verified_credit_expires_at: "2026-09-19T12:00:00.000Z",
  spent: "10000000000000000",
  expires_at: "2026-09-20T23:00:00.000Z",
  policy_version: 1,
  allowlist_hash: "0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70",
  source_block: 62948913,
  source_tx_hash: "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb",
};

function intent(expiresAt: string, overrides: Record<string, unknown> = {}): SeedIntentInput {
  return {
    intent_id: "intent-req-1",
    card_id: "1",
    agent_id: "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682",
    merchant_id: "arc-demo-merchant",
    amount_base_units: "10000000000000000",
    asset: "arc-testnet-usdc",
    chain_id: 5042002,
    purpose: "arc lane readiness probe",
    confidence: 0.9,
    provider: "openai",
    model: "gpt-5.6-luna",
    policy_version: 1,
    created_at: "2026-09-20T11:00:00.000Z",
    expires_at: expiresAt,
    request_id: "req-seed-neon-1",
    idempotency_key: "intent-req-1",
    ...overrides,
  } as SeedIntentInput;
}

describe("Neon seed validator", () => {
  it("accepts the verified Arc seed pair and returns the canonical hash", () => {
    const result = validateSeedPayloads({
      card: CARD,
      intent: intent("2026-09-20T13:08:53.827Z"),
      nowMs: Date.parse("2026-09-20T11:08:53.827Z"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonicalHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.canonicalHash).toBe("0x96733916cf3f767a24d7f6069c34b3a7f614b4b13fefda4411c20e33b72b413a");
    }
  });

  it("rejects CTC disguise, chain mismatch, and bad provenance", () => {
    const base = { card: CARD, intent: intent("2026-09-20T13:08:53.827Z"), nowMs: Date.parse("2026-09-20T11:08:53.827Z") };
    expect(validateSeedPayloads({ ...base, card: { ...CARD, asset: "native-testnet-ctc", chain_id: 102031 } }).ok).toBe(false);
    expect(validateSeedPayloads({ ...base, card: { ...CARD, chain_id: 102031 } }).ok).toBe(false);
    expect(validateSeedPayloads({ ...base, card: { ...CARD, controller_address: "0x1111111111111111111111111111111111111111" } }).ok).toBe(false);
    expect(validateSeedPayloads({ ...base, card: { ...CARD, source_block: 1 } }).ok).toBe(false);
    expect(validateSeedPayloads({ ...base, card: { ...CARD, owner_address: "0x1111111111111111111111111111111111111111" } }).ok).toBe(false);
  });

  it("rejects agent/policy/allowlist/hash/expiry mismatches", () => {
    const base = { card: CARD, intent: intent("2026-09-20T13:08:53.827Z"), nowMs: Date.parse("2026-09-20T11:08:53.827Z") };
    expect(validateSeedPayloads({ ...base, intent: intent("2026-09-20T13:08:53.827Z", { agent_id: "0x1111111111111111111111111111111111111111" }) }).ok).toBe(false);
    expect(validateSeedPayloads({ ...base, intent: intent("2026-09-20T13:08:53.827Z", { policy_version: 2 }) }).ok).toBe(false);
    expect(validateSeedPayloads({ ...base, intent: intent("2026-09-20T10:00:00.000Z") }).ok).toBe(false);
    expect(validateSeedPayloads({ ...base, intent: intent("2026-09-20T13:08:53.827Z", { merchant_id: "" }) }).ok).toBe(false);
  });
});
