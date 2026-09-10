import { describe, expect, it, afterEach } from "vitest";
import { loadModelConfig, assertModelConfigAllowsCall } from "../src/model-config.js";
import { loadOpenAIConfig, resolveOpenAIModel } from "../src/schemas.js";
import { DomainError } from "../src/errors.js";

const MODEL_CONFIG_PATH = new URL("../../../config/ai/model-config.json", import.meta.url);
const OPENAI_JSON_PATH = new URL("../../../config/ai/openai.json", import.meta.url);

describe("pinned model config (C-MODEL)", () => {
  const saved = process.env["OPENAI_MODEL"];
  afterEach(() => {
    if (saved === undefined) delete process.env["OPENAI_MODEL"];
    else process.env["OPENAI_MODEL"] = saved;
  });

  it("loads the single model truth openai/gpt-5.6-luna/allowFallback:false", () => {
    const cfg = loadModelConfig(MODEL_CONFIG_PATH);
    expect(cfg).toEqual({ provider: "openai", model: "gpt-5.6-luna", allowFallback: false });
  });

  it("rejects fallback-true and unknown models", () => {
    expect(() =>
      loadModelConfig({ provider: "openai", model: "gpt-5.6-luna", allowFallback: true }),
    ).toThrowError(DomainError);
    expect(() =>
      loadModelConfig({ provider: "openai", model: "gpt-4o", allowFallback: false }),
    ).toThrowError(DomainError);
    expect(() =>
      loadModelConfig({ provider: "anthropic", model: "gpt-5.6-luna", allowFallback: false }),
    ).toThrowError(DomainError);
  });

  it("asserts allowFallback===false before any call and rejects env substitution", () => {
    const cfg = loadModelConfig(MODEL_CONFIG_PATH);
    expect(() => assertModelConfigAllowsCall(cfg)).not.toThrow();
    expect(() =>
      assertModelConfigAllowsCall({
        provider: "openai",
        model: "gpt-5.6-luna",
        // @ts-expect-error — intentionally invalid fallback fixture
        allowFallback: true,
      }),
    ).toThrowError(DomainError);
    delete process.env["OPENAI_MODEL"];
    expect(resolveOpenAIModel({ ...cfg, region: "us-east-1" })).toBe("gpt-5.6-luna");
    process.env["OPENAI_MODEL"] = "gpt-4o";
    expect(() => resolveOpenAIModel({ ...cfg, region: "us-east-1" })).toThrowError(DomainError);
  });

  it("keeps openai.json from forking (deep-equal on model fields, model-config.json authoritative)", () => {
    const modelCfg = loadModelConfig(MODEL_CONFIG_PATH);
    const legacy = loadOpenAIConfig(OPENAI_JSON_PATH);
    expect(legacy.provider).toBe(modelCfg.provider);
    expect(legacy.model).toBe(modelCfg.model);
    expect(legacy.allowFallback).toBe(modelCfg.allowFallback);
  });
});
