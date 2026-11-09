# PHASE 0 — SPECIFICATION LOCK & ARCHITECTURAL DECISIONS
**Reference:** [`docs/pact_docs.md`](./pact_docs.md) (v2.0.0)

This document resolves all protocol edge cases and locks the exact interfaces, math, and data flows across `/contracts`, `/relayer`, and `/web` in strict compliance with `docs/pact_docs.md`.

---

## 1. Network Topology & Multi-RPC Configuration (NFR-03, NFR-04)

| Role | Network Name | Chain ID | Primary RPC | Fallback RPC |
|---|---|---|---|---|
| **Source Escrow Layer** | Avalanche Fuji C-Chain | `43113` | `https://api.avax-test.network/ext/bc/C/rpc` | `https://avalanche-fuji-c-chain-rpc.publicnode.com` |
| **Destination Layer A** | Arbitrum Sepolia | `421614` | `https://sepolia-rollup.arbitrum.io/rpc` | `https://arbitrum-sepolia-rpc.publicnode.com` |
| **Destination Layer B** | Base Sepolia | `84532` | `https://sepolia.base.org` | `https://base-sepolia-rpc.publicnode.com` |

---

## 2. Smart Contract Specification Lock (`/contracts`)

### 2.1. Interface Alignment (`IPactEscrow.sol`)
`IPactEscrow.sol` is implemented verbatim from `docs/pact_docs.md` §3.2.1 (`pragma solidity ^0.8.20;`).

### 2.2. Fee Model & Escrow Deposit Accounting (§1.3, FR-06, FR-09, FR-10)
All USDC amounts use **6 decimals** (`1 USDC = 1_000_000` units, `$15.00 = 15_000_000` units).
- **`amountIn`**: The exact invoice principal requested by the Merchant (e.g., `$3.50 USDC = 3_500_000`). The Merchant receives `amountIn` (`3_500_000`) on the destination chain (`targetChainId`).
- **`feePaid`**: Calculated deterministically on-chain by `PactEscrow.calculateFee(amountIn, priority)`:
  1. **`Priority.SPEED` (Lightning Route)**:
     - If `amountIn >= 15_000_000` ($\ge \$15.00$): Flat fee of **`50_000`** ($0.05 USD).
     - If `amountIn < 15_000_000` ($< \$15.00$): Dynamic rate of **0.30%** (`(amountIn * 30) / 10_000`).
       - Example: For `$3.50` (`3_500_000`), `feePaid = 10_500` (`$0.0105`, displayed as `$0.01` in 2-decimal UI, total `$3.51`).
  2. **`Priority.COST` (Economy Route)**:
     - Flat fee of **`5_000`** ($0.005 USD) regardless of transaction size.
- **Total Locked in Escrow (`totalDeposit = amountIn + feePaid`)**:
  - **ERC-20 (`tokenIn != address(0)`)**: `PactEscrow.createIntent()` pulls `amountIn + feePaid` from `msg.sender` via `IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn + feePaid)`.
  - **Native AVAX (`tokenIn == address(0)`)**: Requires `msg.value == amountIn + feePaid` (FR-06).
- **Claim Payout (`claimEscrow(intentId, secret)`)**:
  - Verifies `!intent.isFulfilled`, `keccak256(abi.encodePacked(secret)) == intent.hashLock`.
  - Sets `intent.isFulfilled = true` and transfers `amountIn + feePaid` to `msg.sender` (the Relayer), emitting `PaymentSettled(intentId, msg.sender, secret)` (FR-09).
- **Timeout & Refund (`refund(intentId)`)**:
  - Deterministic expiration default: $T_{\text{deadline}} = \text{block.timestamp} + 900\text{ seconds}$ (15 minutes, §1.4).
  - Verifies `block.timestamp > intent.deadline` and `!intent.isFulfilled`.
  - Marks intent closed/fulfilled to prevent reentrancy or double-refund, returns 100% of deposited funds (`amountIn + feePaid`) to `intent.sender`, and emits `PaymentRefunded(intentId, intent.sender)` (FR-10).

