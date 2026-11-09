/**
 * Pact Protocol — Solver & Multi-Chain Execution Engine (FR-07, FR-08, FR-09, NFR-03)
 *
 * State Machine:
 *   CREATED ──► DISPATCHED ──► SETTLED ──► CLAIMED
 *                                    └──► (Timeout) ──► REFUNDED
 */
import { type Hex } from "viem";
import { MOCK_USDC_ABI, PACT_BATCH_DISPATCHER_ABI, PACT_ESCROW_ABI } from "../abi/contracts.js";
import {
  CONTRACTS,
  fujiPublicClient,
  fujiWalletClient,
  getDestinationClients,
  relayerAccount,
  withChainLock,
} from "../config/chains.js";
import { RelayerStore } from "../db/store.js";
import { Priority, formatUsdcAmount, type StoredIntentRecord } from "../types/pact.js";

export class PactSolver {
  private store: RelayerStore;
  private inFlightIntents = new Map<string, Promise<StoredIntentRecord | null>>();
  private chainQueues = new Map<number, Promise<unknown>>();
  private unwatchCreated?: () => void;
  private unwatchSettled?: () => void;
  private unwatchRefunded?: () => void;
  private recoveryTimer?: NodeJS.Timeout;
  private pollCatchupTimer?: NodeJS.Timeout;
  private batchTimer?: NodeJS.Timeout;
  private batchingChains = new Set<number>();
  private isStopping = false;

  /** Economy batch window (docs §1.3: 15-45s). */
  private readonly batchWindowMs = Number(process.env.ECONOMY_BATCH_WINDOW_MS || 15_000);
  /** Flush early when an intent is this close to its on-chain deadline (claims revert after it). */
  private readonly batchDeadlineSafetySec = 90;
  private readonly maxBatchSize = 50;

  constructor(store: RelayerStore) {
    this.store = store;
  }

  /**
   * Serializes transactions per chainId to prevent nonce collisions under concurrent intents.
   */
  private async withChainLock<T>(chainId: number, task: () => Promise<T>): Promise<T> {
    return withChainLock(chainId, task);
  }

  public async start(): Promise<void> {
    this.isStopping = false;
    console.log(`[Solver] Starting Pact Relayer Solver as ${relayerAccount.address}`);
    console.log(`[Solver] Watching PactEscrow on Fuji: ${CONTRACTS.avalancheFuji.pactEscrow}`);

    // 1. Recover any pending intents persisted in SQLite before crash/restart (NFR-03)
    await this.recoverPendingIntents();

    // 2. Catch up any missed blocks on Avalanche Fuji
    await this.syncHistoricalEvents();

    // 3. Subscribe to real-time contract events (<500ms polling interval per FR-07)
    const pollingInterval = Number(process.env.POLLING_INTERVAL_MS || 400);

    this.unwatchCreated = fujiPublicClient.watchContractEvent({
      address: CONTRACTS.avalancheFuji.pactEscrow,
      abi: PACT_ESCROW_ABI,
      eventName: "PaymentIntentCreated",
      pollingInterval,
      onLogs: (logs) => {
        for (const log of logs) {
          void this.handleIntentCreatedLog(log);
        }
      },
      onError: (err) => {
        console.warn(`[Solver] watchContractEvent(PaymentIntentCreated) warning:`, err.message);
      },
    });

    this.unwatchSettled = fujiPublicClient.watchContractEvent({
      address: CONTRACTS.avalancheFuji.pactEscrow,
      abi: PACT_ESCROW_ABI,
      eventName: "PaymentSettled",
      pollingInterval: 1000,
      onLogs: (logs) => {
        for (const log of logs) {
          const intentId = log.args.intentId;
          if (!intentId) continue;
          const existing = this.store.getIntentById(intentId);
          if (existing && existing.state !== "CLAIMED") {
            this.store.updateIntentState(intentId, "CLAIMED", {
              claimTxHash: log.transactionHash ?? existing.claim_tx_hash,
              secret: log.args.secret ?? existing.secret,
              errorMessage: null,
            });
            console.log(`[Solver] Synced on-chain PaymentSettled for ${intentId}`);
          }
        }
      },
    });

    this.unwatchRefunded = fujiPublicClient.watchContractEvent({
      address: CONTRACTS.avalancheFuji.pactEscrow,
      abi: PACT_ESCROW_ABI,
      eventName: "PaymentRefunded",
      pollingInterval: 1000,
      onLogs: (logs) => {
        for (const log of logs) {
          const intentId = log.args.intentId;
          if (!intentId) continue;
          this.store.updateIntentState(intentId, "REFUNDED", {
            errorMessage: null,
          });
          console.log(`[Solver] Intent ${intentId} marked REFUNDED`);
        }
      },
    });

    // 4. Periodic crash-recovery & catchup sweep
    this.recoveryTimer = setInterval(() => {
      if (!this.isStopping) {
        void this.recoverPendingIntents();
      }
    }, 5_000);

    this.pollCatchupTimer = setInterval(() => {
      if (!this.isStopping) {
        void this.syncHistoricalEvents();
      }
    }, 3_000);

    // 5. Economy route: flush queued COST intents as one batched transfer per destination chain
    this.batchTimer = setInterval(() => {
      if (!this.isStopping) {
        void this.flushEconomyBatches();
      }
    }, 1_000);
  }

