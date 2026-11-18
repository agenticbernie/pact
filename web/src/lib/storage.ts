/** Browser storage can be unavailable in private mode or because of site policy. */
export function readStored(key: string): string | null {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); }
  catch { return null; }
}

export function writeStored(key: string, value: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key) === value;
  } catch { return false; }
}

export function removeStored(key: string): void {
  try { if (typeof window !== "undefined") window.localStorage.removeItem(key); }
  catch { /* Storage is optional except when explicitly required for signing/recovery. */ }
}
