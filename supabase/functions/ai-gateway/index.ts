/**
 * Regional OpenAI gateway route (Task 3 + S1/S2): POST /v1/agent/intents.
 *
 * - Region is checked against configured SUPABASE_FUNCTION_REGION BEFORE any
 *   provider call (REGION_MISMATCH, zero chain calls).
 * - Provider output is merchantId-only; card ID, agent, asset, recipient,
 *   allowlist, policyVersion (from the on-chain card snapshot), and expiresAt
 *   (canonical UTC) are resolved server-side. Any model-supplied
 *   recipientAddress/address/asset/card/nonce fails closed with
 *   PROVIDER_OUTPUT_INVALID, zero chain calls, no `ready` persist.
 * - Hash + expiry use the Phase 01 canonical exports (no local copy).
 * - This module never imports the executor signer.
 */
import { parseUnits } from "ethers";
import { assertMerchantAllowed, createMerchantCatalog, parseAgentIntent } from "../../../packages/domain/src/schemas.ts";
import { canonicalIntentHash } from "../../../packages/domain/src/canonical-hash.ts";
import {
  MAX_PROMPT_LENGTH,
  createApiError,
  parseIntentRequest,
  requireRequestId,
} from "../../../packages/domain/src/api.ts";
import type { AgentIntent } from "../../../packages/domain/src/types.ts";
import type { ApiError } from "../../../packages/domain/src/api.ts";
import { assertMerchantInCatalog } from "./catalog.ts";
import type { AiProvider, MerchantCatalogItem, ProviderCardContext } from "./provider-port.ts";

export type GatewayDeps = {
  provider: AiProvider;
  card: ProviderCardContext;
  merchants: ReadonlyArray<MerchantCatalogItem>;
  expectedRegion: string;
  actualRegion: string;
  nowMs: number;
};

export type GatewayResult =
  | { ok: true; intent: AgentIntent; intentId: string; requestId: string; status: "ready" }
  | { ok: false; error: ApiError };

const NATIVE_DECIMALS = 18;
const INTENT_TTL_MS = 15 * 60 * 1000;

function fail(requestId: string, code: string): GatewayResult {
  const known: string[] = [
    "AUTH_REQUIRED",
    "AUTH_INVALID",
    "AUTH_EXPIRED",
    "INPUT_INVALID",
    "NETWORK_CONFIG_INVALID",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_MODEL_UNAVAILABLE",
    "PROVIDER_OUTPUT_INVALID",
    "REGION_MISMATCH",
    "CARD_NOT_ELIGIBLE",
    "PREFLIGHT_DECLINED",
    "PAYMENT_BROADCAST_TIMEOUT",
    "PAYMENT_FAILED",
    "PAYMENT_RECONCILIATION_REQUIRED",
    "RATE_LIMITED",
  ];
  const safe = known.includes(code) ? code : "INPUT_INVALID";
  return {
    ok: false,
    error: createApiError(safe as Parameters<typeof createApiError>[0], requestId),
  };
}

