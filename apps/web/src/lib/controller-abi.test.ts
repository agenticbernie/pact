/**
 * Guard against ABI drift: every fragment the console calls must derive the
 * identical selector (or event topic) as the generated SDK ABI it was
 * transcribed from. A signature typo here would otherwise only surface as an
 * unexplained revert on chain.
 */
import { Interface, type InterfaceAbi } from "ethers";
import { describe, expect, it } from "vitest";
import { PACT_ABI } from "../../../../packages/pact-sdk/src/abi.ts";
import { CARD_CONTROLLER_ABI, CREDIT_POOL_ABI, MERCHANT_SIMULATOR_ABI } from "./controller-abi";

/** signature → selector (functions) or topic hash (events). */
function index(entries: readonly unknown[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const iface = new Interface([entry] as InterfaceAbi);
    for (const fragment of iface.fragments) {
      if (fragment.type === "function") {
        map.set(fragment.format("sighash"), fragment.selector);
      } else if (fragment.type === "event") {
        map.set(fragment.format("sighash"), fragment.topicHash);
      } else {
        continue;
      }
    }
  }
  return map;
}

function expectParity(group: string, fragments: readonly string[], sdk: readonly unknown[]): void {
  const reference = index(sdk);
  for (const fragment of fragments) {
    const iface = new Interface([fragment] as InterfaceAbi);
    const parsed = iface.fragments[0];
    if (parsed === undefined) throw new Error(`Unparsable fragment: ${fragment}`);
    const signature = parsed.format("sighash");
    const derived =
      parsed.type === "event"
        ? parsed.topicHash
        : parsed.type === "function"
          ? parsed.selector
          : undefined;
    if (derived === undefined) throw new Error(`Unexpected fragment kind: ${fragment}`);
    expect(reference.get(signature), `${group}: ${signature} is absent from the SDK ABI`).toBe(derived);
  }
}

describe("console ABI fragments match the SDK ABI", () => {
  it("controller fragments", () => {
    expectParity("controller", CARD_CONTROLLER_ABI, PACT_ABI.controller);
  });

  it("credit pool fragments", () => {
    expectParity("pool", CREDIT_POOL_ABI, PACT_ABI.pool);
  });

  it("merchant simulator fragments", () => {
    expectParity("merchantSimulator", MERCHANT_SIMULATOR_ABI, PACT_ABI.merchantSimulator);
  });

  it("covers the payment entry point the agent lane uses", () => {
    expect(CARD_CONTROLLER_ABI.some((fragment) => fragment.startsWith("function pay("))).toBe(true);
  });
});
