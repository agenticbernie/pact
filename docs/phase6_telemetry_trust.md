# Phase 6 — Demo Telemetry & Trust UI Specification

## 1. Overview & Compliance with `docs/pact_docs.md`

Phase 6 implements the complete **Demo Telemetry & Trust UI Suite** (§1.3, §1.4, §2.2 NFR-01, §3.1.2) across `/relayer` and `/web`:

- **Real-Time Settlement Telemetry & Latency Dashboard (§2.2 NFR-01, §3.3):**
  - Integrated [`TelemetryDashboard.tsx`](../web/src/components/TelemetryDashboard.tsx) directly into the main PWA tab switcher (`[ 📱 Payer | 🏪 Merchant POS | 📊 Telemetry & Trust ]`).
  - Queries `/api/v1/health` and `/api/v1/intents` with a 3-second live auto-refresh cycle and active millisecond ping telemetry.
  - Displays multi-chain solver health across **Avalanche Fuji (`43113`)**, **Arbitrum Sepolia (`421614`)**, and **Base Sepolia (`84532`)**: block numbers, Relayer gas balances (AVAX & ETH), and MockUSDC liquidity pool reserves.
- **SLA & Performance Benchmarks Card (NFR-01):**
  - Displays live performance against strict SLAs:
    - **Quote SLA:** `<300ms` target (verified live at **~2.5ms** average).
    - **⚡ Lightning Route SLA:** `<3.0s` target (verified live at **~2.2s - 2.4s** instant fill).
    - **🐢 Economy Route SLA:** `<45s` target (batching window).
    - **HTLC Escrow Guarantee:** 100% principal + fee refundable after 15 minutes if unfulfilled.
- **Interactive Security Architecture: EIP-7702 Post-Mortem Defense (§3.1.2):**
  - Highlights why Pact **rejects EIP-7702 EOA delegation** (the vector responsible for the $6.3B+ October 2026 Binance hot wallet sweep exploit).
  - Explains Pact's **ERC-4337 Modular Smart Account (Kernel v3.1)** architecture: immutable code logic + Scoped Session Keys strictly restricted to `Target == PactEscrow && Value <= $50.00 / 24h` enforced by on-chain `CallPolicy V0_0_4`.
- **4-Step Multi-Chain Settlement Stepper & Universal Explorer Links:**
  - Both Payer ([`PayerClient.tsx`](../web/src/components/PayerClient.tsx)) and Merchant ([`MerchantTerminal.tsx`](../web/src/components/MerchantTerminal.tsx)) feature a 4-step live audit stepper with direct clickable explorer links:
    1. **Fuji Escrow Locked** (Snowtrace link)
    2. **Solver Fronted Liquidity** (Preimage verified)
    3. **Destination Settlement** (Arbiscan / Basescan link)
    4. **Fuji Escrow Claimed** (Snowtrace link)
- **HTLC Expiration & 100% Guaranteed Refund (FR-10, §1.4):**
  - Verified on-chain via `PactEscrow.refund(intentId)`: after deadline expiration ($T > \text{deadline}$), 100% of deposited principal and fee are released back to the sender.

---

## 2. Multi-Chain Explorer Helpers (`web/src/lib/config.ts`)

| Chain | Chain ID | Explorer Base URL | Helper Function |
| :--- | :--- | :--- | :--- |
| **Avalanche Fuji** | `43113` | `https://testnet.snowtrace.io` | `getExplorerTxUrl(43113, tx)` |
| **Arbitrum Sepolia** | `421614` | `https://sepolia.arbiscan.io` | `getExplorerTxUrl(421614, tx)` |
| **Base Sepolia** | `84532` | `https://sepolia.basescan.org` | `getExplorerTxUrl(84532, tx)` |

---

## 3. Live On-Chain Verification Proof (`npm --workspace=relayer run verify:p6`)

Executed end-to-end on testnets via [`verify-phase6.ts`](../relayer/src/scripts/verify-phase6.ts):

```
=================================================================
PACT PROTOCOL — PHASE 6 LIVE TELEMETRY, SLA & TRUST VERIFICATION
=================================================================
[1/4] Verifying Multi-Chain Solver Node Telemetry via /api/v1/health...
  -> Relayer Address:  0xD7A9788d08140237abBc482BF7981647Eb0419A1
  -> Protocol Version: 2.0.0
  -> Fuji Block:       #60771110 (Escrow: 0xEFf5284031D5bA06AA2E5b77e27F97934dC12708)
  -> ArbSepolia Block: #327490642 (USDC: 999969.5)
  -> BaseSepolia Block:#56436632 (USDC: 1000000)

[2/4] Benchmarking Quote Latency (<300ms SLA per NFR-01)...
  -> 5 Quote Samples: 4.7ms, 2.2ms, 1.9ms, 1.9ms, 2.1ms
  -> Average Latency: 2.56ms (Strictly < 300ms NFR-01 SLA ✓)

[3/4] Verifying Lightning Route Instant Settlement (<3.0s NFR-01 SLA)...
  -> Intent Created on Fuji: 0xa4216c54a1afa5bec316a2f8b4206addeb7be6f0dfabab4a8ba1ed5c10fe854e (Tx: 0x97504ce74767878f0ec97f3cb3fd4b2a938ab6bfdcf605608241853481cb7555)
  -> Dest Settlement Tx:   0xfdf23e4c7efc3216ac94f5773c1f2d12b156108e44de48634b420334256da877
  -> Claim Escrow Tx:      0x3e6fbee31bd176031e46ba5b430cac844988642d58b8dc9ddb192f95fe58bd6b
  -> Total Settlement Time: 2.41s to destination fill (5.32s full cycle claim)
  -> Audit Trail Verified in /api/v1/intents ✓

[4/4] Verifying HTLC Expiration & 100% Guaranteed User Refund (FR-10, §1.4)...
  -> Created Refund Test Intent: 0xc7265597ba9924501a1d820aa9eae5b3df473cc50a68cdaf50f8e5d9eb6c3efc
  -> Waiting for test deadline expiration (~15s)...
  -> Current block timestamp 1794209215 > deadline 1794209211 ✓
  -> Calling PactEscrow.refund(intentId) on Avalanche Fuji...
  -> Refund Tx Hash:   0xcbf85c6fd8886a59822cf5c689e97df6bd64c398bc17492665f2f739394186c7
  -> Returned Funds:   2.005 USDC (100% Principal + Fee)
  -> Net Balance Delta: +0 USDC net difference (Full Refund Verified)

=================================================================
PHASE 6 VERIFICATION PASSED — LIVE TELEMETRY, SLAS & TRUST CONFIRMED!
=================================================================
```
