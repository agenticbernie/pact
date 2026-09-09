import {
  deriveEvidenceKey,
  parseEvidenceRecord,
  transitionEvidenceStatus,
} from "@pact/domain";
import type { CreditEvidenceRecord, EvidenceStatus } from "@pact/domain";

export type { CreditEvidenceRecord, EvidenceStatus };
export { deriveEvidenceKey, transitionEvidenceStatus };

export interface EvidenceInput {
  evidenceId: string;
  sourceChainKey: number;
  sourceTxHash: string;
  sourceContract: string;
  beneficiary: string;
  creditAmountBaseUnits: string;
  expiresAt: string;
}

/** Build a validated `discovered` record. Proof blobs and keys never enter the shape. */
export function buildEvidenceRecord(input: EvidenceInput): CreditEvidenceRecord {
  return parseEvidenceRecord({ ...input, proofAttemptCount: 0, status: "discovered" });
}

export function advanceEvidenceRecord(
  record: CreditEvidenceRecord,
  to: EvidenceStatus,
  patch: Partial<CreditEvidenceRecord> = {},
): CreditEvidenceRecord {
  const next = transitionEvidenceStatus(record.status, to);
  return parseEvidenceRecord({ ...record, ...patch, status: next });
}
