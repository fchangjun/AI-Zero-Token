import { isReasoningEffort, type ReasoningEffort } from "../models/reasoning-effort.js";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { OAuthProfile } from "../types.js";
import { getStateDir } from "./state-paths.js";

const execFileAsync = promisify(execFile);

type CodexAuthFile = {
  auth_mode: "chatgpt";
  OPENAI_API_KEY: null;
  tokens: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
  };
  last_refresh: string;
};

export type CodexGatewayProviderStatus = {
  path: string;
  providerId: string;
  exists: boolean;
  active: boolean;
  baseUrl?: string;
  model?: string;
  modelCatalogPath?: string;
  modelProvider?: string;
  managedByAiZeroToken?: boolean;
  authType?: "none" | "bearer_token" | "env_key";
  envKey?: string;
  catalogModels?: CodexCatalogModelInput[];
};

export type CodexAuthStatus = {
  path: string;
  exists: boolean;
  accountId?: string;
  hasIdToken: boolean;
  lastRefresh?: string;
  gatewayProvider: CodexGatewayProviderStatus;
  savedExternalProvider?: CodexGatewayProviderStatus;
};

export type ApplyCodexAuthResult = CodexAuthStatus & {
  backupPath?: string;
  appliedProfileId: string;
  appliedEmail?: string;
};

export type ApplyCodexGatewayProviderResult = {
  path: string;
  backupPath?: string;
  providerId: string;
  baseUrl: string;
  model?: string;
  modelCatalogPath?: string;
  modelCatalogBackupPath?: string;
  modelCatalogCount?: number;
  kind: "codex_gateway" | "openai_compatible";
  authType: "none" | "bearer_token" | "env_key";
  historyMigration?: CodexHistoryMigrationResult;
};

export type CodexCatalogModelInput = {
  id: string;
  displayName?: string;
  contextWindow?: number;
  reasoningEfforts?: ReasoningEffort[];
  inputModalities?: Array<"text" | "image">;
};

export type CodexHistoryMigrationResult = {
  path: string;
  backupPath?: string;
  migratedCount: number;
  rolloutPatchedCount?: number;
  rolloutPatchErrors?: string[];
  skipped?: boolean;
  error?: string;
};

export type RemoveCodexGatewayProviderResult = {
  path: string;
  backupPath?: string;
  providerId: string;
  removed: boolean;
  providerDefinitionRetained?: boolean;
  credentialsRetained?: boolean;
};

export function getCodexHomeDir(): string {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

const OPENAI_CODEX_PROVIDER_ID = "openai";
const LEGACY_CODEX_PROVIDER_ID = "ai-zero-token";
const DEFAULT_CODEX_PROVIDER_ID = OPENAI_CODEX_PROVIDER_ID;
export const ACTIVE_CODEX_PROVIDER_ID = "azt_active";
const MANAGED_MODEL_MARKER_PREFIX = "# AI Zero Token managed Codex model ";
const MANAGED_PROVIDER_MARKER_PREFIX = "# AI Zero Token managed Codex provider state ";
const MANAGED_CATALOG_MARKER_PREFIX = "# AI Zero Token managed Codex model catalog ";
const MANAGED_CATALOG_RELATIVE_PATH = path.join("model-catalogs", "ai-zero-token-models.json");
const CONFIG_MUTATION_LOCK = ".ai-zero-token-config.lock";
const CONFIG_MUTATION_TRANSITION = "transition.json";
const CONFIG_MUTATION_LOCK_TIMEOUT_MS = 30_000;
const CONFIG_MUTATION_LOCK_STALE_MS = 120_000;
const FALLBACK_CODEX_INSTRUCTIONS = [
  "You are Codex, a coding agent. Work directly in the user's workspace and continue until the requested outcome is genuinely handled.",
  "Use the available tools when useful, preserve unrelated user changes, and communicate important progress and results clearly.",
].join("\n\n");

export function getCodexAuthPath(): string {
  return path.join(getCodexHomeDir(), "auth.json");
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHomeDir(), "config.toml");
}

function getCodexStateDbPath(): string {
  return path.join(getCodexHomeDir(), "state_5.sqlite");
}

function createBackupSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function validateProviderId(providerId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(providerId)) {
    throw new Error("Codex providerId 只能包含字母、数字、下划线和短横线。");
  }
}

function validateModelId(model: string): void {
  if (!model || model.length > 256 || /[\u0000-\u001f\u007f]/.test(model)) {
    throw new Error("Codex 模型 ID 格式错误。");
  }
}

function urlsHaveSameProviderBase(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    const normalizePath = (value: string) => value.replace(/\/+$/g, "") || "/";
    return leftUrl.origin === rightUrl.origin && normalizePath(leftUrl.pathname) === normalizePath(rightUrl.pathname);
  } catch {
    return false;
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT";
}

function sqliteQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runSqlite(dbPath: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync("sqlite3", [dbPath, sql], {
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

function resolveCodexSessionPath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(getCodexHomeDir(), value);
}

function parseLegacyHistoryThreadRows(raw: string): Array<{ id: string; rolloutPath: string }> {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf("\t");
      if (separator === -1) {
        return null;
      }

      const id = line.slice(0, separator).trim();
      const rolloutPath = line.slice(separator + 1).trim();
      return id && rolloutPath ? { id, rolloutPath } : null;
    })
    .filter((item): item is { id: string; rolloutPath: string } => Boolean(item));
}

async function patchSessionRolloutProvider(
  rolloutPath: string,
  backupSuffix: string,
  fromProvider: string,
  toProvider: string,
): Promise<boolean> {
  const targetPath = resolveCodexSessionPath(rolloutPath);
  let raw = "";
  try {
    raw = await fs.readFile(targetPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT") {
      return false;
    }
    throw error;
  }

  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = raw.endsWith("\n");
  const lines = raw.replace(/\r?\n$/u, "").split(/\r?\n/u);
  let changed = false;

  for (let index = 0; index < Math.min(lines.length, 20); index += 1) {
    try {
      const parsed = JSON.parse(lines[index] ?? "") as unknown;
      if (!isRecord(parsed) || parsed.type !== "session_meta" || !isRecord(parsed.payload)) {
        continue;
      }

      if (parsed.payload.model_provider !== fromProvider) {
        return false;
      }

      parsed.payload.model_provider = toProvider;
      lines[index] = JSON.stringify(parsed);
      changed = true;
      break;
    } catch {
      continue;
    }
  }

  if (!changed) {
    return false;
  }

  await fs.copyFile(targetPath, `${targetPath}.azt-backup-${backupSuffix}`);
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, `${lines.join(newline)}${trailingNewline ? newline : ""}`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmpPath, targetPath);
  return true;
}

