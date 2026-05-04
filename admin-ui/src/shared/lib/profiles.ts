import type { ProfileSummary } from "@/shared/types";
import { formatFullTime, formatTime, timestampToMillis } from "./format";

export function clampPercent(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getPlanType(profile: ProfileSummary | null | undefined): string {
  return profile?.quota?.planType || "unknown";
}

export function getPlanRank(profile: ProfileSummary): number {
  const plan = getPlanType(profile).toLowerCase();
  if (plan.includes("enterprise") || plan.includes("business")) return 60;
  if (plan.includes("team")) return 50;
  if (plan.includes("pro") || plan.includes("premium")) return 40;
  if (plan.includes("plus")) return 30;
  if (plan.includes("free")) return 10;
  return 0;
}

export function getPlanKey(profile: ProfileSummary): string {
  const plan = getPlanType(profile).toLowerCase();
  if (plan.includes("plus")) return "plus";
  if (plan.includes("pro")) return "pro";
  if (plan.includes("enterprise") || plan.includes("business")) return "enterprise";
  if (plan.includes("team")) return "team";
  if (plan.includes("free")) return "free";
  if (plan.includes("premium")) return "premium";
  return "unknown";
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return maskIdentifier(email);
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(3, Math.min(5, name.length)))}@${domain}`;
}

export function maskIdentifier(value?: string): string {
  if (!value) return "未提供";
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function profileLabel(profile: ProfileSummary | null | undefined, showEmails: boolean): string {
  if (!profile) return "未登录";
  if (profile.email) return showEmails ? profile.email : maskEmail(profile.email);
  return showEmails ? profile.accountId || profile.profileId : maskIdentifier(profile.accountId || profile.profileId);
}

export function profileInitial(profile: ProfileSummary): string {
  const label = profile.email || profile.accountId || profile.profileId || "A";
  return label.trim().slice(0, 1).toUpperCase();
}

export function primaryUsage(profile: ProfileSummary): number {
  return clampPercent(profile.quota?.primaryUsedPercent);
}

export function primaryRemaining(profile: ProfileSummary): number {
  return 100 - primaryUsage(profile);
}

export function secondaryUsage(profile: ProfileSummary): number {
  return clampPercent(profile.quota?.secondaryUsedPercent);
}

export function quotaBarTone(value: number): "blue" | "orange" | "red" {
  if (value >= 95) return "red";
  if (value >= 75) return "orange";
  return "blue";
}

export function usageCorner(profile: ProfileSummary, codexActive: boolean): { className: string; label: string } | null {
  if (profile.isActive && codexActive) return { className: "dual", label: "API + Codex" };
  if (profile.isActive) return { className: "api-only", label: "API" };
  if (codexActive) return { className: "codex-only", label: "Codex" };
  return null;
}

export function isQuotaExhausted(profile: ProfileSummary): boolean {
  return primaryUsage(profile) >= 100 || secondaryUsage(profile) >= 100;
}

export function isAuthInvalid(profile: ProfileSummary): boolean {
  return profile.authStatus?.state === "token_invalidated" || profile.authStatus?.state === "auth_error";
}

export function isProfileInvalid(profile: ProfileSummary): boolean {
  return isAuthInvalid(profile) || Boolean(profile.expiresAt && profile.expiresAt <= Date.now());
}

export function profileSortGroup(profile: ProfileSummary, codexAccountId?: string): number {
  const isActive = profile.isActive || Boolean(codexAccountId && profile.accountId === codexAccountId);
  if (isActive) return 0;
  if (isProfileInvalid(profile)) return 2;
  return 1;
}

export function authStatusText(profile: ProfileSummary): string {
  const authStatus = profile.authStatus;
  if (!authStatus || authStatus.state === "ok") {
    return authStatus?.checkedAt ? `正常 · ${formatFullTime(authStatus.checkedAt)}` : "正常";
  }
  const prefix = authStatus.state === "token_invalidated" ? "登录失效" : "认证异常";
  const detail = authStatus.code || authStatus.httpStatus ? ` (${authStatus.code || authStatus.httpStatus})` : "";
  return `${prefix}${detail} · ${formatFullTime(authStatus.checkedAt)}`;
}

export function profileHealth(profile: ProfileSummary): { key: "healthy" | "warning" | "expired" | "exhausted" | "invalid"; label: string; tone: string } {
  if (profile.authStatus?.state === "token_invalidated") return { key: "invalid", label: "登录失效", tone: "red" };
  if (profile.authStatus?.state === "auth_error") return { key: "invalid", label: "认证异常", tone: "red" };
  if (profile.expiresAt && profile.expiresAt <= Date.now()) return { key: "expired", label: "已过期", tone: "red" };
  if (isQuotaExhausted(profile)) return { key: "exhausted", label: "额度耗尽", tone: "orange" };
  if (primaryUsage(profile) >= 75 || secondaryUsage(profile) >= 75) return { key: "warning", label: "即将耗尽", tone: "orange" };
  return { key: "healthy", label: "健康", tone: "green" };
}

export function resetLabel(profile: ProfileSummary, slot: "primary" | "secondary"): string {
  const minutes = slot === "primary" ? profile.quota?.primaryWindowMinutes : profile.quota?.secondaryWindowMinutes;
  if (!minutes) return slot === "primary" ? "主额度重置" : "周重置";
  if (minutes < 60) return `${minutes} 分钟重置`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时重置`;
  return `${Math.round(minutes / 60 / 24)} 天重置`;
}

export function resetTime(profile: ProfileSummary, slot: "primary" | "secondary"): string {
  const direct = slot === "primary" ? profile.quota?.primaryResetAt : profile.quota?.secondaryResetAt;
  const after = slot === "primary" ? profile.quota?.primaryResetAfterSeconds : profile.quota?.secondaryResetAfterSeconds;
  const directMillis = timestampToMillis(direct);
  if (directMillis) return formatTime(directMillis);
  if (typeof after === "number" && after > 0) {
    const capturedAt = timestampToMillis(profile.quota?.capturedAt) || Date.now();
    return formatTime(capturedAt + after * 1000);
  }
  return "-";
}

export function imageCapability(profile: ProfileSummary | null | undefined): { ok: boolean; detail: string } {
  if (!profile) return { ok: false, detail: "登录后可测试图片接口。" };
  if (profile.authStatus?.state === "token_invalidated" || profile.authStatus?.state === "auth_error") {
    return { ok: false, detail: "账号认证已失效，请重新登录后再测试图片接口。" };
  }
  if (isQuotaExhausted(profile)) return { ok: true, detail: "账号额度可能不足，实际以接口返回为准。" };
  return { ok: true, detail: "当前账号可使用图片生成接口。" };
}
