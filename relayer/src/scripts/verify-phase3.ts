/**
 * Phase 3 End-to-End Live Testnet Verification (Economy Route Batching)
 *
 * Verifies docs/pact_docs.md §1.3:
 * 1. Request multiple /api/v1/quote with Priority.COST (Economy Route, flat $0.005 fee).
 * 2. Create multiple PaymentIntents on Avalanche Fuji with priority = COST (1).
 * 3. Verify relayer queues them and dispatches ONE batched transaction on Arbitrum Sepolia
 *    via PactBatchDispatcher.batchTransfer, paying both merchants atomically.
 * 4. Verify both merchants receive exact USDC amounts on the destination chain.
 * 5. Verify relayer claims both escrows on Avalanche Fuji with the corresponding secrets.
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
import { Priority } from "../types/pact.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const testPort = 4056;
  const testDbPath = path.resolve(process.cwd(), "pact_relayer_test_p3.db");
  for (const suffix of ["", "-shm", "-wal"]) {
    if (fs.existsSync(testDbPath + suffix)) {
      fs.unlinkSync(testDbPath + suffix);
    }
  }

  console.log("=== [Phase 3 Verification] Starting Relayer Daemon (Economy Batching) ===");
  const daemon = await startRelayerDaemon({ port: testPort, dbPath: testDbPath });

  try {
    const merchantA = "0x1111111111111111111111111111111111111111" as const;
    const merchantB = "0x2222222222222222222222222222222222222222" as const;

    const orderIdA = `ORD-ECON-A-${Date.now()}`;
    const orderIdB = `ORD-ECON-B-${Date.now()}`;

    // 1. Fetch Economy Quotes
    console.log("[Step 1] Requesting Economy quotes for Merchant A ($2.00) and Merchant B ($4.50)...");
    const [resA, resB] = await Promise.all([
      fetch(`http://localhost:${testPort}/api/v1/quote?amount=2.00&targetChainId=421614&merchant=${merchantA}&orderId=${orderIdA}`),
      fetch(`http://localhost:${testPort}/api/v1/quote?amount=4.50&targetChainId=421614&merchant=${merchantB}&orderId=${orderIdB}`),
    ]);

    const quoteA = (await resA.json()) as any;
    const quoteB = (await resB.json()) as any;

    console.log(`Quote A: amount=${quoteA.amount} fee=${quoteA.routes.economy.fee} total=${quoteA.routes.economy.totalPayable}`);
    console.log(`Quote B: amount=${quoteB.amount} fee=${quoteB.routes.economy.fee} total=${quoteB.routes.economy.totalPayable}`);

    if (quoteA.routes.economy.feeAtomic !== "5000" || quoteB.routes.economy.feeAtomic !== "5000") {
      throw new Error("Economy fee should be exactly 5000 atomic units ($0.005)");
    }

    // 2. Balances before on Arbitrum Sepolia
    const [balABefore, balBBefore] = await Promise.all([
      arbSepoliaPublicClient.readContract({
        address: CONTRACTS.arbitrumSepolia.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "balanceOf",
        args: [merchantA],
      }),
      arbSepoliaPublicClient.readContract({
        address: CONTRACTS.arbitrumSepolia.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "balanceOf",
        args: [merchantB],
      }),
    ]);

    // 3. Ensure Fuji allowance
    const totalDeposit = BigInt(quoteA.routes.economy.totalPayableAtomic) + BigInt(quoteB.routes.economy.totalPayableAtomic);
    const allowance = await fujiPublicClient.readContract({
      address: CONTRACTS.avalancheFuji.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "allowance",
      args: [relayerAccount.address, CONTRACTS.avalancheFuji.pactEscrow],
    });

    if (allowance < totalDeposit) {
      console.log("[Step 2] Approving MockUSDC for PactEscrow on Fuji...");
      const appTx = await fujiWalletClient.writeContract({
        address: CONTRACTS.avalancheFuji.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "approve",
        args: [CONTRACTS.avalancheFuji.pactEscrow, 1_000_000_000_000n],
      });
      await fujiPublicClient.waitForTransactionReceipt({ hash: appTx });
    }

    // 4. Create two Economy intents on Avalanche Fuji sequentially to ensure correct nonce handling
    console.log("[Step 3] Submitting 2 Economy Intents to PactEscrow on Avalanche Fuji...");
    const txA = await fujiWalletClient.writeContract({
      address: CONTRACTS.avalancheFuji.pactEscrow,
      abi: PACT_ESCROW_ABI,
      functionName: "createIntent",
      args: [
        CONTRACTS.avalancheFuji.mockUsdc,
        BigInt(quoteA.amountAtomic),
        421614n,
        merchantA,
        CONTRACTS.arbitrumSepolia.mockUsdc,
        Priority.COST,
        quoteA.hashLock,
        BigInt(quoteA.deadline),
      ],
    });
    console.log(`Intent A submitted on Fuji: ${txA}`);
    const rcA = await fujiPublicClient.waitForTransactionReceipt({ hash: txA, pollingInterval: 500, timeout: 60000 });

    const txB = await fujiWalletClient.writeContract({
      address: CONTRACTS.avalancheFuji.pactEscrow,
      abi: PACT_ESCROW_ABI,
      functionName: "createIntent",
      args: [
        CONTRACTS.avalancheFuji.mockUsdc,
        BigInt(quoteB.amountAtomic),
        421614n,
        merchantB,
        CONTRACTS.arbitrumSepolia.mockUsdc,
        Priority.COST,
        quoteB.hashLock,
        BigInt(quoteB.deadline),
      ],
    });
    console.log(`Intent B submitted on Fuji: ${txB}`);
    const rcB = await fujiPublicClient.waitForTransactionReceipt({ hash: txB, pollingInterval: 500, timeout: 60000 });

    const logsA = parseEventLogs({ abi: PACT_ESCROW_ABI, eventName: "PaymentIntentCreated", logs: rcA.logs });
    const logsB = parseEventLogs({ abi: PACT_ESCROW_ABI, eventName: "PaymentIntentCreated", logs: rcB.logs });

    const intentIdA = logsA[0]?.args.intentId!;
    const intentIdB = logsB[0]?.args.intentId!;
    console.log(`Created on Fuji:`);
    console.log(`  Intent A: ${intentIdA}`);
    console.log(`  Intent B: ${intentIdB}`);

    // Force flush the economy batch to trigger immediate multi-transfer
    console.log("[Step 4] Forcing Economy batch flush to test batchTransfer...");
    await sleep(2000); // Give indexer time to record events in SQLite
    await daemon.solver.flushEconomyBatches(true);

    // 5. Poll both intents until CLAIMED
    console.log("[Step 5] Awaiting settlement and claim for both intents...");
    let recA: any = null;
    let recB: any = null;

    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      recA = daemon.store.getIntentById(intentIdA);
      recB = daemon.store.getIntentById(intentIdB);
      if (recA?.state === "CLAIMED" && recB?.state === "CLAIMED") {
        break;
      }
    }

    if (recA?.state !== "CLAIMED" || recB?.state !== "CLAIMED") {
      throw new Error(`Timeout waiting for both intents to be CLAIMED. States: A=${recA?.state}, B=${recB?.state}`);
    }

    console.log(`[PASS] Both intents reached CLAIMED state!`);
    console.log(`Shared Destination Batch Tx: ${recA.dest_tx_hash}`);
    if (recA.dest_tx_hash !== recB.dest_tx_hash) {
      throw new Error(`Expected identical dest_tx_hash for batched intents! Got ${recA.dest_tx_hash} vs ${recB.dest_tx_hash}`);
    }

    // 6. Verify balances on Arbitrum Sepolia
    const [balAAfter, balBAfter] = await Promise.all([
      arbSepoliaPublicClient.readContract({
        address: CONTRACTS.arbitrumSepolia.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "balanceOf",
        args: [merchantA],
      }),
      arbSepoliaPublicClient.readContract({
        address: CONTRACTS.arbitrumSepolia.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "balanceOf",
        args: [merchantB],
      }),
    ]);

    const deltaA = balAAfter - balABefore;
    const deltaB = balBAfter - balBBefore;

    if (deltaA !== 2_000_000n) throw new Error(`Merchant A delta mismatch: expected 2000000, got ${deltaA}`);
    if (deltaB !== 4_500_000n) throw new Error(`Merchant B delta mismatch: expected 4500000, got ${deltaB}`);

    console.log(`[PASS] Destination balances verified!`);
    console.log(`  Merchant A received: +$${Number(deltaA) / 1e6} USDC`);
    console.log(`  Merchant B received: +$${Number(deltaB) / 1e6} USDC`);
    console.log(`  Both paid in ONE single Arbitrum transaction: ${recA.dest_tx_hash}`);
    console.log(`  Claim Tx A (Fuji): ${recA.claim_tx_hash}`);
    console.log(`  Claim Tx B (Fuji): ${recB.claim_tx_hash}`);
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
    console.log("=== ALL PHASE 3 VERIFICATION TESTS PASSED ===");
    process.exit(0);
  })
  .catch((err) => {
    console.error("=== PHASE 3 VERIFICATION FAILED ===", err);
    process.exit(1);
  });
