import { readFileSync } from "node:fs";
import { z } from "zod";
import { DomainError } from "./errors.ts";

/**
 * Single model truth (C-MODEL): `config/ai/model-config.json` is the ONLY
 * model pin — `{provider:openai, model:gpt-5.6-luna, allowFallback:false}`.
 * Loaded via this strict loader + `resolveOpenAIModel` with a pre-call
 * `allowFallback===false` assert. No `openai` package. No env substitution
 * (`OPENAI_MODEL` unset-or-equal or throw). `openai.json` must not fork
 * (thin assert-equal adapter; `model-config.json` authoritative).
 */

export const PINNED_MODEL = "gpt-5.6-luna" as const;

export type ModelConfig = {
  provider: "openai";
  model: typeof PINNED_MODEL;
  allowFallback: false;
};

const ModelConfigSchema = z
  .object({
    provider: z.literal("openai"),
    model: z.literal("gpt-5.6-luna"),
    allowFallback: z.literal(false),
  })
  .strict();

function readJsonInput(input: unknown): unknown {
  if (typeof input === "string" || input instanceof URL) {
    const path = typeof input === "string" ? input : input.pathname;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
      throw new DomainError("AI_CONFIG_INVALID", "Model config is not readable JSON.", {
        reason: "unreadable-config",
      });
    }
  }
  return input;
}

/** Strict loader for `config/ai/model-config.json` (the single source of truth). */
export function loadModelConfig(input: string | URL | unknown): ModelConfig {
  const result = ModelConfigSchema.safeParse(readJsonInput(input));
  if (!result.success) {
    throw new DomainError("AI_CONFIG_INVALID", "Model config is invalid.", {
      reason: "schema-rejected",
    });
  }
  return result.data;
}

/**
 * Edge-compatible entry (C4): parses already-loaded JSON text with the SAME
 * strict schema. Serve adapters bundle the pinned JSON statically
 * (`import ... with { type: "json" }`) or inject it — no disk read on Edge.
 */
export function parseModelConfigJson(jsonText: string): ModelConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw new DomainError("AI_CONFIG_INVALID", "Model config is invalid.", {
      reason: "unreadable-config",
    });
  }
  const result = ModelConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new DomainError("AI_CONFIG_INVALID", "Model config is invalid.", {
      reason: "schema-rejected",
    });
  }
  return result.data;
}

/** Pre-call gate: `allowFallback===false` must hold, or the call never starts. */
export function assertModelConfigAllowsCall(config: ModelConfig): void {
  if (config.allowFallback !== false) {
    throw new DomainError("AI_CONFIG_INVALID", "Model fallback is not permitted.", {
      reason: "fallback-rejected",
    });
  }
  if (config.provider !== "openai" || config.model !== PINNED_MODEL) {
    throw new DomainError("AI_CONFIG_INVALID", "Model pin mismatch.", {
      reason: "model-mismatch",
    });
  }
}
