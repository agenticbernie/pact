/**
 * Pact Protocol — Off-Chain Relayer & Solver Daemon Entrypoint (§3.3.2)
 */
import { CONTRACTS, RPC_ENDPOINTS, relayerAccount } from "./config/chains.js";
import { RelayerStore } from "./db/store.js";
import { createRelayerHttpServer } from "./server/api.js";
import { PactSolver } from "./services/solver.js";

export async function startRelayerDaemon(options?: {
  port?: number;
  dbPath?: string;
}) {
  const port = options?.port ?? Number(process.env.RELAYER_PORT || 4000);
  const store = new RelayerStore(options?.dbPath);
  const solver = new PactSolver(store);
  const server = createRelayerHttpServer(store);

  console.log("====================================================");
  console.log("  PACT PROTOCOL — OFF-CHAIN SOLVER & RELAYER v2.0.0 ");
  console.log("====================================================");
  console.log(`Relayer Signer  : ${relayerAccount.address}`);
  console.log(`PactEscrow Fuji : ${CONTRACTS.avalancheFuji.pactEscrow}`);
  console.log(`MockUSDC Fuji   : ${CONTRACTS.avalancheFuji.mockUsdc}`);
  console.log(`MockUSDC ArbSep : ${CONTRACTS.arbitrumSepolia.mockUsdc}`);
  console.log(`MockUSDC BaseSep: ${CONTRACTS.baseSepolia.mockUsdc}`);
  console.log(`RPC Fallbacks   : >=2 endpoints per chain configured`);

  await solver.start();

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`[API] Relayer HTTP Server listening on http://localhost:${port}`);
      console.log(`      - Quote : http://localhost:${port}/api/v1/quote?amount=3.50&targetChainId=421614`);
      console.log(`      - Health: http://localhost:${port}/api/v1/health`);
      resolve();
    });
  });

  const shutdown = () => {
    console.log("\n[Relayer] Shutting down gracefully...");
    solver.stop();
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { store, solver, server };
}

// Run directly if invoked as main script
if (import.meta.url === `file://${process.argv[1]}`) {
  startRelayerDaemon().catch((err) => {
    console.error("[Relayer] Fatal startup error:", err);
    process.exit(1);
  });
}
