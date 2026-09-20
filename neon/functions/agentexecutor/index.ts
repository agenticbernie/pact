/**
 * Neon agent-executor function (Arc lane, H2 path).
 *
 * Thin Node entry over `startExecutorServer`: auth-before-work,
 * server-bound intent/card values, read-only static preflight over the
 * lane RPC transport, split-role owner authorization seam with the Arc
 * card-1 registry, closed 15-code surface. No signer is constructed on
 * the read-only path; full execute/reconcile invariants unchanged.
 *
 * Persistence is the Neon adapter; lane is Arc. Build failures return a
 * redacted 503.
 */
import { startExecutorServer } from "../../../supabase/functions/agent-executor/index.ts";
import { createFetchRpcTransport } from "../../../supabase/functions/agent-executor/chain-client.ts";
import { createArcCard1OwnerRegistry } from "../../../supabase/functions/_shared/owner-authorization.ts";
import {
  createNeonPersistence,
  createNeonPool,
  requireNeonEnv,
} from "../../adapter/neon-persistence.ts";

type FetchHandler = (request: Request) => Response | Promise<Response>;

let cached: FetchHandler | null = null;
let failed = false;

function buildHandler(): FetchHandler {
  const { databaseUrl } = requireNeonEnv(process.env as Record<string, string | undefined>);
  const pool = createNeonPool(databaseUrl);
  const persistence = createNeonPersistence(pool, "arc");
  const rpcUrl = process.env["ARC_RPC_URL"] ?? "";
  let served: FetchHandler | undefined;
  startExecutorServer({
    serve: (handler) => {
      served = handler;
    },
    env: {
      PACT_EXPECTED_REGION: process.env["PACT_EXPECTED_REGION"],
      SB_REGION: process.env["SB_REGION"],
      SESSION_HMAC_SECRET: process.env["SESSION_HMAC_SECRET"],
      ARC_RPC_URL: process.env["ARC_RPC_URL"],
    },
    transport: createFetchRpcTransport(rpcUrl, fetch),
    persistence,
    lane: "arc",
    ownerAuthorizations: createArcCard1OwnerRegistry(),
  });
  if (served === undefined) {
    throw new Error("Executor server did not serve a handler.");
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
        JSON.stringify({ code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }
    return cached(request);
  } catch {
    return new Response(
      JSON.stringify({ code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}

export default { fetch: handler };
