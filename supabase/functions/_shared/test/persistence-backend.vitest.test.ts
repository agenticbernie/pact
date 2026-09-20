import { describe, expect, it } from "vitest";
import {
  describePersistenceBackend,
  resolvePersistenceBackend,
} from "../persistence-backend.ts";

describe("persistence backend selector (Supabase now, Neon reserved)", () => {
  it("defaults to the Supabase PostgREST backend with zero config", () => {
    const resolved = resolvePersistenceBackend({});
    expect(resolved.id).toBe("supabase-postgrest");
    expect(resolved.ready).toBe(true);
  });

  it("accepts an explicit Supabase backend selection", () => {
    const resolved = resolvePersistenceBackend({
      PERSISTENCE_BACKEND: "supabase-postgrest",
    });
    expect(resolved.ready).toBe(true);
  });

  it("marks Neon backends as reserved-but-not-ready, fail-closed", () => {
    for (const id of ["neon-data-api", "neon-postgres"] as const) {
      const resolved = resolvePersistenceBackend({ PERSISTENCE_BACKEND: id });
      expect(resolved.id).toBe(id);
      expect(resolved.ready).toBe(false);
      expect(resolved.reason).toMatch(/NOT_IMPLEMENTED/);
    }
  });

  it("rejects unknown backend ids", () => {
    expect(() =>
      resolvePersistenceBackend({ PERSISTENCE_BACKEND: "dynamodb" }),
    ).toThrow(/unknown persistence backend/i);
  });

  it("describes backends with names only, never secret values", () => {
    const text = describePersistenceBackend(
      resolvePersistenceBackend({ PERSISTENCE_BACKEND: "neon-data-api" }),
    );
    expect(text).toContain("neon-data-api");
    expect(text).not.toMatch(/sk-|eyJ|BEGIN .*PRIVATE KEY/);
  });
});
