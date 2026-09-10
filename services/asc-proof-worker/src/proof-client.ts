import { z } from "zod";
import type { AscProofPayload, ExecuteArgs } from "./types.js";

const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const hexSchema = z.string().regex(/^0x([0-9a-fA-F]*)$/);

const SiblingSchema = z
  .object({ hash: bytes32Schema, isLeft: z.boolean() })
  .strict();

const PayloadSchema = z
  .object({
    chainKey: z.number().int().min(0),
    blockHeight: z.number().int().min(0),
    encodedTransaction: hexSchema,
    merkleRoot: bytes32Schema,
    siblings: z.array(SiblingSchema),
    lowerEndpointDigest: bytes32Schema,
    continuityRoots: z.array(bytes32Schema),
  })
  .strict();

/** Strict payload parse. Unknown/transposed keys are rejected, never coerced. */
export function parseProofPayload(input: unknown): AscProofPayload {
  const result = PayloadSchema.safeParse(input);
  if (!result.success) {
    throw new Error("invalid proof payload shape");
  }
  return result.data;
}

export type ContinuityResponseLike = {
  chainKey: number;
  headerNumber: number;
  txBytes: string;
  merkleProof: { root: string; siblings: Array<{ hash: string; isLeft: boolean }> };
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
};

/**
 * 1:1 mapping from a proof-builder `ContinuityResponse` to positional
 * `execute()` args. Field order and sibling shape are part of the contract:
 * `{hash, isLeft}` — never `{hash, left}`.
 */
export function mapContinuityResponse(action: number, response: ContinuityResponseLike): ExecuteArgs {
  const payload = parseProofPayload({
    chainKey: response.chainKey,
    blockHeight: response.headerNumber,
    encodedTransaction: response.txBytes,
    merkleRoot: response.merkleProof.root,
    siblings: response.merkleProof.siblings,
    lowerEndpointDigest: response.continuityProof.lowerEndpointDigest,
    continuityRoots: response.continuityProof.roots,
  });
  return [
    action,
    payload.chainKey,
    payload.blockHeight,
    payload.encodedTransaction,
    payload.merkleRoot,
    payload.siblings,
    payload.lowerEndpointDigest,
    payload.continuityRoots,
  ];
}

/** Gas estimate plus buffer, with a size-based fallback when estimation fails. */
export async function resolveGasLimit(
  estimate: () => Promise<bigint>,
  continuityLength: number,
): Promise<bigint> {
  try {
    const estimated = await estimate();
    return (estimated * BigInt(135)) / BigInt(100);
  } catch {
    return BigInt(21000 + continuityLength * 5000 + 20000);
  }
}
