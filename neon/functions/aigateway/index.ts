/**
 * Neon AI-gateway function (Arc lane, H1 path).
 *
 * Thin Node entry over `startGatewayServer`: merchantId-only provider
 * contract, server-bound card/asset/recipient/policy/hash, canonical
 * model pin (`gpt-4o-mini`, `allowFallback:false`), raw-fetch provider,
 * single retry on 429/502/503 only. OpenAI key stays server-side and is
 * NEVER called by any lane in the migration task (no live H1 here).
 *
 * Persistence is the Neon adapter; lane is Arc; health reports the lane
 * chain. Build failures return a redacted 503.
 */
import { startGatewayServer } from "../../../supabase/functions/ai-gateway/index.ts";
import {
  createNeonPersistence,
  createNeonPool,
  requireNeonEnv,
} from "../../adapter/neon-persistence.ts";
import type { FetchFn } from "../../../supabase/functions/ai-gateway/openai-provider.ts";
import {
  createChainPolicyVersionReader,
  type PolicyVersionReader,
} from "../../../supabase/functions/_shared/policy-version.ts";
import { ARC_LANE } from "../../../supabase/functions/_shared/lane-config.ts";

type FetchHandler = (request: Request) => Response | Promise<Response>;

let cached: FetchHandler | null = null;
let failed = false;

function buildHandler(): FetchHandler {
  const { databaseUrl } = requireNeonEnv(process.env as Record<string, string | undefined>);
  const pool = createNeonPool(databaseUrl);
  const persistence = createNeonPersistence(pool, "arc");

  // The persisted `cards.policy_version` is a projection placeholder, so the
  // intent must bind the controller's authoritative version or the executor's
  // on-chain compare rejects settlement with CARD_NOT_ELIGIBLE. When the RPC is
  // unconfigured/unreachable the resolver is absent (or answers null) and the
  // projection value is kept — never a fabricated one.
  const rpcUrl = process.env["ARC_RPC_URL"] ?? "";
  const controllerAddress = ARC_LANE.controller ?? "";
  let resolvePolicyVersion: PolicyVersionReader | undefined;
  try {
    if (rpcUrl.trim().length > 0 && controllerAddress.trim().length > 0) {
      resolvePolicyVersion = createChainPolicyVersionReader({
        rpcUrl,
        chainId: ARC_LANE.chainId,
        controllerAddress,
      });
    }
  } catch {
    resolvePolicyVersion = undefined;
  }

  let served: FetchHandler | undefined;
  startGatewayServer({
    serve: (handler) => {
      served = handler;
    },
    env: {
      PACT_EXPECTED_REGION: process.env["PACT_EXPECTED_REGION"],
      SB_REGION: process.env["SB_REGION"],
      SESSION_HMAC_SECRET: process.env["SESSION_HMAC_SECRET"],
      OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
      OPENAI_MODEL: process.env["OPENAI_MODEL"],
    },
    persistence,
    lane: "arc",
    fetchFn: fetch as unknown as FetchFn,
    ...(resolvePolicyVersion === undefined ? {} : { resolvePolicyVersion }),
  });
  if (served === undefined) {
    throw new Error("Gateway server did not serve a handler.");
  }
  return served;
}

function handler(request: Request): Response | Promise<Response> {
  try {
    if (cached === null && !failed) {
      try {
        cached = buildHandler();
      } catch {
        failed = true;
      }
    }
    if (cached === null) {
      return new Response(
        JSON.stringify({ code: "PROVIDER_UNAVAILABLE", message: "Gateway boundary is unavailable." }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }
    return cached(request);
  } catch {
    return new Response(
      JSON.stringify({ code: "PROVIDER_UNAVAILABLE", message: "Gateway boundary is unavailable." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}

export default { fetch: handler };
