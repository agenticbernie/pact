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
import { isApiErrorCode } from "../../../packages/domain/src/api.ts";
import type { AgentIntent } from "../../../packages/domain/src/types.ts";
import type { ApiError } from "../../../packages/domain/src/api.ts";
import { OpenAiProvider, type FetchFn } from "./openai-provider.ts";
import { parseModelConfigJson } from "../../../packages/domain/src/model-config.ts";
import { assertMerchantInCatalog } from "./catalog.ts";
import type { AiProvider, MerchantCatalogItem, ProviderCardContext } from "./provider-port.ts";
import { buildHealth } from "../_shared/health.ts";
import { TARGET_CHAIN_ID } from "../_shared/chain-config.ts";

export type GatewayDeps = {
  provider: AiProvider;
  card: ProviderCardContext;
  merchants: ReadonlyArray<MerchantCatalogItem>;
  expectedRegion: string;
  actualRegion: string;
  nowMs: number;
};

export type IntentStore = {
  save(intent: AgentIntent): Promise<void>;
};

export type GatewayRuntimeDeps = GatewayDeps & { store: IntentStore };

export type GatewayRequestDeps = GatewayRuntimeDeps & {
  configuredRegion: string;
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
  const safe = isApiErrorCode(code) && known.includes(code) ? code : "INPUT_INVALID";
  return {
    ok: false,
    error: createApiError(safe, requestId),
  };
}

export async function handleRuntimeIntentRequest(
  input: { prompt: unknown; cardId: unknown; requestId: unknown },
  deps: GatewayRuntimeDeps,
): Promise<GatewayResult> {
  const result = await handleIntentRequest(input, deps);
  if (result.ok) await deps.store.save(result.intent);
  return result;
}

export async function handleHealthRequest(
  request: Request,
  input: { configuredRegion: string; expectedRegion: string; chainId?: number; modelAvailable: boolean },
): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? `req-${crypto.randomUUID()}`;
  if (request.method !== "GET" || new URL(request.url).pathname !== "/health") {
    return new Response(JSON.stringify({ requestId, code: "INPUT_INVALID", message: "Unsupported health route." }), {
      status: 404,
      headers: { "content-type": "application/json", "x-request-id": requestId },
    });
  }
  const body = buildHealth({
    requestId,
    configuredRegion: input.configuredRegion,
    expectedRegion: input.expectedRegion,
    chainId: input.chainId ?? TARGET_CHAIN_ID,
    model: "gpt-5.6-luna",
    modelAvailable: input.modelAvailable,
  });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

export function createGatewayEntrypointHandler(input: {
  deps?: GatewayRequestDeps;
  configuredRegion?: string;
  expectedRegion?: string;
} = {}): (request: Request) => Promise<Response> {
  const expectedRegion = input.expectedRegion ?? "us-east-1";
  return async (request) => {
    const requestId = request.headers.get("x-request-id") ?? `req-${crypto.randomUUID()}`;
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return handleHealthRequest(request, {
        configuredRegion: input.configuredRegion ?? input.deps?.configuredRegion ?? "unknown",
        expectedRegion,
        modelAvailable: false,
      });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/agent/intents") {
      return new Response(JSON.stringify({ requestId, code: "INPUT_INVALID", message: "Unsupported gateway route." }), {
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    if (input.deps === undefined || input.deps.configuredRegion !== expectedRegion) {
      return new Response(JSON.stringify({ requestId, code: "REGION_MISMATCH", message: "Function region mismatch." }), {
        status: 503,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ requestId, code: "INPUT_INVALID", message: "Invalid request." }), {
        status: 400,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    const result = await handleRuntimeIntentRequest({
      prompt: body.prompt,
      cardId: body.cardId,
      requestId,
    }, input.deps);
    return new Response(JSON.stringify(result.ok ? result : result.error), {
      status: result.ok ? 200 : 400,
      headers: { "content-type": "application/json", "x-request-id": requestId },
    });
  };
}

type RuntimeEnv = Record<string, string | undefined>;
type Server = (handler: (request: Request) => Response | Promise<Response>) => void;

export function createGatewayCompositionRoot(input: {
  env?: RuntimeEnv;
  provider?: AiProvider;
  card?: ProviderCardContext;
  merchants?: ReadonlyArray<MerchantCatalogItem>;
  store?: IntentStore;
  fetchFn?: FetchFn;
} = {}): (request: Request) => Promise<Response> {
  const env = input.env ?? {};
  const configuredRegion = env.SUPABASE_FUNCTION_REGION;
  const expectedRegion = "us-east-1";
  const provider = input.provider ?? (env.OPENAI_API_KEY === undefined || input.fetchFn === undefined
    ? undefined
    : new OpenAiProvider({
      apiKey: env.OPENAI_API_KEY,
      region: configuredRegion,
      modelConfig: parseModelConfigJson('{"provider":"openai","model":"gpt-5.6-luna","allowFallback":false}'),
      fetchFn: input.fetchFn,
    }));
  if (
    configuredRegion === undefined ||
    provider === undefined ||
    input.card === undefined ||
    input.merchants === undefined ||
    input.store === undefined
  ) {
    return createGatewayEntrypointHandler({ configuredRegion, expectedRegion });
  }
  return createGatewayEntrypointHandler({
    configuredRegion,
    expectedRegion,
    deps: {
      provider,
      card: input.card,
      merchants: input.merchants,
      expectedRegion,
      actualRegion: configuredRegion,
      nowMs: Date.now(),
      store: input.store,
      configuredRegion,
    },
  });
}

export function startGatewayServer(input: {
  serve: Server;
  env?: RuntimeEnv;
  provider?: AiProvider;
  card?: ProviderCardContext;
  merchants?: ReadonlyArray<MerchantCatalogItem>;
  store?: IntentStore;
  fetchFn?: FetchFn;
}): void {
  input.serve(createGatewayCompositionRoot(input));
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

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare const crypto: { randomUUID(): string };

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  startGatewayServer({
    serve: Deno.serve,
    env: { SUPABASE_FUNCTION_REGION: Deno.env.get("SUPABASE_FUNCTION_REGION"), OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY") },
    fetchFn: fetch as unknown as FetchFn,
  });
}
