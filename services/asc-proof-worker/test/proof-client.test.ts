import { describe, expect, it } from "vitest";
import {
  mapContinuityResponse,
  parseProofPayload,
  resolveGasLimit,
} from "../src/proof-client.js";

const H = (ch: string) => `0x${ch.repeat(64)}`;

const RESPONSE = {
  chainKey: 1,
  headerNumber: 3193,
  txIndex: 4,
  txHash: H("a"),
  txBytes: "0xdeadbeef",
  continuityProof: { lowerEndpointDigest: H("1"), roots: [H("2"), H("3")] },
  merkleProof: {
    root: H("4"),
    siblings: [
      { hash: H("5"), isLeft: true },
      { hash: H("6"), isLeft: false },
    ],
  },
};

describe("proof-client mapping", () => {
  it("maps 1:1 to execute args preserving isLeft order", () => {
    const args = mapContinuityResponse(0, RESPONSE);
    expect(args).toEqual([
      0,
      1,
      3193,
      "0xdeadbeef",
      H("4"),
      [
        { hash: H("5"), isLeft: true },
        { hash: H("6"), isLeft: false },
      ],
      H("1"),
      [H("2"), H("3")],
    ]);
  });

  it("rejects transposed sibling fields at parse time", () => {
    const bad = {
      chainKey: 1,
      blockHeight: 3193,
      encodedTransaction: "0xdeadbeef",
      merkleRoot: "0x4444",
      siblings: [{ hash: "0x5555", left: true }],
      lowerEndpointDigest: "0x1111",
      continuityRoots: [],
    };
    expect(() => parseProofPayload(bad)).toThrow();
  });

  it("parses a valid payload", () => {
    const payload = {
      chainKey: 1,
      blockHeight: 3193,
      encodedTransaction: "0xdeadbeef",
      merkleRoot: H("4"),
      siblings: [{ hash: H("5"), isLeft: true }],
      lowerEndpointDigest: H("1"),
      continuityRoots: [],
    };
    expect(parseProofPayload(payload).siblings).toEqual([{ hash: H("5"), isLeft: true }]);
  });

  it("falls back to size-based gas when estimation fails", async () => {
    const estimate = () => Promise.reject(new Error("eth_estimateGas unavailable"));
    const gas = await resolveGasLimit(estimate, 3);
    expect(gas).toBe(BigInt(21000 + 3 * 5000 + 20000));
  });

  it("adds 35 percent buffer on successful estimation", async () => {
    const estimate = () => Promise.resolve(BigInt(100000));
    const gas = await resolveGasLimit(estimate, 3);
    expect(gas).toBe(BigInt(135000));
  });
});
