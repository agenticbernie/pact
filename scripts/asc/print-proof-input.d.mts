export const STEP0_PUBLIC: string[];
export const STEP0_SECRET: string[];
export const DERIVED_LATER: string[];

export interface StepZeroResult {
  ok: boolean;
  states: Record<string, "set" | "missing">;
  missing: string[];
  pendingDerived: string[];
}

export function checkStepZero(env?: Record<string, string | undefined>): StepZeroResult;
