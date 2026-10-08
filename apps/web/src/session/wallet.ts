/**
 * Browser wallet adapter for the owner session handshake.
 *
 * Only an injected EVM provider (EIP-1193) is used, and only two methods are
 * requested: `eth_requestAccounts` and `personal_sign` over the one-time
 * challenge. The console holds no private key and has no path to agent payments.
 */

export type Eip1193Provider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

type InjectedWindow = { ethereum?: unknown };

/** The injected provider, or null when no wallet extension is present. */
export function injectedProvider(): Eip1193Provider | null {
  const candidate = (globalThis as InjectedWindow).ethereum;
  if (candidate === null || candidate === undefined || typeof candidate !== "object") return null;
  const request = (candidate as { request?: unknown }).request;
  if (typeof request !== "function") return null;
  return candidate as Eip1193Provider;
}

export async function requestAccount(provider: Eip1193Provider): Promise<string> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== "string" || first === "") {
    throw new Error("The wallet returned no account.");
  }
  return first;
}

export async function signChallenge(
  provider: Eip1193Provider,
  address: string,
  message: string,
): Promise<string> {
  const signature = await provider.request({
    method: "personal_sign",
    params: [message, address],
  });
  if (typeof signature !== "string" || signature === "") {
    throw new Error("The wallet returned no signature.");
  }
  return signature;
}

/** Watch for account/chain changes so a stale owner session is dropped. */
export function watchWallet(provider: Eip1193Provider, onChange: () => void): () => void {
  if (provider.on === undefined) return () => {};
  provider.on("accountsChanged", onChange);
  provider.on("chainChanged", onChange);
  return () => {
    provider.removeListener?.("accountsChanged", onChange);
    provider.removeListener?.("chainChanged", onChange);
  };
}
