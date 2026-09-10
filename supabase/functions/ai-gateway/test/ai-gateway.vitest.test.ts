import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { handleIntentRequest, type GatewayDeps } from "../index.ts";
import { OpenAiProvider } from "../openai-provider.ts";
import type { AiProvider } from "../provider-port.ts";

const CARD = {
  cardId: "7",
  agent: "0x1111111111111111111111111111111111111111",
  asset: "native-testnet-ctc",
  recipient: "0x3333333333333333333333333333333333333333",
  policyVersion: 1,
};

const MERCHANTS = [{ id: "coffee-demo", label: "Coffee Demo" }];

function depsWith(provider: AiProvider, overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    provider,
    card: CARD,
    merchants: MERCHANTS,
    expectedRegion: "us-east-1",
    actualRegion: "us-east-1",
    nowMs: Date.parse("2026-09-09T00:00:00Z"),
    ...overrides,
  };
}

function fakeProvider(result: unknown): AiProvider {
  return {
    parseIntent: () => Promise.resolve(result as never),
  };
}

describe("gateway fail-closed (C-MODEL, merchantId-only)", () => {
  it("accepts valid structured output with provider/model attribution", async () => {
    const res = await handleIntentRequest(
      { prompt: "buy coffee", cardId: "7", requestId: "req-ok" },
      depsWith(
        fakeProvider({
          provider: "openai",
          model: "gpt-5.6-luna",
          merchantId: "coffee-demo",
          amountDecimal: "2.5",
          purpose: "demo coffee purchase",
          confidence: 0.9,
        }),
      ),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.intent.provider).toBe("openai");
      expect(res.intent.model).toBe("gpt-5.6-luna");
      expect(res.intent.merchantId).toBe("coffee-demo");
    }
  });

  it("fails closed with sendPayment==0 on every failure class", async () => {
    const sendPayment = vi.fn();
    const maybeSettle = (res: unknown) => {
      if (typeof res === "object" && res !== null && (res as { ok?: boolean }).ok === true) {
        sendPayment(res);
      }
    };
    const cases: Array<{ name: string; deps: GatewayDeps; code: string }> = [
      {
        name: "provider-401",
        deps: depsWith({
          parseIntent: () => Promise.reject(Object.assign(new Error("unauthorized"), { status: 401 })),
        }),
        code: "PROVIDER_UNAVAILABLE",
      },
      {
        name: "provider-429",
        deps: depsWith({
          parseIntent: () => Promise.reject(Object.assign(new Error("limited"), { status: 429 })),
        }),
        code: "RATE_LIMITED",
      },
      {
        name: "provider-500",
        deps: depsWith({
          parseIntent: () => Promise.reject(Object.assign(new Error("boom"), { status: 500 })),
        }),
        code: "PROVIDER_UNAVAILABLE",
      },
      {
        name: "malformed-json",
        deps: depsWith(fakeProvider({ provider: "openai", model: "gpt-5.6-luna", garbage: true })),
        code: "PROVIDER_OUTPUT_INVALID",
      },
      {
        name: "model-unavailable",
        deps: depsWith(fakeProvider({ provider: "openai", model: "gpt-4o", merchantId: "coffee-demo", amountDecimal: "1", purpose: "x", confidence: 1 })),
        code: "PROVIDER_MODEL_UNAVAILABLE",
      },
      {
        name: "wrong-region",
        deps: depsWith(
          fakeProvider({ provider: "openai", model: "gpt-5.6-luna", merchantId: "coffee-demo", amountDecimal: "1", purpose: "x", confidence: 1 }),
          { actualRegion: "eu-west-1" },
        ),
        code: "REGION_MISMATCH",
      },
      {
        name: "unknown-merchant",
        deps: depsWith(fakeProvider({ provider: "openai", model: "gpt-5.6-luna", merchantId: "nope-shop", amountDecimal: "1", purpose: "x", confidence: 1 })),
        code: "PROVIDER_OUTPUT_INVALID",
      },
      {
        name: "model-recipient",
        deps: depsWith(fakeProvider({ provider: "openai", model: "gpt-5.6-luna", merchantId: "coffee-demo", amountDecimal: "1", purpose: "x", confidence: 1, recipientAddress: "0x2222222222222222222222222222222222222222" })),
        code: "PROVIDER_OUTPUT_INVALID",
      },
      {
        name: "oversize-prompt",
        deps: depsWith(fakeProvider({ provider: "openai", model: "gpt-5.6-luna", merchantId: "coffee-demo", amountDecimal: "1", purpose: "x", confidence: 1 })),
        code: "INPUT_INVALID",
      },
    ];
    for (const c of cases) {
      const input =
        c.name === "oversize-prompt"
          ? { prompt: "p".repeat(2001), cardId: "7", requestId: `req-${c.name}` }
          : { prompt: "buy coffee", cardId: "7", requestId: `req-${c.name}` };
      const res = await handleIntentRequest(input, c.deps);
      expect(res.ok, c.name).toBe(false);
      if (!res.ok) {
        expect(res.error.code, c.name).toBe(c.code);
      }
      maybeSettle(res);
    }
    expect(sendPayment).toHaveBeenCalledTimes(0);
  });

  it("retries once only on 502/503/429 and never as a new payment", async () => {
    let calls = 0;
    const flaky = () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({ status: 503, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            output: [
              { content: [{ text: JSON.stringify({ merchantId: "coffee-demo", amountDecimal: "1", purpose: "x", confidence: 1 }) }] },
            ],
          }),
      });
    };
    const provider = new OpenAiProvider({
      modelConfig: { provider: "openai", model: "gpt-5.6-luna", allowFallback: false },
      fetchFn: flaky as never,
    });
    const ok = await provider.parseIntent({ prompt: "hi", card: CARD, merchants: MERCHANTS });
    expect(ok.merchantId).toBe("coffee-demo");
    expect(calls).toBe(2);
    let hardCalls = 0;
    const hardFail = () => {
      hardCalls += 1;
      return Promise.resolve({ status: 500, json: () => Promise.resolve({}) });
    };
    const failing = new OpenAiProvider({
      modelConfig: { provider: "openai", model: "gpt-5.6-luna", allowFallback: false },
      fetchFn: hardFail as never,
    });
    await expect(failing.parseIntent({ prompt: "hi", card: CARD, merchants: MERCHANTS })).rejects.toThrow();
    expect(hardCalls).toBe(1);
  });

  it("uses Responses store:false + strict pact_agent_intent and never imports the signer", async () => {
    const bodies: unknown[] = [];
    const stubFetch = (_url: string, init: { body?: string }) => {
      bodies.push(JSON.parse(init.body ?? "{}"));
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            output: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      merchantId: "coffee-demo",
                      amountDecimal: "1",
                      purpose: "x",
                      confidence: 1,
                    }),
                  },
                ],
              },
            ],
          }),
      });
    };
    const provider = new OpenAiProvider({
      modelConfig: { provider: "openai", model: "gpt-5.6-luna", allowFallback: false },
      fetchFn: stubFetch as never,
    });
    await provider.parseIntent({ prompt: "hi", card: CARD, merchants: MERCHANTS });
    const body = bodies[0] as Record<string, unknown>;
    expect(body["store"]).toBe(false);
    expect(JSON.stringify(body)).toContain("pact_agent_intent");
    for (const file of ["../index.ts", "../openai-provider.ts", "../catalog.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src).not.toMatch(/sendPayment/);
      expect(src).not.toMatch(/AGENT_SIGNER_PRIVATE_KEY/);
      expect(src).not.toMatch(/from ["']openai["']/);
    }
  });
});