async function migrateLegacyCodexHistoryProvider(): Promise<CodexHistoryMigrationResult> {
  const dbPath = getCodexStateDbPath();
  if (!(await fileExists(dbPath))) {
    return {
      path: dbPath,
      migratedCount: 0,
      skipped: true,
    };
  }

  try {
    const rowsRaw = await runSqlite(
      dbPath,
      `select id || char(9) || rollout_path from threads where model_provider=${sqliteQuote(LEGACY_CODEX_PROVIDER_ID)};`,
    );
    const legacyThreads = parseLegacyHistoryThreadRows(rowsRaw);
    if (legacyThreads.length <= 0) {
      return {
        path: dbPath,
        migratedCount: 0,
        skipped: true,
      };
    }

    const backupSuffix = createBackupSuffix();
    const backupPath = `${dbPath}.azt-backup-${backupSuffix}`;
    await runSqlite(dbPath, `.backup ${sqliteQuote(backupPath)}`);

    let rolloutPatchedCount = 0;
    const rolloutPatchErrors: string[] = [];
    for (const thread of legacyThreads) {
      try {
        if (await patchSessionRolloutProvider(thread.rolloutPath, backupSuffix, LEGACY_CODEX_PROVIDER_ID, OPENAI_CODEX_PROVIDER_ID)) {
          rolloutPatchedCount += 1;
        }
      } catch (error) {
        rolloutPatchErrors.push(`${thread.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await runSqlite(
      dbPath,
      `update threads set model_provider=${sqliteQuote(OPENAI_CODEX_PROVIDER_ID)} where model_provider=${sqliteQuote(LEGACY_CODEX_PROVIDER_ID)};`,
    );
    return {
      path: dbPath,
      backupPath,
      migratedCount: legacyThreads.length,
      rolloutPatchedCount,
      rolloutPatchErrors: rolloutPatchErrors.length ? rolloutPatchErrors.slice(0, 20) : undefined,
    };
  } catch (error) {
    return {
      path: dbPath,
      migratedCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeCodexProviderBaseUrl(value: string, kind: "codex_gateway" | "openai_compatible" = "codex_gateway"): string {
  let normalized = value.trim();
  if (!normalized) {
    throw new Error("Codex provider base_url 不能为空。");
  }

  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Codex provider base_url 格式错误，请填写完整的 http(s) URL。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Codex provider base_url 必须是 http(s) URL。");
  }

  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/g, "");

  if (kind === "openai_compatible") {
    if (!path || path === "/") {
      url.pathname = "/v1";
    } else {
      url.pathname = path;
    }
  } else if (!path || path === "/") {
    url.pathname = "/codex/v1";
  } else if (path === "/v1") {
    url.pathname = "/codex/v1";
  } else if (path.endsWith("/codex")) {
    url.pathname = `${path}/v1`;
  } else {
    url.pathname = path;
  }

  return url.toString().replace(/\/+$/g, "");
}

function parseTomlStringValue(value: string): string | undefined {
  const trimmed = value.trim().replace(/\s+#.*$/g, "");
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function findFirstTableLine(lines: string[]): number {
  const index = lines.findIndex((line) => /^\s*\[/.test(line));
  return index === -1 ? lines.length : index;
}

export function parseRootString(raw: string, key: string): string | undefined {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+)$`);

  for (let index = 0; index < firstTableLine; index += 1) {
    const match = keyPattern.exec(lines[index] ?? "");
    if (match) {
      return parseTomlStringValue(match[1] ?? "");
    }
  }

  return undefined;
}

function parseRootModelProvider(raw: string): string | undefined {
  return parseRootString(raw, "model_provider");
}

function parseRootModel(raw: string): string | undefined {
  return parseRootString(raw, "model");
}

function parseGatewayProviderTable(raw: string, providerId: string): {
  exists: boolean;
  baseUrl?: string;
  bearerToken?: string;
  envKey?: string;
  authType?: "none" | "bearer_token" | "env_key";
} {
  const lines = raw.split(/\r?\n/);
  const tablePattern = new RegExp(`^\\s*\\[\\s*model_providers\\.${escapeRegExp(providerId)}\\s*\\]\\s*$`);
  const start = lines.findIndex((line) => tablePattern.test(line));
  if (start === -1) {
    return { exists: false };
  }

  let baseUrl: string | undefined;
  let bearerToken: string | undefined;
  let envKey: string | undefined;
  for (let index = start + 1; index < lines.length && !/^\s*\[/.test(lines[index] ?? ""); index += 1) {
    const match = /^\s*(base_url|experimental_bearer_token|env_key)\s*=\s*(.+)$/.exec(lines[index] ?? "");
    if (!match) {
      continue;
    }

    const parsed = parseTomlStringValue(match[2] ?? "");
    if (match[1] === "base_url") {
      baseUrl = parsed;
    } else if (match[1] === "experimental_bearer_token") {
      bearerToken = parsed;
    } else if (match[1] === "env_key") {
      envKey = parsed;
    }
  }

  return {
    exists: true,
    baseUrl,
    bearerToken,
    envKey,
    authType: bearerToken ? "bearer_token" : envKey ? "env_key" : "none",
  };
}

function upsertRootString(raw: string, key: string, value: string): string {
  if (!raw.trim()) {
    return `${key} = ${formatTomlString(value)}\n`;
  }

  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  const nextLine = `${key} = ${formatTomlString(value)}`;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);

  for (let index = 0; index < firstTableLine; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = nextLine;
      return lines.join("\n");
    }
  }

  lines.splice(firstTableLine, 0, nextLine, "");
  return lines.join("\n");
}

function upsertRootModelProvider(raw: string, providerId: string): string {
  return upsertRootString(raw, "model_provider", providerId);
}

type ManagedProviderMarker = {
  managed: string;
  previous?: string;
};

function parseManagedProviderMarker(raw: string): ManagedProviderMarker | undefined {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  for (let index = 0; index < firstTableLine; index += 1) {
    const line = lines[index]?.trim();
    if (!line?.startsWith(MANAGED_PROVIDER_MARKER_PREFIX)) {
      continue;
    }
    try {
      const encoded = line.slice(MANAGED_PROVIDER_MARKER_PREFIX.length).trim();
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
      if (!isRecord(parsed) || typeof parsed.managed !== "string") {
        return undefined;
      }
      return {
        managed: parsed.managed,
        previous: typeof parsed.previous === "string" ? parsed.previous : undefined,
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function removeManagedProviderMarker(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  for (let index = 0; index < firstTableLine; index += 1) {
    if (lines[index]?.trim().startsWith(MANAGED_PROVIDER_MARKER_PREFIX)) {
      lines.splice(index, 1);
      break;
    }
  }
  return lines.join("\n");
}

function upsertManagedRootProvider(raw: string, providerId: string): string {
  const marker = parseManagedProviderMarker(raw);
  const currentProvider = parseRootModelProvider(raw);
  const previous = marker && currentProvider === marker.managed ? marker.previous : currentProvider;
  const withoutMarker = removeManagedProviderMarker(raw);
  const withProvider = upsertRootModelProvider(withoutMarker, providerId);
  const payload = Buffer.from(JSON.stringify({ managed: providerId, previous }), "utf8").toString("base64url");
  const lines = withProvider.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  const providerLine = lines.slice(0, firstTableLine).findIndex((line) => /^\s*model_provider\s*=/.test(line));
  lines.splice(providerLine === -1 ? firstTableLine : providerLine, 0, `${MANAGED_PROVIDER_MARKER_PREFIX}${payload}`);
  return lines.join("\n");
}

function restoreManagedRootProvider(raw: string): { raw: string; restored: boolean } {
  const marker = parseManagedProviderMarker(raw);
  if (!marker) {
    return { raw, restored: false };
  }
  const currentProvider = parseRootModelProvider(raw);
  let next = removeManagedProviderMarker(raw);
  if (currentProvider !== marker.managed) {
    return { raw: next, restored: false };
  }
  next = marker.previous
    ? upsertRootModelProvider(next, marker.previous)
    : removeRootString(next, "model_provider", marker.managed).raw;
  return { raw: next, restored: true };
}

function upsertRootModel(raw: string, model: string): string {
  return upsertRootString(raw, "model", model);
}

type ManagedModelMarker = {
  managed: string;
  previous?: string;
};

function parseManagedModelMarker(raw: string): ManagedModelMarker | undefined {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  for (let index = 0; index < firstTableLine; index += 1) {
    const line = lines[index]?.trim();
    if (!line?.startsWith(MANAGED_MODEL_MARKER_PREFIX)) {
      continue;
    }
    try {
      const encoded = line.slice(MANAGED_MODEL_MARKER_PREFIX.length).trim();
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
      if (!isRecord(parsed) || typeof parsed.managed !== "string") {
        return undefined;
      }
      return {
        managed: parsed.managed,
        previous: typeof parsed.previous === "string" ? parsed.previous : undefined,
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function removeManagedModelMarker(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  for (let index = 0; index < firstTableLine; index += 1) {
    if (lines[index]?.trim().startsWith(MANAGED_MODEL_MARKER_PREFIX)) {
      lines.splice(index, 1);
      break;
    }
  }
  return lines.join("\n");
}

function upsertManagedRootModel(raw: string, model: string): string {
  const marker = parseManagedModelMarker(raw);
  const currentModel = parseRootModel(raw);
  const previous = marker && currentModel === marker.managed ? marker.previous : currentModel;
  const withoutMarker = removeManagedModelMarker(raw);
  const withModel = upsertRootModel(withoutMarker, model);
  const payload = Buffer.from(JSON.stringify({ managed: model, previous }), "utf8").toString("base64url");
  const lines = withModel.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  const modelLine = lines.slice(0, firstTableLine).findIndex((line) => /^\s*model\s*=/.test(line));
  lines.splice(modelLine === -1 ? firstTableLine : modelLine, 0, `${MANAGED_MODEL_MARKER_PREFIX}${payload}`);
  return lines.join("\n");
}

function restoreManagedRootModel(raw: string): { raw: string; restored: boolean } {
  const marker = parseManagedModelMarker(raw);
  if (!marker) {
    return { raw, restored: false };
  }
  const currentModel = parseRootModel(raw);
  let next = removeManagedModelMarker(raw);
  if (currentModel !== marker.managed) {
    return { raw: next, restored: false };
  }
  next = marker.previous
    ? upsertRootModel(next, marker.previous)
    : removeRootString(next, "model", marker.managed).raw;
  return { raw: next, restored: true };
}

type ManagedCatalogMarker = {
  managed: string;
  previous?: string;
};

function parseRootModelCatalogPath(raw: string): string | undefined {
  return parseRootString(raw, "model_catalog_json");
}

function parseManagedCatalogMarker(raw: string): ManagedCatalogMarker | undefined {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  for (let index = 0; index < firstTableLine; index += 1) {
    const line = lines[index]?.trim();
    if (!line?.startsWith(MANAGED_CATALOG_MARKER_PREFIX)) {
      continue;
    }
    try {
      const encoded = line.slice(MANAGED_CATALOG_MARKER_PREFIX.length).trim();
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
      if (!isRecord(parsed) || typeof parsed.managed !== "string") {
        return undefined;
      }
      return {
        managed: parsed.managed,
        previous: typeof parsed.previous === "string" ? parsed.previous : undefined,
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function removeManagedCatalogMarker(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  for (let index = 0; index < firstTableLine; index += 1) {
    if (lines[index]?.trim().startsWith(MANAGED_CATALOG_MARKER_PREFIX)) {
      lines.splice(index, 1);
      break;
    }
  }
  return lines.join("\n");
}

function upsertManagedRootModelCatalog(raw: string, catalogPath: string): string {
  const marker = parseManagedCatalogMarker(raw);
  const currentCatalogPath = parseRootModelCatalogPath(raw);
  const previous = marker && currentCatalogPath === marker.managed ? marker.previous : currentCatalogPath;
  const withoutMarker = removeManagedCatalogMarker(raw);
  const withCatalog = upsertRootString(withoutMarker, "model_catalog_json", catalogPath);
  const payload = Buffer.from(JSON.stringify({ managed: catalogPath, previous }), "utf8").toString("base64url");
  const lines = withCatalog.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  const catalogLine = lines.slice(0, firstTableLine).findIndex((line) => /^\s*model_catalog_json\s*=/.test(line));
  lines.splice(catalogLine === -1 ? firstTableLine : catalogLine, 0, `${MANAGED_CATALOG_MARKER_PREFIX}${payload}`);
  return lines.join("\n");
}

function restoreManagedRootModelCatalog(raw: string): { raw: string; restored: boolean } {
  const marker = parseManagedCatalogMarker(raw);
  if (!marker) {
    return { raw, restored: false };
  }
  const currentCatalogPath = parseRootModelCatalogPath(raw);
  let next = removeManagedCatalogMarker(raw);
  if (currentCatalogPath !== marker.managed) {
    return { raw: next, restored: false };
  }
  next = marker.previous
    ? upsertRootString(next, "model_catalog_json", marker.previous)
    : removeRootString(next, "model_catalog_json", marker.managed).raw;
  return { raw: next, restored: true };
}

function buildGatewayProviderBlock(
  providerId: string,
  baseUrl: string,
  options?: {
    displayName?: string;
    bearerToken?: string;
    envKey?: string;
  },
): string[] {
  const block = [
    "# AI Zero Token managed Codex provider",
    `[model_providers.${providerId}]`,
    `name = ${formatTomlString(options?.displayName || "AI Zero Token")}`,
    `base_url = ${formatTomlString(baseUrl)}`,
    'wire_api = "responses"',
    "supports_websockets = false",
  ];

  if (options?.bearerToken) {
    block.push(`experimental_bearer_token = ${formatTomlString(options.bearerToken)}`);
  } else if (options?.envKey) {
    block.push(`env_key = ${formatTomlString(options.envKey)}`);
  }

  return block;
}

function upsertGatewayProviderTable(
  raw: string,
  providerId: string,
  baseUrl: string,
  options?: {
    displayName?: string;
    bearerToken?: string;
    envKey?: string;
  },
): string {
  const lines = raw.split(/\r?\n/);
  const tablePattern = new RegExp(`^\\s*\\[\\s*model_providers\\.${escapeRegExp(providerId)}\\s*\\]\\s*$`);
  const start = lines.findIndex((line) => tablePattern.test(line));
  const block = buildGatewayProviderBlock(providerId, baseUrl, options);

  if (start === -1) {
    const trimmed = raw.replace(/\s+$/g, "");
    return `${trimmed}${trimmed ? "\n\n" : ""}${block.join("\n")}\n`;
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) {
    end += 1;
  }

  const replaceStart = start > 0 && /AI Zero Token managed Codex provider/.test(lines[start - 1])
    ? start - 1
    : start;
  lines.splice(replaceStart, end - replaceStart, ...block, "");
  return lines.join("\n").replace(/\s+$/g, "\n");
}

function applyGatewayProviderConfig(
  raw: string,
  providerId: string,
  baseUrl: string,
  options?: {
    displayName?: string;
    bearerToken?: string;
    envKey?: string;
    model?: string;
  },
): string {
  const managedProviderRaw = upsertManagedRootProvider(raw, providerId);
  const withProvider = upsertRootModelProvider(managedProviderRaw, providerId);
  const withModel = options?.model
    ? upsertManagedRootModel(withProvider, options.model)
    : restoreManagedRootModel(withProvider).raw;
  return upsertGatewayProviderTable(withModel, providerId, baseUrl, options);
}

function applyOpenAIGatewayConfig(raw: string, baseUrl: string, model?: string): string {
  const managedProviderRaw = upsertManagedRootProvider(raw, OPENAI_CODEX_PROVIDER_ID);
  const withProvider = upsertRootString(
    upsertRootModelProvider(managedProviderRaw, OPENAI_CODEX_PROVIDER_ID),
    "openai_base_url",
    baseUrl,
  );
  return model ? upsertManagedRootModel(withProvider, model) : restoreManagedRootModel(withProvider).raw;
}

function removeRootString(raw: string, key: string, expectedValue?: string): { raw: string; removed: boolean } {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+)$`);

  for (let index = 0; index < firstTableLine; index += 1) {
    const match = keyPattern.exec(lines[index] ?? "");
    if (!match) {
      continue;
    }

    if (typeof expectedValue === "string" && parseTomlStringValue(match[1] ?? "") !== expectedValue) {
      continue;
    }

    lines.splice(index, 1);
    if (lines[index] === "" && (index === 0 || lines[index - 1] === "")) {
      lines.splice(index, 1);
    }
    return { raw: lines.join("\n").replace(/^\s+\n/g, ""), removed: true };
  }

  return { raw, removed: false };
}

function removeRootModelProvider(raw: string, providerId: string): { raw: string; removed: boolean } {
  return removeRootString(raw, "model_provider", providerId);
}

function removeGatewayProviderTable(raw: string, providerId: string): { raw: string; removed: boolean } {
  const lines = raw.split(/\r?\n/);
  const tablePattern = new RegExp(`^\\s*\\[\\s*model_providers\\.${escapeRegExp(providerId)}\\s*\\]\\s*$`);
  const start = lines.findIndex((line) => tablePattern.test(line));
  if (start === -1) {
    return { raw, removed: false };
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) {
    end += 1;
  }

  const replaceStart = start > 0 && /AI Zero Token managed Codex provider/.test(lines[start - 1])
    ? start - 1
    : start;
  lines.splice(replaceStart, end - replaceStart);
  return {
    raw: lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "\n"),
    removed: true,
  };
}

function removeGatewayProviderConfig(raw: string, providerId: string): { raw: string; removed: boolean } {
  const rootRemoved = removeRootModelProvider(raw, providerId);
  const tableRemoved = removeGatewayProviderTable(rootRemoved.raw, providerId);
  return {
    raw: tableRemoved.raw,
    removed: rootRemoved.removed || tableRemoved.removed,
  };
}

function removeOpenAIGatewayConfig(raw: string): { raw: string; removed: boolean } {
  const openAIBaseRemoved = removeRootString(raw, "openai_base_url");
  const openAIProviderRemoved = removeRootModelProvider(openAIBaseRemoved.raw, OPENAI_CODEX_PROVIDER_ID);
  return {
    raw: openAIProviderRemoved.raw,
    removed: openAIBaseRemoved.removed || openAIProviderRemoved.removed,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readCodexAuth(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(getCodexAuthPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getCodexAccountId(profile: OAuthProfile): string | undefined {
  return profile.codexAccountId ?? (!profile.accountIdSource ? profile.accountId : undefined);
}

function formatCodexModelDisplayName(modelId: string): string {
  const knownWords: Record<string, string> = {
    claude: "Claude",
    code: "Code",
    deepseek: "DeepSeek",
    flash: "Flash",
    gemini: "Gemini",
    glm: "GLM",
    gpt: "GPT",
    grok: "Grok",
    kimi: "Kimi",
    luna: "Luna",
    minimax: "MiniMax",
    pro: "Pro",
    qwen: "Qwen",
    sol: "Sol",
    terra: "Terra",
    astra: "Astra",
  };
  return modelId
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((word) => {
      const known = knownWords[word.toLowerCase()];
      if (known) {
        return known;
      }
      if (/^v\d/i.test(word)) {
        return `V${word.slice(1)}`;
      }
      return /^[a-z]+$/i.test(word) ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : word;
    })
    .join(" ");
}

function normalizeCodexCatalogModels(
  models: readonly CodexCatalogModelInput[] | undefined,
  selectedModel: string | undefined,
): CodexCatalogModelInput[] {
  const normalized: CodexCatalogModelInput[] = [];
  const seen = new Set<string>();
  const candidates = [...(models ?? [])];

  for (const candidate of candidates) {
    const id = candidate.id.trim();
    validateModelId(id);
    const displayName = candidate.displayName?.trim();
    if (displayName && (displayName.length > 256 || /[\u0000-\u001f\u007f]/.test(displayName))) {
      throw new Error(`Codex 模型 ${id} 的显示名称格式错误。`);
    }
    const contextWindow = candidate.contextWindow;
    if (typeof contextWindow !== "undefined" && (!Number.isInteger(contextWindow) || contextWindow < 1 || contextWindow > 4_000_000)) {
      throw new Error(`Codex 模型 ${id} 的上下文长度格式错误。`);
    }
    const reasoningEfforts = candidate.reasoningEfforts
      ? [...new Set(candidate.reasoningEfforts)]
      : undefined;
    const inputModalities = candidate.inputModalities
      ? [...new Set(candidate.inputModalities)]
      : undefined;
    const next = {
      id,
      ...(displayName ? { displayName } : {}),
      ...(contextWindow ? { contextWindow } : {}),
      ...(reasoningEfforts ? { reasoningEfforts } : {}),
      ...(inputModalities?.length ? { inputModalities } : {}),
    };
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(next);
  }

  if (selectedModel && !normalized.some((candidate) => candidate.id === selectedModel)) {
    normalized.unshift({ id: selectedModel });
  }

  return normalized;
}

function extractInstructionsFromCatalogEntry(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.base_instructions === "string" && value.base_instructions.trim()) {
    return value.base_instructions;
  }
  const messages = isRecord(value.model_messages) ? value.model_messages : undefined;
  return typeof messages?.instructions_template === "string" && messages.instructions_template.trim()
    ? messages.instructions_template
    : undefined;
}

async function loadCodexCatalogInstructions(selectedModel: string | undefined): Promise<string> {
  const cachePath = process.env.CODEX_MODELS_CACHE_PATH?.trim() || path.join(getCodexHomeDir(), "models_cache.json");
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath, "utf8")) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.models)) {
      return FALLBACK_CODEX_INSTRUCTIONS;
    }
    const entries = parsed.models.filter(isRecord);
    const selected = selectedModel
      ? entries.find((entry) => entry.slug === selectedModel)
      : undefined;
    for (const entry of selected ? [selected, ...entries] : entries) {
      const instructions = extractInstructionsFromCatalogEntry(entry);
      if (instructions) {
        return instructions;
      }
    }
  } catch {
    // A missing or stale official cache should not block a managed custom catalog.
  }
  return FALLBACK_CODEX_INSTRUCTIONS;
}

function buildCodexCatalogEntry(
  model: CodexCatalogModelInput,
  priority: number,
  baseInstructions: string,
): Record<string, unknown> {
  const contextWindow = model.contextWindow ?? 128_000;
  const reasoningDescriptions: Record<ReasoningEffort, string> = {
    none: "No reasoning",
    minimal: "Minimal reasoning for the fastest responses",
    low: "Fast responses with lighter reasoning",
    medium: "Balanced speed and reasoning",
    high: "Deeper reasoning",
    xhigh: "Extra deep reasoning",
    max: "Maximum reasoning",
  };
  const reasoningEfforts = model.reasoningEfforts ?? [];
  return {
    slug: model.id,
    display_name: model.displayName || formatCodexModelDisplayName(model.id),
    description: "User-selected API model configured by AI Zero Token.",
    ...(reasoningEfforts.length > 0 ? { default_reasoning_level: reasoningEfforts.includes("medium") ? "medium" : reasoningEfforts[0] } : {}),
    supported_reasoning_levels: reasoningEfforts.map((effort) => ({ effort, description: reasoningDescriptions[effort] })),
    shell_type: "unified_exec",
    visibility: "list",
    supported_in_api: true,
    priority,
    additional_speed_tiers: [],
    service_tiers: [],
    availability_nux: null,
    upgrade: null,
    include_skills_usage_instructions: true,
    include_plugin_usage_instructions: true,
    include_apps_usage_instructions: true,
    supports_reasoning_summary_parameter: false,
    default_reasoning_summary: "none",
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: null,
    web_search_tool_type: "text",
    truncation_policy: { mode: "bytes", limit: 10_000 },
    supports_image_detail_original: false,
    context_window: contextWindow,
    max_context_window: contextWindow,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: model.inputModalities?.length ? model.inputModalities : ["text"],
    supports_search_tool: false,
    supports_experimental_context: false,
    use_responses_lite: false,
    node_repl_auto_review_required: false,
    node_repl_disabled: false,
    base_instructions: baseInstructions,
  };
}

async function writeManagedCodexModelCatalog(
  models: readonly CodexCatalogModelInput[],
  selectedModel: string | undefined,
): Promise<{ path: string; backupPath?: string; count: number }> {
  if (models.length === 0) {
    throw new Error("没有可写入 Codex 模型目录的已验证模型。");
  }
  const catalogPath = path.join(getCodexHomeDir(), MANAGED_CATALOG_RELATIVE_PATH);
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });

  let backupPath: string | undefined;
  if (await fileExists(catalogPath)) {
    backupPath = `${catalogPath}.azt-backup-${createBackupSuffix()}`;
    await fs.copyFile(catalogPath, backupPath);
  }

  const baseInstructions = await loadCodexCatalogInstructions(selectedModel);
  const payload = {
    models: models.map((model, index) => buildCodexCatalogEntry(model, index, baseInstructions)),
  };
  const tmpPath = `${catalogPath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmpPath, catalogPath);
  await fs.chmod(catalogPath, 0o600);
  return { path: catalogPath, backupPath, count: models.length };
}

async function readManagedCodexModelCatalog(catalogPath: string | undefined): Promise<CodexCatalogModelInput[]> {
  if (!catalogPath || path.resolve(catalogPath) !== path.resolve(path.join(getCodexHomeDir(), MANAGED_CATALOG_RELATIVE_PATH))) {
    return [];
  }
  try {
    const parsed = JSON.parse(await fs.readFile(catalogPath, "utf8")) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.models)) return [];
    const models: CodexCatalogModelInput[] = [];
    for (const item of parsed.models) {
      if (!isRecord(item) || typeof item.slug !== "string") continue;
      const id = item.slug.trim();
      if (!id) continue;
      const displayName = typeof item.display_name === "string" ? item.display_name.trim() : undefined;
      const levels = Array.isArray(item.supported_reasoning_levels)
        ? item.supported_reasoning_levels
          .map((level) => isRecord(level) && typeof level.effort === "string" ? level.effort : undefined)
          .filter(isReasoningEffort)
        : [];
      const inputModalities = Array.isArray(item.input_modalities)
        ? item.input_modalities.filter((modality): modality is "text" | "image" => modality === "text" || modality === "image")
        : [];
      models.push({
        id,
        ...(typeof item.context_window === "number" && Number.isInteger(item.context_window) && item.context_window > 0 && item.context_window <= 4_000_000 ? { contextWindow: item.context_window } : {}),
        ...(displayName ? { displayName } : {}),
        ...(levels.length ? { reasoningEfforts: levels } : {}),
        ...(inputModalities.length ? { inputModalities } : {}),
      });
    }
    return normalizeCodexCatalogModels(models, undefined);
  } catch {
    return [];
  }
}

export async function getCodexGatewayProviderStatus(params?: {
  providerId?: string;
}): Promise<CodexGatewayProviderStatus> {
  const requestedProviderId = params?.providerId?.trim();
  let providerId = requestedProviderId || DEFAULT_CODEX_PROVIDER_ID;
  validateProviderId(providerId);

  const configPath = getCodexConfigPath();
  let raw = "";
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch {
    return {
      path: configPath,
      providerId,
      exists: false,
      active: false,
    };
  }

  const modelProvider = parseRootModelProvider(raw);
  const managedProvider = parseManagedProviderMarker(raw)?.managed;
  if (!requestedProviderId && (modelProvider?.startsWith("azt_external_") || modelProvider === "azt_gateway" || modelProvider === ACTIVE_CODEX_PROVIDER_ID)) providerId = modelProvider;
  const model = parseRootModel(raw);
  const modelCatalogPath = parseRootModelCatalogPath(raw);
  if (providerId === OPENAI_CODEX_PROVIDER_ID) {
    const openAIBaseUrl = parseRootString(raw, "openai_base_url");
    if (openAIBaseUrl && (!modelProvider || modelProvider === OPENAI_CODEX_PROVIDER_ID)) {
      return {
        path: configPath,
        providerId: OPENAI_CODEX_PROVIDER_ID,
        exists: true,
        active: !modelProvider || modelProvider === OPENAI_CODEX_PROVIDER_ID,
        baseUrl: openAIBaseUrl,
        model,
        modelCatalogPath,
        modelProvider,
        managedByAiZeroToken: managedProvider === OPENAI_CODEX_PROVIDER_ID,
        authType: "none",
      };
    }

    const legacyTable = parseGatewayProviderTable(raw, LEGACY_CODEX_PROVIDER_ID);
    if (!requestedProviderId && legacyTable.exists) {
      const catalogModels = await readManagedCodexModelCatalog(modelCatalogPath);
      return {
        path: configPath,
        providerId: LEGACY_CODEX_PROVIDER_ID,
        exists: true,
        active: modelProvider === LEGACY_CODEX_PROVIDER_ID,
        baseUrl: legacyTable.baseUrl,
        model,
        modelCatalogPath,
        modelProvider,
        managedByAiZeroToken: managedProvider === LEGACY_CODEX_PROVIDER_ID,
        authType: legacyTable.authType,
        envKey: legacyTable.envKey,
        ...(catalogModels.length ? { catalogModels } : {}),
      };
    }
  }

  const table = parseGatewayProviderTable(raw, providerId);
  const catalogModels = await readManagedCodexModelCatalog(modelCatalogPath);
  return {
    path: configPath,
    providerId,
    exists: table.exists,
    active: modelProvider === providerId && table.exists,
    baseUrl: table.baseUrl,
    model,
    modelCatalogPath,
    modelProvider,
    managedByAiZeroToken: managedProvider === providerId,
    authType: table.authType,
    envKey: table.envKey,
    ...(catalogModels.length ? { catalogModels } : {}),
  };
}

export async function getCodexAuthStatus(): Promise<CodexAuthStatus> {
  const authPath = getCodexAuthPath();
  const [auth, gatewayProvider, externalProvider] = await Promise.all([
    readCodexAuth(),
    getCodexGatewayProviderStatus(),
    getCodexGatewayProviderStatus({ providerId: LEGACY_CODEX_PROVIDER_ID }),
  ]);
  const savedExternalProvider = externalProvider.exists ? externalProvider : undefined;
  if (!auth) {
    return {
      path: authPath,
      exists: false,
      hasIdToken: false,
      gatewayProvider,
      ...(savedExternalProvider ? { savedExternalProvider } : {}),
    };
  }

  const tokens = isRecord(auth.tokens) ? auth.tokens : {};
  return {
    path: authPath,
    exists: true,
    accountId: typeof tokens.account_id === "string" ? tokens.account_id : undefined,
    hasIdToken: typeof tokens.id_token === "string" && tokens.id_token.length > 0,
    lastRefresh: typeof auth.last_refresh === "string" ? auth.last_refresh : undefined,
    gatewayProvider,
    ...(savedExternalProvider ? { savedExternalProvider } : {}),
  };
}

export async function applyProfileToCodexAuth(profile: OAuthProfile): Promise<ApplyCodexAuthResult> {
  const codexAccountId = getCodexAccountId(profile);
  if (!codexAccountId) {
    throw new Error("当前账号缺少真实 chatgpt_account_id，只能用于网关/API 转发，不能应用到本机 Codex。");
  }

  if (!profile.idToken) {
    throw new Error("当前账号缺少 id_token。请先刷新账号 token 或重新导入包含 id_token 的账号 JSON。");
  }

  const authPath = getCodexAuthPath();
  const codexHomeDir = path.dirname(authPath);
  await fs.mkdir(codexHomeDir, { recursive: true });

  let backupPath: string | undefined;
  try {
    await fs.access(authPath);
    backupPath = `${authPath}.azt-backup-${createBackupSuffix()}`;
    await fs.copyFile(authPath, backupPath);
  } catch {
    backupPath = undefined;
  }

  const authFile: CodexAuthFile = {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: profile.idToken,
      access_token: profile.access,
      refresh_token: profile.refresh,
      account_id: codexAccountId,
    },
    last_refresh: new Date().toISOString(),
  };
  const tmpPath = `${authPath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(authFile, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmpPath, authPath);
  await fs.chmod(authPath, 0o600);

  return {
    path: authPath,
    exists: true,
    accountId: codexAccountId,
    hasIdToken: true,
    lastRefresh: authFile.last_refresh,
    gatewayProvider: await getCodexGatewayProviderStatus(),
    backupPath,
    appliedProfileId: profile.profileId,
    appliedEmail: profile.email,
  };
}

type ApplyProviderConfigParams = {
  baseUrl: string;
  providerId?: string;
  kind?: "codex_gateway" | "openai_compatible";
  bearerToken?: string;
  model?: string;
  catalogModels?: CodexCatalogModelInput[];
  replaceCatalogModels?: boolean;
  displayName?: string;
};

let configMutationQueue: Promise<unknown> = Promise.resolve();

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function reclaimStaleConfigLock(lockPath: string): Promise<boolean> {
  let info: { token?: unknown; pid?: unknown; host?: unknown; createdAt?: unknown } | undefined;
  let ownerRaw = "";
  let age = 0;
  try {
    const [raw, stats] = await Promise.all([
      fs.readFile(path.join(lockPath, "owner.json"), "utf8").catch(() => ""),
      fs.stat(lockPath),
    ]);
    ownerRaw = raw;
    age = Date.now() - stats.mtimeMs;
    if (raw) {
      try { info = JSON.parse(raw) as typeof info; } catch { info = undefined; }
    }
  } catch (error) {
    if (isMissingFileError(error)) return true;
    return false;
  }

  const sameHost = info?.host === os.hostname();
  const pid = typeof info?.pid === "number" && Number.isSafeInteger(info.pid) && info.pid > 0 ? info.pid : undefined;
  const ownerAlive = sameHost && pid !== undefined && processIsAlive(pid);
  const ownerDead = sameHost && pid !== undefined && !ownerAlive;
  if (ownerAlive) return false;
  if (!ownerDead && age < CONFIG_MUTATION_LOCK_STALE_MS) return false;

  // Reclaim and release both take the same transition claim. Without it, two
  // reclaimers can inspect an old lock, then one can accidentally rename the
  // fresh replacement acquired after the other reclaimer removes it.
  const transitionPath = path.join(lockPath, CONFIG_MUTATION_TRANSITION);
  const transitionToken = randomUUID();
  try {
    await fs.writeFile(transitionPath, JSON.stringify({ token: transitionToken, ownerToken: info?.token, pid: process.pid, host: os.hostname() }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }

  const stalePath = `${lockPath}.stale-${randomUUID()}`;
  try {
    const currentOwnerRaw = await fs.readFile(path.join(lockPath, "owner.json"), "utf8").catch((error) => {
      if (isMissingFileError(error)) return "";
      throw error;
    });
    if (currentOwnerRaw !== ownerRaw) {
      const transition = JSON.parse(await fs.readFile(transitionPath, "utf8")) as { token?: unknown };
      if (transition.token === transitionToken) await fs.rm(transitionPath, { force: true });
      return false;
    }
    await fs.rename(lockPath, stalePath);
    await fs.rm(stalePath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return true;
    try {
      const transition = JSON.parse(await fs.readFile(transitionPath, "utf8")) as { token?: unknown };
      if (transition.token === transitionToken) await fs.rm(transitionPath, { force: true });
    } catch { /* The directory may already have been removed. */ }
    return false;
  }
}

async function acquireConfigMutationLock(): Promise<() => Promise<void>> {
  const root = getCodexHomeDir();
  const lockPath = path.join(root, CONFIG_MUTATION_LOCK);
  const token = randomUUID();
  const startedAt = Date.now();
  await fs.mkdir(root, { recursive: true });

  while (true) {
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      try {
        await fs.writeFile(path.join(lockPath, "owner.json"), JSON.stringify({ token, pid: process.pid, host: os.hostname(), createdAt: Date.now() }), { mode: 0o600 });
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      return async () => {
        const transitionToken = randomUUID();
        const transitionPath = path.join(lockPath, CONFIG_MUTATION_TRANSITION);
        const startedAt = Date.now();
        while (true) {
          try {
            await fs.writeFile(transitionPath, JSON.stringify({ token: transitionToken, ownerToken: token, pid: process.pid, host: os.hostname() }), { flag: "wx", mode: 0o600 });
            const owner = JSON.parse(await fs.readFile(path.join(lockPath, "owner.json"), "utf8")) as { token?: unknown };
            if (owner.token === token) await fs.rm(lockPath, { recursive: true, force: true });
            else {
              const transition = JSON.parse(await fs.readFile(transitionPath, "utf8")) as { token?: unknown };
              if (transition.token === transitionToken) await fs.rm(transitionPath, { force: true });
            }
            return;
          } catch (error) {
            if (isMissingFileError(error)) return;
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            if (Date.now() - startedAt >= CONFIG_MUTATION_LOCK_TIMEOUT_MS) {
              throw new Error("Codex 配置锁正在由另一个进程回收，请稍后重试。");
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await reclaimStaleConfigLock(lockPath)) continue;
      if (Date.now() - startedAt >= CONFIG_MUTATION_LOCK_TIMEOUT_MS) {
        throw new Error("Codex 配置正在被另一个 AI Zero Token 进程修改，请稍后重试。");
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
}

/** Keep the managed catalog and config together, including the caller's final store commit. */
export function withCodexProviderConfigTransaction<T>(operation: (config: {
  apply: typeof applyProviderConfig;
  remove: typeof removeProviderConfig;
}) => Promise<T>): Promise<T> {
  return withCodexProviderConfigLock(async () => {
      const paths = [getCodexConfigPath(), path.join(getCodexHomeDir(), MANAGED_CATALOG_RELATIVE_PATH)];
      const snapshots = await Promise.all(paths.map(async (target) => {
        try {
          return { target, content: await fs.readFile(target), mode: (await fs.stat(target)).mode & 0o777 };
        } catch (error) {
          if (!isMissingFileError(error)) throw error;
          return { target, content: undefined, mode: 0o600 };
        }
      }));
      try {
        return await operation({ apply: applyProviderConfig, remove: removeProviderConfig });
      } catch (error) {
        const restores = await Promise.allSettled(snapshots.map(async ({ target, content, mode }) => {
          if (content === undefined) {
            await fs.rm(target, { force: true });
            return;
          }
          const temporary = `${target}.restore-${randomUUID()}`;
          try {
            await fs.writeFile(temporary, content, { mode });
            await fs.rename(temporary, target);
          } finally {
            await fs.rm(temporary, { force: true });
          }
        }));
        if (restores.some((result) => result.status === "rejected")) {
          throw new Error("Codex 配置写入失败，且恢复未完成。请检查目录权限并使用配置备份恢复。", { cause: error });
        }
        throw error;
      }
  });
}

/** Shared by the legacy config editor and the durable config/database switch. */
export function withCodexProviderConfigLock<T>(operation: () => Promise<T>, allowPendingSwitch = false): Promise<T> {
  const run = configMutationQueue.then(async () => {
    const releaseLock = await acquireConfigMutationLock();
    try {
      if (!allowPendingSwitch && await fileExists(path.join(getStateDir(), "codex-switch-state.json.pending"))) {
        throw new Error("上次 Codex 切换尚未完成，请先通过模型与服务重试接管或解除接管以恢复。");
      }
      return await operation();
    } finally { await releaseLock(); }
  });
  configMutationQueue = run.catch(() => undefined);
  return run;
}

export type NativeCodexSettings = { model?: string; effort?: string; catalog?: string };

export function readNativeCodexSettings(raw: string): NativeCodexSettings {
  const restored = restoreManagedRootModelCatalog(restoreManagedRootModel(restoreManagedRootProvider(raw).raw).raw).raw;
  if ((parseRootModelProvider(restored) ?? "openai") !== "openai") return {};
  return {
    model: parseRootModel(restored),
    effort: parseRootString(restored, "model_reasoning_effort"),
    catalog: parseRootModelCatalogPath(restored),
  };
}

/** Build the complete write set before the switch journal or any target file is changed. */
export async function buildCodexSwitchFiles(
  raw: string,
  native: NativeCodexSettings,
  target?: ApplyProviderConfigParams,
): Promise<{ config: string; catalog?: string }> {
  if (parseRootString(raw, "profile")) throw new Error("当前启用了 Codex 配置 profile，请先取消 profile 覆盖再切换服务。");
  let next = removeRootString(raw, "openai_base_url").raw;
  const setOptional = (text: string, key: string, value: string | undefined) => value === undefined
    ? removeRootString(text, key).raw : upsertRootString(text, key, value);
  if (target) {
    const baseUrl = normalizeCodexProviderBaseUrl(target.baseUrl, "openai_compatible");
    const token = target.bearerToken?.trim();
    if (!token || /[\r\n]/.test(token)) throw new Error("请填写有效的外部 API Token。");
    const models = normalizeCodexCatalogModels(target.catalogModels, target.model);
    if (!target.model || !models.length) throw new Error("请先选择第三方默认模型。");
    const efforts = models.find((model) => model.id === target.model)?.reasoningEfforts ?? [];
    const oldEffort = parseRootString(raw, "model_reasoning_effort");
    const effort = efforts.find((value) => value === oldEffort) ?? (efforts.includes("medium") ? "medium" : efforts[0]);
    next = applyGatewayProviderConfig(next, ACTIVE_CODEX_PROVIDER_ID, baseUrl, {
      displayName: target.displayName, bearerToken: token, model: target.model,
    });
    next = next.replace(`[model_providers.${ACTIVE_CODEX_PROVIDER_ID}]`, `[model_providers.${ACTIVE_CODEX_PROVIDER_ID}]\nrequires_openai_auth = false`);
    next = upsertManagedRootModelCatalog(next, path.join(getCodexHomeDir(), MANAGED_CATALOG_RELATIVE_PATH));
    next = setOptional(next, "model_reasoning_effort", effort);
    const instructions = await loadCodexCatalogInstructions(target.model);
    return { config: next, catalog: `${JSON.stringify({ models: models.map((model, index) => buildCodexCatalogEntry(model, index, instructions)) }, null, 2)}\n` };
  }
  next = removeManagedCatalogMarker(removeManagedModelMarker(removeManagedProviderMarker(next)));
  next = upsertRootModelProvider(next, "openai");
  next = setOptional(next, "model", native.model);
  next = setOptional(next, "model_reasoning_effort", native.effort);
  next = setOptional(next, "model_catalog_json", native.catalog);
  // Retain the alias for historical metadata, but strip its active credentials.
  const lines = next.split(/\r?\n/);
  let activeTable = false;
  next = lines.filter((line) => {
    if (/^\s*\[/.test(line)) activeTable = line.trim() === `[model_providers.${ACTIVE_CODEX_PROVIDER_ID}]`;
    return !activeTable || !/^\s*(experimental_bearer_token|env_key)\s*=/.test(line);
  }).join("\n");
  return { config: next };
}

export function applyGatewayToCodexProviderConfig(params: ApplyProviderConfigParams): Promise<ApplyCodexGatewayProviderResult> {
  return withCodexProviderConfigTransaction(({ apply }) => apply(params));
}

async function applyProviderConfig(params: ApplyProviderConfigParams): Promise<ApplyCodexGatewayProviderResult> {
  const providerId = params.providerId?.trim() || DEFAULT_CODEX_PROVIDER_ID;
  validateProviderId(providerId);
  const kind = params.kind ?? "codex_gateway";
  const baseUrl = normalizeCodexProviderBaseUrl(params.baseUrl, kind);
  const model = params.model?.trim() || undefined;
  if (model) {
    validateModelId(model);
  }

  const configPath = getCodexConfigPath();
  const codexHomeDir = path.dirname(configPath);
  await fs.mkdir(codexHomeDir, { recursive: true });

  let raw = "";
  let backupPath: string | undefined;
  let configExists = false;
  try {
    raw = await fs.readFile(configPath, "utf8");
    configExists = true;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    raw = "";
  }
  if (configExists) {
    backupPath = `${configPath}.azt-backup-${createBackupSuffix()}`;
    await fs.copyFile(configPath, backupPath);
  }

  const useOpenAIProvider = providerId === OPENAI_CODEX_PROVIDER_ID;
  if (providerId === ACTIVE_CODEX_PROVIDER_ID || parseRootModelProvider(raw) === ACTIVE_CODEX_PROVIDER_ID) {
    throw new Error("当前使用统一会话接管，请在模型与服务中切换；接入账号池前请先解除第三方接管。");
  }
  if (kind === "openai_compatible" && useOpenAIProvider) {
    throw new Error("外部 API Token 需要写入独立 Codex provider，不能使用 openai_base_url 模式。");
  }

  const existingProvider = parseGatewayProviderTable(raw, providerId);
  const reusableStoredToken = (kind === "openai_compatible" || providerId === "azt_gateway") && urlsHaveSameProviderBase(existingProvider.baseUrl, baseUrl)
    ? existingProvider.bearerToken
    : undefined;
  const bearerToken = params.bearerToken !== undefined ? params.bearerToken.trim() || undefined : reusableStoredToken;
  if (kind === "openai_compatible" && !bearerToken) {
    throw new Error("请填写外部 API Token。");
  }

  const existingCatalogModels = kind === "openai_compatible" && !params.replaceCatalogModels && urlsHaveSameProviderBase(existingProvider.baseUrl, baseUrl)
    ? await readManagedCodexModelCatalog(parseRootModelCatalogPath(raw))
    : [];
  const incomingCatalogModels = params.catalogModels ?? [];
  const incomingIds = new Set(incomingCatalogModels.map((item) => item.id.trim()));
  const catalogModels = kind === "openai_compatible"
    ? normalizeCodexCatalogModels(params.replaceCatalogModels
      ? incomingCatalogModels
      : [...incomingCatalogModels, ...existingCatalogModels.filter((item) => !incomingIds.has(item.id))], model)
    : [];
  const catalogWrite = catalogModels.length > 0
    ? await writeManagedCodexModelCatalog(catalogModels, model)
    : undefined;

  const providerOptions = kind === "openai_compatible"
    ? {
        displayName: params.displayName?.trim() || "External API",
        bearerToken,
        model,
      }
    : { model, bearerToken };
  const providerConfigured = useOpenAIProvider
    ? applyOpenAIGatewayConfig(raw, baseUrl, model)
    : applyGatewayProviderConfig(raw, providerId, baseUrl, providerOptions);
  const next = catalogWrite
    ? upsertManagedRootModelCatalog(providerConfigured, catalogWrite.path)
    : restoreManagedRootModelCatalog(providerConfigured).raw;
  const tmpPath = `${configPath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, next, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmpPath, configPath);
  await fs.chmod(configPath, 0o600);

  return {
    path: configPath,
    backupPath,
    providerId,
    baseUrl,
    model,
    modelCatalogPath: catalogWrite?.path,
    modelCatalogBackupPath: catalogWrite?.backupPath,
    modelCatalogCount: catalogWrite?.count,
    kind,
    authType: bearerToken ? "bearer_token" : "none",
  };
}

export async function getReusableCodexProviderBearerToken(params: {
  baseUrl: string;
  providerId: string;
}): Promise<string | undefined> {
  const providerId = params.providerId.trim();
  validateProviderId(providerId);
  const configPath = getCodexConfigPath();
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    return undefined;
  }

  const existingProvider = parseGatewayProviderTable(raw, providerId);
  return urlsHaveSameProviderBase(existingProvider.baseUrl, params.baseUrl)
    ? existingProvider.bearerToken
    : undefined;
}

export async function removeGatewayFromCodexProviderConfig(params?: {
  providerId?: string;
  purgeProviderDefinition?: boolean;
}): Promise<RemoveCodexGatewayProviderResult> {
  return withCodexProviderConfigTransaction(({ remove }) => remove(params));
}

async function removeProviderConfig(params?: {
  providerId?: string;
  purgeProviderDefinition?: boolean;
}): Promise<RemoveCodexGatewayProviderResult> {
  const providerId = params?.providerId?.trim() || DEFAULT_CODEX_PROVIDER_ID;
  validateProviderId(providerId);
  if (providerId === ACTIVE_CODEX_PROVIDER_ID) throw new Error("请在模型与服务中解除接管，以同时恢复已有会话。");

  const configPath = getCodexConfigPath();
  let raw = "";
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    return {
      path: configPath,
      providerId,
      removed: false,
    };
  }

  const providerMarker = parseManagedProviderMarker(raw);
  const removesManagedProvider = providerMarker?.managed === providerId || (
    providerId === OPENAI_CODEX_PROVIDER_ID && providerMarker?.managed === LEGACY_CODEX_PROVIDER_ID
  );
  const providerRestored = removesManagedProvider ? restoreManagedRootProvider(raw).raw : raw;
  const modelRestored = removesManagedProvider ? restoreManagedRootModel(providerRestored).raw : providerRestored;
  const catalogRestored = removesManagedProvider
    ? restoreManagedRootModelCatalog(modelRestored)
    : { raw: modelRestored, restored: false };
  const retainedProvider = parseGatewayProviderTable(catalogRestored.raw, providerId);
  // Existing threads persist their provider ID. Keep custom definitions and
  // credentials resolvable when disconnecting; only an explicit purge deletes them.
  const providerDefinitionRetained = providerId !== OPENAI_CODEX_PROVIDER_ID
    && !params?.purgeProviderDefinition
    && retainedProvider.exists;
  const credentialsRetained = providerDefinitionRetained && retainedProvider.authType !== "none";
  const providerRemoved = providerDefinitionRetained
    ? removeRootModelProvider(catalogRestored.raw, providerId)
    : providerId === OPENAI_CODEX_PROVIDER_ID
      ? removeOpenAIGatewayConfig(catalogRestored.raw)
      : removeGatewayProviderConfig(catalogRestored.raw, providerId);
  const next = {
    raw: providerRemoved.raw,
    removed: providerRemoved.removed || removesManagedProvider || catalogRestored.restored,
  };
  if (!next.removed) {
    return {
      path: configPath,
      providerId,
      removed: false,
      providerDefinitionRetained,
      credentialsRetained,
    };
  }

  const backupPath = `${configPath}.azt-backup-${createBackupSuffix()}`;
  await fs.copyFile(configPath, backupPath);
  const tmpPath = `${configPath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, next.raw.trim() ? next.raw : "", {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmpPath, configPath);
  await fs.chmod(configPath, 0o600);

  return {
    path: configPath,
    backupPath,
    providerId,
    removed: true,
    providerDefinitionRetained,
    credentialsRetained,
  };
}
