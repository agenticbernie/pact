import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression coverage for the production 400 `INPUT_INVALID` on
 * `POST /v1/agent/intents` (request id 832d7d3b-86af-49d6-8edf-c7fbe0178fa2,
 * cardId "3").
 *
 * Netlify applies the FIRST redirect rule that matches, so every route that
 * belongs to a specific Neon function must be listed before the generic
 * `/v1/*` read-model catch-all. Sending a write route into the read-only
 * read-api answers 400 `INPUT_INVALID` for ANY non-GET (see the read-api test
 * suite), which is exactly the response the client saw — the gateway, its
 * merchant validation and the idempotency store were never reached.
 *
 * These assertions fail if a future edit puts the catch-all (or any read rule)
 * ahead of a write route again.
 */

type Redirect = { from: string; to: string };

const NETLIFY = new URL("../../netlify.toml", import.meta.url);

function parseRedirects(): Redirect[] {
  return readFileSync(NETLIFY, "utf8")
    .split("[[redirects]]")
    .slice(1)
    .map((block) => ({
      from: /from\s*=\s*"([^"]*)"/.exec(block)?.[1] ?? "",
      to: /to\s*=\s*"([^"]*)"/.exec(block)?.[1] ?? "",
    }));
}

function matchesRule(from: string, path: string): boolean {
  if (from.endsWith("/*")) {
    const base = from.slice(0, -2);
    return path === base || path.startsWith(base + "/");
  }
  return path === from;
}

/** The Neon function a request path resolves to, by first-match rule order. */
function upstreamFor(path: string): string {
  const rule = parseRedirects().find((candidate) => matchesRule(candidate.from, path));
  if (rule === undefined) return "none";
  return /br-spring-poetry-au5ekyxd-([a-z]+)\./.exec(rule.to)?.[1] ?? "unknown";
}

describe("Netlify production routing", () => {
  it("sends the reported failing request to the AI gateway, not the read API", () => {
    expect(upstreamFor("/v1/agent/intents")).toBe("aigateway");
  });

  it("routes each write route to the function that owns it", () => {
    expect(upstreamFor("/v1/payments/preflight")).toBe("agentexecutor");
    expect(upstreamFor("/v1/payments/execute")).toBe("agentexecutor");
  });

  it("keeps session and health on their owners", () => {
    expect(upstreamFor("/v1/session/challenge")).toBe("session");
    expect(upstreamFor("/v1/session/verify")).toBe("session");
    expect(upstreamFor("/v1/session/revoke")).toBe("session");
    expect(upstreamFor("/health")).toBe("aigateway");
  });

  it("still serves the read model from the read API", () => {
    expect(upstreamFor("/v1/config")).toBe("readapi");
    expect(upstreamFor("/v1/cards")).toBe("readapi");
    expect(upstreamFor("/v1/cards/2")).toBe("readapi");
    expect(upstreamFor("/v1/payments")).toBe("readapi");
  });

  it("lists the read-model catch-all after every write route", () => {
    const rules = parseRedirects();
    const catchAll = rules.findIndex((rule) => rule.from === "/v1/*");
    expect(catchAll).toBeGreaterThan(-1);
    for (const write of ["/v1/agent/intents", "/v1/payments/preflight", "/v1/payments/execute"]) {
      const index = rules.findIndex((rule) => matchesRule(rule.from, write));
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(catchAll);
    }
  });

  it("keeps the SPA fallback last so unknown /v1 routes still reach the API", () => {
    const rules = parseRedirects();
    expect(rules.findIndex((rule) => rule.from === "/*")).toBe(rules.length - 1);
  });
});
