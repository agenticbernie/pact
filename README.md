# Pact Protocol

> **"MoMo for Stablecoins" — Gasless, Sub-2s Cross-Chain QR Payments Powered by Smart Intent-Based Flow Routing**
>
> Authored by **HackOn Team** • Built on **Avalanche**

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![Avalanche Fuji](https://img.shields.io/badge/Source_Anchor-Avalanche_Fuji_(43113)-E84142)](https://testnet.snowtrace.io/address/0xEFf5284031D5bA06AA2E5b77e27F97934dC12708)
[![ERC-4337](https://img.shields.io/badge/Account_Abstraction-ZeroDev_Kernel_v3.1-3B82F6)](./docs/phase5_account_abstraction.md)

---

## Overview

**Pact Protocol** brings the 3-second, 1-tap QR checkout experience of leading consumer payment apps (such as MoMo and Napas 24/7) to cross-chain stablecoins.

A payer holding stablecoins on **Avalanche C-Chain (Fuji `43113`)** scans a merchant QR code and settles **USDC** directly to the merchant on **Arbitrum (`421614`)** or **Base (`84532`)** in **under 2.5 seconds**—with **zero seed phrases**, **zero wallet popups**, and **zero gas tokens** required.

### Core Capabilities

- **Smart Intent-Based Flow Routing:**
  - **⚡ Lightning Route (Speed Priority):** Instant solver liquidity fill in **1.0–3.0s** (`0.30%` dynamic fee for invoices `<$15.00`; `$0.05` flat fee for invoices `>=$15.00`).
  - **🐢 Economy Route (Cost Priority):** Multi-intent L2 batch settlement (`PactBatchDispatcher`) within a **15–45s** window for a flat **`$0.005`** fee.
- **ZeroDev Kernel v3.1 Account Abstraction (EIP-7702 Defense):**
  - **WebAuthn Passkey Onboarding:** Biometric smart accounts on canonical ERC-4337 `EntryPoint v0.7`—no seed phrases and no invasive EIP-7702 EOA code delegation.
  - **Scoped Session Keys:** On-chain `CallPolicy V0_0_4` + `TimestampPolicy` strictly caps spending at **`$50.00 / 24h`** exclusively on `PactEscrow.createIntent()`, enabling 1-tap payments with zero confirmation dialogs.
  - **Paymaster Gas Sponsorship & 1-Click Faucet:** Users transact with `0 AVAX` and can mint `+500.00 USDC` gaslessly from the client UI.
- **Cryptographic HTLC Escrow & 100% Refund Guarantee:**
  - Funds locked in `PactEscrow.sol` can only be claimed by the solver upon revealing the hashlock preimage (`keccak256(secret) == hashLock`), or 100% refunded to the payer after the 15-minute deterministic deadline (`refund(intentId)`).

---

## Architecture

```text
[Payer Mobile PWA]               [Avalanche Fuji (43113)]         [Pact Relayer & Solver]         [Arbitrum / Base Sepolia]
 (ZeroDev Kernel v3)                  (PactEscrow.sol)              (SQLite WAL + Viem)              (Merchant POS Terminal)
        │                                    │                               │                                 │
        ├── 1. Scan QR & Request Quote ──────┼──────────────────────────────►│                                 │
        ├── 2. Slide to Pay (UserOp) ───────►│                               │                                 │
        │      [Session Key, 0 AVAX Gas]     ├── 3. PaymentIntentCreated ───►│                                 │
        │                                    │                               ├── 4. Instant / Batched Fill ───►│
        │                                    │                               │      [Direct USDC Transfer]     ├── "Ting Ting!"
        │                                    │◄── 5. claimEscrow(secret) ────┤                                 │
```

| Directory | Description |
| :--- | :--- |
| [`contracts/`](./contracts) | Foundry smart contracts: `PactEscrow.sol`, `PactBatchDispatcher.sol`, `MockUSDC.sol`, and 33 unit/fuzz tests. |
| [`relayer/`](./relayer) | Off-chain TypeScript solver daemon, multi-RPC fallback engine, SQLite WAL state store, and ERC-4337 Bundler/Paymaster API. |
| [`web/`](./web) | Next.js 14 Mobile-First PWA featuring the Payer QR Scanner, Merchant POS Terminal, and Live Telemetry & Trust Dashboard. |
| [`shared/`](./shared) | Canonical multi-chain deployment registry ([`deployments.json`](./shared/deployments.json)). |
| [`docs/`](./docs) | Product & technical specification ([`pact_docs.md`](./docs/pact_docs.md)) and phase verification reports. |

---

## Deployed & Verified Contracts (Testnet)

| Network | Chain ID | Contract | Address | Explorer |
| :--- | :--- | :--- | :--- | :--- |
| **Avalanche Fuji** | `43113` | `PactEscrow` | `0xEFf5284031D5bA06AA2E5b77e27F97934dC12708` | [Snowtrace](https://testnet.snowtrace.io/address/0xEFf5284031D5bA06AA2E5b77e27F97934dC12708) |
| **Avalanche Fuji** | `43113` | `MockUSDC` (6 dec) | `0x937408C5194bb6885fB51ab4607575c52524933E` | [Snowtrace](https://testnet.snowtrace.io/address/0x937408C5194bb6885fB51ab4607575c52524933E) |
| **Arbitrum Sepolia** | `421614` | `MockUSDC` (6 dec) | `0xEFf5284031D5bA06AA2E5b77e27F97934dC12708` | [Arbiscan](https://sepolia.arbiscan.io/address/0xEFf5284031D5bA06AA2E5b77e27F97934dC12708) |
| **Arbitrum Sepolia** | `421614` | `PactBatchDispatcher` | `0x2d29dAc762d43B036eDe889d3D18fF1fBA553878` | [Arbiscan](https://sepolia.arbiscan.io/address/0x2d29dAc762d43B036eDe889d3D18fF1fBA553878) |
| **Base Sepolia** | `84532` | `MockUSDC` (6 dec) | `0xEFf5284031D5bA06AA2E5b77e27F97934dC12708` | [Basescan](https://sepolia.basescan.org/address/0xEFf5284031D5bA06AA2E5b77e27F97934dC12708) |
| **Base Sepolia** | `84532` | `PactBatchDispatcher` | `0x937408C5194bb6885fB51ab4607575c52524933E` | [Basescan](https://sepolia.basescan.org/address/0x937408C5194bb6885fB51ab4607575c52524933E) |

---

## Quick Start

### Prerequisites
- **Node.js** `>= 22.0.0` (uses built-in `node:sqlite`)
- **Foundry** (`forge`, `cast`)

### 1. Install & Configure
```bash
npm install
cp .env.example .env
# Add your funded testnet PRIVATE_KEY in .env (Fuji AVAX, Arbitrum Sepolia ETH, Base Sepolia ETH)
```

### 2. Run the Relayer & PWA
```bash
# Terminal 1 — Start Off-Chain Solver, Bundler/Paymaster & HTTP API (http://localhost:4000)
npm run relayer:dev

# Terminal 2 — Start Next.js Mobile PWA (http://localhost:3000)
npm run web:dev
```

### 3. Run Verification Suites
```bash
npm run contracts:test   # Run 33 Foundry unit & fuzz tests
npm run typecheck        # Typecheck relayer and web workspaces
npm run web:build        # Production Next.js build
npm run verify:p2        # Live Lightning settlement (<3s), quote SLA (<300ms) & crash recovery
npm run verify:p3        # Live Economy batching via PactBatchDispatcher
npm run verify:p5        # Live ZeroDev Kernel v3.1 Passkey AA, gasless faucet & $50 CallPolicy cap
npm run verify:p6        # Live multi-chain telemetry, SLAs & 100% HTLC refund past deadline
```

---

## Authors & License

Built with precision by **HackOn Team**.

Licensed under the [MIT License](./LICENSE).
