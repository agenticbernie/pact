/**
 * Where the console keeps its wallet-bound session token.
 *
 * `sessionStorage` is deliberate: the token is short-lived (30 minutes) and
 * holding it per browser tab means closing the tab ends the session. Nothing is
 * written to `localStorage`, so no credential outlives the tab.
 */
const STORAGE_KEY = "pact.console.session";

export type StoredSession = {
  token: string;
  wallet: string;
};

export function readStoredSession(): StoredSession | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const { token, wallet } = parsed as Record<string, unknown>;
    if (typeof token !== "string" || token === "") return null;
    if (typeof wallet !== "string" || wallet === "") return null;
    return { token, wallet };
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // A blocked storage backend only costs the user a re-connect, never correctness.
  }
}

export function clearStoredSession(): void {
  try {
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: nothing to clean up if storage is unavailable.
  }
}
