import type { ModelInfo } from "../types.js";

export const DEFAULT_CODEX_MODEL = "gpt-5.4";

export const CODEX_MODEL_INFOS: ModelInfo[] = [
  { provider: "openai-codex", id: "gpt-5.4", name: "GPT-5.4", input: ["text", "image"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.2", name: "GPT-5.2", input: ["text", "image"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.2-codex", name: "GPT-5.2 Codex", input: ["text", "image"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.3-codex", name: "GPT-5.3 Codex", input: ["text", "image"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.3-codex-spark", name: "GPT-5.3 Codex Spark", input: ["text"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.1", name: "GPT-5.1", input: ["text", "image"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.1-codex", name: "GPT-5.1 Codex", input: ["text", "image"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini", input: ["text", "image"], source: "static" },
  { provider: "openai-codex", id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max", input: ["text", "image"], source: "static" },
];

export const SUPPORTED_CODEX_MODELS = [
  "gpt-5.4",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex-max",
] as const;

export type SupportedCodexModel = (typeof SUPPORTED_CODEX_MODELS)[number];

export function isSupportedCodexModel(model: string): model is SupportedCodexModel {
  return SUPPORTED_CODEX_MODELS.includes(model as SupportedCodexModel);
}
