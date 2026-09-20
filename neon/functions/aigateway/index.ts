/**
 * Neon AI-gateway function (Arc lane, H1 path).
 *
 * Thin Node entry over `startGatewayServer`: merchantId-only provider
 * contract, server-bound card/asset/recipient/policy/hash, canonical
 * model pin (`gpt-5.6-luna`, `allowFallback:false`), raw-fetch provider,
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

type FetchHandler = (request: Request) => Response | Promise<Response>;

let cached: FetchHandler | null = null;
let failed = false;

function buildHandler(): FetchHandler {
  const { databaseUrl } = requireNeonEnv(process.env as Record<string, string | undefined>);
  const pool = createNeonPool(databaseUrl);
  const persistence = createNeonPersistence(pool, "arc");
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
