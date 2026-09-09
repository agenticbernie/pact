import { describe, expect, it } from "vitest";
import {
  deriveEvidenceKey,
  classifyProofOutcome,
  transitionEvidenceStatus,
  parseEvidenceRecord,
} from "../src/evidence.js";

describe("evidence record", () => {
  it("derives one evidence key per source event", () => {
    const ev1 = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const tx1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const tx2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(deriveEvidenceKey({ sourceChainKey: 1, sourceTxHash: tx1, evidenceId: ev1 })).toBe(
      `1|${tx1}|${ev1}`,
    );
    expect(deriveEvidenceKey({ sourceChainKey: 1, sourceTxHash: tx1, evidenceId: ev1 })).toBe(
      deriveEvidenceKey({ sourceChainKey: 1, sourceTxHash: tx1, evidenceId: ev1 }),
    );
    expect(deriveEvidenceKey({ sourceChainKey: 1, sourceTxHash: tx2, evidenceId: ev1 })).not.toBe(
      `1|${tx1}|${ev1}`,
    );
  });

  it("parses a valid record and rejects unknown keys", () => {
    const record = {
      evidenceId: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      sourceChainKey: 1,
      sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceContract: "0x1111111111111111111111111111111111111111",
      beneficiary: "0x2222222222222222222222222222222222222222",
      creditAmountBaseUnits: "500",
      expiresAt: "2026-09-09T00:05:00Z",
      proofAttemptCount: 0,
      status: "discovered",
    };
    expect(parseEvidenceRecord(record).status).toBe("discovered");
    expect(() => parseEvidenceRecord({ ...record, extra: "nope" })).toThrow();
  });

  it("enforces the status machine", () => {
    expect(transitionEvidenceStatus("discovered", "verified")).toBe("verified");
    expect(transitionEvidenceStatus("proving", "failed")).toBe("failed");
    expect(() => transitionEvidenceStatus("discovered", "failed")).toThrow();
    expect(() => transitionEvidenceStatus("verified", "proving")).toThrow();
  });

  it("classifies proof outcomes without leaking values", () => {
    expect(classifyProofOutcome({ ok: true }).status).toBe("verified");
    const bad = classifyProofOutcome({ ok: false, reason: "TIMEOUT https://builder.example/x" });
    expect(bad.status).toBe("failed");
    expect(JSON.stringify(bad)).not.toContain("builder.example");
  });
});