  public stop(): void {
    this.isStopping = true;
    this.unwatchCreated?.();
    this.unwatchSettled?.();
    this.unwatchRefunded?.();
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    if (this.pollCatchupTimer) clearInterval(this.pollCatchupTimer);
    if (this.batchTimer) clearInterval(this.batchTimer);
  }

  public async syncHistoricalEvents(): Promise<void> {
    try {
      const currentBlock = await fujiPublicClient.getBlockNumber();
      const lastIndexed = this.store.getLastIndexedBlock();
      const fromBlock =
        lastIndexed !== null
          ? lastIndexed + 1n
          : currentBlock > 100n
            ? currentBlock - 100n
            : 0n;

      if (fromBlock > currentBlock) {
        return;
      }

      // Query in bounded range (max 500 blocks)
      const toBlock = currentBlock - fromBlock > 500n ? fromBlock + 500n : currentBlock;

      const logs = await fujiPublicClient.getContractEvents({
        address: CONTRACTS.avalancheFuji.pactEscrow,
        abi: PACT_ESCROW_ABI,
        eventName: "PaymentIntentCreated",
        fromBlock,
        toBlock,
      });

      for (const log of logs) {
        await this.handleIntentCreatedLog(log);
      }

      this.store.setLastIndexedBlock(toBlock);
    } catch (err) {
      console.warn(`[Solver] Historical sync warning:`, (err as Error).message);
    }
  }

