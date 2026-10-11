import { createHash } from "node:crypto";
import type { AccountIdSource, OAuthProfile } from "../types.js";

const AUTH_CLAIM_PATH = "https://api.openai.com/auth";
const PROFILE_CLAIM_PATH = "https://api.openai.com/profile";

type JwtPayload = Record<string, unknown>;

export type ExportedProfile = {
  type: "codex";
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expired: string;
  email?: string;
  account_id: string;
  codex_account_id?: string;
  account_identity?: string;
  account_id_source?: AccountIdSource;
  codex_apply_supported?: boolean;
  profile_id: string;
  exported_at: string;
};

export type ExportedProfileBundle = {
  type: "codex_profiles";
  exported_at: string;
  profiles: ExportedProfile[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1] ?? "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return JSON.parse(Buffer.from(normalized + padding, "base64").toString("utf8")) as JwtPayload;
  } catch {
    return null;
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = getString(value);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function getNestedString(input: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = input;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return getString(current);
}

function hashAccessToken(access: string): string {
  return createHash("sha256").update(access).digest("hex");
}

type ImportIdentity = {
  accountId: string;
  codexAccountId?: string;
  source: AccountIdSource;
};

function extractAuthClaim(payload: JwtPayload | null): Record<string, unknown> | undefined {
  const authClaim = payload?.[AUTH_CLAIM_PATH];
  return isRecord(authClaim) ? authClaim : undefined;
}

function extractImportIdentity(input: Record<string, unknown>, payload: JwtPayload | null, access: string): ImportIdentity {
  const authClaim = extractAuthClaim(payload);
  const tokenAccountId = getString(authClaim?.chatgpt_account_id);
  if (tokenAccountId) {
    return {
      accountId: tokenAccountId,
      codexAccountId: tokenAccountId,
      source: "chatgpt_account_id",
    };
  }

  const explicitChatGptAccountId = firstString(
    input.chatgpt_account_id,
    input.chatgptAccountId,
    getNestedString(input, ["account", "chatgpt_account_id"]),
    getNestedString(input, ["account", "chatgptAccountId"]),
  );
  if (explicitChatGptAccountId) {
    return {
      accountId: explicitChatGptAccountId,
      codexAccountId: explicitChatGptAccountId,
      source: "chatgpt_account_id",
    };
  }

  const explicitAccountId = firstString(
    input.account_id,
    input.accountId,
    getNestedString(input, ["account", "account_id"]),
    getNestedString(input, ["account", "accountId"]),
    getNestedString(input, ["account", "id"]),
  );
  if (explicitAccountId) {
    return {
      accountId: explicitAccountId,
      codexAccountId: explicitAccountId,
      source: "account_id",
    };
  }

  const chatGptUserId = firstString(
    authClaim?.chatgpt_user_id,
    input.chatgpt_user_id,
    input.chatgptUserId,
    getNestedString(input, ["user", "chatgpt_user_id"]),
    getNestedString(input, ["user", "chatgptUserId"]),
  );
  if (chatGptUserId) {
    return {
      accountId: chatGptUserId,
      source: "chatgpt_user_id",
    };
  }

  const userId = firstString(
    authClaim?.user_id,
    input.user_id,
    input.userId,
    getNestedString(input, ["user", "user_id"]),
    getNestedString(input, ["user", "userId"]),
    getNestedString(input, ["user", "id"]),
  );
  if (userId) {
    return {
      accountId: userId,
      source: "user_id",
    };
  }

  const subject = getString(payload?.sub);
  if (subject) {
    return {
      accountId: subject,
      source: "sub",
    };
  }

  const email = extractEmail(payload, input.email);
  if (email) {
    return {
      accountId: `email:${email.toLowerCase()}`,
      source: "email",
    };
  }

  return {
    accountId: `access:${hashAccessToken(access).slice(0, 32)}`,
    source: "access_token_sha256",
  };
}

function extractEmail(payload: JwtPayload | null, fallback: unknown): string | undefined {
  const profileClaim = payload?.[PROFILE_CLAIM_PATH];
  const profileEmail = isRecord(profileClaim) ? getString(profileClaim.email) : undefined;
  return profileEmail ?? getString(payload?.email) ?? getString(fallback);
}

function parseExpiry(input: Record<string, unknown>, payload: JwtPayload | null): number {
  const jwtExp = getNumber(payload?.exp);
  if (jwtExp) {
    return jwtExp * 1000;
  }

  const directExpires = getNumber(input.expires);
  if (directExpires) {
    return directExpires > 10_000_000_000 ? directExpires : directExpires * 1000;
  }

  const expiresAt = getNumber(input.expires_at);
  if (expiresAt) {
    return expiresAt > 10_000_000_000 ? expiresAt : expiresAt * 1000;
  }

  const expired = getString(input.expired) ?? getString(input.expiresAt);
  if (expired) {
    const parsed = Date.parse(expired);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("导入失败: 缺少有效的过期时间。");
}

export function importProfileFromJson(value: unknown): OAuthProfile {
  if (!isRecord(value)) {
    throw new Error("导入失败: JSON 根节点必须是对象。");
  }

  // Also accept the native Codex auth.json shape:
  // { auth_mode, last_refresh, tokens: { access_token, refresh_token, ... } }.
  const nestedTokens = isRecord(value.tokens) ? value.tokens : undefined;
  const input = nestedTokens ? { ...value, ...nestedTokens } : value;
  const access = getString(input.access_token) ?? getString(input.access);
  const refresh = getString(input.refresh_token) ?? getString(input.refresh);
  const idToken = getString(input.id_token) ?? getString(input.idToken);
  if (!access || !refresh) {
    throw new Error("导入失败: 缺少 access_token/access 或 refresh_token/refresh。");
  }

  const payload = decodeJwtPayload(access);
  const identity = extractImportIdentity(input, payload, access);
  const email = extractEmail(payload, input.email);
  const expires = parseExpiry(input, payload);

  return {
    provider: "openai-codex",
    profileId: `openai-codex:${identity.accountId}`,
    mode: "oauth_account",
    access,
    refresh,
    idToken,
    expires,
    accountId: identity.accountId,
    codexAccountId: identity.codexAccountId,
    accountIdSource: identity.source,
    email,
  };
}

export function importProfilesFromJson(value: unknown): OAuthProfile[] {
  const items = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.profiles)
      ? value.profiles
      : [value];

  return items.map((item, index) => {
    try {
      return importProfileFromJson(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`第 ${index + 1} 个账号${message.startsWith("导入失败") ? message : `导入失败: ${message}`}`);
    }
  });
}

export function exportProfileToJson(profile: OAuthProfile): ExportedProfile {
  const codexAccountId = profile.codexAccountId ?? (!profile.accountIdSource ? profile.accountId : undefined);

  return {
    type: "codex",
    access_token: profile.access,
    refresh_token: profile.refresh,
    id_token: profile.idToken,
    expired: new Date(profile.expires).toISOString(),
    email: profile.email,
    account_id: codexAccountId ?? "",
    codex_account_id: codexAccountId,
    account_identity: profile.accountId,
    account_id_source: profile.accountIdSource ?? (codexAccountId ? "chatgpt_account_id" : undefined),
    codex_apply_supported: Boolean(codexAccountId),
    profile_id: profile.profileId,
    exported_at: new Date().toISOString(),
  };
}

export function exportProfilesToJson(profiles: OAuthProfile[]): ExportedProfileBundle {
  return {
    type: "codex_profiles",
    exported_at: new Date().toISOString(),
    profiles: profiles.map((profile) => exportProfileToJson(profile)),
  };
}

export function getProfileImportTemplate(): ExportedProfileBundle {
  return {
    type: "codex_profiles",
    exported_at: new Date(0).toISOString(),
    profiles: [
      {
        type: "codex",
        access_token: "eyJ...access_token",
        refresh_token: "rt_...",
        id_token: "eyJ...id_token",
        expired: "2026-05-04T22:13:00.000Z",
        email: "user@example.com",
        account_id: "可选；有真实 chatgpt_account_id/account_id 时可应用到 Codex",
        account_identity: "缺少 account_id 时会自动使用 user_id/sub/email/hash 作为网关身份",
        account_id_source: "chatgpt_account_id",
        codex_apply_supported: true,
        profile_id: "可选，导入时会按 account_id 自动生成",
        exported_at: new Date(0).toISOString(),
      },
    ],
  };
}
