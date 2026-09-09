import { z } from "zod";
import { DomainError } from "./errors.js";

const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const utcSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/);

const STATUS = ["discovered", "proving", "verified", "rejected", "failed"] as const;
export type EvidenceStatus = (typeof STATUS)[number];

const TRANSITIONS: Record<EvidenceStatus, EvidenceStatus[]> = {
  discovered: ["proving", "verified", "rejected"],
  proving: ["verified", "rejected", "failed"],
  verified: [],
  rejected: [],
  failed: [],
};

export const CreditEvidenceRecordSchema = z
  .object({
    evidenceId: bytes32Schema,
    sourceChainKey: z.number().int().min(0),
    sourceTxHash: bytes32Schema,
    sourceContract: addressSchema,
    beneficiary: addressSchema,
    creditAmountBaseUnits: z.string().regex(/^[1-9][0-9]*$/),
    expiresAt: utcSchema,
    proofAttemptCount: z.number().int().min(0),
    proofTxHash: bytes32Schema.optional(),
    targetBlock: z.number().int().min(0).optional(),
    status: z.enum(STATUS),
    lastErrorCategory: z.string().min(1).max(64).optional(),
  })
  .strict();

export type CreditEvidenceRecord = z.infer<typeof CreditEvidenceRecordSchema>;

export function parseEvidenceRecord(input: unknown): CreditEvidenceRecord {
  const result = CreditEvidenceRecordSchema.safeParse(input);
  if (!result.success) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Evidence record failed strict validation.", {
      issues: result.error.issues.map((issue) => issue.path.join(".") || "(root)").join(","),
    });
  }
  return result.data;
}

export function transitionEvidenceStatus(from: EvidenceStatus, to: EvidenceStatus): EvidenceStatus {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Invalid evidence status transition.", {
      issues: `${from}->${to}`,
    });
  }
  return to;
}

export function deriveEvidenceKey(input: {
  sourceChainKey: number;
  sourceTxHash: string;
  evidenceId: string;
}): string {
  return `${input.sourceChainKey}|${input.sourceTxHash}|${input.evidenceId}`;
}

/** Strip endpoint-shaped values so classifications never leak URLs. */
export function sanitizeCategory(reason: string): string {
  return reason.replace(/https?:\/\/[^\s"']+/g, "[redacted-url]").slice(0, 64);
}

export function classifyProofOutcome(outcome: { ok: boolean; reason?: string }): {
  status: "verified" | "failed";
  category?: string;
} {
  if (outcome.ok) {
    return { status: "verified" };
  }
  return { status: "failed", category: sanitizeCategory(outcome.reason ?? "unknown") };
}
