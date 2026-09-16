/**
 * Regional OpenAI gateway route (Task 3 + S1/S2): POST /v1/agent/intents.
 *
 * - Expected project region and observed execution region are validated before
 *   any provider call (REGION_MISMATCH, zero chain calls).
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
import { assertMerchantInCatalog, loadMerchantCatalog } from "./catalog.ts";
import type { AiProvider, MerchantCatalogItem, ProviderCardContext } from "./provider-port.ts";
import { buildHealth } from "../_shared/health.ts";
import { normalizeFunctionPath } from "../_shared/path-prefix.ts";
import { TARGET_CHAIN_ID } from "../_shared/chain-config.ts";
import { requireSession } from "../_shared/auth.ts";
import { hashToken } from "../_shared/session-token.ts";
import { toApiError } from "../_shared/errors.ts";
import {
  createPostgrestPersistenceFromEnv,
  type PostgrestPersistence,
} from "../_shared/persistence-composition.ts";
import type { SessionPersistence } from "../session/index.ts";
import type { CardStore } from "../_shared/card-store.ts";
import { regionsMatch, resolveRegionConfig } from "../_shared/region-config.ts";

import modelConfigJson from "../../../config/ai/model-config.json" with { type: "json" };
import merchantCatalogJson from "../../../config/ai/merchant-catalog.json" with { type: "json" };

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

export type GatewayRequestDeps = Omit<GatewayRuntimeDeps, "card"> & {
  card?: ProviderCardContext;
  cardStore?: Pick<CardStore, "getById">;
  configuredRegion: string;
  sessionSecret?: string;
  sessionPersistence?: SessionPersistence;
};

export type GatewayResult =
  | { ok: true; intent: AgentIntent; intentId: string; requestId: string; status: "ready" }
  | { ok: false; error: ApiError };

const NATIVE_DECIMALS = 18;
const INTENT_TTL_MS = 15 * 60 * 1000;

function fail(requestId: string, code: string): GatewayResult {
  const safe = isApiErrorCode(code) ? code : "INPUT_INVALID";
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
  if (result.ok) {
    try {
      await deps.store.save(result.intent);
    } catch (error) {
      return { ok: false, error: toApiError(error, result.requestId) };
    }
  }
  return result;
}

function providerCardFromRecord(record: Awaited<ReturnType<CardStore["getById"]>>): ProviderCardContext | null {
  if (record === null) return null;
  return {
    cardId: record.card_id,
    agent: record.agent_id,
    asset: record.asset,
    // Merchant recipients are resolved by the controller/catalog path, never by the request.
    recipient: "",
    policyVersion: record.policy_version,
  };
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
  failureCode?: "PROVIDER_UNAVAILABLE" | "PROVIDER_MODEL_UNAVAILABLE" | "REGION_MISMATCH";
} = {}): (request: Request) => Promise<Response> {
  const expectedRegion = input.expectedRegion ?? "unknown";
  return async (request) => {
    const url = new URL(request.url);
    const receivedPathname = url.pathname;
    const requestId = request.headers.get("x-request-id") ?? `req-${crypto.randomUUID()}`;
    const normalized = normalizeFunctionPath(receivedPathname, "ai-gateway");
    if (!normalized.ok) {
      return new Response(JSON.stringify({ requestId, code: "INPUT_INVALID", message: "Unsupported gateway route." }), {
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    const path = normalized.path;
    if (path === "/health") {
      const healthRequest = path === url.pathname
        ? request
        : new Request(new URL(path, url).toString(), { method: request.method, headers: request.headers });
      return handleHealthRequest(healthRequest, {
        configuredRegion: input.configuredRegion ?? input.deps?.configuredRegion ?? "unknown",
        expectedRegion,
        modelAvailable: false,
      });
    }
    if (request.method !== "POST" || path !== "/v1/agent/intents") {
      return new Response(JSON.stringify({ requestId, code: "INPUT_INVALID", message: "Unsupported gateway route." }), {
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    if (input.deps === undefined) {
      const code = input.failureCode ?? "PROVIDER_UNAVAILABLE";
      return new Response(JSON.stringify(createApiError(code, requestId)), {
        status: 503,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    const sessionSecret = input.deps.sessionSecret;
    if (typeof sessionSecret !== "string" || sessionSecret.trim().length === 0 || input.deps.sessionPersistence === undefined) {
      return new Response(JSON.stringify(createApiError("PROVIDER_UNAVAILABLE", requestId)), {
        status: 503,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    if (!regionsMatch(expectedRegion, input.deps.actualRegion) || input.deps.configuredRegion !== input.deps.actualRegion) {
      return new Response(JSON.stringify({ requestId, code: "REGION_MISMATCH", message: "Function region mismatch." }), {
        status: 503,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    let sessionWallet: string | undefined;
    try {
      const session = requireSession({
        authorization: request.headers.get("authorization") ?? undefined,
        secret: sessionSecret,
        nowMs: input.deps.nowMs,
      });
      sessionWallet = session.wallet;
    } catch (error) {
      const authError = toApiError(error, requestId);
      return new Response(JSON.stringify(authError), {
        status: 401,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    const token = request.headers.get("authorization")?.slice("Bearer ".length) ?? "";
    try {
      const stored = await input.deps.sessionPersistence.findSession(hashToken(token), sessionWallet);
      if (
        stored === null ||
        stored.tokenHash !== hashToken(token) ||
        stored.wallet.toLowerCase() !== sessionWallet.toLowerCase() ||
        stored.revokedAtMs !== null ||
        stored.expiresAtMs <= input.deps.nowMs
      ) {
        throw new Error("Authentication is invalid.");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication is invalid.") {
        return new Response(JSON.stringify(createApiError("AUTH_INVALID", requestId)), {
          status: 401,
          headers: { "content-type": "application/json", "x-request-id": requestId },
        });
      }
      return new Response(JSON.stringify(createApiError("PROVIDER_UNAVAILABLE", requestId)), {
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
    let card = input.deps.card;
    if (card === undefined && input.deps.cardStore !== undefined) {
      try {
        const stored = await input.deps.cardStore.getById({ cardId: String(body.cardId ?? ""), ownerAddress: sessionWallet });
        const resolved = providerCardFromRecord(stored);
        if (resolved !== null) card = resolved;
      } catch (error) {
        const persistenceError = toApiError(error, requestId);
        return new Response(JSON.stringify(persistenceError), {
          status: 503,
          headers: { "content-type": "application/json", "x-request-id": requestId },
        });
      }
    }
    if (card === undefined) {
      return new Response(JSON.stringify(createApiError("CARD_NOT_ELIGIBLE", requestId)), {
        status: 400,
        headers: { "content-type": "application/json", "x-request-id": requestId },
      });
    }
    const result = await handleRuntimeIntentRequest({
      prompt: body.prompt,
      cardId: body.cardId,
      requestId,
    }, { ...input.deps, card });
    return new Response(JSON.stringify(result.ok ? result : result.error), {
      status: result.ok ? 200 : 400,
      headers: { "content-type": "application/json", "x-request-id": requestId },
    });
  };
}

type RuntimeEnv = Record<string, string | undefined>;
type Server = (handler: (request: Request) => Response | Promise<Response>) => void;

type GatewayCompositionInput = {
  env?: RuntimeEnv;
  provider?: AiProvider;
  card?: ProviderCardContext;
  cardStore?: Pick<CardStore, "getById">;
  merchants?: ReadonlyArray<MerchantCatalogItem>;
  store?: IntentStore;
  intentStore?: IntentStore;
  sessionPersistence?: SessionPersistence;
  persistence?: PostgrestPersistence;
  postgrestTransport?: Parameters<typeof createPostgrestPersistenceFromEnv>[1];
  fetchFn?: FetchFn;
};

export function createGatewayCompositionRoot(input: GatewayCompositionInput = {}): (request: Request) => Promise<Response> {
  const env = input.env ?? {};
  const region = resolveRegionConfig(env);
  const expectedRegion = region.expectedRegion ?? "unknown";
  const actualRegion = region.observedRegion;
  const configuredRegion = region.configuredRegion;
  const healthRegion = configuredRegion;
  const sessionSecret = env.SESSION_HMAC_SECRET;
  if (!regionsMatch(region.expectedRegion, region.observedRegion)) {
    return createGatewayEntrypointHandler({ configuredRegion: healthRegion, expectedRegion, failureCode: "REGION_MISMATCH" });
  }
  if (typeof sessionSecret !== "string" || sessionSecret.trim().length === 0) {
    return createGatewayEntrypointHandler({ configuredRegion: healthRegion, expectedRegion, failureCode: "PROVIDER_UNAVAILABLE" });
  }
  const localInjection = input.provider !== undefined && input.card !== undefined &&
    input.merchants !== undefined && input.store !== undefined;
  let persistence = input.persistence;
  if (persistence === undefined && !localInjection) {
    try {
      persistence = createPostgrestPersistenceFromEnv(env, input.postgrestTransport);
    } catch {
      return createGatewayEntrypointHandler({ configuredRegion: healthRegion, expectedRegion, failureCode: "PROVIDER_UNAVAILABLE" });
    }
  }
  let merchants = input.merchants;
  if (merchants === undefined) {
    try {
      merchants = loadMerchantCatalog(merchantCatalogJson).merchants;
    } catch {
      return createGatewayEntrypointHandler({ configuredRegion: healthRegion, expectedRegion, failureCode: "PROVIDER_UNAVAILABLE" });
    }
  }
  const provider = input.provider ?? (env.OPENAI_API_KEY === undefined || input.fetchFn === undefined
    ? undefined
    : new OpenAiProvider({
      apiKey: env.OPENAI_API_KEY,
      region: actualRegion,
      envModel: env.OPENAI_MODEL,
      modelConfig: parseModelConfigJson(JSON.stringify(modelConfigJson)),
      fetchFn: input.fetchFn,
    }));
  const cardStore = input.cardStore ?? persistence?.card;
  const store = input.store ?? input.intentStore ?? persistence?.intent;
  if (
    configuredRegion === undefined || actualRegion === undefined ||
    provider === undefined ||
    store === undefined ||
    (input.card === undefined && cardStore === undefined)
    || (input.sessionPersistence === undefined && persistence?.session === undefined)
  ) {
    return createGatewayEntrypointHandler({ configuredRegion: healthRegion, expectedRegion, failureCode: "PROVIDER_UNAVAILABLE" });
  }
  if (configuredRegion === undefined) {
    return createGatewayEntrypointHandler({ configuredRegion: healthRegion, expectedRegion, failureCode: "PROVIDER_UNAVAILABLE" });
  }
  const runtimeConfiguredRegion = configuredRegion;
  return createGatewayEntrypointHandler({
    configuredRegion: healthRegion,
    expectedRegion,
    deps: {
      provider,
      card: input.card,
      cardStore,
      merchants,
      expectedRegion,
      actualRegion,
      nowMs: Date.now(),
      store,
      configuredRegion: runtimeConfiguredRegion,
      sessionSecret,
      sessionPersistence: input.sessionPersistence ?? persistence?.session,
    },
  });
}

export function startGatewayServer(input: {
  serve: Server;
  env?: RuntimeEnv;
  provider?: AiProvider;
  card?: ProviderCardContext;
  cardStore?: Pick<CardStore, "getById">;
  merchants?: ReadonlyArray<MerchantCatalogItem>;
  store?: IntentStore;
  intentStore?: IntentStore;
  sessionPersistence?: SessionPersistence;
  persistence?: PostgrestPersistence;
  postgrestTransport?: Parameters<typeof createPostgrestPersistenceFromEnv>[1];
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
  if (!regionsMatch(deps.expectedRegion, deps.actualRegion)) {
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
    env: {
      PACT_EXPECTED_REGION: Deno.env.get("PACT_EXPECTED_REGION"),
      SB_REGION: Deno.env.get("SB_REGION"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      SESSION_HMAC_SECRET: Deno.env.get("SESSION_HMAC_SECRET"),
      OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
      OPENAI_MODEL: Deno.env.get("OPENAI_MODEL"),
    },
    fetchFn: fetch as unknown as FetchFn,
  });
}
