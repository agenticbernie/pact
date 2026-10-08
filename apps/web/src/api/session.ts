/**
 * Session routes (Phase 04 C3): EIP-191 one-time challenge plus an HMAC-signed,
 * wallet-bound token. The browser only ever signs the challenge message — it
 * never receives a provider key and never signs a payment.
 */
import { apiPost } from "./client";

export type ChallengeResponse = {
  nonce: string;
  message: string;
  expiresAt: string;
};

export type VerifyResponse = {
  token: string;
  sessionId: string;
};

export function requestSessionChallenge(input: {
  wallet: string;
  domain: string;
  chainLabel: string;
}): Promise<ChallengeResponse> {
  return apiPost<ChallengeResponse>("/v1/session/challenge", input, { token: null });
}

export function verifySessionChallenge(input: {
  nonce: string;
  signature: string;
}): Promise<VerifyResponse> {
  return apiPost<VerifyResponse>("/v1/session/verify", input, { token: null });
}

export function revokeSession(token: string): Promise<{ revoked: boolean }> {
  return apiPost<{ revoked: boolean }>("/v1/session/revoke", {}, { token });
}
