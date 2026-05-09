import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OAuthProfile } from "../types.js";

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

const DEFAULT_CODEX_PROVIDER_ID = "ai-zero-token";

export function getCodexAuthPath(): string {
  return path.join(getCodexHomeDir(), "auth.json");
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHomeDir(), "config.toml");
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

function parseRootModelProvider(raw: string): string | undefined {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);

  for (let index = 0; index < firstTableLine; index += 1) {
    const match = /^\s*model_provider\s*=\s*(.+)$/.exec(lines[index] ?? "");
    if (match) {
      return parseTomlStringValue(match[1] ?? "");
    }
  }

  return undefined;
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

function upsertRootModelProvider(raw: string, providerId: string): string {
  if (!raw.trim()) {
    return `model_provider = ${formatTomlString(providerId)}\n`;
  }

  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);
  const nextLine = `model_provider = ${formatTomlString(providerId)}`;

  for (let index = 0; index < firstTableLine; index += 1) {
    if (/^\s*model_provider\s*=/.test(lines[index])) {
      lines[index] = nextLine;
      return lines.join("\n");
    }
  }

  lines.splice(firstTableLine, 0, nextLine, "");
  return lines.join("\n");
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
  return upsertGatewayProviderTable(upsertRootModelProvider(raw, providerId), providerId, baseUrl);
}

function removeRootModelProvider(raw: string, providerId: string): { raw: string; removed: boolean } {
  const lines = raw.split(/\r?\n/);
  const firstTableLine = findFirstTableLine(lines);

  for (let index = 0; index < firstTableLine; index += 1) {
    const match = /^\s*model_provider\s*=\s*(.+)$/.exec(lines[index] ?? "");
    if (!match || parseTomlStringValue(match[1] ?? "") !== providerId) {
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
      exists: false,
      active: false,
    };
  }

  const modelProvider = parseRootModelProvider(raw);
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

  const next = applyGatewayProviderConfig(raw, providerId, baseUrl);
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

  const next = removeGatewayProviderConfig(raw, providerId);
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
