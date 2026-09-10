import { describe, expect, it } from "vitest";
import { MemoryEvidenceStore } from "../src/state-store.js";
import { runEvidenceOnce } from "../src/worker.js";
import type { EvidenceStore, ProofProvider } from "../src/types.js";
import { WorkerError } from "../src/types.js";

const EVIDENCE_KEY = "1|0xabc|0xev1";

function payload() {
  return {
    chainKey: 1,
    blockHeight: 100,
    encodedTransaction: "0xdeadbeef",
    merkleRoot: "0x4444",
    siblings: [{ hash: "0x5555", isLeft: true }],
    lowerEndpointDigest: "0x1111",
    continuityRoots: ["0x2222"],
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const store: EvidenceStore = new MemoryEvidenceStore();
  const proof: ProofProvider = {
    buildProof: () => Promise.resolve({ ok: true as const, payload: payload() }),
  };
  const base = {
    store,
    proof,
    allowedChainKeys: [1],
    submitExecute: () => {
      calls.push("submit");
      return Promise.resolve({ targetTxHash: "0xtarget1", reverted: false });
    },
    readTargetReceipt: () => Promise.resolve({ found: false, success: false }),
    sleep: () => Promise.resolve(),
    calls,
  };
  return { ...base, ...overrides };
}

describe("worker idempotency", () => {
  it("skips already-seen evidence without calling the prover", async () => {
    const d = deps();
    let proverCalls = 0;
    d.proof = {
      buildProof: () => {
        proverCalls += 1;
        return Promise.resolve({ ok: true as const, payload: payload() });
      },
    };
    await d.store.recordAttempt({ evidenceKey: EVIDENCE_KEY, sourceTxHash: "0xabc", status: "verified" });
    const result = await runEvidenceOnce({ ...d, evidenceKey: EVIDENCE_KEY, sourceTxHash: "0xabc" });
    expect(result.status).toBe("duplicate");
    expect(proverCalls).toBe(0);
    expect(d.calls).toEqual([]);
  });

  it("retries a pre-broadcast timeout under the same evidence key", async () => {
    const d = deps();
    let builds = 0;
    d.proof = {
      buildProof: () => {
        builds += 1;
        if (builds === 1) {
          return Promise.resolve({ ok: false as const, reason: "PROOF_TIMEOUT" });
        }
        return Promise.resolve({ ok: true as const, payload: payload() });
      },
    };
    const result = await runEvidenceOnce({ ...d, evidenceKey: EVIDENCE_KEY, sourceTxHash: "0xabc" });
    expect(result.status).toBe("verified");
    expect(builds).toBe(2);
    expect(d.calls).toEqual(["submit"]);
  });

  it("reconciles a broadcast timeout instead of resubmitting", async () => {
    const d = deps({
      submitExecute: () => {
        d2calls.push("submit");
        return Promise.reject(new WorkerError("BROADCAST_TIMEOUT_RECONCILED", EVIDENCE_KEY));
      },
      readTargetReceipt: () => Promise.resolve({ found: true, success: true, targetTxHash: "0xtarget9" }),
    });
    const d2calls: string[] = [];
    const result = await runEvidenceOnce({ ...d, evidenceKey: EVIDENCE_KEY, sourceTxHash: "0xabc" });
    expect(result.status).toBe("verified");
    expect(result.targetTxHash).toBe("0xtarget9");
    expect(d2calls).toEqual(["submit"]);
  });

  it("marks permanent proof failure without unbounded retry", async () => {
    let builds = 0;
    const d = deps();
    d.proof = {
      buildProof: () => {
        builds += 1;
        return Promise.resolve({ ok: false as const, reason: "PROOF_FAILED" });
      },
    };
    const result = await runEvidenceOnce({ ...d, evidenceKey: EVIDENCE_KEY, sourceTxHash: "0xabc" });
    expect(result.status).toBe("failed");
    expect(builds).toBe(3);
  });

  it("refuses a non-allowlisted chain before any proof call", async () => {
    let proverCalls = 0;
    const d = deps({ allowedChainKeys: [1] });
    d.proof = {
      buildProof: () => {
        proverCalls += 1;
        return Promise.resolve({ ok: true as const, payload: payload() });
      },
    };
    const result = await runEvidenceOnce({
      ...d,
      evidenceKey: "999|0xabc|0xev1",
      sourceTxHash: "0xabc",
      sourceChainKey: 999,
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toBe("CHAIN_NOT_ALLOWLISTED");
    expect(proverCalls).toBe(0);
  });

  it("records attempts with redacted errors", async () => {
    const store = new MemoryEvidenceStore();
    const d = deps({ store });
    d.proof = {
      buildProof: () => Promise.reject(new Error("https://secret-builder.example/key leaked? no")),
    };
    const result = await runEvidenceOnce({ ...d, evidenceKey: EVIDENCE_KEY, sourceTxHash: "0xabc" });
    expect(result.status).toBe("failed");
    const attempts = store.attemptsFor(EVIDENCE_KEY);
    expect(attempts.length).toBeGreaterThan(0);
    for (const attempt of attempts) {
      expect(JSON.stringify(attempt)).not.toContain("secret-builder.example");
    }
  });
});
