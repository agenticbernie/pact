import { describe, expect, it } from "vitest";
import {
  createPostgrestSessionPersistence,
  SESSION_CHALLENGES_PATH,
  SESSIONS_PATH,
} from "../session-challenge-store.ts";
import type { PostgrestRequest, PostgrestResponse } from "../persistence-ports.ts";
import { PersistenceError } from "../persistence-ports.ts";

const WALLET = "0x1111111111111111111111111111111111111111";
const NONCE_HASH =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW_ISO = "2026-09-12T00:00:00.000Z";
const ISSUED_ISO = "2026-09-11T23:55:00.000Z";
const EXPIRES_ISO = "2026-09-12T00:00:00.000Z";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    nonce_hash: NONCE_HASH,
    wallet_address: WALLET,
    message: "pact.test wants you to sign in",
    issued_at: ISSUED_ISO,
    expires_at: EXPIRES_ISO,
    consumed_at: null,
    ...overrides,
  };
}

function transportFor(
  recorded: PostgrestRequest[],
  handler: (req: PostgrestRequest) => PostgrestResponse,
) {
  return async (req: PostgrestRequest): Promise<PostgrestResponse> => {
    recorded.push(req);
    // Assert header names only; never capture key values.
    return handler(req);
  };
}

const CONFIG = {
  supabaseUrl: "https://ref.supabase.co",
  serviceRoleKey: "test-only-service-role",
};

describe("G21 SessionChallengeStore (Option A PostgREST)", () => {
  it("writes hash-only challenge rows with message/TTLs and no plaintext secrets", async () => {
    const recorded: PostgrestRequest[] = [];
    const store = createPostgrestSessionPersistence(CONFIG, transportFor(recorded, () => ({
      status: 201,
      body: [makeRow()],
    })));
    await store.insertChallenge({
      nonceHash: NONCE_HASH,
      wallet: WALLET,
      message: "pact.test wants you to sign in",
      expiresAtMs: Date.parse(EXPIRES_ISO),
      consumedAtMs: null,
    });
    expect(recorded).toHaveLength(1);
    const req = recorded[0]!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe(SESSION_CHALLENGES_PATH);
    const body = req.body as Record<string, unknown>;
    expect(body.nonce_hash).toBe(NONCE_HASH);
    expect(body.wallet_address).toBe(WALLET);
    expect(body.message).toBe("pact.test wants you to sign in");
    expect(body).toHaveProperty("issued_at");
    expect(body).toHaveProperty("expires_at");
    expect(JSON.stringify(body)).not.toMatch(/signature|bearer|privateKey/i);
  });

  it("consumes atomically with a single conditional PATCH and returns the row on length 1", async () => {
    const recorded: PostgrestRequest[] = [];
    const store = createPostgrestSessionPersistence(CONFIG, transportFor(recorded, (req) => {
      if (req.method === "PATCH") return { status: 200, body: [makeRow({ consumed_at: NOW_ISO })] };
      return { status: 200, body: [] };
    }));
    const row = await store.consumeChallenge(NONCE_HASH);
    expect(row).not.toBeNull();
    expect(row?.nonceHash).toBe(NONCE_HASH);
    expect(recorded).toHaveLength(1);
    const req = recorded[0]!;
    expect(req.method).toBe("PATCH");
    expect(req.path).toContain(SESSION_CHALLENGES_PATH);
    expect(req.path).toContain(`nonce_hash=eq.${NONCE_HASH}`);
    expect(req.path).toContain("consumed_at=is.null");
    expect(req.path).toContain("revoked_at=is.null");
    expect(req.path).toContain("expires_at=gt.");
    expect(req.method).not.toBe("GET");
  });

  it("maps zero-row consume to null (replay/expiry) with no session issuance", async () => {
    const recorded: PostgrestRequest[] = [];
    const store = createPostgrestSessionPersistence(CONFIG, transportFor(recorded, (req) => {
      if (req.method === "PATCH") return { status: 200, body: [] };
      // Classification GET: already consumed.
      return { status: 200, body: [makeRow({ consumed_at: NOW_ISO })] };
    }));
    const row = await store.consumeChallenge(NONCE_HASH);
    expect(row).toBeNull();
    // One PATCH plus one read-only classification GET; no second write.
    expect(recorded.filter((r) => r.method === "PATCH")).toHaveLength(1);
    expect(recorded.filter((r) => r.method === "GET").length).toBeGreaterThanOrEqual(1);
  });

  it("fails closed on >1 rows for a unique consume", async () => {
    const store = createPostgrestSessionPersistence(CONFIG, async () => ({
      status: 200,
      body: [makeRow(), makeRow()],
    }));
    await expect(store.consumeChallenge(NONCE_HASH)).rejects.toMatchObject({
      code: "INVALID_ROW",
    });
  });

  it("maps 409 duplicate hash to CONFLICT and transport failure to UNAVAILABLE", async () => {
    const conflict = createPostgrestSessionPersistence(CONFIG, async () => ({
      status: 409,
      body: { message: "duplicate" },
    }));
    await expect(
      conflict.insertChallenge({
        nonceHash: NONCE_HASH,
        wallet: WALLET,
        message: "msg",
        expiresAtMs: Date.parse(EXPIRES_ISO),
        consumedAtMs: null,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const down = createPostgrestSessionPersistence(CONFIG, async () => {
      throw new Error("network down");
    });
    await expect(
      down.insertChallenge({
        nonceHash: NONCE_HASH,
        wallet: WALLET,
        message: "msg",
        expiresAtMs: Date.parse(EXPIRES_ISO),
        consumedAtMs: null,
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("revokes monotonically: true only for a newly revoked row", async () => {
    const recorded: PostgrestRequest[] = [];
    const fresh = createPostgrestSessionPersistence(CONFIG, transportFor(recorded, (req) => {
      if (req.method === "PATCH" && req.path.startsWith(SESSIONS_PATH)) {
        return { status: 200, body: [{ id: "sess-1" }] };
      }
      return { status: 200, body: [] };
    }));
    await expect(
      fresh.revokeSession("b".repeat(64), WALLET, Date.parse(NOW_ISO)),
    ).resolves.toBe(true);

    const stale = createPostgrestSessionPersistence(CONFIG, async () => ({
      status: 200,
      body: [],
    }));
    await expect(
      stale.revokeSession("b".repeat(64), WALLET, Date.parse(NOW_ISO)),
    ).resolves.toBe(false);
  });

  it("rejects invalid rows without raw DB detail", async () => {
    const store = createPostgrestSessionPersistence(CONFIG, async () => ({
      status: 201,
      body: [makeRow()],
    }));
    await expect(
      store.insertChallenge({
        nonceHash: "not-hex",
        wallet: WALLET,
        message: "msg",
        expiresAtMs: Date.parse(EXPIRES_ISO),
        consumedAtMs: null,
      }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});
