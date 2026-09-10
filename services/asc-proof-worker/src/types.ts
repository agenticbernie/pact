export type SiblingProof = {
  hash: string;
  isLeft: boolean;
};

export type AscProofPayload = {
  chainKey: number;
  blockHeight: number;
  encodedTransaction: string;
  merkleRoot: string;
  siblings: SiblingProof[];
  lowerEndpointDigest: string;
  continuityRoots: string[];
};

/** Positional args for ASC `execute()`, in canonical order. */
export type ExecuteArgs = [
  action: number,
  chainKey: number,
  height: number,
  encodedTransaction: string,
  merkleRoot: string,
  siblings: SiblingProof[],
  lowerEndpointDigest: string,
  continuityRoots: string[],
];

export type ProofOutcome =
  | { ok: true; payload: AscProofPayload }
  | { ok: false; reason: string };

export interface ProofProvider {
  buildProof(sourceTxHash: string, sourceChainKey: number): Promise<ProofOutcome>;
}

export interface EvidenceAttempt {
  evidenceKey: string;
  sourceTxHash: string;
  status: string;
  targetTxHash?: string;
}

export interface EvidenceStore {
  seen(evidenceKey: string): Promise<boolean>;
  recordAttempt(input: EvidenceAttempt): Promise<void>;
}

export type WorkerReason =
  | "CHAIN_NOT_ALLOWLISTED"
  | "ALREADY_SEEN"
  | "PROOF_TIMEOUT"
  | "PROOF_FAILED"
  | "ATTESTATION_TIMEOUT"
  | "BROADCAST_TIMEOUT_RECONCILED"
  | "EXECUTE_REVERTED"
  | "VERIFY_FAILED";

export class WorkerError extends Error {
  readonly reason: WorkerReason;
  readonly evidenceKey: string;

  constructor(reason: WorkerReason, evidenceKey: string) {
    super(`proof worker ${reason} for evidence ${evidenceKey}.`);
    this.name = "WorkerError";
    this.reason = reason;
    this.evidenceKey = evidenceKey;
  }
}

export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 5000;
export const GAS_BUFFER_PERCENT = 135;
export const MAX_LOG_BLOCK_RANGE = 50;
export const ATTESTATION_TIMEOUT_MS = 1200000;