  private async handleIntentCreatedLog(log: {
    args: {
      intentId?: `0x${string}`;
      sender?: `0x${string}`;
      targetChainId?: bigint;
      receiver?: `0x${string}`;
      tokenIn?: `0x${string}`;
      amountIn?: bigint;
      feePaid?: bigint;
      priority?: number;
      hashLock?: `0x${string}`;
      deadline?: bigint;
    };
    transactionHash?: `0x${string}` | null;
    blockNumber?: bigint | null;
  }): Promise<void> {
    const {
      intentId,
      sender,
      targetChainId,
      receiver,
      tokenIn,
      amountIn,
      feePaid,
      priority,
      hashLock,
      deadline,
    } = log.args;

    if (
      !intentId ||
      !sender ||
      targetChainId === undefined ||
      !receiver ||
      !tokenIn ||
      amountIn === undefined ||
      feePaid === undefined ||
      priority === undefined ||
      !hashLock ||
      deadline === undefined
    ) {
      return;
    }

    // Fetch tokenOut from contract if needed, or default to target chain MockUSDC
    const targetChainNum = Number(targetChainId);
    const defaultTokenOut =
      targetChainNum === 421614
        ? CONTRACTS.arbitrumSepolia.mockUsdc
        : CONTRACTS.baseSepolia.mockUsdc;

    const { record, isNew } = this.store.upsertIntentFromEvent({
      intentId,
      sender,
      tokenIn,
      amountIn,
      feePaid,
      targetChainId: targetChainNum,
      receiver,
      tokenOut: defaultTokenOut,
      priority: priority as Priority,
      hashLock,
      deadline: Number(deadline),
      sourceTxHash: log.transactionHash ?? null,
      sourceBlockNumber: log.blockNumber ? Number(log.blockNumber) : null,
    });

    if (log.blockNumber) {
      const lastBlock = this.store.getLastIndexedBlock();
      if (lastBlock === null || log.blockNumber > lastBlock) {
        this.store.setLastIndexedBlock(log.blockNumber);
      }
    }

    if (isNew) {
      console.log(
        `[Solver] Indexed PaymentIntentCreated: ${record.intent_id} | ` +
          `Amount: $${formatUsdcAmount(BigInt(record.amount_in))} USDC | ` +
          `Route: ${record.priority === Priority.SPEED ? "⚡ SPEED" : "🐢 COST"} | ` +
          `TargetChain: ${record.target_chain_id}`
      );
    }

    if (record.priority === Priority.SPEED) {
      void this.processIntent(record.intent_id);
    } else {
      console.log(
        `[Solver] Intent ${record.intent_id} queued in COST (Economy) pool for batch window.`
      );
    }
  }

  /**
   * Economy Route (§1.3): aggregates queued COST intents per destination chain and pays all merchants
   * in ONE PactBatchDispatcher.batchTransfer transaction to amortize gas.
   * A chain's batch flushes when its oldest intent has waited the batch window, or earlier if any
   * intent is close to its deadline.
   */
  public async flushEconomyBatches(force = false): Promise<void> {
    const queued = this.store.getQueuedEconomyIntents();
    if (queued.length === 0) return;

    const byChain = new Map<number, StoredIntentRecord[]>();
    for (const item of queued) {
      const list = byChain.get(item.target_chain_id) ?? [];
      list.push(item);
      byChain.set(item.target_chain_id, list);
    }

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    await Promise.all(
      [...byChain.entries()].map(async ([chainId, items]) => {
        if (this.batchingChains.has(chainId)) return;

        const oldestWaitMs = nowMs - Math.min(...items.map((i) => i.created_at));
        const nearDeadline = items.some((i) => i.deadline - nowSec <= this.batchDeadlineSafetySec);
        if (!force && oldestWaitMs < this.batchWindowMs && !nearDeadline) return;

        this.batchingChains.add(chainId);
        try {
          await this.dispatchBatch(chainId, items.slice(0, this.maxBatchSize));
        } catch (err) {
          console.error(`[Batch] Chain ${chainId} batch failed:`, (err as Error).message);
        } finally {
          this.batchingChains.delete(chainId);
        }
      })
    );
  }

  private async dispatchBatch(chainId: number, candidates: StoredIntentRecord[]): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const dest = getDestinationClients(chainId);
    if (dest.batchDispatcherAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(`PactBatchDispatcher not configured for chain ${chainId}`);
    }

