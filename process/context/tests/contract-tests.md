---
name: context:contract-tests
description: Pact domain, canonicalization, Solidity policy, invariant, and local deployment verification.
keywords: contracts, solidity, forge, foundry, vitest, domain, schema, hash, policy, invariant
related: [context:all-tests]
date: 09-09-26
---

# Contract and Domain Tests

## Scope

This document covers deterministic shared-domain tests and the on-chain
authority tests for Pact. It does not cover Supabase runtime behavior, browser
rendering, or live testnet mutation.

## Source Surface

The planned source/test paths are:

- `packages/domain/src/` and `packages/domain/test/` for schemas, canonical
  serialization, hashes, asset/merchant conversion, errors, network config,
  and preflight fixtures;
- `contracts/src/` and `contracts/test/` for `PactCardController`,
  `PactCreditPool`, `MerchantSimulator`, shared types/errors, policy checks,
  atomicity, replay protection, and invariants;
- `contracts/script/DeployPaymentSystem.s.sol` for local deployment/readback.

None of the contract sources existed at the `vc-setup` scan. The
`packages/domain` side (schemas, canonical serialization, hashes,
asset/merchant conversion, errors, network config, preflight fixtures) is
implemented and green, as is the `contracts/` side (`PactCardController`,
`PactCreditPool`, `MerchantSimulator`, policy/atomicity/invariant suites, local
deployment script with SDK export) — 64 Forge tests green on solc 0.8.30,
`evm_version` shanghai.

## Commands

    corepack yarn vitest run packages/domain/test
    forge fmt --check
    forge test --root contracts -vvv
    forge test --root contracts --match-path test/PactPaymentInvariant.t.sol -vvv

For local wiring, the Phase 02 plan uses Anvil plus the deployment script,
artifact export, and `corepack yarn typecheck`. Run this only after the focused tests
are green and local toolchains are installed.

## Required Assertions

- Schema parsing is strict and rejects unknown model fields.
- Canonical field order includes `policyVersion`; equal inputs hash equally and
  materially different versions hash differently.
- `native-testnet-ctc` maps to the configured native asset and contract
  `address(0)` representation.
- Merchant IDs have one deterministic `bytes32` conversion.
- Controller lifecycle, owner-only transitions, agent-only payment path,
  allowlist, asset, cap, effective credit, expiry, deadline, balance, and nonce
  checks agree with the off-chain reason matrix.
- Reverting merchant calls roll back accounting atomically.
- A used nonce cannot settle twice and payment accounting never exceeds the
  effective limit.

## Update Triggers

Refresh this file when the domain schema, hash version, contract public
interface, compiler/toolchain, policy reason code, or focused command changes.
