import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelCatalogInfo, ModelInfo } from "../types.js";

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

type CodexModelsCacheFile = {
  fetched_at?: string;
  models?: CodexModelsCacheEntry[];
};

type CodexModelsCacheEntry = {
  slug?: string;
  display_name?: string;
  input_modalities?: string[];
  visibility?: string;
};

export function getCodexModelsCachePath(): string {
  return process.env.CODEX_MODELS_CACHE_PATH || path.join(os.homedir(), ".codex", "models_cache.json");
}

function normalizeInputModalities(input: unknown): Array<"text" | "image"> {
  const rawValues = Array.isArray(input) ? input : [];
  const values = new Set<"text" | "image">();

  for (const item of rawValues) {
    if (item === "text" || item === "image") {
      values.add(item);
    }
  }

  if (values.size === 0) {
    values.add("text");
  }

  return Array.from(values);
}

function normalizeCodexCacheEntry(entry: CodexModelsCacheEntry): ModelInfo | null {
  if (!entry || typeof entry.slug !== "string" || !entry.slug) {
    return null;
  }

  if (typeof entry.visibility === "string" && entry.visibility !== "list") {
    return null;
  }

  return {
    provider: "openai-codex",
    id: entry.slug,
    name: typeof entry.display_name === "string" && entry.display_name ? entry.display_name : entry.slug,
    input: normalizeInputModalities(entry.input_modalities),
    source: "codex-cache",
  };
}

function dedupeModels(models: readonly ModelInfo[]): ModelInfo[] {
  const seen = new Set<string>();
  const next: ModelInfo[] = [];

  for (const model of models) {
    if (seen.has(model.id)) {
      continue;
    }
    seen.add(model.id);
    next.push(model);
  }

  return next;
}

export async function getCodexModelCatalog(): Promise<{
  models: ModelInfo[];
  catalog: ModelCatalogInfo;
}> {
  const cachePath = getCodexModelsCachePath();

  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as CodexModelsCacheFile;
    const models = dedupeModels((parsed.models ?? []).map(normalizeCodexCacheEntry).filter(Boolean) as ModelInfo[]);
    if (models.length > 0) {
      return {
        models,
        catalog: {
          source: "codex-cache",
          cachePath,
          fetchedAt: parsed.fetched_at,
          modelCount: models.length,
        },
      };
    }
  } catch {
    // Fall back to the built-in catalog when the local Codex cache is absent or unreadable.
  }

  return {
    models: CODEX_MODEL_INFOS,
    catalog: {
      source: "static-fallback",
      cachePath,
      modelCount: CODEX_MODEL_INFOS.length,
    },
  };
}

export async function hasCodexModel(model: string): Promise<boolean> {
  const { models } = await getCodexModelCatalog();
  return models.some((item) => item.id === model);
}

export async function getPreferredCodexModel(): Promise<string> {
  const { models } = await getCodexModelCatalog();
  if (models.some((item) => item.id === DEFAULT_CODEX_MODEL)) {
    return DEFAULT_CODEX_MODEL;
  }
  return models[0]?.id ?? DEFAULT_CODEX_MODEL;
}

export function isSupportedCodexModel(model: string): model is SupportedCodexModel {
  return SUPPORTED_CODEX_MODELS.includes(model as SupportedCodexModel);
}
