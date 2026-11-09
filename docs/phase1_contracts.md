# PHASE 1 — SMART CONTRACTS

Implements `docs/pact_docs.md` §3.2 and `docs/phase0_spec_lock.md` §2–3.

## Contracts
- `contracts/src/interfaces/IPactEscrow.sol` — verbatim from §3.2.1.
- `contracts/src/MockUSDC.sol` — verbatim from §3.2.2 (6 decimals, 1M initial mint, `faucet()` = 500 USDC).
- `contracts/src/PactEscrow.sol` — escrow, with `calculateFee`, `getIntent`, `isRefunded` views.

## Behaviour beyond the interface (all consistent with the docs)
| Decision | Reason |
|---|---|
| Locks `amountIn + feePaid`; fee computed on-chain via `calculateFee` | Spec lock §2.2 |
| `claimEscrow` valid only while `block.timestamp <= deadline`; `refund` only when `> deadline` | Mutually exclusive, so the FR-10 refund guarantee cannot be raced |
| `refund` callable only by the original `sender` | FR-10 |
| Refund tracked in a separate `_refunded` map, `isFulfilled` stays `false` | A refund is never reported as a settlement |
| `targetChainId` limited to 421614 / 84532 | FR-05 |
| `deadline` must be in `(now, now + 900s + 120s skew]` | §1.4 (15 min) with client clock tolerance |
| `hashLock` single-use | Stops one revealed secret from claiming a second intent |
| `ReentrancyGuard`, `SafeERC20`, checks-effects-interactions, balance-delta check on token pull | Fund safety |

## Security notes for later phases
1. **The relayer MUST generate the secret** (spec lock §3). If a payer knows the preimage, they can claim the escrow back themselves after the relayer has paid the merchant on the destination chain.
2. **Claim front-running:** `claimEscrow` reveals `secret` in calldata and pays `msg.sender`. A mempool observer could copy the call. This is low risk on a testnet, but a relayer allowlist or binding the claimer into the hashlock would fix it. Not in the doc interface, so not implemented.
3. **Trust model:** the contract does not verify the destination-chain transfer. The relayer is trusted to claim only after dispatch.
4. **Native AVAX:** supported per FR-06. The fee formula is in 6-decimal USDC units, so for 18-decimal AVAX it is effectively negligible. The MVP flow uses USDC.

## Verify
```bash
npm run contracts:test        # 29 tests incl. fuzz
cd contracts && cp ../.env ./.env   # or export PRIVATE_KEY
forge script script/DeployFuji.s.sol --rpc-url avalanche_fuji --broadcast
forge script script/DeployDestination.s.sol --rpc-url arbitrum_sepolia --broadcast
forge script script/DeployDestination.s.sol --rpc-url base_sepolia --broadcast
node ../scripts/update-deployments.mjs   # writes shared/deployments.json
```
Then copy the addresses into `.env` (`PACT_ESCROW_FUJI`, `MOCK_USDC_*`).
