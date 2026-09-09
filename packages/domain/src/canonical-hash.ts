import { AbiCoder, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { DomainError } from "./errors.js";
import type { CanonicalIntentInput } from "./types.js";

/**
 * Canonical intent hashing (Phase 01 contract, consumed by Phase 02 Solidity).
 *
 * Fixed ABI tuple — field order and types are part of the contract:
 *   ["uint256", "address", "bytes32", "uint256", "address", "string", "uint64", "uint32"]
 *    cardId     agent    merchant    amount     asset     purpose  expiry     policyVersion
 *
 * Normalization before encoding: decimal strings to bigint, agent address to
 * checksum form, merchant ID lowercased then keccak256 to bytes32, logical
 * asset resolved through the native descriptor, timestamps floored to unix
 * seconds. Only cardId, agentId, merchantId, amountBaseUnits, asset, purpose,
 * expiresAt, and policyVersion participate in the hash.
 */
export const CANONICAL_HASH_ABI_TYPES = [
  "uint256",
  "address",
  "bytes32",
  "uint256",
  "address",
  "string",
  "uint64",
  "uint32",
] as const;

/** EVM representation of the logical `native-testnet-ctc` asset. */
export const NATIVE_ASSET_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * Merchant ID conversion rule: trim, lowercase, keccak256 over UTF-8 bytes.
 * Deterministic for every kebab-case merchant ID; distinct IDs map to
 * distinct bytes32 values for all practical purposes.
 */
export function merchantIdToBytes32(merchantId: string): string {
  return keccak256(toUtf8Bytes(merchantId.trim().toLowerCase()));
}

function toExpirySeconds(expiresAt: string): bigint {
  const millis = Date.parse(expiresAt);
  if (!Number.isFinite(millis)) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Invalid expiresAt timestamp.", {
      field: "expiresAt",
    });
  }
  return BigInt(Math.floor(millis / 1000));
}

export function canonicalIntentHash(input: CanonicalIntentInput): string {
  if (input.asset !== "native-testnet-ctc") {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Unknown logical asset for hashing.", {
      field: "asset",
    });
  }
  if (!Number.isSafeInteger(input.policyVersion) || input.policyVersion < 0) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Invalid policyVersion for hashing.", {
      field: "policyVersion",
    });
  }
  const encoded = abiCoder.encode(
    [...CANONICAL_HASH_ABI_TYPES],
    [
      BigInt(input.cardId),
      getAddress(input.agentId),
      merchantIdToBytes32(input.merchantId),
      BigInt(input.amountBaseUnits),
      NATIVE_ASSET_EVM_ADDRESS,
      input.purpose,
      toExpirySeconds(input.expiresAt),
      input.policyVersion,
    ],
  );
  return keccak256(encoded);
}
