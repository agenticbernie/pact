/**
 * Neon session function (Arc lane).
 *
 * Thin Node entry over the existing `startSessionServer` composition root:
 * same routes, same HMAC auth, same TTL/revoke semantics. Persistence is
 * the Neon direct-Postgres adapter (PERSISTENCE_BACKEND=neon + DATABASE_URL
 * required; anything else fails closed before serving).
 *
 * Default export provides fetch(request) per the Neon Functions contract.
 * Build failures return a redacted 503 (never secrets, never stack traces).
 */
import { startSessionServer } from "../../../supabase/functions/session/index.ts";
import {
  createNeonPersistence,
  createNeonPool,
  requireNeonEnv,
} from "../../adapter/neon-persistence.ts";

type FetchHandler = (request: Request) => Response | Promise<Response>;

let cached: FetchHandler | null = null;
let buildError: string | null = null;

function buildHandler(): FetchHandler {
  const { databaseUrl } = requireNeonEnv(process.env as Record<string, string | undefined>);
  const pool = createNeonPool(databaseUrl);
  const persistence = createNeonPersistence(pool);
  let served: FetchHandler | undefined;
  startSessionServer({
    serve: (handler) => {
      served = handler;
    },
    env: {
      PACT_EXPECTED_REGION: process.env["PACT_EXPECTED_REGION"],
      SB_REGION: process.env["SB_REGION"],
      SESSION_HMAC_SECRET: process.env["SESSION_HMAC_SECRET"],
    },
    persistence: persistence.session,
  });
  if (served === undefined) {
    throw new Error("Session server did not serve a handler.");
  }
  return served;
}

function handler(request: Request): Response | Promise<Response> {
  try {
    if (cached === null && buildError === null) {
      try {
        cached = buildHandler();
      } catch (error) {
        buildError = error instanceof Error ? error.message : "Unavailable.";
      }
    }
    if (cached === null) {
      return new Response(
        JSON.stringify({ code: "PROVIDER_UNAVAILABLE", message: "Session boundary is unavailable." }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }
    return cached(request);
  } catch {
    return new Response(
      JSON.stringify({ code: "PROVIDER_UNAVAILABLE", message: "Session boundary is unavailable." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}

export default { fetch: handler };
