import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { describeError, onAuthFailure, setSessionToken } from "../api/client";
import { requestSessionChallenge, verifySessionChallenge } from "../api/session";
import { clearStoredSession, readStoredSession, writeStoredSession } from "./session-store";
import { injectedProvider, requestAccount, signChallenge, watchWallet } from "./wallet";

/** Cosmetic label inside the signed challenge message; the lane itself is Arc testnet. */
const CHAIN_LABEL = "arc-testnet";

export type SessionState =
  | { status: "anonymous" }
  | { status: "connecting" }
  | { status: "active"; wallet: string }
  | { status: "failed"; message: string };

type SessionContextValue = {
  state: SessionState;
  /** True when a browser wallet is reachable in this tab. */
  walletDetected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

// Restore once at module load so the very first request already carries the token.
const restored = readStoredSession();
if (restored !== null) setSessionToken(restored.token);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(() =>
    restored === null ? { status: "anonymous" } : { status: "active", wallet: restored.wallet },
  );
  const [walletDetected, setWalletDetected] = useState(() => injectedProvider() !== null);

  const disconnect = useCallback(() => {
    clearStoredSession();
    setSessionToken(null);
    setState({ status: "anonymous" });
  }, []);

  // A rejected token (expired or revoked) must never linger in the shell.
  useEffect(() => onAuthFailure(disconnect), [disconnect]);

  const connect = useCallback(async () => {
    setState({ status: "connecting" });
    try {
      const provider = injectedProvider();
      setWalletDetected(provider !== null);
      if (provider === null) {
        throw new Error(
          "No browser wallet detected. Install an EVM wallet extension to sign the owner session.",
        );
      }
      const address = await requestAccount(provider);
      const challenge = await requestSessionChallenge({
        wallet: address,
        domain: globalThis.location.host,
        chainLabel: CHAIN_LABEL,
      });
      const signature = await signChallenge(provider, address, challenge.message);
      const { token } = await verifySessionChallenge({ nonce: challenge.nonce, signature });
      writeStoredSession({ token, wallet: address });
      setSessionToken(token);
      setState({ status: "active", wallet: address });
    } catch (error) {
      setState({ status: "failed", message: describeError(error) });
    }
  }, []);

  // Account or chain changes invalidate the owner scope: drop the session and refetch.
  useEffect(() => {
    const provider = injectedProvider();
    if (provider === null) return;
    return watchWallet(provider, disconnect);
  }, [disconnect]);

  const value = useMemo<SessionContextValue>(
    () => ({ state, walletDetected, connect, disconnect }),
    [state, walletDetected, connect, disconnect],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession must be used inside a SessionProvider.");
  return value;
}