    const batch: StoredIntentRecord[] = [];
    for (const item of candidates) {
      const fresh = this.store.getIntentById(item.intent_id);
      if (!fresh || fresh.state !== "CREATED" || fresh.dest_tx_hash) continue; // already handled
      if (nowSec >= fresh.deadline) {
        // Too late to settle safely: let the sender refund() on Fuji.
        this.store.updateIntentState(fresh.intent_id, "REFUNDED", {
          errorMessage: "Expired before economy batch dispatch",
        });
        continue;
      }
      if (!fresh.secret) {
        const resolved = this.store.resolveSecretForHashLock(fresh.hash_lock);
        if (!resolved.secret) {
          console.error(`[Batch] Skipping ${fresh.intent_id}: no preimage secret for ${fresh.hash_lock}`);
          this.store.updateIntentState(fresh.intent_id, "CREATED", {
            errorMessage: "Preimage secret not found",
            incrementRetry: true,
          });
          continue;
        }
        this.store.updateIntentState(fresh.intent_id, "CREATED", { secret: resolved.secret });
      }
      batch.push(fresh);
    }
    if (batch.length === 0) return;

    const total = batch.reduce((acc, i) => acc + BigInt(i.amount_in), 0n);
    console.log(
      `[Batch] 🐢 Dispatching ${batch.length} economy intent(s) ($${formatUsdcAmount(total)} USDC) ` +
        `in ONE tx on ${dest.chainName}...`
    );

    const txHash = await this.withChainLock(chainId, async () => {
      const allowance = await dest.publicClient.readContract({
        address: dest.mockUsdcAddress,
        abi: MOCK_USDC_ABI,
        functionName: "allowance",
        args: [relayerAccount.address, dest.batchDispatcherAddress],
      });
      if (allowance < total) {
        console.log(`[Batch] Approving PactBatchDispatcher on ${dest.chainName}...`);
        const approveHash = await dest.walletClient.writeContract({
          address: dest.mockUsdcAddress,
          abi: MOCK_USDC_ABI,
          functionName: "approve",
          args: [dest.batchDispatcherAddress, 2n ** 255n],
        });
        await dest.publicClient.waitForTransactionReceipt({ hash: approveHash, pollingInterval: 250 });
      }

      return await dest.walletClient.writeContract({
        address: dest.batchDispatcherAddress,
        abi: PACT_BATCH_DISPATCHER_ABI,
        functionName: "batchTransfer",
        args: [
          dest.mockUsdcAddress,
          batch.map((i) => i.intent_id as Hex),
          batch.map((i) => i.receiver),
          batch.map((i) => BigInt(i.amount_in)),
        ],
      });
    });

    // Persist DISPATCHED + shared batch tx hash BEFORE waiting for the receipt (crash-safe).
    for (const i of batch) {
      this.store.updateIntentState(i.intent_id, "DISPATCHED", { destTxHash: txHash, errorMessage: null });
    }
    console.log(`[Batch] -> DISPATCHED ${batch.length} intent(s) on ${dest.chainName}: tx=${txHash}`);

