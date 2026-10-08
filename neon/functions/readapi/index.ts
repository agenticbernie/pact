/**
 * Neon read-api function (Phase 05 read model, Arc lane).
 *
 * Thin Node entry over `startReadApiServer`: it wires the SQL read store (over
 * the indexed `chain_events` + Phase 04 tables) and an ethers json-rpc receipt
 * reader, so the API can require BOTH a confirmed receipt and a matching
 * indexed PaymentSettled event before it reports `settled`.
 *
 * Read-only by construction: no signer, no broadcast, no transaction path, and
 * no secret other than the session HMAC used to scope reads to the caller's
 * wallet. Build failures return a redacted 503.
 */
import { readFileSync } from "node:fs";
import { startReadApiServer } from "../../../supabase/functions/read-api/index.ts";
import { createSqlReadStore } from "../../../supabase/functions/read-api/read-store.ts";
import { createEthersChainReader } from "../../../supabase/functions/indexer/chain-reader.ts";
import {
  ARC_LANE_CHAIN_ID,
  ARC_LANE_CONTROLLER,
  ARC_LANE_MERCHANT,
  ARC_LANE_POOL,
} from "../../../supabase/functions/_shared/lane-config.ts";
import { createNeonPool, requireNeonEnv } from "../../adapter/neon-persistence.ts";

type FetchHandler = (request: Request) => Promise<Response>;

/** Explorer base from the committed network manifest; never a secret. */
function explorerUrl(): string {
  const raw = readFileSync("config/networks/arc-testnet.json", "utf8");
  const parsed = JSON.parse(raw) as { explorerUrl?: unknown };
  return typeof parsed.explorerUrl === "string" ? parsed.explorerUrl : "";
}

let cached: Promise<FetchHandler> | null = null;
let failed = false;

function buildHandler(): FetchHandler {
  const { databaseUrl } = requireNeonEnv(process.env as Record<string, string | undefined>);
  const pool = createNeonPool(databaseUrl);
  const store = createSqlReadStore((text, params) => pool.query(text, params));
  const rpcUrl = process.env["ARC_RPC_URL"] ?? "";
  const reader = createEthersChainReader({
    rpcUrl,
    chainId: ARC_LANE_CHAIN_ID,
    addresses: [ARC_LANE_CONTROLLER, ARC_LANE_POOL, ARC_LANE_MERCHANT],
  });

  let served: FetchHandler | undefined;
  startReadApiServer({
    serve: (handler) => {
      served = handler;
    },
    store,
    chainId: ARC_LANE_CHAIN_ID,
    controller: ARC_LANE_CONTROLLER,
    pool: ARC_LANE_POOL,
    merchant: ARC_LANE_MERCHANT,
    explorerUrl: explorerUrl(),
    sessionSecret: process.env["SESSION_HMAC_SECRET"] ?? "",
    receiptLookup: (txHash) => reader.getReceipt(txHash),
  });
  if (served === undefined) {
    throw new Error("Read API did not serve a handler.");
  }
  return served;
}

function unavailable(): Response {
  return new Response(
    JSON.stringify({ code: "PROVIDER_UNAVAILABLE", message: "Read model is unavailable." }),
    { status: 503, headers: { "content-type": "application/json" } },
  );
}

async function handler(request: Request): Promise<Response> {
  if (cached === null) {
    if (failed) return unavailable();
    try {
      cached = Promise.resolve(buildHandler());
    } catch {
      failed = true;
      return unavailable();
    }
  }
  let resolved: FetchHandler;
  try {
    resolved = await cached;
  } catch {
    failed = true;
    cached = null;
    return unavailable();
  }
  try {
    return await resolved(request);
  } catch {
    return unavailable();
  }
}

export default { fetch: handler };
