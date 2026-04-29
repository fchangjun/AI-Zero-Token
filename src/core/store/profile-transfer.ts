import type { OAuthProfile } from "../types.js";

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

function extractAccountId(payload: JwtPayload | null, fallback: unknown): string {
  const authClaim = payload?.[AUTH_CLAIM_PATH];
  const accountId = isRecord(authClaim) ? getString(authClaim.chatgpt_account_id) : undefined;
  const fallbackAccountId = getString(fallback);
  const resolved = accountId ?? fallbackAccountId;
  if (!resolved) {
    throw new Error("导入失败: 无法从 access_token 中提取 accountId。");
  }
  return resolved;
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

  const access = getString(value.access_token) ?? getString(value.access);
  const refresh = getString(value.refresh_token) ?? getString(value.refresh);
  const idToken = getString(value.id_token) ?? getString(value.idToken);
  if (!access || !refresh) {
    throw new Error("导入失败: 缺少 access_token/access 或 refresh_token/refresh。");
  }

  const payload = decodeJwtPayload(access);
  const accountId = extractAccountId(payload, value.account_id ?? value.accountId);
  const email = extractEmail(payload, value.email);
  const expires = parseExpiry(value, payload);

  return {
    provider: "openai-codex",
    profileId: `openai-codex:${accountId}`,
    mode: "oauth_account",
    access,
    refresh,
    idToken,
    expires,
    accountId,
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
  return {
    type: "codex",
    access_token: profile.access,
    refresh_token: profile.refresh,
    id_token: profile.idToken,
    expired: new Date(profile.expires).toISOString(),
    email: profile.email,
    account_id: profile.accountId,
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
        account_id: "可选，通常会从 access_token 自动解析",
        profile_id: "可选，导入时会按 account_id 自动生成",
        exported_at: new Date(0).toISOString(),
      },
    ],
  };
}
