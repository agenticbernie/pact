/**
 * Neon agent-executor function (Arc lane, H2 path).
 *
 * Thin Node entry over `startExecutorServer`: auth-before-work,
 * server-bound intent/card values, read-only static preflight over the
 * lane RPC transport, split-role owner authorization derived dynamically
 * from the seeded card rows (no static fixture), closed 15-code surface.
 *
 * Execute (signing) path: when a usable signer binding is present the entry
 * builds the ethers-backed agent signer (`createAgentSignerPaymentClient`) plus
 * the durable `payment_attempts` store and wires both into the executor, so
 * `POST /v1/payments/execute` signs and broadcasts `controller.pay` with
 * server-bound values. Signers are bound to the agent they sign for:
 * `AGENT_SIGNER_KEYS` maps `{ "<agent address>": "<0x key>" }` (multi-agent lane)
 * and `AGENT_SIGNER_PRIVATE_KEY` remains the single-signer shape, whose agent is
 * derived from the key. Execute resolves the intent's OWN agent, so a card
 * assigned to an agent with no signer fails closed instead of being signed by
 * another key. With no usable binding the entry stays read-only and execute
 * answers 503 — a missing signer must never widen anything.
 *
 * The key is read here (Node runtime) and passed as an argument; it is never
 * logged, returned, or persisted, and the signing module reads no environment.
 *
 * Persistence is the Neon adapter; lane is Arc. Build failures return a
 * redacted 503.
 */
import { startExecutorServer } from "../../../supabase/functions/agent-executor/index.ts";
import { createAgentSignerPaymentClient } from "../../../supabase/functions/agent-executor/agent-signer.ts";
import type { AgentSignerPaymentClient } from "../../../supabase/functions/agent-executor/agent-signer.ts";
import {
  createAgentSignerRegistry,
  parseAgentSignerBindings,
} from "../../../supabase/functions/agent-executor/agent-signers.ts";
import { createSqlAttemptStore } from "../../../supabase/functions/agent-executor/attempt-store.ts";
import { createFetchRpcTransport } from "../../../supabase/functions/agent-executor/chain-client.ts";
import type { PaymentClient } from "../../../supabase/functions/agent-executor/chain-client.ts";
import { ARC_LANE } from "../../../supabase/functions/_shared/lane-config.ts";
import {
  createNeonPersistence,
  createNeonPool,
  requireNeonEnv,
} from "../../adapter/neon-persistence.ts";

type FetchHandler = (request: Request) => Response | Promise<Response>;

let cached: Promise<FetchHandler> | null = null;
let failed = false;

async function buildHandler(): Promise<FetchHandler> {
  const { databaseUrl } = requireNeonEnv(process.env as Record<string, string | undefined>);
  const pool = createNeonPool(databaseUrl);
  const persistence = createNeonPersistence(pool, "arc");
  const rpcUrl = process.env["ARC_RPC_URL"] ?? "";
  const attempts = createSqlAttemptStore((text, params) => pool.query(text, params));

  // Signers are bound to the agent they sign for. `AGENT_SIGNER_KEYS` is an
  // optional `{ "<agent address>": "<key>" }` map for a multi-agent lane;
  // `AGENT_SIGNER_PRIVATE_KEY` stays the single-signer shape, and its agent is
  // DERIVED from the key rather than declared. Signing is optional at boot: with
  // no usable binding the entry stays read-only and execute answers 503 instead
  // of taking the preflight surface down with it.

  const signers = createAgentSignerRegistry({
    bindings: [
      ...parseAgentSignerBindings({
        json: process.env["AGENT_SIGNER_KEYS"],
        legacyPrivateKey: process.env["AGENT_SIGNER_PRIVATE_KEY"],
      }),
      ...parseAgentSignerBindings({
        legacyPrivateKey: process.env["AGENT_SIGNER_CARD4_PRIVATE_KEY"],
      }),
    ],
    createClient: (binding) =>
    createAgentSignerPaymentClient({
      rpcUrl,
      expectedChainId: ARC_LANE.chainId,
      controllerAddress: ARC_LANE.controller ?? "",
      privateKey: binding.privateKey,
    }),
  });
  let paymentClient: PaymentClient | undefined;
  let signerAddress: string | undefined;
  let signerChainId: number | undefined;
  let signerForAgent: ((agentAddress: string) => Promise<AgentSignerPaymentClient | null>) | undefined;
  const boundAgents = signers.boundAgents();
  if (boundAgents.length > 0) {
    // Any bound signer serves the static chain reads; execute resolves the
    // intent's OWN agent, so only the signer bound to it can ever submit.
    const reader = await signers.resolve(boundAgents[0]);
    if (reader !== null) {
      paymentClient = reader.client;
      signerAddress = reader.signerAddress;
      signerChainId = reader.signerChainId;
      signerForAgent = (agent) => signers.resolve(agent);
    }
  }

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
    attempts,
    ...(paymentClient === undefined ? {} : { paymentClient, signerAddress, signerForAgent, signerChainId }),
  });
  if (served === undefined) {
    throw new Error("Executor server did not serve a handler.");
  }
  return served;
}

function unavailable(): Response {
  return new Response(
    JSON.stringify({ code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }),
    { status: 503, headers: { "content-type": "application/json" } },
  );
}

async function handler(request: Request): Promise<Response> {
  if (cached === null) {
    if (failed) return unavailable();
    cached = buildHandler();
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
