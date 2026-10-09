/**
 * Authoritative on-chain card policy version.
 *
 * The `cards` read projection cannot carry a truthful `policy_version`: the
 * controller's card lifecycle events (`CardCreated`, `PolicyUpdated`,
 * `CreditVerified`) do not include it, so the column is a projection-only
 * placeholder. The controller's `cards(uint256)` view IS authoritative, so the
 * intent path reads it directly instead of trusting the placeholder — otherwise
 * every intent records a stale version and the executor's on-chain compare
 * rejects the settlement with `CARD_NOT_ELIGIBLE`.
 *
 * Read-only: a single `eth_call`, no signer, no broadcast, never a write. Every
 * failure resolves to `null`, which callers read as "no authoritative answer"
 * (never as zero, never as a reason to widen anything).
 */
import { Interface, JsonRpcProvider } from "ethers";

/**
 * `cards(uint256)` exactly as `PactCardController` declares it. Field order is
 * pinned by `supabase/functions/agent-executor/agent-signer.ts`; `policyVersion`
 * is the last member.
 */
export const PACT_CARDS_ABI = [
  "function cards(uint256 cardId) view returns (address owner, address agent, address asset, uint256 ownerConfiguredCap, uint256 verifiedCredit, uint64 verifiedCreditExpiry, uint256 spent, uint256 perTransactionLimit, uint64 expiresAt, uint8 status, uint32 policyVersion)",
] as const;

const POLICY_VERSION_INDEX = 10;

/** Card id -> authoritative policy version, or `null` when unreadable. */
export type PolicyVersionReader = (cardId: string) => Promise<number | null>;

export function createChainPolicyVersionReader(input: {
  rpcUrl: string;
  chainId: number;
  controllerAddress: string;
  /** Injectable `eth_call` transport; defaults to ethers over the lane RPC. */
  call?: (to: string, data: string) => Promise<string>;
}): PolicyVersionReader {
  const controller = input.controllerAddress.trim();
  if (controller.length === 0) {
    throw new Error("A controller address is required to read the card policy version.");
  }
  const iface = new Interface(PACT_CARDS_ABI);
  const call =
    input.call ??
    (() => {
      const provider = new JsonRpcProvider(input.rpcUrl, input.chainId, { staticNetwork: true });
      return (to: string, data: string): Promise<string> => provider.call({ to, data });
    })();

  return async (cardId: string): Promise<number | null> => {
    let encoded: string;
    try {
      encoded = iface.encodeFunctionData("cards", [BigInt(cardId)]);
    } catch {
      return null;
    }
    try {
      const decoded = iface.decodeFunctionResult("cards", await call(controller, encoded));
      const version = Number(decoded[POLICY_VERSION_INDEX]);
      return Number.isInteger(version) && version >= 0 ? version : null;
    } catch {
      return null;
    }
  };
}
