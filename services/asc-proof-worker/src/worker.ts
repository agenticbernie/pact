import type {
  AscProofPayload,
  EvidenceStore,
  ProofProvider,
  WorkerReason,
} from "./types.js";
import { MAX_ATTEMPTS, RETRY_DELAY_MS, WorkerError } from "./types.js";

export interface SubmitResult {
  targetTxHash: string;
}

export interface TargetReceipt {
  found: boolean;
  success: boolean;
  targetTxHash?: string;
}

export interface RunInput {
  evidenceKey: string;
  sourceTxHash: string;
  sourceChainKey?: number;
  store: EvidenceStore;
  proof: ProofProvider;
  allowedChainKeys: number[];
  submitExecute: (payload: AscProofPayload) => Promise<SubmitResult>;
  readTargetReceipt: (targetTxHash?: string) => Promise<TargetReceipt>;
  sleep?: (ms: number) => Promise<void>;
}

export interface EvidenceResult {
  status: "verified" | "duplicate" | "failed" | "rejected";
  reason?: string;
  targetTxHash?: string;
  attempts: number;
}

export function chainKeyOf(evidenceKey: string): number {
  return Number(evidenceKey.split("|")[0]);
}

/** Strip URLs and cap length so stored diagnostics never carry endpoints or keys. */
export function sanitizeDiagnostic(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/https?:\/\/[^\s"']+/g, "[redacted-url]").slice(0, 200);
}

/**
 * One evidence item, start to terminal state. Order: allowlist → dedupe →
 * bounded prove/submit loop with reconcile-before-retry. Never writes credit
 * directly; submission goes through the ASC contract only.
 */
export async function runEvidenceOnce(input: RunInput): Promise<EvidenceResult> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const chainKey = input.sourceChainKey ?? chainKeyOf(input.evidenceKey);
  if (!input.allowedChainKeys.includes(chainKey)) {
    await input.store.recordAttempt({
      evidenceKey: input.evidenceKey,
      sourceTxHash: input.sourceTxHash,
      status: "rejected",
    });
    return { status: "rejected", reason: "CHAIN_NOT_ALLOWLISTED", attempts: 0 };
  }
  if (await input.store.seen(input.evidenceKey)) {
    return { status: "duplicate", attempts: 0 };
  }
  let lastTargetTx: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let payload: AscProofPayload;
    try {
      const outcome = await input.proof.buildProof(input.sourceTxHash, chainKey);
      if (!outcome.ok) {
        await input.store.recordAttempt({
          evidenceKey: input.evidenceKey,
          sourceTxHash: input.sourceTxHash,
          status: `proof-attempt-${attempt}`,
        });
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        const reason: WorkerReason = outcome.reason === "PROOF_TIMEOUT" ? "PROOF_TIMEOUT" : "PROOF_FAILED";
        return { status: "failed", reason, attempts: attempt };
      }
      payload = outcome.payload;
    } catch (error) {
      await input.store.recordAttempt({
        evidenceKey: input.evidenceKey,
        sourceTxHash: input.sourceTxHash,
        status: `proof-error-${attempt}:${sanitizeDiagnostic(error)}`,
      });
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return { status: "failed", reason: sanitizeDiagnostic(error), attempts: attempt };
    }
    try {
      const submitted = await input.submitExecute(payload);
      lastTargetTx = submitted.targetTxHash;
      await input.store.recordAttempt({
        evidenceKey: input.evidenceKey,
        sourceTxHash: input.sourceTxHash,
        status: "verified",
        targetTxHash: lastTargetTx,
      });
      return { status: "verified", targetTxHash: lastTargetTx, attempts: attempt };
    } catch (error) {
      if (error instanceof WorkerError && error.reason === "BROADCAST_TIMEOUT_RECONCILED") {
        const receipt = await input.readTargetReceipt(lastTargetTx);
        if (receipt.found && receipt.success) {
          const targetTxHash = receipt.targetTxHash ?? lastTargetTx;
          await input.store.recordAttempt({
            evidenceKey: input.evidenceKey,
            sourceTxHash: input.sourceTxHash,
            status: "verified",
            targetTxHash,
          });
          return { status: "verified", targetTxHash, attempts: attempt };
        }
        await input.store.recordAttempt({
          evidenceKey: input.evidenceKey,
          sourceTxHash: input.sourceTxHash,
          status: `broadcast-timeout-${attempt}`,
          targetTxHash: lastTargetTx,
        });
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return { status: "failed", reason: "BROADCAST_TIMEOUT_RECONCILED", attempts: attempt };
      }
      const reason = error instanceof WorkerError ? error.reason : "EXECUTE_REVERTED";
      await input.store.recordAttempt({
        evidenceKey: input.evidenceKey,
        sourceTxHash: input.sourceTxHash,
        status: `failed:${sanitizeDiagnostic(reason)}`,
      });
      return { status: "failed", reason: sanitizeDiagnostic(reason), attempts: attempt };
    }
  }
  return { status: "failed", reason: "MAX_ATTEMPTS", attempts: MAX_ATTEMPTS };
}
