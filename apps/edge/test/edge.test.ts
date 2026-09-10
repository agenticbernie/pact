import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { handleEdgeRequest, type EdgeEnv } from "../src/index.ts";

const ENV: EdgeEnv = {
  SUPABASE_REGIONAL_FUNCTION_URL: "https://xyzcompany.supabase.co/functions/v1",
  ALLOWED_ORIGIN: "https://app.example.invalid",
};

function req(
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
) {
  return {
    method: init.method ?? "POST",
    path,
    headers: { "x-request-id": "req-test-1", ...(init.headers ?? {}) },
    body: init.body ?? JSON.stringify({ hello: "world" }),
  };
}

describe("edge boundary", () => {
  it("rejects bodies over 64KB before forwarding", async () => {
    const fetchFn = vi.fn();
    const res = await handleEdgeRequest(
      req("/v1/agent/intents", { body: `{"p":"${"p".repeat(70 * 1024)}"}` }),
      ENV,
      { fetchFn: fetchFn as never, nowMs: 1000 },
    );
    expect(res.status).toBe(413);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods/paths and missing auth headers", async () => {
    const fetchFn = vi.fn();
    const badMethod = await handleEdgeRequest(req("/v1/agent/intents", { method: "TRACE" }), ENV, {
      fetchFn: fetchFn as never,
      nowMs: 1000,
    });
    expect(badMethod.status).toBe(404);
    const badPath = await handleEdgeRequest(req("/v1/nope"), ENV, {
      fetchFn: fetchFn as never,
      nowMs: 1000,
    });
    expect(badPath.status).toBe(404);
    const noAuth = await handleEdgeRequest(
      req("/v1/agent/intents", { headers: { "x-request-id": "req-noauth" } }),
      ENV,
      { fetchFn: fetchFn as never, nowMs: 1000 },
    );
    expect(noAuth.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("enforces the 30/min rate limit", async () => {
    let calls = 0;
    const fetchFn = () => {
      calls += 1;
      return Promise.resolve({ status: 200, body: "{}", headers: {} });
    };
    let limited = 0;
    for (let i = 0; i < 35; i += 1) {
      const res = await handleEdgeRequest(
        req("/v1/agent/intents", {
          headers: { "x-request-id": `req-rl-${i}`, authorization: "Bearer tok" },
        }),
        ENV,
        { fetchFn: fetchFn as never, nowMs: 1000, clientIp: "10.0.0.9" },
      );
      if (res.status === 429) {
        limited += 1;
      }
    }
    expect(limited).toBeGreaterThan(0);
    expect(calls).toBeLessThan(35);
  });

  it("propagates correlation headers and maps upstream timeout/4xx/5xx", async () => {
    const seen: string[] = [];
    const okFetch = (_url: string, init: { headers?: Record<string, string> }) => {
      seen.push(init.headers?.["x-request-id"] ?? "");
      return Promise.resolve({ status: 200, body: `{"ok":true}`, headers: {} });
    };
    const ok = await handleEdgeRequest(
      req("/v1/agent/intents", {
        headers: { "x-request-id": "req-corr-7", authorization: "Bearer tok" },
      }),
      ENV,
      { fetchFn: okFetch as never, nowMs: 1000 },
    );
    expect(ok.status).toBe(200);
    expect(seen).toEqual(["req-corr-7"]);
    expect(ok.headers["x-request-id"]).toBe("req-corr-7");

    const failFetch = () => Promise.resolve({ status: 502, body: "bad gateway", headers: {} });
    const bad = await handleEdgeRequest(
      req("/v1/agent/intents", {
        headers: { "x-request-id": "req-up-502", authorization: "Bearer tok" },
      }),
      ENV,
      { fetchFn: failFetch as never, nowMs: 2000 },
    );
    expect(bad.status).toBe(502);
    expect(JSON.stringify(bad.body)).toContain("req-up-502");

    const timeoutFetch = () => Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    const timed = await handleEdgeRequest(
      req("/v1/agent/intents", {
        headers: { "x-request-id": "req-up-timeout", authorization: "Bearer tok" },
      }),
      ENV,
      { fetchFn: timeoutFetch as never, nowMs: 3000 },
    );
    expect(timed.status).toBe(504);
  });

  it("never references provider/signer secrets", () => {
    for (const file of ["../src/index.ts", "../src/rate-limit.ts", "../src/upstream.ts", "../src/types.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src).not.toMatch(/OPENAI_API_KEY/);
      expect(src).not.toMatch(/AGENT_SIGNER_PRIVATE_KEY/);
      expect(src).not.toMatch(/SERVICE_ROLE/);
    }
  });
});