    // Continue each intent: confirm batch receipt -> SETTLED -> claimEscrow on Fuji.
    await Promise.all(batch.map((i) => this.processIntent(i.intent_id)));
  }

  /**
   * Crash-recovery loop (NFR-03): resumes all recoverable intents from SQLite state.
   */
  public async recoverPendingIntents(): Promise<void> {
    const pending = this.store.getRecoverableIntents();
    await Promise.all(
      pending
        .filter((item) => item.priority === Priority.SPEED || item.state !== "CREATED")
        .map((item) => this.processIntent(item.intent_id))
    );
  }

  /**
   * Idempotent state machine execution for a single PaymentIntent:
   * CREATED -> DISPATCHED -> SETTLED -> CLAIMED
   */
  public async processIntent(intentId: string): Promise<StoredIntentRecord | null> {
    const normalizedId = intentId.toLowerCase();
    const existingPromise = this.inFlightIntents.get(normalizedId);
    if (existingPromise) {
      return await existingPromise;
    }

    const promise = this.executeIntentStateMachine(normalizedId).finally(() => {
      this.inFlightIntents.delete(normalizedId);
    });
    this.inFlightIntents.set(normalizedId, promise);
    return await promise;
  }

  private async executeIntentStateMachine(normalizedId: string): Promise<StoredIntentRecord | null> {
    const startMs = Date.now();

    try {
      let record = this.store.getIntentById(normalizedId);
      if (!record) return null;

      if (record.state === "CLAIMED" || record.state === "REFUNDED") {
        return record;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > record.deadline && record.state === "CREATED") {
        console.warn(`[Solver] Intent ${normalizedId} expired past deadline (${record.deadline}). Skipping dispatch.`);
        this.store.updateIntentState(normalizedId, "REFUNDED", {
          errorMessage: "Expired before destination dispatch",
        });
        return this.store.getIntentById(normalizedId);
      }

      // Ensure we have the preimage secret before fronting liquidity
      let secret = record.secret;
      if (!secret) {
        const resolved = this.store.resolveSecretForHashLock(record.hash_lock);
        secret = resolved.secret;
        if (secret) {
          record = this.store.updateIntentState(normalizedId, record.state, { secret })!;
        }
      }

      if (!secret) {
        // Check if this historical intent was already fulfilled or refunded on-chain
        const [onChainIntent, refunded] = await Promise.all([
          fujiPublicClient.readContract({
            address: CONTRACTS.avalancheFuji.pactEscrow,
            abi: PACT_ESCROW_ABI,
            functionName: "getIntent",
            args: [record.intent_id as Hex],
          }),
          fujiPublicClient.readContract({
            address: CONTRACTS.avalancheFuji.pactEscrow,
            abi: PACT_ESCROW_ABI,
            functionName: "isRefunded",
            args: [record.intent_id as Hex],
          }),
        ]);

        if (onChainIntent.isFulfilled) {
          return this.store.updateIntentState(normalizedId, "CLAIMED", { errorMessage: null });
        }
        if (refunded) {
          return this.store.updateIntentState(normalizedId, "REFUNDED", { errorMessage: null });
        }

        const msg = `Preimage secret not found for hashLock ${record.hash_lock}. Cannot claim escrow safely.`;
        console.error(`[Solver] ${msg}`);
        this.store.updateIntentState(normalizedId, record.state, {
          errorMessage: msg,
          incrementRetry: true,
        });
        return this.store.getIntentById(normalizedId);
      }

      const dest = getDestinationClients(record.target_chain_id);

      // -------------------------------------------------------------------
      // STEP 1: CREATED -> DISPATCHED (Destination ERC-20 transfer)
      // -------------------------------------------------------------------
      if (record.state === "CREATED") {
        // If dest_tx_hash is already set (e.g., partial crash), advance to DISPATCHED directly
        if (record.dest_tx_hash) {
          record = this.store.updateIntentState(normalizedId, "DISPATCHED")!;
        } else {
          console.log(
            `[Solver] Dispatching $${formatUsdcAmount(BigInt(record.amount_in))} USDC to ${record.receiver} on ${dest.chainName} (${record.target_chain_id})...`
          );

          const receiver = record.receiver;
          const amountIn = BigInt(record.amount_in);
          const destTxHash = await this.withChainLock(record.target_chain_id, async () => {
            return await dest.walletClient.writeContract({
              address: dest.mockUsdcAddress,
              abi: MOCK_USDC_ABI,
              functionName: "transfer",
              args: [receiver, amountIn],
            });
          });

          // Persist DISPATCHED + destTxHash BEFORE waiting for receipt (crash-safe idempotency)
          record = this.store.updateIntentState(normalizedId, "DISPATCHED", {
            destTxHash,
            errorMessage: null,
          })!;
          console.log(`[Solver] -> DISPATCHED on ${dest.chainName}: tx=${destTxHash}`);
        }
      }

      // -------------------------------------------------------------------
      // STEP 2: DISPATCHED -> SETTLED (Confirm destination receipt)
      // -------------------------------------------------------------------
      if (record.state === "DISPATCHED") {
        if (!record.dest_tx_hash) {
          throw new Error(`Intent ${normalizedId} is in DISPATCHED state without dest_tx_hash`);
        }

        const receipt = await dest.publicClient.waitForTransactionReceipt({
          hash: record.dest_tx_hash,
          pollingInterval: 250,
          timeout: 60_000,
        });

        if (receipt.status !== "success") {
          throw new Error(`Destination transfer reverted on ${dest.chainName}: ${record.dest_tx_hash}`);
        }

        record = this.store.updateIntentState(normalizedId, "SETTLED", {
          errorMessage: null,
        })!;

        const settleElapsedMs = Date.now() - startMs;
        console.log(
          `[Solver] -> SETTLED on ${dest.chainName} in ${settleElapsedMs}ms! Merchant ${record.receiver} received $${formatUsdcAmount(BigInt(record.amount_in))} USDC.`
        );
      }

      // -------------------------------------------------------------------
      // STEP 3: SETTLED -> CLAIMED (Claim locked escrow + fee on Fuji)
      // -------------------------------------------------------------------
      if (record.state === "SETTLED") {
        // Check if already fulfilled on-chain (e.g. crash after claim tx broadcast)
        if (record.claim_tx_hash) {
          const claimReceipt = await fujiPublicClient.waitForTransactionReceipt({
            hash: record.claim_tx_hash,
            pollingInterval: 250,
          });
          if (claimReceipt.status === "success") {
            record = this.store.updateIntentState(normalizedId, "CLAIMED", {
              errorMessage: null,
            })!;
            console.log(`[Solver] -> CLAIMED (recovered receipt) on Fuji: tx=${record.claim_tx_hash}`);
            return record;
          }
        }

        const onChainIntent = await fujiPublicClient.readContract({
          address: CONTRACTS.avalancheFuji.pactEscrow,
          abi: PACT_ESCROW_ABI,
          functionName: "getIntent",
          args: [record.intent_id as Hex],
        });

        if (onChainIntent.isFulfilled) {
          record = this.store.updateIntentState(normalizedId, "CLAIMED", {
            errorMessage: null,
          })!;
          console.log(`[Solver] -> CLAIMED (already fulfilled on-chain) for ${normalizedId}`);
          return record;
        }

        console.log(`[Solver] Claiming escrow on Avalanche Fuji for ${normalizedId}...`);
        const claimTxHash = await this.withChainLock(CONTRACTS.avalancheFuji.chainId, async () => {
          return await fujiWalletClient.writeContract({
            address: CONTRACTS.avalancheFuji.pactEscrow,
            abi: PACT_ESCROW_ABI,
            functionName: "claimEscrow",
            args: [record!.intent_id as Hex, secret!],
          });
        });

        // Persist claimTxHash immediately before waiting for receipt
        record = this.store.updateIntentState(normalizedId, "SETTLED", {
          claimTxHash,
        })!;

        const claimReceipt = await fujiPublicClient.waitForTransactionReceipt({
          hash: claimTxHash,
          pollingInterval: 250,
          timeout: 60_000,
        });

        if (claimReceipt.status !== "success") {
          throw new Error(`claimEscrow reverted on Avalanche Fuji: ${claimTxHash}`);
        }

        record = this.store.updateIntentState(normalizedId, "CLAIMED", {
          claimTxHash,
          errorMessage: null,
        })!;

        const totalElapsedMs = Date.now() - startMs;
        console.log(
          `[Solver] -> CLAIMED on Avalanche Fuji in ${totalElapsedMs}ms total! Claim Tx: ${claimTxHash}`
        );
      }

      return record;
    } catch (err) {
      if (this.isStopping) return null;
      const errorMessage = (err as Error).message || String(err);
      console.error(`[Solver] Error processing intent ${normalizedId}:`, errorMessage);
      const current = this.store.getIntentById(normalizedId);
      if (current) {
        this.store.updateIntentState(normalizedId, current.state, {
          errorMessage,
          incrementRetry: true,
        });
      }
      return this.store.getIntentById(normalizedId);
    }
  }
}
