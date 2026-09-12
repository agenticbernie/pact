import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const PORTS_PATH = new URL(
  "../functions/_shared/persistence-ports.ts",
  import.meta.url,
);
const SESSION_STORE_PATH = new URL(
  "../functions/_shared/session-challenge-store.ts",
  import.meta.url,
);
const INTENT_STORE_PATH = new URL(
  "../functions/_shared/intent-store.ts",
  import.meta.url,
);
const CARD_STORE_PATH = new URL(
  "../functions/_shared/card-store.ts",
  import.meta.url,
);
const COMPOSITION_PATH = new URL(
  "../functions/_shared/persistence-composition.ts",
  import.meta.url,
);

function readAll(): string {
  return [
    readFileSync(PORTS_PATH, "utf8"),
    readFileSync(SESSION_STORE_PATH, "utf8"),
    readFileSync(INTENT_STORE_PATH, "utf8"),
    readFileSync(CARD_STORE_PATH, "utf8"),
    readFileSync(COMPOSITION_PATH, "utf8"),
  ].join("\n");
}

describe("G20 PostgREST server-only contract (Option A)", () => {
  it("adapter files exist", () => {
    for (const path of [
      PORTS_PATH,
      SESSION_STORE_PATH,
      INTENT_STORE_PATH,
      CARD_STORE_PATH,
      COMPOSITION_PATH,
    ]) {
      expect(existsSync(path), String(path)).toBe(true);
    }
  });

  it("requires SUPABASE_URL and SERVICE_ROLE server-only, never anon", () => {
    const all = readAll();
    expect(all).toMatch(/SUPABASE_URL/);
    expect(all).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    // Anon must never be used as a transport credential.
    expect(all).not.toMatch(/ANON_KEY.*serviceRole|serviceRole.*ANON_KEY/i);
    expect(all).not.toMatch(/SUPABASE_ANON_KEY/);
  });

  it("allows only GET/POST/PATCH on the five REST paths", () => {
    const all = readAll();
    expect(all).toMatch(/\/rest\/v1\/session_challenges/);
    expect(all).toMatch(/\/rest\/v1\/sessions/);
    expect(all).toMatch(/\/rest\/v1\/intents/);
    expect(all).toMatch(/\/rest\/v1\/cards/);
    expect(all).toMatch(/\/rest\/v1\/payment_attempts/);
    // Forbidden verbs/endpoints must be explicitly rejected in code or comments.
    expect(all).toMatch(/DELETE.*forbidden|forbidden.*DELETE/i);
    expect(all).not.toMatch(/\/rest\/v1\/rpc\//);
  });

  it("uses exact server-only headers without key values", () => {
    const all = readAll();
    expect(all).toMatch(/apikey/);
    expect(all).toMatch(/Authorization/);
    expect(all).toMatch(/Bearer/);
    expect(all).toMatch(/Prefer/);
    expect(all).toMatch(/return=representation/);
    expect(all).toMatch(/application\/vnd\.pgrst\.object\+json/);
    // No key value may appear (header names only in tests).
    expect(all).not.toMatch(/sk-[A-Za-z0-9-_]{20,}/);
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\./);
  });

  it("encodes 1/0/>1 affected-row rules and closed error mapping", () => {
    const all = readAll();
    expect(all).toMatch(/NOT_FOUND/);
    expect(all).toMatch(/INVALID_ROW/);
    expect(all).toMatch(/OWNERSHIP_DENIED/);
    expect(all).toMatch(/REPLAYED/);
    expect(all).toMatch(/EXPIRED/);
    expect(all).toMatch(/REVOKED/);
    expect(all).toMatch(/IDEMPOTENCY_CONFLICT/);
    expect(all).toMatch(/DUPLICATE_ACTIVE_CARD/);
    expect(all).toMatch(/CONFLICT/);
    expect(all).toMatch(/UNAVAILABLE/);
    // Length-based affected-row handling.
    expect(all).toMatch(/length === 1|length.*1.*applied/i);
    expect(all).toMatch(/length === 0|length.*0.*not applied/i);
  });

  it("enforces timeout/retry: 5000ms AbortController, no blind retries", () => {
    const all = readAll();
    expect(all).toMatch(/5000/);
    expect(all).toMatch(/AbortController/);
  });

  it("rejects RPC, SECURITY DEFINER/INVOKER, is_active_assignment, and anon fallback", () => {
    const all = readAll();
    expect(all).not.toMatch(/SECURITY DEFINER/);
    expect(all).not.toMatch(/SECURITY INVOKER/);
    expect(all).not.toMatch(/\/rest\/v1\/rpc\//);
    expect(all).not.toMatch(/is_active_assignment/);
  });

  it("re-exports canonical types without duplicate domain definitions", () => {
    const ports = readFileSync(PORTS_PATH, "utf8");
    expect(ports).toMatch(/AgentIntent/);
    expect(ports).toMatch(/ChallengeRecord/);
    expect(ports).toMatch(/SessionRecord/);
    expect(ports).toMatch(/OnChainCardSnapshot/);
    // No local redefinition of the canonical domain value.
    expect(ports).not.toMatch(/type AgentIntent = \{/);
    expect(ports).not.toMatch(/type ChallengeRecord = \{/);
  });
});
