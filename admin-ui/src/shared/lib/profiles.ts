import type { ProfileSummary } from "@/shared/types";
import { formatFullTime, formatTime, timestampToMillis } from "./format";

export type Translator = (key: string, values?: Record<string, string | number>) => string;

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
  if (!value) return "-";
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function profileLabel(profile: ProfileSummary | null | undefined, showEmails: boolean): string {
  if (!profile) return "-";
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

export function usageCorner(profile: ProfileSummary, codexActive: boolean, t: Translator): { className: string; label: string } | null {
  if (profile.isActive && codexActive) return { className: "dual", label: t("accountsPanel.usageCornerDual") };
  if (profile.isActive) return { className: "api-only", label: t("accountsPanel.usageCornerApi") };
  if (codexActive) return { className: "codex-only", label: t("accountsPanel.usageCornerCodex") };
  return null;
}

export function profileCodexAccountId(profile: ProfileSummary | null | undefined): string | undefined {
  if (!profile) return undefined;
  return profile.codexAccountId || (!profile.accountIdSource ? profile.accountId : undefined);
}

export function isCodexActiveProfile(profile: ProfileSummary, codexAccountId?: string): boolean {
  return Boolean(codexAccountId && profileCodexAccountId(profile) === codexAccountId);
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

export function autoSwitchEligibility(profile: ProfileSummary, t: Translator): { key: "ready" | "auth-invalid" | "quota-exhausted"; label: string; tone: "green" | "orange" | "red" } {
  if (isAuthInvalid(profile)) {
    return { key: "auth-invalid", label: t("accountsPanel.autoSwitchAuthInvalid"), tone: "red" };
  }

  if (isQuotaExhausted(profile)) {
    return { key: "quota-exhausted", label: t("accountsPanel.autoSwitchQuotaExhausted"), tone: "orange" };
  }

  return { key: "ready", label: t("accountsPanel.autoSwitchReady"), tone: "green" };
}

export function profileSortGroup(profile: ProfileSummary, codexAccountId?: string): number {
  const isActive = profile.isActive || isCodexActiveProfile(profile, codexAccountId);
  if (isActive) return 0;
  if (isProfileInvalid(profile)) return 2;
  return 1;
}

export function authStatusText(profile: ProfileSummary, t: Translator, locale?: string): string {
  const authStatus = profile.authStatus;
  if (!authStatus || authStatus.state === "ok") {
    return authStatus?.checkedAt ? t("accountsPanel.authStatusOkAt", { time: formatFullTime(authStatus.checkedAt, locale) }) : t("accountsPanel.authStatusOk");
  }
  const prefix = authStatus.state === "token_invalidated" ? t("accountsPanel.authStatusInvalidated") : t("accountsPanel.authStatusError");
  const detail = authStatus.code || authStatus.httpStatus ? ` (${authStatus.code || authStatus.httpStatus})` : "";
  return `${prefix}${detail} · ${formatFullTime(authStatus.checkedAt, locale)}`;
}

export function profileHealth(profile: ProfileSummary, t: Translator): { key: "healthy" | "warning" | "unknown" | "expired" | "exhausted" | "invalid"; label: string; tone: string } {
  if (profile.authStatus?.state === "token_invalidated") return { key: "invalid", label: t("accountsPanel.healthInvalidLogin"), tone: "red" };
  if (profile.authStatus?.state === "auth_error") return { key: "invalid", label: t("accountsPanel.healthAuthError"), tone: "red" };
  if (profile.expiresAt && profile.expiresAt <= Date.now()) return { key: "expired", label: t("accountsPanel.healthExpired"), tone: "red" };
  if (!profile.quota?.capturedAt) return { key: "unknown", label: t("accountsPanel.healthUnknown"), tone: "blue" };
  if (isQuotaExhausted(profile)) return { key: "exhausted", label: t("accountsPanel.healthExhausted"), tone: "orange" };
  if (primaryUsage(profile) >= 75 || secondaryUsage(profile) >= 75) return { key: "warning", label: t("accountsPanel.healthWarning"), tone: "orange" };
  return { key: "healthy", label: t("accountsPanel.healthHealthy"), tone: "green" };
}

export function resetLabel(profile: ProfileSummary, slot: "primary" | "secondary", t: Translator): string {
  const minutes = slot === "primary" ? profile.quota?.primaryWindowMinutes : profile.quota?.secondaryWindowMinutes;
  if (!minutes) return slot === "primary" ? t("accountsPanel.resetPrimary") : t("accountsPanel.resetWeekly");
  if (minutes < 60) return t("accountsPanel.resetMinutes", { count: minutes });
  if (minutes < 60 * 24) return t("accountsPanel.resetHours", { count: Math.round(minutes / 60) });
  return t("accountsPanel.resetDays", { count: Math.round(minutes / 60 / 24) });
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

export function imageCapability(profile: ProfileSummary | null | undefined, t: Translator): { ok: boolean; detail: string } {
  if (!profile) return { ok: false, detail: t("accountsPanel.imageCapabilityNeedLogin") };
  if (profile.authStatus?.state === "token_invalidated" || profile.authStatus?.state === "auth_error") {
    return { ok: false, detail: t("accountsPanel.imageCapabilityAuthInvalid") };
  }
  if (isQuotaExhausted(profile)) return { ok: true, detail: t("accountsPanel.imageCapabilityLowQuota") };
  return { ok: true, detail: t("accountsPanel.imageCapabilityReady") };
}