export async function handleIntentRequest(
  input: { prompt: unknown; cardId: unknown; requestId: unknown },
  deps: GatewayDeps,
): Promise<GatewayResult> {
  const rawRequestId = typeof input.requestId === "string" ? input.requestId : "req-unknown";
  let requestId: string;
  try {
    requestId = requireRequestId(input.requestId);
  } catch {
    return fail(rawRequestId, "INPUT_INVALID");
  }
  let parsed: { cardId: string; prompt: string };
  try {
    parsed = parseIntentRequest({ cardId: input.cardId, prompt: input.prompt });
  } catch {
    return fail(requestId, "INPUT_INVALID");
  }
  if (parsed.prompt.length > MAX_PROMPT_LENGTH) {
    return fail(requestId, "INPUT_INVALID");
  }
  if (parsed.cardId !== deps.card.cardId) {
    return fail(requestId, "CARD_NOT_ELIGIBLE");
  }
  // Region gate BEFORE any provider call.
  if (deps.actualRegion !== deps.expectedRegion) {
    return fail(requestId, "REGION_MISMATCH");
  }

  let provided: {
    provider: string;
    model: string;
    merchantId: string;
    amountDecimal: string;
    purpose: string;
    confidence: number;
  };
  try {
    const result = await deps.provider.parseIntent({
      prompt: parsed.prompt,
      card: deps.card,
      merchants: deps.merchants,
    });
    provided = result as unknown as typeof provided;
  } catch (error) {
    const record = error as { code?: unknown; status?: unknown };
    if (typeof record.code === "string") {
      return fail(requestId, record.code);
    }
    if (record.status === 429) {
      return fail(requestId, "RATE_LIMITED");
    }
    if (record.status === 404) {
      return fail(requestId, "PROVIDER_MODEL_UNAVAILABLE");
    }
    return fail(requestId, "PROVIDER_UNAVAILABLE");
  }

  if (provided.provider !== "openai") {
    return fail(requestId, "PROVIDER_OUTPUT_INVALID");
  }
  if (provided.model !== "gpt-5.6-luna") {
    return fail(requestId, "PROVIDER_MODEL_UNAVAILABLE");
  }
  // MerchantId-only enforcement: any extra client/model field is rejected.
  const rawKeys = Object.keys(provided as unknown as Record<string, unknown>);
  const allowed = new Set(["provider", "model", "merchantId", "amountDecimal", "purpose", "confidence"]);
  for (const key of rawKeys) {
    if (!allowed.has(key)) {
      return fail(requestId, "PROVIDER_OUTPUT_INVALID");
    }
  }
  try {
    assertMerchantInCatalog(deps.merchants, provided.merchantId);
    // Phase 01 second-pass: catalog allowlist through the shared authority.
    assertMerchantAllowed(
      createMerchantCatalog(deps.merchants.map((item) => item.id)),
      provided.merchantId,
    );
  } catch {
    return fail(requestId, "PROVIDER_OUTPUT_INVALID");
  }
  let amountBaseUnits: string;
  try {
    if (!/^\d+(\.\d+)?$/.test(provided.amountDecimal)) {
      throw new Error("bad-decimal");
    }
    amountBaseUnits = parseUnits(provided.amountDecimal, NATIVE_DECIMALS).toString();
    if (amountBaseUnits === "0") {
      throw new Error("zero-amount");
    }
  } catch {
    return fail(requestId, "PROVIDER_OUTPUT_INVALID");
  }
  if (provided.purpose.length === 0 || provided.purpose.length > 160) {
    return fail(requestId, "PROVIDER_OUTPUT_INVALID");
  }
  if (!(provided.confidence >= 0 && provided.confidence <= 1)) {
    return fail(requestId, "PROVIDER_OUTPUT_INVALID");
  }

  const createdAt = new Date(deps.nowMs).toISOString();
  const expiresAt = new Date(deps.nowMs + INTENT_TTL_MS).toISOString();
  const intentId = `intent-${requestId}`;
  let intentHash: string;
  try {
    intentHash = canonicalIntentHash({
      cardId: deps.card.cardId,
      agentId: deps.card.agent,
      merchantId: provided.merchantId,
      amountBaseUnits,
      asset: "native-testnet-ctc",
      purpose: provided.purpose,
      expiresAt,
      policyVersion: deps.card.policyVersion,
    });
  } catch {
    return fail(requestId, "PROVIDER_OUTPUT_INVALID");
  }
  try {
    const intent = parseAgentIntent({
      intentId,
      agentId: deps.card.agent,
      cardId: deps.card.cardId,
      merchantId: provided.merchantId,
      amountBaseUnits,
      asset: "native-testnet-ctc",
      purpose: provided.purpose,
      confidence: provided.confidence,
      provider: "openai",
      model: "gpt-5.6-luna",
      createdAt,
      expiresAt,
      policyVersion: deps.card.policyVersion,
      intentHash,
    });
    return { ok: true, intent, intentId, requestId, status: "ready" };
  } catch {
    return fail(requestId, "PROVIDER_OUTPUT_INVALID");
  }
}
