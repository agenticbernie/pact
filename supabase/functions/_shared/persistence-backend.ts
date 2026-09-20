/**
 * Persistence backend selector (Neon migration foundation).
 *
 * Additive only: existing PostgREST ports/stores are untouched and remain the
 * default. This selector reserves the Neon transport ids as explicitly
 * NOT_IMPLEMENTED so no caller can silently assume a Neon backend exists.
 * No secret names or values are introduced here.
 */

export type PersistenceBackendId = "supabase-postgrest" | "neon-data-api" | "neon-postgres";

const BACKEND_IDS: readonly PersistenceBackendId[] = [
  "supabase-postgrest",
  "neon-data-api",
  "neon-postgres",
];

export type PersistenceBackendSelection = {
  id: PersistenceBackendId;
  /** False until the backend transport is implemented AND live-verified. */
  ready: boolean;
  reason: "OK" | "NOT_IMPLEMENTED";
};

export function resolvePersistenceBackend(
  env: Record<string, string | undefined>,
): PersistenceBackendSelection {
  const raw = env["PERSISTENCE_BACKEND"];
  if (raw === undefined || raw === "") {
    return { id: "supabase-postgrest", ready: true, reason: "OK" };
  }
  if (!(BACKEND_IDS as readonly string[]).includes(raw)) {
    throw new Error(`unknown persistence backend: ${raw}`);
  }
  const id = raw as PersistenceBackendId;
  if (id === "supabase-postgrest") {
    return { id, ready: true, reason: "OK" };
  }
  return { id, ready: false, reason: "NOT_IMPLEMENTED" };
}

/** Names-only description safe for logs and evidence packs. */
export function describePersistenceBackend(selection: PersistenceBackendSelection): string {
  return `persistence backend: ${selection.id} (ready=${String(selection.ready)}, reason=${selection.reason})`;
}
