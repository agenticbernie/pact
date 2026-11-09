# PHASE 3 — ECONOMY ROUTE BATCHING

Implements `docs/pact_docs.md` §1.3 (Economy Route: Cost Priority), §3.3.2, and `docs/phase0_spec_lock.md`.

---

## 1. Overview & Architecture

The **Economy Route (🐢 COST)** minimizes transaction overhead by batching multiple customer payments on destination chains:
- **Fee Model:** Flat **$0.005 USD** (5,000 atomic units) regardless of transfer volume.
- **Batch Window:** Configurable `15 - 45s` window (`ECONOMY_BATCH_WINDOW_MS=15000`) or early trigger if an intent nears its deadline (`batchDeadlineSafetySec = 90s`).
- **Destination Settlement:** Executed via [`PactBatchDispatcher.sol`](file:///home/bernieweb3/Downloads/hackathons/pact/contracts/src/PactBatchDispatcher.sol) deployed on Arbitrum Sepolia and Base Sepolia.

---

## 2. Smart Contracts (`/contracts`)

| Contract | Chain | Address |
|---|---|---|
| `PactBatchDispatcher` | Arbitrum Sepolia (`421614`) | `0x2d29dAc762d43B036eDe889d3D18fF1fBA553878` |
| `PactBatchDispatcher` | Base Sepolia (`84532`) | `0x937408C5194bb6885fB51ab4607575c52524933E` |

`PactBatchDispatcher.batchTransfer`:
```solidity
function batchTransfer(
    address token,
    bytes32[] calldata intentIds,
    address[] calldata receivers,
    uint256[] calldata amounts
) external
```
Atomically transfers tokens from the caller (Relayer) to all destination merchant addresses within a single transaction, emitting `BatchTransfer(intentId, receiver, amount)` for each payment.

---

## 3. Relayer Solver Integration (`/relayer`)

- **Queue Management:** `store.getQueuedEconomyIntents()` retrieves all `CREATED` intents with `priority = 1 (COST)` grouped by destination `target_chain_id`.
- **Atomic Dispatch:** When the window expires or an urgent deadline approaches, [`flushEconomyBatches()`](file:///home/bernieweb3/Downloads/hackathons/pact/relayer/src/services/solver.ts) aggregates all intents and broadcasts a single `batchTransfer` call.
- **Shared State Transition:** Every intent in the batch records the exact same `dest_tx_hash` and transitions synchronously to `DISPATCHED → SETTLED`.
- **Fuji Claim Execution:** Once destination receipt is confirmed, the Relayer claims each escrowed deposit on Avalanche Fuji sequentially using the respective preimage secret.

---

## 4. Live Testnet Verification Results (`npm --workspace=relayer run verify:p3`)

- **Intent A (Fuji):** `0x2a2dc46b0610da69ddf586538cb280c3148ba068011bf8cb29036035e88586c2` ($2.00 USDC, $0.005 fee)
- **Intent B (Fuji):** `0x27906ca32df7aba3ddeb4878b96cc809ef111888135a0d11af91801cf81621e8` ($4.50 USDC, $0.005 fee)
- **Single Destination Batch Tx (Arbitrum Sepolia):** [`0x2a03ac2b28b431d17aac096c0860980dad8f49be7349a81ac124b03295f6e353`](https://sepolia.arbiscan.io/tx/0x2a03ac2b28b431d17aac096c0860980dad8f49be7349a81ac124b03295f6e353)
  - Both merchants received exact funds in one atomic transaction!
- **Claim Tx A (Fuji):** `0x35081b6a72735c881de392f9c2f7f32625216370c0308ff1b9d81072792b35e0`
- **Claim Tx B (Fuji):** `0xb2ed46965648107dc4b8d8d61e99126bd7d672ff419010565949709b8390ec83`
