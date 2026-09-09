import type { EvidenceAttempt, EvidenceStore } from "./types.js";

/** In-memory evidence store. Production wiring swaps this for durable storage
 * behind the same interface; retry/dedupe semantics do not change. */
export class MemoryEvidenceStore implements EvidenceStore {
  private readonly attempts = new Map<string, EvidenceAttempt[]>();
  private cursor = 0;

  async seen(evidenceKey: string): Promise<boolean> {
    return (this.attempts.get(evidenceKey) ?? []).length > 0;
  }

  async recordAttempt(input: EvidenceAttempt): Promise<void> {
    const list = this.attempts.get(input.evidenceKey) ?? [];
    list.push({ ...input });
    this.attempts.set(input.evidenceKey, list);
  }

  attemptsFor(evidenceKey: string): EvidenceAttempt[] {
    return [...(this.attempts.get(evidenceKey) ?? [])];
  }

  getCursor(): number {
    return this.cursor;
  }

  setCursor(value: number): void {
    this.cursor = value;
  }
}
