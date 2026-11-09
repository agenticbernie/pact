# PHASE 2 — OFF-CHAIN RELAYER DAEMON (`/relayer`)

Implements `docs/pact_docs.md` §3.3.2, §3.4.1, FR-07, FR-08, FR-09, NFR-01, NFR-03, and `docs/phase0_spec_lock.md` §3–4.

---

## 1. Architecture & Module Breakdown

| Module | File | Responsibility |
|---|---|---|
| **Viem ABIs** | `relayer/src/abi/contracts.ts` | Strongly-typed ABIs for `PactEscrow` and `MockUSDC`. |
| **Multi-Chain Config & RPC Fallbacks** | `relayer/src/config/chains.ts` | Configures `fallback([http(primary), http(fallback)])` across Avalanche Fuji (`43113`), Arbitrum Sepolia (`421614`), and Base Sepolia (`84532`) (NFR-03). |
| **SQLite State Store** | `relayer/src/db/store.ts` | Crash-safe WAL-mode SQLite database (`node:sqlite` `DatabaseSync`) storing `quotes`, `intents` (`CREATED → DISPATCHED → SETTLED → CLAIMED` / `REFUNDED`), and `sync_state` (`last_indexed_fuji_block`). |
| **Solver & Execution Engine** | `relayer/src/services/solver.ts` | Sub-500ms event indexer (FR-07), per-chain nonce-serialized dispatcher (FR-08), HTLC preimage claimer (FR-09), and crash-recovery state machine (NFR-03). |
| **HTTP API Server** | `relayer/src/server/api.ts` | Exposes `/api/v1/quote` (`<300ms` per NFR-01), `/api/v1/health`, `/api/v1/intents/:intentId`, and `/api/v1/orders/:orderId`. |
| **Verification Suite** | `relayer/src/scripts/verify-phase2.ts` | End-to-end live testnet verification (Fuji $\rightarrow$ Arbitrum Sepolia $\rightarrow$ Fuji claim + crash-recovery test). |

---

## 2. Crash-Recovery & Idempotency Guarantees (NFR-03)

1. **Pre-Receipt `dest_tx_hash` Persistence**:
   - In `CREATED → DISPATCHED`, the Relayer records `dest_tx_hash` in SQLite **immediately** upon broadcasting `MockUSDC.transfer(receiver, amountIn)` on the destination chain—before awaiting `waitForTransactionReceipt`.
   - If the Relayer crashes mid-flight, upon restart `recoverPendingIntents()` sees `state === 'DISPATCHED'` with `dest_tx_hash` present and resumes waiting for that transaction receipt instead of sending a duplicate transfer.
2. **Pre-Receipt `claim_tx_hash` & On-Chain `isFulfilled` Verification**:
   - In `SETTLED → CLAIMED`, the Relayer checks `claim_tx_hash` and `PactEscrow.getIntent(intentId).isFulfilled` on Avalanche Fuji before submitting `claimEscrow(intentId, secret)`, preventing duplicate claim transactions on restart.
3. **Historical Block Catch-Up**:
   - Tracks `last_indexed_fuji_block` in SQLite `sync_state` so any `PaymentIntentCreated` events emitted while the daemon was offline are indexed and fulfilled upon restart.

---

## 3. Commands

```bash
# Start the Relayer daemon in watch mode (port 4000)
npm run relayer:dev

# Typecheck the Relayer workspace
npm run relayer:typecheck

# Run the live end-to-end testnet & crash-recovery verification suite
npm --workspace=relayer run verify
```
