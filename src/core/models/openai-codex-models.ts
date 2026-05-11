import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelCatalogInfo, ModelInfo, OAuthProfile } from "../types.js";
import { requestText } from "../providers/http-client.js";

export const DEFAULT_CODEX_MODEL = "gpt-5.4";
const CODEX_MODELS_URL = process.env.CODEX_MODELS_URL || "https://chatgpt.com/backend-api/codex/models";
const CODEX_MODELS_REFRESH_TIMEOUT_MS = 60_000;
const DEFAULT_CODEX_MODELS_CLIENT_VERSION = "0.130.0";

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
  etag?: string;
  client_version?: string;
  models?: CodexModelsCacheEntry[];
  [key: string]: unknown;
};

type CodexModelsCacheEntry = {
  slug?: string;
  display_name?: string;
  input_modalities?: string[];
  visibility?: string;
  [key: string]: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeNetworkModelsBody(
  value: unknown,
  headers: Record<string, string>,
  clientVersion: string,
): CodexModelsCacheFile {
  const body = isRecord(value) ? value : {};
  const rawModels = Array.isArray(value)
    ? value
    : Array.isArray(body.models)
      ? body.models
      : Array.isArray(body.data)
        ? body.data
        : null;

  if (!rawModels) {
    throw new Error("Codex 模型列表响应缺少 models 字段。");
  }

  const models = rawModels.filter(isRecord) as CodexModelsCacheEntry[];
  const cache: CodexModelsCacheFile = {
    ...body,
    fetched_at: typeof body.fetched_at === "string" ? body.fetched_at : new Date().toISOString(),
    client_version: typeof body.client_version === "string" ? body.client_version : clientVersion,
    models,
  };

  const responseEtag = headers.etag;
  if (!cache.etag && responseEtag) {
    cache.etag = responseEtag;
  }

  return cache;
}

async function getCodexModelsClientVersion(cachePath: string): Promise<string> {
  const override = process.env.CODEX_MODELS_CLIENT_VERSION?.trim();
  if (override) {
    return override;
  }

  try {
    const parsed = JSON.parse(await fs.readFile(cachePath, "utf8")) as CodexModelsCacheFile;
    if (typeof parsed.client_version === "string" && parsed.client_version.trim()) {
      return parsed.client_version.trim();
    }
  } catch {
    // A missing or unreadable cache should not prevent network refresh.
  }

  return DEFAULT_CODEX_MODELS_CLIENT_VERSION;
}

function buildCodexModelsUrl(clientVersion: string): string {
  const url = new URL(CODEX_MODELS_URL);
  if (!url.searchParams.has("client_version")) {
    url.searchParams.set("client_version", clientVersion);
  }
  return url.toString();
}

function buildCodexModelsRequestHeaders(profile: OAuthProfile): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${profile.access}`,
    "ChatGPT-Account-Id": profile.accountId,
    "OpenAI-Beta": "responses=experimental",
    Originator: "pi",
    "User-Agent": "pi (bun demo)",
  };
}

function createCodexModelsError(status: number, transport: "fetch" | "curl", body: string): Error {
  const preview = body.trim().slice(0, 1000);
  const error = new Error(`同步 Codex 模型失败: HTTP ${status} via ${transport}${preview ? ` ${preview}` : ""}`) as Error & {
    upstreamStatus?: number;
    upstreamErrorMessage?: string;
  };
  error.upstreamStatus = status;
  error.upstreamErrorMessage = preview;
  return error;
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

export async function refreshCodexModelCatalogFromNetwork(profile: OAuthProfile): Promise<{
  models: ModelInfo[];
  catalog: ModelCatalogInfo;
}> {
  const cachePath = getCodexModelsCachePath();
  const clientVersion = await getCodexModelsClientVersion(cachePath);
  const response = await requestText({
    method: "GET",
    url: buildCodexModelsUrl(clientVersion),
    headers: buildCodexModelsRequestHeaders(profile),
    timeoutMs: CODEX_MODELS_REFRESH_TIMEOUT_MS,
  });

  if (response.status < 200 || response.status >= 300) {
    throw createCodexModelsError(response.status, response.transport, response.body);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    throw new Error("同步 Codex 模型失败: 上游返回的模型列表不是有效 JSON。");
  }

  const cache = normalizeNetworkModelsBody(parsed, response.headers, clientVersion);
  const models = dedupeModels((cache.models ?? []).map(normalizeCodexCacheEntry).filter(Boolean) as ModelInfo[]);
  if (models.length === 0) {
    throw new Error("同步 Codex 模型失败: 上游模型列表为空或没有可展示模型。");
  }

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");

  const networkModels = models.map((model) => ({
    ...model,
    source: "codex-network" as const,
  }));

  return {
    models: networkModels,
    catalog: {
      source: "codex-network",
      cachePath,
      fetchedAt: cache.fetched_at,
      modelCount: networkModels.length,
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
