import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { decode } from "ox/Cbor";
import type { RelayerStore } from "../db/store.js";

type Flow = "register" | "login";
interface Challenge { flow: Flow; origin: string; rpId: string; userId: string; username: string; expiresAt: number }
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest();
const bytes = (value: unknown): Buffer => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_+/=-]+$/.test(value)) throw new Error("Invalid credential encoding.");
  return Buffer.from(value, "base64url");
};
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** One-use challenges are deliberately ephemeral: a restart invalidates, never accepts, old prompts. */
export class PasskeyService {
  private challenges = new Map<string, Challenge>();
  constructor(private store: RelayerStore) {}

  private origin(body: Record<string, unknown>, origin?: string) {
    if (!origin) throw new Error("A browser origin is required for passkeys.");
    const url = new URL(origin);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Passkeys require HTTPS or localhost.");
    const allowed = process.env.PASSKEY_ALLOWED_ORIGINS?.split(",").map((value) => value.trim());
    if (allowed && !allowed.includes(url.origin)) throw new Error("This browser origin is not allowed.");
    if (body.rpID !== url.hostname) throw new Error("Passkey relying party does not match the browser origin.");
    return { origin: url.origin, rpId: url.hostname };
  }

  options(flow: Flow, body: Record<string, unknown>, origin?: string) {
    const context = this.origin(body, origin);
    for (const [key, value] of this.challenges) if (value.expiresAt < Date.now()) this.challenges.delete(key);
    if (this.challenges.size >= 2048) throw new Error("Too many passkey prompts. Please retry shortly.");
    const challenge = randomBytes(32).toString("base64url");
    const userId = randomBytes(24).toString("base64url");
    const username = String(body.username || "Pact user").slice(0, 100);
    this.challenges.set(challenge, { ...context, flow, userId, username, expiresAt: Date.now() + 300_000 });
    if (flow === "login") return { challenge, rpId: context.rpId, timeout: 60000, userVerification: "required" };
    return { userId, options: { challenge, rp: { name: "Pact", id: context.rpId }, user: { id: userId, name: username, displayName: username }, pubKeyCredParams: [{ alg: -7, type: "public-key" }], timeout: 60000, attestation: "none", authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" } } };
  }

  verify(flow: Flow, body: Record<string, unknown>, origin?: string) {
    const context = this.origin(body, origin);
    const credential = body.cred as { id?: unknown; type?: unknown; response?: Record<string, unknown> } | undefined;
    if (!credential?.response || credential.type !== "public-key" || typeof credential.id !== "string") throw new Error("Invalid passkey credential.");
    const response = credential.response;
    const clientBytes = bytes(response.clientDataJSON);
    const client = JSON.parse(clientBytes.toString("utf8")) as { type?: string; challenge?: string; origin?: string; crossOrigin?: boolean };
    const challenge = typeof client.challenge === "string" ? this.challenges.get(client.challenge) : undefined;
    if (!challenge || challenge.flow !== flow || challenge.expiresAt < Date.now()) throw new Error("Passkey challenge expired or is unknown. Start a new prompt.");
    this.challenges.delete(client.challenge!);
    if (challenge.origin !== context.origin || challenge.rpId !== context.rpId || client.origin !== context.origin || client.crossOrigin === true || client.type !== (flow === "register" ? "webauthn.create" : "webauthn.get")) throw new Error("Passkey origin, relying party, or ceremony does not match.");
    const attestation = flow === "register" ? decode<Record<string, unknown>>(bytes(response.attestationObject)) : null;
    const authData = flow === "register" ? Buffer.from(attestation?.authData as Uint8Array || []) : bytes(response.authenticatorData);
    if (authData.length < 37 || !same(authData.subarray(0, 32), digest(context.rpId)) || (authData[32] & 5) !== 5) throw new Error("Passkey user verification or relying-party binding failed.");

    if (flow === "register") {
      if (body.userId !== challenge.userId || attestation?.fmt !== "none" || (authData[32] & 64) === 0 || authData.length < 55) throw new Error("Invalid passkey registration data.");
      const idLength = authData.readUInt16BE(53);
      if (idLength === 0 || authData.length <= 55 + idLength || !same(authData.subarray(55, 55 + idLength), bytes(credential.id))) throw new Error("The registered credential ID does not match.");
      if (this.store.getPasskeyByAuthenticatorId(credential.id)) throw new Error("This passkey is already registered. Sign in instead.");
      const cose = decode<Record<string, unknown>>(authData.subarray(55 + idLength));
      if (cose["1"] !== 2 || cose["3"] !== -7 || cose["-1"] !== 1 || !(cose["-2"] instanceof Uint8Array) || !(cose["-3"] instanceof Uint8Array)) throw new Error("Only ES256 P-256 passkeys are supported.");
      const x = Buffer.from(cose["-2"]).toString("base64url");
      const y = Buffer.from(cose["-3"]).toString("base64url");
      if (Buffer.from(cose["-2"]).length !== 32 || Buffer.from(cose["-3"]).length !== 32) throw new Error("Invalid P-256 public key.");
      const suppliedKey = createPublicKey({ key: bytes(response.publicKey), format: "der", type: "spki" });
      const supplied = suppliedKey.export({ format: "jwk" });
      if (supplied.kty !== "EC" || supplied.crv !== "P-256" || supplied.x !== x || supplied.y !== y) throw new Error("The credential public key does not match its authenticator data.");
      const pubkey = suppliedKey.export({ format: "der", type: "spki" }).toString("base64");
      this.store.savePasskey({ authenticatorId: credential.id, userId: challenge.userId, username: challenge.username, rpId: context.rpId, pubkey });
      return { verified: true };
    }

    const saved = this.store.getPasskeyByAuthenticatorId(credential.id);
    if (!saved || saved.rp_id !== context.rpId) throw new Error("Passkey not found for this site.");
    const key = createPublicKey({ key: Buffer.from(saved.pubkey, "base64"), format: "der", type: "spki" });
    if (!verify("sha256", Buffer.concat([authData, digest(clientBytes)]), key, bytes(response.signature))) throw new Error("Passkey signature verification failed.");
    return { verification: { verified: true }, pubkey: saved.pubkey };
  }
}
