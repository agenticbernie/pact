import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSessionCompositionRoot } from "../../session/index.ts";

const WALLET = "0x1111111111111111111111111111111111111111";

describe("G26 session persistence composition", () => {
  it("selects the PostgREST-shaped adapter from environment inputs", async () => {
    const requests: Array<{ method: string; path: string; body?: unknown }> = [];
    const handler = createSessionCompositionRoot({
      env: {
        SUPABASE_FUNCTION_REGION: "us-east-1",
        SB_REGION: "us-east-1",
        SESSION_HMAC_SECRET: "local-session-test",
        SUPABASE_URL: "https://local.supabase.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "local-postgrest-test",
      },
      postgrestTransport: async (request: { method: string; path: string; body?: unknown }) => {
        requests.push(request);
        return { status: 201, body: [] };
      },
    } as never);
    const response = await handler(new Request("https://regional.invalid/v1/session/challenge", {
      method: "POST",
      body: JSON.stringify({ wallet: WALLET, domain: "pact.test", chainLabel: "advance-testnet" }),
    }));
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.path).toBe("/rest/v1/session_challenges");
    expect(Object.keys((requests[0]?.body ?? {}) as object).sort()).toEqual([
      "expires_at", "issued_at", "message", "nonce_hash", "wallet_address",
    ]);
  });

  it("does not use a fake or Map fallback in the production composition root", () => {
    const source = readFileSync(new URL("../../session/index.ts", import.meta.url), "utf8");
    const root = source.slice(source.indexOf("export function createSessionCompositionRoot"));
    expect(root).toMatch(/createPostgrestPersistenceFromEnv/);
    expect(root).not.toMatch(/createFakePersistence|new Map/);
  });
});
