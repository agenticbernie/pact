export const REQUIRED_PUBLIC: string[];
export const REQUIRED_SECRETS: string[];
export const MAINNET_BLOCKED: number[];
export const TASK_TARGET_CHAIN_ID: number;
export const TARGET_ALLOWLIST: number[];
export const SOURCE_CHAIN_ID: number;

export interface DryRunReport {
  dryRun: true;
  stage: string;
  ok: boolean;
  states: Record<string, "set" | "missing">;
  missing: string[];
}

export class ChainGuardError extends Error {
  code: string;
  reason: string;
  constructor(reason: string);
}

export function getDryRunReport(env?: Record<string, string | undefined>): DryRunReport;
export function assertChainGuard(args?: {
  targetChainId: number;
  configChainId: number;
}): { ok: true; targetChainId: number };
