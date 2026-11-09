/**
 * Phase 2 End-to-End Live Testnet & Crash-Recovery Verification
 *
 * Tests:
 * 1. /api/v1/quote latency (<300ms per NFR-01) and HTLC hashLock generation
 * 2. /api/v1/health multi-chain RPC & balance checks
 * 3. Live on-chain PaymentIntentCreated (Avalanche Fuji) ->
 *    Instant MockUSDC transfer (Arbitrum Sepolia) ->
 *    claimEscrow with secret preimage (Avalanche Fuji)
 * 4. SQLite state persistence & crash-recovery idempotency (NFR-03)
 */
import path from "node:path";
import fs from "node:fs";
import { parseEventLogs, type Hex } from "viem";
import { MOCK_USDC_ABI, PACT_ESCROW_ABI } from "../abi/contracts.js";
import {
  CONTRACTS,
  arbSepoliaPublicClient,
  fujiPublicClient,
  fujiWalletClient,
  relayerAccount,
} from "../config/chains.js";
import { startRelayerDaemon } from "../index.js";
import { RelayerStore } from "../db/store.js";
import { PactSolver } from "../services/solver.js";
import { Priority } from "../types/pact.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const testPort = 4055;
  const testDbPath = path.resolve(process.cwd(), "pact_relayer_test.db");
  for (const suffix of ["", "-shm", "-wal"]) {
    if (fs.existsSync(testDbPath + suffix)) {
      fs.unlinkSync(testDbPath + suffix);
    }
  }

  console.log("=== [Phase 2 Verification] Starting Relayer Daemon ===");
  const daemon = await startRelayerDaemon({ port: testPort, dbPath: testDbPath });

  try {
    // 1. Test /api/v1/quote (<300ms requirement)
    const orderId = `ORD-${Date.now()}`;
    const merchantAddress = "0x000000000000000000000000000000000000cafE" as const;
    const t0 = performance.now();
    const quoteRes = await fetch(
      `http://localhost:${testPort}/api/v1/quote?amount=3.50&targetChainId=421614&merchant=${merchantAddress}&orderId=${orderId}`
    );
    const quoteRoundtripMs = Number((performance.now() - t0).toFixed(2));
    if (!quoteRes.ok) {
      throw new Error(`/api/v1/quote failed with status ${quoteRes.status}`);
    }
    const quote = (await quoteRes.json()) as {
      hashLock: Hex;
      deadline: number;
      amountAtomic: string;
      quoteLatencyMs: number;
      routes: {
        lightning: { feeAtomic: string; totalPayableAtomic: string };
        economy: { feeAtomic: string; totalPayableAtomic: string };
      };
    };

    console.log(
      `[Test 1 PASS] /api/v1/quote responded in ${quoteRoundtripMs}ms (server: ${quote.quoteLatencyMs}ms < 300ms NFR-01)`
    );
    console.log(`              hashLock=${quote.hashLock} | lightningFee=${quote.routes.lightning.feeAtomic}`);

    if (quoteRoundtripMs >= 300) {
      throw new Error(`Quote exceeded 300ms NFR-01 limit: ${quoteRoundtripMs}ms`);
    }

    // 2. Test /api/v1/health
    const healthRes = await fetch(`http://localhost:${testPort}/api/v1/health`);
    if (!healthRes.ok) {
      throw new Error(`/api/v1/health failed with status ${healthRes.status}`);
    }
    const health = (await healthRes.json()) as { status: string; relayerAddress: string };
    console.log(`[Test 2 PASS] /api/v1/health status=${health.status} relayer=${health.relayerAddress}`);

    // 3. Record merchant balance on Arbitrum Sepolia before intent
    const merchantArbBalanceBefore = await arbSepoliaPublicClient.readContract({
      address: CONTRACTS.arbitrumSepolia.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "balanceOf",
      args: [merchantAddress],
    });

    // 4. Approve PactEscrow on Fuji if needed
    const totalPayable = BigInt(quote.routes.lightning.totalPayableAtomic);
    const currentAllowance = await fujiPublicClient.readContract({
      address: CONTRACTS.avalancheFuji.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "allowance",
      args: [relayerAccount.address, CONTRACTS.avalancheFuji.pactEscrow],
    });

    if (currentAllowance < totalPayable) {
      console.log(`[Test 3] Approving MockUSDC on Avalanche Fuji...`);
      const approveHash = await fujiWalletClient.writeContract({
        address: CONTRACTS.avalancheFuji.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "approve",
        args: [CONTRACTS.avalancheFuji.pactEscrow, 1_000_000_000_000n],
      });
      await fujiPublicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log(`[Test 3] Approved MockUSDC: ${approveHash}`);
    }

    // 5. Create PaymentIntent on Avalanche Fuji
    console.log(`[Test 3] Creating Lightning PaymentIntent ($3.50 USDC -> Arbitrum Sepolia)...`);
    const createTxHash = await fujiWalletClient.writeContract({
      address: CONTRACTS.avalancheFuji.pactEscrow,
      abi: PACT_ESCROW_ABI,
      functionName: "createIntent",
      args: [
        CONTRACTS.avalancheFuji.mockUsdc,
        BigInt(quote.amountAtomic),
        421614n,
        merchantAddress,
        CONTRACTS.arbitrumSepolia.mockUsdc,
        Priority.SPEED,
        quote.hashLock,
        BigInt(quote.deadline),
      ],
    });

    const createReceipt = await fujiPublicClient.waitForTransactionReceipt({
      hash: createTxHash,
      pollingInterval: 250,
    });
    const postInclusionStart = performance.now();

    const parsedLogs = parseEventLogs({
      abi: PACT_ESCROW_ABI,
      eventName: "PaymentIntentCreated",
      logs: createReceipt.logs,
    });
    const intentId = parsedLogs[0]?.args.intentId;
    if (!intentId) {
      throw new Error("PaymentIntentCreated event not found in receipt");
    }
    console.log(`[Test 3] PaymentIntentCreated on Fuji: intentId=${intentId} tx=${createTxHash}`);

    // 6. Poll /api/v1/orders/:orderId until SETTLED and CLAIMED
    let settledTimeMs: number | null = null;
    let claimedTimeMs: number | null = null;
    let finalIntentRecord: Record<string, unknown> | null = null;

    for (let i = 0; i < 120; i++) {
      await sleep(250);
      const orderRes = await fetch(`http://localhost:${testPort}/api/v1/orders/${orderId}`);
      if (!orderRes.ok) continue;
      const orderData = (await orderRes.json()) as {
        status: string;
        isSettled: boolean;
        intent: Record<string, unknown>;
      };

      if (orderData.isSettled && settledTimeMs === null) {
        settledTimeMs = Number((performance.now() - postInclusionStart).toFixed(0));
        console.log(`[Test 3] Merchant Order ${orderId} SETTLED in ${settledTimeMs}ms after Fuji inclusion!`);
      }
      if (orderData.status === "CLAIMED") {
        claimedTimeMs = Number((performance.now() - postInclusionStart).toFixed(0));
        finalIntentRecord = orderData.intent;
        console.log(`[Test 3] Escrow CLAIMED on Fuji in ${claimedTimeMs}ms total!`);
        break;
      }
    }

    if (!finalIntentRecord) {
      throw new Error("Timed out waiting for Relayer to reach CLAIMED state");
    }

    // Verify Merchant received exact $3.50 USDC on Arbitrum Sepolia
    const merchantArbBalanceAfter = await arbSepoliaPublicClient.readContract({
      address: CONTRACTS.arbitrumSepolia.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "balanceOf",
      args: [merchantAddress],
    });
    const delta = merchantArbBalanceAfter - merchantArbBalanceBefore;
    if (delta !== 3_500_000n) {
      throw new Error(`Expected merchant balance delta 3500000, got ${delta.toString()}`);
    }

    // Verify on-chain PactEscrow intent isFulfilled == true
    const onChainIntent = await fujiPublicClient.readContract({
      address: CONTRACTS.avalancheFuji.pactEscrow,
      abi: PACT_ESCROW_ABI,
      functionName: "getIntent",
      args: [intentId],
    });
    if (!onChainIntent.isFulfilled) {
      throw new Error("Expected onChainIntent.isFulfilled === true");
    }

    console.log(`[Test 3 PASS] End-to-End Cross-Chain Intent Fulfilled & Claimed!`);
    console.log(`              Fuji Create Tx : ${createTxHash}`);
    console.log(`              Arb Dispatch Tx: ${finalIntentRecord.dest_tx_hash}`);
    console.log(`              Fuji Claim Tx  : ${finalIntentRecord.claim_tx_hash}`);

    // 7. Test Crash-Recovery State Machine Idempotency (NFR-03)
    console.log(`[Test 4] Simulating Relayer crash at DISPATCHED state and recovery on restart...`);
    daemon.solver.stop();
    await daemon.solver.processIntent(intentId); // Wait for any in-flight work to finish
    daemon.store.updateIntentState(intentId, "DISPATCHED", {
      claimTxHash: null,
    });
    const beforeRecovery = daemon.store.getIntentById(intentId);
    if (beforeRecovery?.state !== "DISPATCHED") {
      throw new Error("Failed to set simulated DISPATCHED state");
    }

    // Simulate process restart with a fresh PactSolver reading from the persisted SQLite DB
    const restartedSolver = new PactSolver(daemon.store);
    await restartedSolver.recoverPendingIntents();
    const afterRecovery = daemon.store.getIntentById(intentId);
    if (afterRecovery?.state !== "CLAIMED") {
      throw new Error(`Crash recovery failed: expected CLAIMED, got ${afterRecovery?.state}`);
    }
    const merchantBalanceAfterRecovery = await arbSepoliaPublicClient.readContract({
      address: CONTRACTS.arbitrumSepolia.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "balanceOf",
      args: [merchantAddress],
    });
    if (merchantBalanceAfterRecovery !== merchantArbBalanceAfter) {
      throw new Error("Crash recovery double-transferred tokens!");
    }
    console.log(`[Test 4 PASS] Crash recovery resumed DISPATCHED -> SETTLED -> CLAIMED with zero duplicate transfer!`);
  } finally {
    daemon.solver.stop();
    daemon.server.close();
    daemon.store.close();
    for (const suffix of ["", "-shm", "-wal"]) {
      if (fs.existsSync(testDbPath + suffix)) {
        fs.unlinkSync(testDbPath + suffix);
      }
    }
  }
}

main()
  .then(() => {
    console.log("=== ALL PHASE 2 VERIFICATION TESTS PASSED ===");
    process.exit(0);
  })
  .catch((err) => {
    console.error("=== PHASE 2 VERIFICATION FAILED ===", err);
    process.exit(1);
  });
