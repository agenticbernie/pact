/**
 * OpenAI provider over raw fetch (S1 A3 raw-fetch-behind-port, no SDK).
 *
 * - Model value comes only from `loadModelConfig` pinned to `gpt-5.6-luna`
 *   with `allowFallback:false`; `resolveOpenAIModel` rejects env substitution.
 * - Pre-call `allowFallback===false` assert; no fallback branch exists.
 * - Responses API with `store:false` + strict JSON schema `pact_agent_intent`
 *   (merchantId-only, `additionalProperties:false`).
 * - Retry once only on 502/503/429, never as a new payment (this module has
 *   no payment path at all).
 * - No `openai` package anywhere (import-graph + lockfile check in G6).
 */
import { assertModelConfigAllowsCall } from "../../../packages/domain/src/model-config.ts";
import type { ModelConfig } from "../../../packages/domain/src/model-config.ts";
import { resolveOpenAIModel } from "../../../packages/domain/src/schemas.ts";
import type {
  AiProvider,
  MerchantCatalogItem,
  ProviderCardContext,
  ProviderIntentResult,
} from "./provider-port.ts";

export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: unknown },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export class GatewayError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

const RETRYABLE_STATUS = new Set([502, 503, 429]);

function statusToCode(status: number, bodyText: string): string {
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status === 404 || bodyText.includes("model_not_found") || bodyText.includes("model-unavailable")) {
    return "PROVIDER_MODEL_UNAVAILABLE";
  }
  return "PROVIDER_UNAVAILABLE";
}

export class OpenAiProvider implements AiProvider {
  private readonly modelConfig: ModelConfig;
  private readonly region: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;
  private readonly apiKey?: string;

  constructor(input: { modelConfig: ModelConfig; region?: string; baseUrl?: string; apiKey?: string; fetchFn: FetchFn }) {
    this.modelConfig = input.modelConfig;
    this.region = input.region ?? "us-east-1";
    this.baseUrl = input.baseUrl ?? "https://api.openai.com";
    this.fetchFn = input.fetchFn;
    this.apiKey = input.apiKey;
  }

  async parseIntent(input: {
    prompt: string;
    card: ProviderCardContext;
    merchants: ReadonlyArray<MerchantCatalogItem>;
  }): Promise<ProviderIntentResult> {
    assertModelConfigAllowsCall(this.modelConfig);
    const model = resolveOpenAIModel({ ...this.modelConfig, region: this.region });
    const body = {
      model,
      store: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pact_agent_intent",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              merchantId: { type: "string" },
              amountDecimal: { type: "string" },
              purpose: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["merchantId", "amountDecimal", "purpose", "confidence"],
          },
        },
      },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: input.prompt },
            {
              type: "input_text",
              text: `merchants: ${input.merchants.map((m) => m.id).join(",")}`,
            },
          ],
        },
      ],
    };
    const payload = JSON.stringify(body);
    let attempt = 0;
    let lastStatus = 0;
    let lastText = "";
    while (attempt < 2) {
      attempt += 1;
      const started = Date.now();
      void started;
      const response = await this.fetchFn(`${this.baseUrl}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey === undefined ? {} : { authorization: `Bearer ${this.apiKey}` }),
        },
        body: payload,
      });
      lastStatus = response.status;
      if (lastStatus >= 200 && lastStatus < 300) {
        return this.readResult(await response.json(), model);
      }
      lastText = JSON.stringify(await response.json().catch(() => ({})));
      if (!RETRYABLE_STATUS.has(lastStatus) || attempt >= 2) {
        throw new GatewayError(statusToCode(lastStatus, lastText), "Provider request failed.", lastStatus);
      }
    }
    throw new GatewayError(statusToCode(lastStatus, lastText), "Provider request failed.", lastStatus);
  }

  private readResult(raw: unknown, model: string): ProviderIntentResult {
    let text = "";
    try {
      const record = raw as Record<string, unknown>;
      const output = record["output"] as Array<{
        content?: Array<{ text?: string }>;
      }>;
      const first = output[0];
      const content = first !== undefined ? (first.content ?? []) : [];
      const piece = content[0];
      text = typeof piece?.text === "string" ? piece.text : "";
      if (text === "") {
        throw new Error("empty-output");
      }
    } catch {
      throw new GatewayError("PROVIDER_OUTPUT_INVALID", "Provider output failed validation.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new GatewayError("PROVIDER_OUTPUT_INVALID", "Provider output failed validation.");
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new GatewayError("PROVIDER_OUTPUT_INVALID", "Provider output failed validation.");
    }
    const record = parsed as Record<string, unknown>;
    const allowed = new Set(["merchantId", "amountDecimal", "purpose", "confidence"]);
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) {
        throw new GatewayError("PROVIDER_OUTPUT_INVALID", "Provider output failed validation.");
      }
    }
    const { merchantId, amountDecimal, purpose, confidence } = record;
    if (
      typeof merchantId !== "string" ||
      typeof amountDecimal !== "string" ||
      typeof purpose !== "string" ||
      typeof confidence !== "number"
    ) {
      throw new GatewayError("PROVIDER_OUTPUT_INVALID", "Provider output failed validation.");
    }
    return { provider: "openai", model, merchantId, amountDecimal, purpose, confidence };
  }
}
