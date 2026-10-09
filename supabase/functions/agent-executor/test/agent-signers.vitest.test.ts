import { describe, expect, it } from "vitest";
import { computeAddress } from "ethers";
import { createAgentSignerRegistry, parseAgentSignerBindings } from "../agent-signers.ts";
import type { PaymentClient } from "../chain-client.ts";
import type { AgentSignerPaymentClient } from "../agent-signer.ts";

const KEY_A = "0x" + "11".repeat(32);
const KEY_B = "0x" + "22".repeat(32);
const AGENT_A = computeAddress(KEY_A).toLowerCase();
const AGENT_B = computeAddress(KEY_B).toLowerCase();
const UNBOUND = "0x9999999999999999999999999999999999999999";

const CLIENT = {} as PaymentClient;

function signer(agent: string): AgentSignerPaymentClient {
  return { client: CLIENT, signerAddress: agent, signerChainId: 5042002 };
}

function registry(createClient: (binding: { agent: string; privateKey: string }) => Promise<AgentSignerPaymentClient>) {
  return createAgentSignerRegistry({
    bindings: parseAgentSignerBindings({ json: JSON.stringify({ [AGENT_A]: KEY_A, [AGENT_B]: KEY_B }) }),
    createClient,
  });
}

describe("agent signer bindings (parse)", () => {
  it("binds a legacy single key to the address derived from it", () => {
    const bindings = parseAgentSignerBindings({ legacyPrivateKey: KEY_A });
    expect(bindings).toEqual([{ agent: AGENT_A, privateKey: KEY_A }]);
  });

  it("binds JSON entries whose declared agent is the key's own address", () => {
    const bindings = parseAgentSignerBindings({ json: JSON.stringify({ [AGENT_A]: KEY_A }) });
    expect(bindings.map((binding) => binding.agent)).toEqual([AGENT_A]);
  });

  it("discards a declared agent the key does not control", () => {
    // Key B declared as agent A: a mismatch must never become a binding.
    const bindings = parseAgentSignerBindings({ json: JSON.stringify({ [AGENT_A]: KEY_B }) });
    expect(bindings).toEqual([]);
  });

  it("discards malformed keys, malformed JSON and non-address entries", () => {
    expect(
      parseAgentSignerBindings({
        json: JSON.stringify({ [AGENT_A]: "not-a-key", "coffee-demo": KEY_B, [AGENT_B]: "0x1234" }),
      }),
    ).toEqual([]);
    expect(parseAgentSignerBindings({ json: "{not json" })).toEqual([]);
    expect(parseAgentSignerBindings({ json: JSON.stringify([KEY_A]) })).toEqual([]);
    expect(parseAgentSignerBindings({ legacyPrivateKey: "0x" + "zz".repeat(32) })).toEqual([]);
  });

  it("keeps the map and the single key apart, one binding per agent", () => {
    const bindings = parseAgentSignerBindings({
      json: JSON.stringify({ [AGENT_A]: KEY_A }),
      legacyPrivateKey: KEY_A,
    });
    expect(bindings).toHaveLength(1);
    expect(bindings[0].agent).toBe(AGENT_A);
  });
});

describe("agent signer registry (resolution)", () => {
  it("resolves only the agent a signer is bound to", async () => {
    const signers = registry(async (binding) => signer(binding.agent));
    expect(signers.boundAgents().sort()).toEqual([AGENT_A, AGENT_B].sort());

    const forA = await signers.resolve(AGENT_A);
    expect(forA?.signerAddress).toBe(AGENT_A);
    // Any address form (here the mixed-case checksum) resolves to the same identity.
    expect((await signers.resolve(computeAddress(KEY_A)))?.signerAddress).toBe(AGENT_A);
    expect(await signers.resolve(UNBOUND)).toBeNull();
    expect(await signers.resolve("not-an-address")).toBeNull();
  });

  it("fails closed when the client reports another address or cannot be built", async () => {
    const mismatched = registry(async () => signer(AGENT_B));
    expect(await mismatched.resolve(AGENT_A)).toBeNull();

    const broken = registry(() => Promise.reject(new Error("NETWORK_CONFIG_INVALID")));
    expect(await broken.resolve(AGENT_A)).toBeNull();
  });

  it("builds each agent's client once and exposes no key material", async () => {
    let built = 0;
    const signers = registry(async (binding) => {
      built += 1;
      return signer(binding.agent);
    });

    const first = await signers.resolve(AGENT_A);
    const second = await signers.resolve(AGENT_A);
    expect(built).toBe(1);
    expect(second).toBe(first);
    expect(JSON.stringify(first)).not.toMatch(/privateKey/);
    expect(JSON.stringify(signers.boundAgents())).not.toMatch(/0x[0-9a-f]{64}/);
  });
});
