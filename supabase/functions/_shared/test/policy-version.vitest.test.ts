import { describe, expect, it, vi } from "vitest";
import { Interface } from "ethers";
import { PACT_CARDS_ABI, createChainPolicyVersionReader } from "../policy-version.ts";

const CONTROLLER = "0x00000000000000000000000000000000000000c0";

function encodeCards(policyVersion: number): string {
  const iface = new Interface(PACT_CARDS_ABI);
  return iface.encodeFunctionResult("cards", [
    "0x1111111111111111111111111111111111111111", // owner
    "0x2222222222222222222222222222222222222222", // agent
    "0x3333333333333333333333333333333333333333", // asset
    10n ** 18n, // ownerConfiguredCap
    5n * 10n ** 17n, // verifiedCredit
    1_800_000_000n, // verifiedCreditExpiry
    0n, // spent
    10n ** 17n, // perTransactionLimit
    1_900_000_000n, // expiresAt
    1n, // status (ACTIVE)
    BigInt(policyVersion), // policyVersion
  ]);
}

describe("createChainPolicyVersionReader", () => {
  it("decodes the controller's authoritative policyVersion", async () => {
    const call = vi.fn((_to: string, _data: string) => Promise.resolve(encodeCards(7)));
    const read = createChainPolicyVersionReader({
      rpcUrl: "http://rpc.invalid",
      chainId: 5042002,
      controllerAddress: CONTROLLER,
      call,
    });
    await expect(read("3")).resolves.toBe(7);
    // The read is a single eth_call to the controller, addressed by card id.
    expect(call).toHaveBeenCalledTimes(1);
    const [to, data] = call.mock.calls[0] as [string, string];
    expect(to).toBe(CONTROLLER);
    expect(new Interface(PACT_CARDS_ABI).parseTransaction({ data })?.name).toBe("cards");
  });

  it("resolves null (never zero) when the chain read fails", async () => {
    const read = createChainPolicyVersionReader({
      rpcUrl: "http://rpc.invalid",
      chainId: 5042002,
      controllerAddress: CONTROLLER,
      call: () => Promise.reject(new Error("rpc down")),
    });
    await expect(read("3")).resolves.toBeNull();
  });

  it("resolves null for an unencodable card id", async () => {
    const call = vi.fn(() => Promise.resolve(encodeCards(1)));
    const read = createChainPolicyVersionReader({
      rpcUrl: "http://rpc.invalid",
      chainId: 5042002,
      controllerAddress: CONTROLLER,
      call,
    });
    await expect(read("not-a-card")).resolves.toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses to build without a controller address", () => {
    expect(() =>
      createChainPolicyVersionReader({
        rpcUrl: "http://rpc.invalid",
        chainId: 5042002,
        controllerAddress: "   ",
        call: () => Promise.resolve("0x"),
      }),
    ).toThrow(/controller address/i);
  });
});
