# Phase 5 — ZeroDev Account Abstraction (ERC-4337 Kernel v3.1)

## 1. Overview & Compliance with `docs/pact_docs.md`

Phase 5 implements 100% live on-chain **ERC-4337 Account Abstraction** using **ZeroDev (`@zerodev/sdk`, `@zerodev/passkey-validator`, `@zerodev/permissions`, Kernel v3.1)** on **Avalanche Fuji (`43113`)**:

- **FR-01 (Passkey Account Onboarding):** Generates an ERC-4337 Smart Contract Account (`KERNEL_V3_1`, EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`) using WebAuthn P-256 Passkey authentication (`toPasskeyValidator` with `PasskeyValidatorContractVersion.V0_0_3_PATCHED` at `0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69`). Zero seed phrases required.
- **FR-02 (Scoped Session Keys):** Delegates a scoped ECDSA Session Key (`toPermissionValidator`, `toECDSASigner`) governed by ZeroDev's on-chain `CallPolicy V0_0_4` (`0x9a52283276A0ec8740DF50bF01B28A80D880eaf2`) and `TimestampPolicy` (`0xB9f8f524bE6EcD8C945b1b87f9ae5C192FdCE20F`):
  - Strictly scoped to `PactEscrow.createIntent()` with an upper spending limit of **$50.00 / 24h** (`50_000_000` atomic units), `MockUSDC.approve(PactEscrow, <= $50.05)`, `MockUSDC.faucet()`, and `PactEscrow.refund()`.
  - Eliminates repeated biometric/wallet confirmation dialogs during 1-Tap payments (`0` popups after onboarding).
- **FR-03 (Paymaster Gas Sponsorship):** Sponsors gas on Avalanche Fuji via `createZeroDevPaymasterClient` and our Relayer's ERC-4337 v0.7 Bundler & Gas Sponsorship engine (`/api/v1/bundler`, `/api/v1/paymaster`), funding the Smart Account's `EntryPoint v0.7` deposit via `depositTo(sender)` so users transact with **0 native AVAX**.
- **§1.4 (1-Click Testnet Faucet):** Provides a client UI button (`+500 USDC Faucet`) in `PayerClient.tsx` that executes `MockUSDC.faucet()` via a gasless UserOperation, deploying the user's Kernel v3.1 Smart Account on-chain and minting `500.00 MockUSDC`.

---

## 2. Canonical On-Chain ZeroDev Contracts (Avalanche Fuji `43113`)

| Contract | Address |
| :--- | :--- |
| **ERC-4337 EntryPoint v0.7** | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| **ZeroDev Kernel v3.1 Factory** | `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` |
| **ZeroDev Kernel v3 MetaFactory** | `0xd703aaE79538628d27099B8c4f621bE4CCd142d5` |
| **PasskeyValidator (v0.0.3 Patched)** | `0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69` |
| **ECDSA Signer Module** | `0x6A6F069E2a08c2468e7724Ab3250CdBFBA14D4FF` |
| **CallPolicy Module (v0.0.4)** | `0x9a52283276A0ec8740DF50bF01B28A80D880eaf2` |
| **TimestampPolicy Module** | `0xB9f8f524bE6EcD8C945b1b87f9ae5C192FdCE20F` |

---

## 3. Architecture & Key Files

1. **Frontend ZeroDev Kernel v3 SDK Engine (`web/src/lib/zerodev.ts`):**
   - `onboardPasskeySmartAccount()`: Creates a Passkey Validator (`sudo` plugin) and Scoped Session Key Permission Validator (`regular` plugin) with `$50.00/24h` `CallPolicyVersion.V0_0_4` + `TimestampPolicy`.
   - `claimGaslessFaucet()`: Encodes and sends a gasless UserOperation calling `MockUSDC.faucet()` on Avalanche Fuji.
   - `executeGaslessPaymentIntent()`: Encodes and sends a batched gasless UserOperation (`[MockUSDC.approve, PactEscrow.createIntent]`) signed by the Scoped Session Key with zero confirmation dialogs.
   - `executeGaslessRefund()`: Encodes and sends a gasless UserOperation calling `PactEscrow.refund(intentId)`.
2. **Payer PWA Integration (`web/src/components/PayerClient.tsx`):**
   - Displays the **ZeroDev Kernel v3 Smart Account Bar** with Passkey Sign-In, Smart Account address, live `MockUSDC` balance, Session Key badge (`$50/24h`), Paymaster badge (`0 Gas`), and the **1-Click `+500 USDC Faucet` button**.
   - Sliding to pay on `RouteSelectorModal.tsx` submits a real gasless UserOperation on Avalanche Fuji and polls `/api/v1/orders/:orderId` until cross-chain settlement completes.
3. **Relayer ERC-4337 Bundler, Paymaster & Passkey Endpoints (`relayer/src/services/bundler.ts`, `relayer/src/server/api.ts`, `relayer/src/db/store.ts`):**
   - `POST /api/v1/bundler` & `POST /api/v1/paymaster`: Full ERC-4337 v0.7 JSON-RPC handler (`eth_sendUserOperation`, `eth_estimateUserOperationGas`, `eth_getUserOperationReceipt`, `zd_sponsorUserOperation`, `zd_getUserOperationGasPrice`) that sponsors `EntryPoint.depositTo(sender)` and executes `EntryPoint.handleOps` on Avalanche Fuji using `withChainLock` nonce synchronization.
   - `POST /api/v1/passkeys/{register,login}/{options,verify}`: WebAuthn credential registration and lookup persisted in SQLite (`passkeys` table).

---

## 4. Live On-Chain Verification Proof (`npm --workspace=relayer run verify:p5`)

Verified end-to-end on **Avalanche Fuji (`43113`)** and **Arbitrum Sepolia (`421614`)**:
- **Smart Account Deployed (Kernel v3.1):** `0xCB6DBC60e95973Eb04adED0f4f191ac1FE2243b6` (`0 AVAX` native balance)
- **Scoped Session Key:** `0x9bb1A6e7aAB908F1B9c18b7C7b8a06d75e1f7969` (`$50.00 / 24h` limit on `PactEscrow.createIntent`)
- **§1.4 1-Click Faucet UserOperation (`+500.00 USDC`):**
  - UserOp Hash: `0xbc9e207592187b8002f131a777e4e25d2c4626b4f12d391521b06fa13c0c0dde`
  - Avalanche Fuji Tx: `0x54be1be51f4605f480f6ed7070df67b7dc2797452a609541f470b320c390fa69`
- **FR-02 & FR-06 Gasless Session Key Payment (`$3.50 USDC` `[approve, createIntent]`):**
  - UserOp Hash: `0xe55543f25987ca250f9123cf7bd21866514532338346e71a6bd910304281a59e`
  - Avalanche Fuji Escrow Tx: `0x078f5f73b37469f33a09940b27c00d7592f44c3e67b2ef99fee4761848ae99e1`
  - Arbitrum Sepolia Merchant Fill Tx: `0xa8a6dbd0faea33f2291f063dd1bcaff2ae1b9cc9e91389cde759fb9d5f57d620`
  - Avalanche Fuji Claim Escrow Tx: `0xf8a769bf17fd7b5810fef4653ff9c52294a73605ea038a5cabcd517317a580fc`
- **FR-02 On-Chain Policy Enforcement (`$55.00 > $50.00` limit):**
  - Submitting a `$55.00` `createIntent` call signed by the Session Key was rejected on-chain by `EntryPoint v0.7` / `CallPolicy V0_0_4` with `FailedOpWithRevert(0, "AA23 reverted", 0x59d52e40)`.
