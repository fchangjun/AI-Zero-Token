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

export type CodexAuthStatus = {
  path: string;
  exists: boolean;
  accountId?: string;
  hasIdToken: boolean;
  lastRefresh?: string;
};

export type ApplyCodexAuthResult = CodexAuthStatus & {
  backupPath?: string;
  appliedProfileId: string;
  appliedEmail?: string;
};

function getCodexHomeDir(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function getCodexAuthPath(): string {
  return path.join(getCodexHomeDir(), "auth.json");
}

function createBackupSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
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

export async function getCodexAuthStatus(): Promise<CodexAuthStatus> {
  const authPath = getCodexAuthPath();
  const auth = await readCodexAuth();
  if (!auth) {
    return {
      path: authPath,
      exists: false,
      hasIdToken: false,
    };
  }

  const tokens = isRecord(auth.tokens) ? auth.tokens : {};
  return {
    path: authPath,
    exists: true,
    accountId: typeof tokens.account_id === "string" ? tokens.account_id : undefined,
    hasIdToken: typeof tokens.id_token === "string" && tokens.id_token.length > 0,
    lastRefresh: typeof auth.last_refresh === "string" ? auth.last_refresh : undefined,
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
    backupPath,
    appliedProfileId: profile.profileId,
    appliedEmail: profile.email,
  };
}
