# PACT PROTOCOL — TECHNICAL & PRODUCT DOCUMENTATION SUITE
**Positioning:** "MoMo for Stablecoins" with Smart Intent-Based Flow Routing  
**Target Event:** UniHack 2026 (Team1 Vietnam — Avalanche Ecosystem)  
**Version:** 2.0.0 (Post-UniHackFest Upgrade)  
**Target Audience / Consumers:** Developers, Mentors, Evaluators, and AI Coding Agents (Antigravity CLI)  

---

## TABLE OF CONTENTS
1. [Product Requirements Document (PRD)](#1-product-requirements-document-prd)
2. [Software Requirements Specification (SRS)](#2-software-requirements-specification-srs)
3. [Technical Architecture Document (AICD Framework)](#3-technical-architecture-document-aicd-framework)
4. [UI/UX Design Principles & Mobile-First PWA Guidelines](#4-uiux-design-principles--mobile-first-pwa-guidelines)
5. [Implementation Roadmap & CLI Execution Prompts](#5-implementation-roadmap--cli-execution-prompts)

---

# 1. PRODUCT REQUIREMENTS DOCUMENT (PRD)

## 1.1. Context & Product Vision

### 1.1.1. Problem Statement
Cryptocurrency and stablecoin retail payments face three critical bottlenecks:
1. **Network & Asset Fragmentation:** A payer holds native AVAX or USDC on Avalanche C-Chain, while the payee (merchant, coffee shop) strictly requires settlement in USDC on Arbitrum or Base. Traditional cross-chain bridging takes 5 to 20 minutes, requires navigating 3–4 complex dApps, and demands maintaining native gas token balances across multiple destination chains.
2. **Web3 User Experience Friction:** Complex concepts such as private key management, seed phrases, manual gas estimation, and two-step token approvals create unacceptable cognitive barriers for retail users. Furthermore, following the $6.3B+ Binance exploit in October 2026 involving hijacked EIP-7702 delegation authorizations, users and security auditors demand strict account isolation over invasive account takeovers.
3. **Rigid, Unadaptable Payment Flows:** Existing Web3 payment gateways enforce rigid "Chain A to Chain A" execution. Users cannot adjust execution parameters based on context (e.g., instant clearance for coffee vs. ultra-low fees for monthly rent).

### 1.1.2. Positioning
**Pact** is positioned as the **"MoMo for Stablecoin Payments"** — delivering the sub-2-second, 1-tap QR payment convenience of top Web2 consumer fintech apps (such as MoMo or Napas 24/7), powered by Web3 programmable money and an **Intent-Based Cross-Chain Routing Engine**.

---

## 1.2. User Personas

### Persona 1: Consumer / Payer (Mobile-First)
* **Profile:** Everyday consumer paying for offline services (dining, retail, groceries).
* **Core Job-to-be-Done:** Scan a merchant QR code, authenticate with FaceID/TouchID via Passkey, and settle instantly in under 3 seconds without managing destination chain RPCs or bridge gas.
* **Behavior:** Chooses speed over minor fee differences for small daily purchases ($3 coffee), but prioritizes cost savings for larger transfers ($200 rent).

### Persona 2: Merchant / Payee (POS / Tablet Web)
* **Profile:** Retail business owner requiring predictable accounting.
* **Core Job-to-be-Done:** Input order total in USD, specify destination chain/asset preference (e.g., USDC on Arbitrum Sepolia), generate a dynamic QR code, and receive instant audio ("Ting Ting") and visual confirmation upon settlement.

### Persona 3: Pact Solver / Relayer Daemon (Automated Market Maker)
* **Profile:** Off-chain liquidity provider and execution agent.
* **Core Job-to-be-Done:** Monitor on-chain Payment Intents, front liquidity to merchants on destination networks, and claim locked escrow on Avalanche along with a relayer service fee via cryptographic proof (HTLC / Preimage).

---

## 1.3. Smart Intent-Based Flow Routing Model

Pact implements an **Intent-Based Architecture**, where users express *what* outcome they require rather than executing individual blockchain transactions:

$$\text{PaymentIntent} = \langle \text{Sender}, \text{Token}_{\text{in}}, \text{Amount}_{\text{in}}, \text{TargetChainId}, \text{Receiver}, \text{Token}_{\text{out}}, \text{Priority}, \text{HashLock}, \text{Deadline} \rangle$$

### Routing Profiles:
1. **⚡ Lightning Route (Speed Priority):**
   * **Target Latency:** $1.0 - 3.0\text{ seconds}$ end-to-end.
   * **Execution Model:** Relayer immediately fronts liquidity from its destination chain hot wallet (Instant Fill).
   * **Fee Structure:**
     * For transactions $\ge \$15.00$: Flat fee of **$0.05 USD**.
     * For micro-transactions $<\$15.00$: Dynamic rate of **0.30%** of invoice value.
2. **🐢 Economy Route (Cost Priority):**
   * **Target Latency:** $15 - 45\text{ seconds}$ (Batch processing window).
   * **Execution Model:** Relayer aggregates multiple destination transfers into a single batched transaction to amortize L1/L2 gas costs.
   * **Fee Structure:** Flat symbolic fee of **$0.005 USD** regardless of transaction size.

---

## 1.4. Timeout, Refund Guarantee & Testnet Faucet

* **Deterministic Expiration:** Every payment intent carries an on-chain expiration parameter ($T_{\text{deadline}} = \text{block.timestamp} + 900\text{ seconds}$ / 15 minutes).
* **Guaranteed Refund:** If a Relayer fails to settle on the destination chain prior to deadline, the sender can trigger `refund(intentId)` on Avalanche Fuji to recover 100% of deposited assets.
* **Zero-Friction Testnet Faucet:** The client interface provides a dedicated "1-Click Faucet" that mints 500 MockUSDC (6 decimals) directly to the user's smart account on Avalanche Fuji.

---

# 2. SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

## 2.1. Functional Requirements (FR)

### Module 1: Smart Account & Identity Management
* **FR-01 (Passkey Account Onboarding):** The system must generate an ERC-4337 Smart Contract Account using WebAuthn/Passkey authentication (via ZeroDev Kernel v3 or Thirdweb SDK). Raw seed phrases are strictly prohibited.
* **FR-02 (Scoped Session Keys):** The system must allow users to delegate a scoped Session Key restricted exclusively to `PactEscrow.createIntent()` with an upper spending limit of $50.00/24h. This eliminates repeated wallet confirmation dialogs during payments.
* **FR-03 (Paymaster Gas Sponsorship):** The system must sponsor gas on Avalanche Fuji testnet using a configured ERC-4337 Paymaster, enabling gasless transactions for new users.

### Module 2: Merchant QR Generation & Invoicing
* **FR-04 (Dynamic QR Encoding):** The merchant terminal must encode invoice metadata into a standardized JSON string payload: `protocol`, `orderId`, `merchantAddress`, `targetChainId`, `targetToken`, `amount`, and `timestamp`.
* **FR-05 (Multi-Network Configuration):** The merchant interface must allow toggling default receipt settlement between `Arbitrum Sepolia (421614)` and `Base Sepolia (84532)`.

### Module 3: Escrow & Cross-Chain Settlement
* **FR-06 (Escrow Intent Creation):** `PactEscrow.sol` on Avalanche Fuji must lock either native AVAX or ERC-20 tokens, generate a unique `bytes32 intentId`, store the `hashLock` commitment, and emit the `PaymentIntentCreated` event.
* **FR-07 (Relayer Event Processing):** The off-chain Relayer daemon must index `PaymentIntentCreated` events via Avalanche RPC WebSocket/HTTP within 500ms of block inclusion.
* **FR-08 (Instant Destination Dispatch):** If `priority == SPEED`, the Relayer must immediately execute an ERC-20 transfer of `amount` to the merchant address on the target chain.
* **FR-09 (Cryptographic Escrow Claim):** Upon confirmation on the target chain, the Relayer must execute `claimEscrow(intentId, secret)` on Avalanche Fuji. The contract verifies $\text{keccak256}(\text{secret}) == \text{hashLock}$ before releasing escrowed funds and accrued fees to the Relayer.
* **FR-10 (Timeout & User Refund):** If `block.timestamp > deadline` and `isFulfilled == false`, the contract must allow the original `sender` to withdraw 100% of deposited funds.

---

## 2.2. Non-Functional Requirements (NFR)

* **NFR-01 (Performance):** QR scanning to intent quote display must complete in $<300\text{ ms}$. Lightning route settlement must reflect on the merchant screen in $<3.0\text{ seconds}$.
* **NFR-02 (Security & Isolation):** Account Abstraction must operate via isolated modular contracts (ERC-4337). Invasive EOA code delegation schemes (such as EIP-7702) are rejected to eliminate arbitrary account-takeover vectors.
* **NFR-03 (Fault Tolerance):** The Relayer daemon must implement automated RPC fallback across at least two public endpoints and persistent intent state storage (via SQLite or Redis) to recover pending fulfillments upon crash restart.
* **NFR-04 (Zero-Cost Operation):** All demo contracts and services must operate strictly on public testnets without requiring proprietary paid APIs.

---

# 3. TECHNICAL ARCHITECTURE DOCUMENT (AICD FRAMEWORK)

```
┌────────────────────────────────────────────────────────────────────────┐
│                          1. ARCHITECTURE                               │
│                                                                        │
│   [Avalanche Fuji C-Chain]      [Off-chain Solver Daemon] [Dest Chains]
│    ┌────────────────────┐          ┌─────────────────┐     ┌───────────┐
│    │   PactEscrow.sol   │◄─────────┤  Pact Relayer   ├────►│ Arbitrum  │
│    │   (Intent Escrow)  │  Events  │  (Multi-Chain)  │ Tx  │   & Base  │
│    └────────────────────┘          └─────────────────┘     └───────────┘
├────────────────────────────────────────────────────────────────────────┤
│                          2. INTERFACES                                 │
│  • Smart Contract: IPactEscrow.sol (Solidity 0.8.20)                   │
│  • QR Payload Schema: application/vnd.pact.payment+json                │
│  • Relayer HTTP/WS API: /api/v1/quote, /api/v1/health                  │
├────────────────────────────────────────────────────────────────────────┤
│                          3. COMPONENTS                                 │
│  • Client: Mobile PWA (Next.js 14 App Router + Tailwind + HTML5-QR)   │
│  • Solver: Node.js / TypeScript Daemon (Viem + Ethers.js)              │
│  • Core Contracts: PactEscrow.sol & MockUSDC.sol (Avalanche Fuji)       │
│  • Destination Contracts: MockUSDC.sol (Arbitrum & Base Sepolia)       │
├────────────────────────────────────────────────────────────────────────┤
│                          4. DATA FLOW & LIFECYCLE                      │
│  PaymentIntent: CREATED ──► DISPATCHED ──► SETTLED ──► CLAIMED         │
│                                       └──► (Timeout) ──► REFUNDED      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3.1. A — Architecture Overview

### 3.1.1. Hybrid On-Chain / Off-Chain Topology
* **Source Settlement Layer (Avalanche Fuji C-Chain - ID: `43113`):** Serves as the immutable escrow anchor. Avalanche's sub-second finality ensures intents are locked and emitted with minimal latency.
* **Solver / Liquidity Mesh (Off-Chain Relayer):** Operates as a stateless coordinator that assumes short-term inventory risk in exchange for routing fees.
* **Destination Settlement Layer (Arbitrum Sepolia - ID: `421614` & Base Sepolia - ID: `84532`):** Direct recipient layer. Receives stablecoin transfers without requiring cross-chain messaging bridges.

### 3.1.2. Security Architecture: EIP-7702 Post-Mortem Defense
In late October 2026, malicious actors exploited EIP-7702 authorization batching on Binance hot wallets, executing 50 pre-signed delegations in a single transaction that transformed standard accounts into sweeper contracts. 

**Pact's Architectural Countermeasure:**
* Pact rejects EIP-7702 EOA delegation.
* Pact mandates **ERC-4337 Modular Smart Accounts** (Kernel v3). Code logic is immutable post-deployment.
* **Scoped Session Keys** hold ephemeral keys that can only sign transactions matching:
  $$\text{Target} == \text{address}(PactEscrow) \quad \land \quad \text{Value} \le \text{DailyLimit}$$
Any arbitrary sweeping or contract override attempt is cryptographically rejected at the smart account kernel level.

---

## 3.2. I — Interfaces & Specifications

### 3.2.1. `IPactEscrow.sol` Specification

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPactEscrow {
    enum Priority { SPEED, COST }

    struct PaymentIntent {
        address sender;
        address tokenIn;
        uint256 amountIn;
        uint256 targetChainId;
        address receiver;
        address tokenOut;
        Priority priority;
        bytes32 hashLock;
        uint256 deadline;
        uint256 feePaid;
        bool isFulfilled;
    }

    event PaymentIntentCreated(
        bytes32 indexed intentId,
        address indexed sender,
        uint256 indexed targetChainId,
        address receiver,
        address tokenIn,
        uint256 amountIn,
        uint256 feePaid,
        Priority priority,
        bytes32 hashLock,
        uint256 deadline
    );

    event PaymentSettled(bytes32 indexed intentId, address indexed relayer, string secret);
    event PaymentRefunded(bytes32 indexed intentId, address indexed sender);

    function createIntent(
        address tokenIn,
        uint256 amountIn,
        uint256 targetChainId,
        address receiver,
        address tokenOut,
        Priority priority,
        bytes32 hashLock,
        uint256 deadline
    ) external payable returns (bytes32 intentId);

    function claimEscrow(bytes32 intentId, string calldata secret) external;
    function refund(bytes32 intentId) external;
}
```

### 3.2.2. `MockUSDC.sol` (6 Decimals Standard)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 10**6); // 1M USDC initial pool for relayer
    }

    function decimals() public pure override returns (uint8) {
        return 6; // Mandatory: Real USDC uses 6 decimals
    }

    function faucet() external {
        _mint(msg.sender, 500 * 10**6); // 500 test USDC per tap
    }
}
```

### 3.2.3. Dynamic QR JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PactPaymentRequest",
  "type": "object",
  "properties": {
    "protocol": { "type": "string", "enum": ["pact"] },
    "version": { "type": "string", "enum": ["1.0"] },
    "orderId": { "type": "string" },
    "merchant": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "targetChainId": { "type": "integer", "enum": [421614, 84532] },
    "targetToken": { "type": "string", "enum": ["USDC"] },
    "amount": { "type": "string", "pattern": "^[0-9]+(\\.[0-9]{1,6})?$" },
    "timestamp": { "type": "integer" }
  },
  "required": ["protocol", "orderId", "merchant", "targetChainId", "targetToken", "amount"]
}
```

---

## 3.3. C — System Components

### 3.3.1. Frontend Web Client (PWA)
* **Stack:** Next.js 14, Tailwind CSS, Viem, Lucide-React.
* **Camera Scanner Engine:** Integrated `@zxing/browser` with automatic 60 FPS viewport processing and Torch/Flashlight toggle.
* **AA Wallet Integration:** ZeroDev / Thirdweb Passkey SDK with WebAuthn credential cache.

### 3.3.2. Off-Chain Relayer Daemon (`relayer.ts`)
* **Stack:** Node.js v20+, TypeScript, Viem (`createPublicClient`, `createWalletClient`).
* **Multi-Chain Wallet Architecture:**
  * Primary signer on Avalanche Fuji (funds claimer).
  * Signer on Arbitrum Sepolia (funds dispatcher).
  * Signer on Base Sepolia (funds dispatcher).
* **Execution Loop:**
  1. Subscribes to `PaymentIntentCreated` on Avalanche Fuji.
  2. Inspects `priority`:
     * If `Priority.SPEED`: Executes transfer on target chain immediately ($<2\text{s}$).
     * If `Priority.COST`: Queues intent for 15s batching window.
  3. Obtains target chain transaction receipt.
  4. Calls `claimEscrow(intentId, secret)` on Avalanche Fuji.

---

## 3.4. D — Data Models & Execution Flows

### 3.4.1. Fast Settlement Flow (Lightning Route)

```text
Payer App (Fuji)        PactEscrow (Fuji)       Relayer Daemon       Merchant POS (Arb/Base)
      │                         │                     │                        │
      ├─ (1) Scans QR Code ─────┼─────────────────────┼────────────────────────┤
      ├─ (2) createIntent() ────►                     │                        │
      │      [Locks $3.50 USDC] │                     │                        │
      │                         ├─ (3) Intent Event ──►                        │
      │                         │   PaymentCreated    │                        │
      │                         │                     ├─ (4) Direct Transfer ──►
      │                         │                     │      [$3.50 USDC]      │
      │                         │                     │                        │
      │                         │                     │◄─ (5) Tx Confirmed ────┤
      │                         │                     │   [Audio: "Ting Ting"] │
      │                         │◄─ (6) claimEscrow() ┤                        │
      │                         │   [Relayer Payout]  │                        │
      │◄─ (7) Success Screen ───┴─────────────────────┴────────────────────────┘
```

### 3.4.2. Timeout & Refund Flow

```text
Payer App (Fuji)               PactEscrow (Fuji)                Relayer Daemon
      │                                │                              │
      ├─ (1) createIntent() ───────────► [Funds Locked for 15 Min]    │
      │                                │                              X (Relayer offline / drop)
      │                                │
      │ [Time Elapses: timestamp > deadline]
      │                                │
      ├─ (2) refund(intentId) ─────────►                              │
      │                                │ [Verifies: block.timestamp > deadline]
      │                                │ [Verifies: isFulfilled == false]
      │◄─ (3) 100% Principle Returned ─┤
```

---

# 4. UI/UX DESIGN PRINCIPLES & MOBILE-FIRST PWA GUIDELINES

## 4.1. The "3-Second MoMo Mental Model"
* **Zero Blockchain Jargon:** No references to Gas limits, Nonces, Gwei, or Hex addresses. Financial figures are rendered cleanly in `$ USD`.
* **Instant Multisensory Feedback:** Successful settlement triggers a tactile haptic pulse (`navigator.vibrate([40, 60, 40])`) and an iconic "Ting Ting" chime audio playback.
* **1-Tap Action Canvas:** Bottom-sheet action flows keep primary CTA buttons within natural thumb reach (bottom 35% of mobile screen).

## 4.2. Design System Tokens

```css
:root {
  /* Brand Accent: Avalanche Flame Red */
  --color-primary: #E84142;
  --color-primary-hover: #D03031;

  /* Semantic Success: MoMo Emerald */
  --color-success: #10B981;
  --color-success-bg: rgba(16, 185, 129, 0.12);

  /* Surfaces & Neutrals */
  --color-bg-base: #0F172A;       /* Slate 900 */
  --color-surface-card: #1E293B;   /* Slate 800 */
  --color-border: #334155;         /* Slate 700 */
  --color-text-main: #F8FAFC;      /* Slate 50 */
  --color-text-muted: #94A3B8;     /* Slate 400 */

  /* Typography */
  --font-family: 'Inter', -apple-system, sans-serif;
}
```

## 4.3. Screen Blueprints

### Screen 1: Payer Scanner & Route Selection View
* **Top 60%:** Active camera stream with centered rectangular scanning reticle and pulsing red corner indicators.
* **Bottom 40% (Dynamic Bottom Sheet):**
  * Merchant identification badge: *"The Coffee Shop (Arbitrum Sepolia)"*.
  * Total Payable Amount: **$3.50 USDC**.
  * **Route Selector Cards:**
    * Card A: `[Active] ⚡ Lightning Route` — *~2.0s • Fee: $0.01 (0.3%)*
    * Card B: `[Inactive] 🐢 Economy Route` — *~30s • Fee: $0.005*
  * **Primary CTA:** Full-width slide-to-confirm button: `[ Slide to Pay $3.51 ]`.

### Screen 2: Merchant POS Terminal View
* Numeric keypad for rapid order creation.
* Centerstage dynamic QR code display with auto-refresh upon expiration.
* Settlement state transition: Green full-screen flash with checkmark badge: **"Received 3.50 USDC from Avalanche"**.

---

# 5. IMPLEMENTATION ROADMAP & CLI EXECUTION PROMPTS

For execution using **Antigravity CLI** or autonomous agents:

### Phase 1: Smart Contract Deployment (Day 1)
```bash
# Antigravity Prompt:
"Implement PactEscrow.sol and MockUSDC.sol using Foundry or Hardhat.
Configure networks for Avalanche Fuji (Chain ID 43113), Arbitrum Sepolia (Chain ID 421614), and Base Sepolia (Chain ID 84532).
Ensure MockUSDC has exactly 6 decimals and a public faucet() function.
Deploy PactEscrow to Avalanche Fuji and MockUSDC to all three chains."
```

### Phase 2: Relayer Daemon Setup (Day 2)
```bash
# Antigravity Prompt:
"Create a TypeScript relayer daemon in /relayer using Viem.
Listen for PaymentIntentCreated on Avalanche Fuji.
Upon event detection with priority == SPEED, dispatch equivalent MockUSDC transfer to the receiver on the specified destination chain.
Once confirmed, call claimEscrow on Fuji using the preimage secret."
```

### Phase 3: PWA Frontend Build (Day 3)
```bash
# Antigravity Prompt:
"Build a Next.js 14 mobile-first PWA in /web using Tailwind CSS.
Implement an HTML5 QR scanner component that parses Pact QR payloads.
Implement a route selection modal offering Lightning (Speed) and Economy (Cost) modes.
Integrate ZeroDev or Thirdweb SDK for Passkey / ERC-4337 smart account creation."
```

---
*Authored for the UniHack 2026 Developer Team & Mentorship Cohort.*
