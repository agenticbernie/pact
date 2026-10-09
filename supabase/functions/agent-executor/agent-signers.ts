/**
 * Per-agent signer registry (execute lane).
 *
 * WHY: `controller.pay` is only accepted from the card's ASSIGNED agent
 * (`WRONG_CALLER` otherwise), and the executor's session must be that same
 * agent. A single lane-wide key therefore can only ever settle the cards
 * assigned to that one address — a card issued to any other agent is
 * unsettleable no matter what the intent says, and a lane that blindly signs
 * with its one key is a key/identity mismatch waiting to be discovered on chain.
 *
 * This module makes the binding explicit and verifiable:
 * - every signer is bound to the AGENT it signs for, and that address is
 *   DERIVED from the key (`computeAddress`) — a declared binding whose derived
 *   address disagrees is discarded, never trusted;
 * - `resolve(agent)` answers only for that exact agent, so an intent whose
 *   assigned agent has no signer fails closed (the caller refuses) instead of
 *   being signed by a wallet the controller will reject;
 * - the legacy single-key shape needs no declared address: the key *is* the
 *   binding, and the address it resolves for is derived, never assumed.
 *
 * Key hygiene: keys are handed to the client factory as arguments, are never
 * logged, returned, serialized or persisted, and never leave this module in a
 * public shape — the only things callers can read back are addresses and
 * clients. The module never reads the environment (the runtime entrypoint does).
 *
 * Deno-safe: ethers only, no Node imports.
 */
import { computeAddress } from "ethers";
import type { AgentSignerPaymentClient } from "./agent-signer.ts";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_KEY = /^0x[0-9a-fA-F]{64}$/;

/** An agent address and the key bound to it. Internal to this module. */
export type AgentSignerBinding = { agent: string; privateKey: string };

export type AgentSignerRegistry = {
  /** The addresses this lane can sign for (never keys). */
  boundAgents(): string[];
  /** The signing client for that exact agent, or `null` when none is bound. */
  resolve(agentAddress: string): Promise<AgentSignerPaymentClient | null>;
};

/**
 * Parses the signer bindings the runtime entrypoint hands in.
 *
 * `json` is an optional object of `{ "<agent address>": "<0x private key>" }`
 * (the multi-agent lane). `legacyPrivateKey` is the single-key shape. Every
 * entry is validated independently and SKIPPED when it is unusable — a bad
 * entry must never widen what the lane may sign for, and a declared agent whose
 * derived address disagrees is a mismatch, not a binding.
 */
export function parseAgentSignerBindings(input: {
  json?: string | undefined;
  legacyPrivateKey?: string | undefined;
}): AgentSignerBinding[] {
  const bindings: AgentSignerBinding[] = [];
  const seen = new Set<string>();

  const add = (agent: string, privateKey: string): void => {
    const key = agent.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    bindings.push({ agent: key, privateKey });
  };

  const declared = (input.json ?? "").trim();
  if (declared.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(declared);
    } catch {
      parsed = undefined;
    }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      for (const [agent, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!EVM_ADDRESS.test(agent)) continue;
        if (typeof value !== "string") continue;
        const privateKey = value.trim();
        if (!EVM_KEY.test(privateKey)) continue;
        let derived: string;
        try {
          derived = computeAddress(privateKey).toLowerCase();
        } catch {
          continue;
        }
        // The declared identity must be the one the key actually controls.
        if (derived !== agent.toLowerCase()) continue;
        add(derived, privateKey);
      }
    }
  }

  const legacy = (input.legacyPrivateKey ?? "").trim();
  if (EVM_KEY.test(legacy)) {
    try {
      add(computeAddress(legacy), legacy);
    } catch {
      // An unreadable key is simply not a signer.
    }
  }

  return bindings;
}

export function createAgentSignerRegistry(input: {
  bindings: readonly AgentSignerBinding[];
  /** Builds the client for one binding; injected so tests never need a chain. */
  createClient: (binding: AgentSignerBinding) => Promise<AgentSignerPaymentClient>;
}): AgentSignerRegistry {
  const byAgent = new Map(input.bindings.map((binding) => [binding.agent.toLowerCase(), binding]));
  const clients = new Map<string, Promise<AgentSignerPaymentClient | null>>();

  return {
    boundAgents(): string[] {
      return [...byAgent.keys()];
    },

    async resolve(agentAddress: string): Promise<AgentSignerPaymentClient | null> {
      if (!EVM_ADDRESS.test(agentAddress)) return null;
      const agent = agentAddress.toLowerCase();
      const binding = byAgent.get(agent);
      if (binding === undefined) return null;
      const cached = clients.get(agent);
      if (cached !== undefined) return cached;
      const pending = (async (): Promise<AgentSignerPaymentClient | null> => {
        try {
          const signer = await input.createClient(binding);
          // Second, independent check: the address the client reports must be
          // the agent we are resolving for. Any disagreement fails closed.
          if (signer.signerAddress.toLowerCase() !== agent) return null;
          return signer;
        } catch {
          return null;
        }
      })();
      clients.set(agent, pending);
      return pending;
    },
  };
}
