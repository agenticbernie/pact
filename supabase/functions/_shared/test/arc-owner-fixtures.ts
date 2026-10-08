/**
 * Legacy Arc owner-authorization fixtures — REGRESSION/MIGRATION SCOPE ONLY.
 *
 * These static, intent-id-pinned registries reproduce the on-chain creation
 * facts of card 1 (and the card-2 lane evidence) for regression and migration
 * tests. They must never be wired into a production composition root:
 * production derives owner authorization dynamically from the seeded card
 * rows via `createCardBackedOwnerRegistry` (`_shared/owner-authorization.ts`).
 * Each entry reproduces a card's on-chain record, including the opaque raw
 * allowlist bytes32; on-chain `preflightPay` remains the authority for
 * merchant membership.
 */
import type { OwnerAuthorization, OwnerAuthorizationRegistry } from "../owner-authorization.ts";

export function staticRegistry(entries: OwnerAuthorization[]): OwnerAuthorizationRegistry {
  return {
    findAuthorization: async (input) =>
      entries.find(
        (entry) =>
          entry.intentId === input.intentId &&
          entry.agentId.toLowerCase() === input.agentId.toLowerCase() &&
          entry.chainId === input.chainId,
      ) ?? null,
  };
}

export const ARC_CARD1_AUTHORIZATION: OwnerAuthorization = {
  intentId: "intent-req-1",
  ownerAddress: "0xb8bdcc633cd8e67250358d807918f99dc0c14d52",
  agentId: "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682",
  cardId: "1",
  chainId: 5042002,
  asset: "arc-testnet-usdc",
  controller: "0x7a474c005433def5fc496d2016f6ae794edfc423",
  issuedBy: "0xb8bdcc633cd8e67250358d807918f99dc0c14d52",
  policyVersion: 1,
  allowlistHash: "0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70",
  sourceBlock: 62948913,
  sourceTxHash: "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb",
  expiresAtMs: Date.parse("2027-09-19T00:00:00.000Z"),
};

export const ARC_CARD2_AUTHORIZATION: OwnerAuthorization = {
  intentId: "intent-req-card2-pay-1",
  ownerAddress: "0x83bc1007076f6681a90d7d60ad62cb53a120f833",
  agentId: "0xc289b3c8f161006a180fd892348d8895ebf91214",
  cardId: "2",
  chainId: 5042002,
  asset: "arc-testnet-usdc",
  controller: "0x7a474c005433def5fc496d2016f6ae794edfc423",
  issuedBy: "0x83bc1007076f6681a90d7d60ad62cb53a120f833",
  policyVersion: 1,
  allowlistHash: "0x14b0d999dc378b1bfd77fdaae9eb812308012cfcc5d585656e4ad328e0c78916",
  sourceBlock: 66167189,
  sourceTxHash: "0x8374dcbc5ee2365ee3769c035c3e1a9118aa4b29164fa207c1d14266c22655b0",
  expiresAtMs: 1794070428000,
};

export function createArcCard1OwnerRegistry(): OwnerAuthorizationRegistry {
  return staticRegistry([ARC_CARD1_AUTHORIZATION]);
}

/** Card-1 plus the card-2 lane authorization (second demo card). */
export function createArcLaneOwnerRegistry(): OwnerAuthorizationRegistry {
  return staticRegistry([ARC_CARD1_AUTHORIZATION, ARC_CARD2_AUTHORIZATION]);
}
