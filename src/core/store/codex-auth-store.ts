import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { OAuthProfile } from "../types.js";

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
  modelProvider?: string;
};

export type CodexAuthStatus = {
  path: string;
  exists: boolean;
  accountId?: string;
  hasIdToken: boolean;
  lastRefresh?: string;
  gatewayProvider: CodexGatewayProviderStatus;
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
  historyMigration?: CodexHistoryMigrationResult;
};

export type CodexHistoryMigrationResult = {
  path: string;
  backupPath?: string;
  migratedCount: number;
  skipped?: boolean;
  error?: string;
};

export type RemoveCodexGatewayProviderResult = {
  path: string;
  backupPath?: string;
  providerId: string;
  removed: boolean;
};

function getCodexHomeDir(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

const OPENAI_CODEX_PROVIDER_ID = "openai";
const LEGACY_CODEX_PROVIDER_ID = "ai-zero-token";
const DEFAULT_CODEX_PROVIDER_ID = OPENAI_CODEX_PROVIDER_ID;

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

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sqliteQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runSqlite(dbPath: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync("sqlite3", [dbPath, sql], {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
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
    const countRaw = await runSqlite(
      dbPath,
      `select count(*) from threads where model_provider=${sqliteQuote(LEGACY_CODEX_PROVIDER_ID)};`,
    );
    const migratedCount = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(migratedCount) || migratedCount <= 0) {
      return {
        path: dbPath,
        migratedCount: 0,
        skipped: true,
      };
    }

    const backupPath = `${dbPath}.azt-backup-${createBackupSuffix()}`;
    await runSqlite(dbPath, `.backup ${sqliteQuote(backupPath)}`);
    await runSqlite(
      dbPath,
      `update threads set model_provider=${sqliteQuote(OPENAI_CODEX_PROVIDER_ID)} where model_provider=${sqliteQuote(LEGACY_CODEX_PROVIDER_ID)};`,
    );
    return {
      path: dbPath,
      backupPath,
      migratedCount,
    };
  } catch (error) {
    return {
      path: dbPath,
      migratedCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeCodexProviderBaseUrl(value: string): string {
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
  if (!path || path === "/") {
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

function parseRootString(raw: string, key: string): string | undefined {
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

function parseGatewayProviderTable(raw: string, providerId: string): { exists: boolean; baseUrl?: string } {
  const lines = raw.split(/\r?\n/);
  const tablePattern = new RegExp(`^\\s*\\[\\s*model_providers\\.${escapeRegExp(providerId)}\\s*\\]\\s*$`);
  const start = lines.findIndex((line) => tablePattern.test(line));
  if (start === -1) {
    return { exists: false };
  }

  let baseUrl: string | undefined;
  for (let index = start + 1; index < lines.length && !/^\s*\[/.test(lines[index] ?? ""); index += 1) {
    const match = /^\s*base_url\s*=\s*(.+)$/.exec(lines[index] ?? "");
    if (match) {
      baseUrl = parseTomlStringValue(match[1] ?? "");
    }
  }

  return { exists: true, baseUrl };
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

function buildGatewayProviderBlock(providerId: string, baseUrl: string): string[] {
  return [
    "# AI Zero Token managed Codex provider",
    `[model_providers.${providerId}]`,
    'name = "AI Zero Token"',
    `base_url = ${formatTomlString(baseUrl)}`,
    'wire_api = "responses"',
    "supports_websockets = false",
  ];
}

function upsertGatewayProviderTable(raw: string, providerId: string, baseUrl: string): string {
  const lines = raw.split(/\r?\n/);
  const tablePattern = new RegExp(`^\\s*\\[\\s*model_providers\\.${escapeRegExp(providerId)}\\s*\\]\\s*$`);
  const start = lines.findIndex((line) => tablePattern.test(line));
  const block = buildGatewayProviderBlock(providerId, baseUrl);

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

function applyGatewayProviderConfig(raw: string, providerId: string, baseUrl: string): string {
  const sanitizedRaw = removeOpenAIGatewayConfig(raw).raw;
  return upsertGatewayProviderTable(upsertRootModelProvider(sanitizedRaw, providerId), providerId, baseUrl);
}

function applyOpenAIGatewayConfig(raw: string, baseUrl: string): string {
  const withoutLegacyProvider = removeGatewayProviderConfig(raw, LEGACY_CODEX_PROVIDER_ID).raw;
  return upsertRootString(
    upsertRootModelProvider(withoutLegacyProvider, OPENAI_CODEX_PROVIDER_ID),
    "openai_base_url",
    baseUrl,
  );
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
  const legacyRemoved = removeGatewayProviderConfig(openAIProviderRemoved.raw, LEGACY_CODEX_PROVIDER_ID);
  return {
    raw: legacyRemoved.raw,
    removed: openAIBaseRemoved.removed || openAIProviderRemoved.removed || legacyRemoved.removed,
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

export async function getCodexGatewayProviderStatus(params?: {
  providerId?: string;
}): Promise<CodexGatewayProviderStatus> {
  const requestedProviderId = params?.providerId?.trim();
  const providerId = requestedProviderId || DEFAULT_CODEX_PROVIDER_ID;
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
  if (providerId === OPENAI_CODEX_PROVIDER_ID) {
    const openAIBaseUrl = parseRootString(raw, "openai_base_url");
    if (openAIBaseUrl && (!modelProvider || modelProvider === OPENAI_CODEX_PROVIDER_ID)) {
      return {
        path: configPath,
        providerId: OPENAI_CODEX_PROVIDER_ID,
        exists: true,
        active: !modelProvider || modelProvider === OPENAI_CODEX_PROVIDER_ID,
        baseUrl: openAIBaseUrl,
        modelProvider,
      };
    }

    const legacyTable = parseGatewayProviderTable(raw, LEGACY_CODEX_PROVIDER_ID);
    if (!requestedProviderId && legacyTable.exists) {
      return {
        path: configPath,
        providerId: LEGACY_CODEX_PROVIDER_ID,
        exists: true,
        active: modelProvider === LEGACY_CODEX_PROVIDER_ID,
        baseUrl: legacyTable.baseUrl,
        modelProvider,
      };
    }
  }

  const table = parseGatewayProviderTable(raw, providerId);
  return {
    path: configPath,
    providerId,
    exists: table.exists,
    active: modelProvider === providerId && table.exists,
    baseUrl: table.baseUrl,
    modelProvider,
  };
}

export async function getCodexAuthStatus(): Promise<CodexAuthStatus> {
  const authPath = getCodexAuthPath();
  const [auth, gatewayProvider] = await Promise.all([
    readCodexAuth(),
    getCodexGatewayProviderStatus(),
  ]);
  if (!auth) {
    return {
      path: authPath,
      exists: false,
      hasIdToken: false,
      gatewayProvider,
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
  };
}

export async function applyProfileToCodexAuth(profile: OAuthProfile): Promise<ApplyCodexAuthResult> {
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
      account_id: profile.accountId,
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
    accountId: profile.accountId,
    hasIdToken: true,
    lastRefresh: authFile.last_refresh,
    gatewayProvider: await getCodexGatewayProviderStatus(),
    backupPath,
    appliedProfileId: profile.profileId,
    appliedEmail: profile.email,
  };
}

export async function applyGatewayToCodexProviderConfig(params: {
  baseUrl: string;
  providerId?: string;
}): Promise<ApplyCodexGatewayProviderResult> {
  const providerId = params.providerId?.trim() || DEFAULT_CODEX_PROVIDER_ID;
  validateProviderId(providerId);
  const baseUrl = normalizeCodexProviderBaseUrl(params.baseUrl);

  const configPath = getCodexConfigPath();
  const codexHomeDir = path.dirname(configPath);
  await fs.mkdir(codexHomeDir, { recursive: true });

  let raw = "";
  let backupPath: string | undefined;
  try {
    raw = await fs.readFile(configPath, "utf8");
    backupPath = `${configPath}.azt-backup-${createBackupSuffix()}`;
    await fs.copyFile(configPath, backupPath);
  } catch {
    raw = "";
    backupPath = undefined;
  }

  const useOpenAIProvider = providerId === OPENAI_CODEX_PROVIDER_ID;
  const next = useOpenAIProvider
    ? applyOpenAIGatewayConfig(raw, baseUrl)
    : applyGatewayProviderConfig(raw, providerId, baseUrl);
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
    historyMigration: useOpenAIProvider ? await migrateLegacyCodexHistoryProvider() : undefined,
  };
}

export async function removeGatewayFromCodexProviderConfig(params?: {
  providerId?: string;
}): Promise<RemoveCodexGatewayProviderResult> {
  const providerId = params?.providerId?.trim() || DEFAULT_CODEX_PROVIDER_ID;
  validateProviderId(providerId);

  const configPath = getCodexConfigPath();
  let raw = "";
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch {
    return {
      path: configPath,
      providerId,
      removed: false,
    };
  }

  const sanitized = removeOpenAIGatewayConfig(raw);
  const next = providerId === OPENAI_CODEX_PROVIDER_ID || providerId === LEGACY_CODEX_PROVIDER_ID
    ? sanitized
    : (() => {
        const providerRemoved = removeGatewayProviderConfig(sanitized.raw, providerId);
        return {
          raw: providerRemoved.raw,
          removed: sanitized.removed || providerRemoved.removed,
        };
      })();
  if (!next.removed) {
    return {
      path: configPath,
      providerId,
      removed: false,
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
  };
}
