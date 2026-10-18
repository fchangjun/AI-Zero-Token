import { expect, test } from "bun:test";
import { groupModelsByVendor, matchesModelSearch, modelVendor } from "../admin-ui/src/pages/providers/model-vendors";

test("channel aliases and namespaced IDs group by the model maker, not the gateway", () => {
  const examples = [
    ["gpt-6-sol", "openai"], ["openai/o3-mini", "openai"], ["azure/gpt-4.1", "openai"],
    ["Claude Sonnet 4.6", "anthropic"], ["Opus 5.5", "anthropic"], ["Haiku-4.5", "anthropic"],
    ["eu.anthropic.claude-sonnet-4-6-v1:0", "anthropic"], ["DeepSeek-V4.1-Flash", "deepseek"],
    ["deepseek-ai/DeepSeek-R1", "deepseek"], ["models/gemini-3.7-flash", "google"],
    ["Grok-4.7", "xai"], ["GLM-5.3-Flash", "zhipu"], ["Kimi K2.6", "moonshot"],
    ["MiniMax-M3", "minimax"], ["Qwen/Qwen3-Coder", "alibaba"], ["meta-llama/Llama-3.3", "meta"],
    ["mistralai/Mixtral-8x7B", "mistral"], ["ERNIE-4.5", "baidu"], ["Doubao-1.5-pro", "bytedance"],
  ];
  for (const [id, vendor] of examples) expect(modelVendor({ id }).id).toBe(vendor);
});

test("unknown and conflicting names remain Other, while display names can identify deployment aliases", () => {
  for (const id of ["auto", "my-gpt-router", "sonnetics-5", "deepseekish", "openai-compatible", "anthropic/gpt-4.1"]) {
    expect(modelVendor({ id }).id).toBe("other");
  }
  expect(modelVendor({ id: "deployment-1", name: "Claude Sonnet 4.6" }).id).toBe("anthropic");
  expect(modelVendor({ id: "gpt-4.1", name: "Claude alias" }).id).toBe("openai");
  expect(modelVendor({ id: "anthropic/gpt-4.1", name: "Claude alias" }).id).toBe("other");
  expect(modelVendor({ id: "deployment-2", description: "OpenAI-compatible API" }).id).toBe("other");
});

test("grouping preserves every model, identity and in-group order without changing stored selection", () => {
  const models = Object.freeze([
    Object.freeze({ id: "unknown", selectedForCodex: true }),
    Object.freeze({ id: "Opus 5", selectedForCodex: false }),
    Object.freeze({ id: "gpt-6-sol", selectedForCodex: true }),
    Object.freeze({ id: "DeepSeek-V4.1-Flash", selectedForCodex: false }),
    Object.freeze({ id: "Claude Haiku 4.5", selectedForCodex: true }),
    Object.freeze({ id: "gpt-6-astra", selectedForCodex: false }),
  ]);
  const groups = groupModelsByVendor(models);
  expect(groups.map((group) => group.id)).toEqual(["openai", "anthropic", "deepseek", "other"]);
  expect(groups[1].models.map((model) => model.id)).toEqual(["Opus 5", "Claude Haiku 4.5"]);
  expect(groups.flatMap((group) => group.models)).toHaveLength(models.length);
  expect(groups[0].models[0]).toBe(models[2]);
  expect(models.map((model) => model.id)).toEqual(["unknown", "Opus 5", "gpt-6-sol", "DeepSeek-V4.1-Flash", "Claude Haiku 4.5", "gpt-6-astra"]);
  expect(models.filter((model) => model.selectedForCodex).map((model) => model.id)).toEqual(["unknown", "gpt-6-sol", "Claude Haiku 4.5"]);
});

test("search finds manufacturer names and aliases without conflating model protocols", () => {
  expect(matchesModelSearch({ id: "Opus 5" }, "Anthropic")).toBe(true);
  expect(matchesModelSearch({ id: "Opus 5" }, "claude")).toBe(true);
  expect(matchesModelSearch({ id: "GLM-5.3" }, "智谱")).toBe(true);
  expect(matchesModelSearch({ id: "gpt-6-sol" }, "OpenAI")).toBe(true);
  expect(matchesModelSearch({ id: "DeepSeek-V4.1-Flash" }, "  deepseek-v4.1  ")).toBe(true);
  expect(matchesModelSearch({ id: "Opus 5" }, "OpenAI")).toBe(false);
});