### 2.3. Deterministic `intentId` Generation (FR-06)
```solidity
bytes32 intentId = keccak256(
    abi.encodePacked(
        msg.sender,
        tokenIn,
        amountIn,
        targetChainId,
        receiver,
        tokenOut,
        priority,
        hashLock,
        deadline,
        block.chainid,
        intentNonce++
    )
);
```

---

## 3. HTLC Preimage (`secret` / `hashLock`) Lifecycle (§3.2, §3.4.1)

To satisfy `IPactEscrow.claimEscrow(bytes32 intentId, string calldata secret)` where `keccak256(abi.encodePacked(secret)) == hashLock`:
1. **Quote Generation (`POST /api/v1/quote` or `GET /api/v1/quote`)**:
   - Upon scanning the Merchant QR code, the Payer client requests a quote from the Relayer (`/api/v1/quote`) in `<300ms` (NFR-01).
   - The Relayer generates a random cryptographic preimage `secret` (32-byte hex string) and computes `hashLock = keccak256(toBytes(secret))`.
   - The Relayer persists `(hashLock, secret, orderId, expiresAt)` in its SQLite store and returns `{ hashLock, fee, totalAmount, deadline, routes }` to the client.
2. **Direct / Offline Fallback Secret**:
   - For standalone CLI scripts or offline testing where `/api/v1/quote` is bypassed, the Relayer also checks a deterministic test preimage (`"pact-demo-secret"` $\rightarrow$ `keccak256("pact-demo-secret")`) so automated Foundry/CLI scripts can trigger end-to-end claims without prior HTTP calls.

---

## 4. Relayer State Machine & API Specification (`/relayer`)

### 4.1. Persistent SQLite Lifecycle (§3, NFR-03)
`PaymentIntent` record transitions stored in `pact_relayer.db`:
- `CREATED`: Indexed from `PaymentIntentCreated` event on Avalanche Fuji.
- `DISPATCHED`: Destination ERC-20 `MockUSDC.transfer(receiver, amountIn)` broadcasted on Arbitrum Sepolia (`421614`) or Base Sepolia (`84532`), with `destTxHash` recorded before waiting for receipt (idempotent crash recovery).
- `SETTLED`: Destination transfer receipt confirmed on target chain.
- `CLAIMED`: `PactEscrow.claimEscrow(intentId, secret)` confirmed on Avalanche Fuji with `claimTxHash` recorded.
- `REFUNDED`: Indexed from `PaymentRefunded` event or expired past `deadline`.

### 4.2. HTTP / WS Endpoints (§3)
- `GET /api/v1/health`: Returns Relayer status, RPC health for all 3 chains, signer balances, and pending queue metrics.
- `POST /api/v1/quote` (and `GET /api/v1/quote`): Returns instant quote (`<300ms`) for both `SPEED` (Lightning) and `COST` (Economy) routes, plus `hashLock` and `deadline`.
- `GET /api/v1/intents/:intentId` & `GET /api/v1/orders/:orderId`: Allows Payer and Merchant POS screens to poll or subscribe to real-time settlement status.

---

## 5. Account Abstraction & Security Constraints (§2.1, §3.1.2)

- **Strictly ERC-4337 Modular Smart Accounts (ZeroDev Kernel v3 / WebAuthn Passkeys)**:
  - No raw seed phrases (FR-01).
  - No EIP-7702 EOA code delegation (NFR-02, §3.1.2).
  - **Scoped Session Keys (FR-02)**: Ephemeral session key restricted exclusively to `PactEscrow.createIntent()` with a `$50.00 / 24h` (`50_000_000` units) spending limit.
  - **Paymaster Gas Sponsorship (FR-03)**: Sponsors UserOperations on Avalanche Fuji (`43113`).
