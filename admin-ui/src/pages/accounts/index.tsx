import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { downloadJsonFile, fetchJson } from "@/shared/api";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import type { AccountStatItem, BusyAction, ProfileFilter } from "@/shared/lib/app-types";
import { formatJson } from "@/shared/lib/format";
import { errorMessage } from "@/shared/lib/app-utils";
import {
  getPlanKey,
  getPlanRank,
  isAuthInvalid,
  isQuotaExhausted,
  profileHealth,
  profileLabel,
  primaryRemaining,
  primaryUsage,
  profileSortGroup,
} from "@/shared/lib/profiles";
import { AccountsPanel } from "./components/AccountsPanel";

export function AccountsPage(props: {
  config: AdminConfig | null;
  showEmails: boolean;
  busy: BusyAction;
  activeProfile: ProfileSummary | null;
  codexAccountId?: string;
  setAccountModalOpen: Dispatch<SetStateAction<boolean>>;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshConfig: (options?: { runtime?: boolean; silent?: boolean }) => Promise<AdminConfig>;
  logout: () => Promise<void>;
}) {
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, boolean>>({});
  const [expandedProfiles, setExpandedProfiles] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<ProfileFilter>({
    search: "",
    status: "all",
    sort: "quota-desc",
  });

  const filteredProfiles = useMemo(() => {
    const profiles = props.config?.profiles ? [...props.config.profiles] : [];
    const excludedProfileIds = new Set(props.config?.settings.autoSwitch.excludedProfileIds || []);
    const search = filter.search.trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
      const label = profileLabel(profile, true).toLowerCase();
      const haystack = [label, profile.accountId, profile.profileId, profile.email || ""].join(" ").toLowerCase();
      const health = profileHealth(profile);
      const codexActive = Boolean(props.codexAccountId && profile.accountId === props.codexAccountId);
      const planKey = getPlanKey(profile);
      if (search && !haystack.includes(search)) return false;
      if (filter.status === "active") return profile.isActive || codexActive;
      if (filter.status === "healthy") return health.key === "healthy";
      if (filter.status === "warning") return health.key === "warning";
      if (filter.status === "unknown") return health.key === "unknown";
      if (filter.status === "exhausted") return health.key === "exhausted";
      if (filter.status === "expired") return health.key === "expired";
      if (filter.status === "invalid") return health.key === "invalid";
      if (filter.status === "login-invalid") return profile.authStatus?.state === "token_invalidated";
      if (filter.status === "auth-error") return profile.authStatus?.state === "auth_error";
      if (filter.status === "available") return health.key === "healthy" || health.key === "warning" || health.key === "unknown";
      if (filter.status === "unavailable") return health.key === "invalid" || health.key === "expired" || health.key === "exhausted";
      if (filter.status === "free") return planKey === "free";
      if (filter.status === "plus") return planKey === "plus";
      if (filter.status === "pro-team") return planKey === "pro" || planKey === "team" || planKey === "enterprise" || planKey === "premium";
      if (filter.status === "api-active") return profile.isActive;
      if (filter.status === "codex-active") return codexActive;
      if (filter.status === "auto-included") return !excludedProfileIds.has(profile.profileId);
      if (filter.status === "auto-excluded") return excludedProfileIds.has(profile.profileId);
      return true;
    });

    filtered.sort((a, b) => {
      const groupDiff = profileSortGroup(a, props.codexAccountId) - profileSortGroup(b, props.codexAccountId);
      if (groupDiff !== 0) return groupDiff;
      const planDiff = getPlanRank(b) - getPlanRank(a);
      if (planDiff !== 0) return planDiff;
      const primaryRemainingDiff = primaryRemaining(b) - primaryRemaining(a);
      if (primaryRemainingDiff !== 0) return primaryRemainingDiff;
      if (filter.sort === "latency-asc") return (b.quota?.capturedAt || 0) - (a.quota?.capturedAt || 0);
      if (filter.sort === "expiry-asc") return (a.expiresAt || Number.MAX_SAFE_INTEGER) - (b.expiresAt || Number.MAX_SAFE_INTEGER);
      if (filter.sort === "name-asc") return profileLabel(a, true).localeCompare(profileLabel(b, true), "zh-CN");
      if (filter.sort === "quota-asc") return 100 - primaryUsage(b) - (100 - primaryUsage(a));
      if (filter.sort === "plan-desc") return getPlanRank(b) - getPlanRank(a);
      if (filter.sort === "email-asc") return profileLabel(a, true).localeCompare(profileLabel(b, true));
      return primaryUsage(b) - primaryUsage(a);
    });
    return filtered;
  }, [filter, props.codexAccountId, props.config?.profiles, props.config?.settings.autoSwitch.excludedProfileIds]);

  const accountStats = useMemo<AccountStatItem[]>(() => {
    const profiles = props.config?.profiles || [];
    const excludedProfileIds = new Set(props.config?.settings.autoSwitch.excludedProfileIds || []);
    const count = (predicate: (profile: ProfileSummary) => boolean) => profiles.filter(predicate).length;
    const codexActiveCount = count((profile) => Boolean(props.codexAccountId && profile.accountId === props.codexAccountId));
    return [
      { key: "all", label: "总账号", value: profiles.length, tone: "blue" },
      { key: "available", label: "可用", value: count((profile) => ["healthy", "warning", "unknown"].includes(profileHealth(profile).key)), tone: "green" },
      { key: "unavailable", label: "不可用", value: count((profile) => ["invalid", "expired", "exhausted"].includes(profileHealth(profile).key)), tone: "red" },
      { key: "unknown", label: "待请求验证", value: count((profile) => profileHealth(profile).key === "unknown"), tone: "blue" },
      { key: "login-invalid", label: "登录失效", value: count((profile) => profile.authStatus?.state === "token_invalidated"), tone: "red" },
      { key: "auth-error", label: "认证异常", value: count((profile) => profile.authStatus?.state === "auth_error"), tone: "red" },
      { key: "exhausted", label: "额度耗尽", value: count((profile) => profileHealth(profile).key === "exhausted"), tone: "orange" },
      { key: "free", label: "Free", value: count((profile) => getPlanKey(profile) === "free"), tone: "muted" },
      { key: "plus", label: "Plus", value: count((profile) => getPlanKey(profile) === "plus"), tone: "brand" },
      { key: "pro-team", label: "Pro/Team", value: count((profile) => ["pro", "team", "enterprise", "premium"].includes(getPlanKey(profile))), tone: "blue" },
      { key: "api-active", label: "API 使用中", value: count((profile) => profile.isActive), tone: "green" },
      { key: "codex-active", label: "Codex 使用中", value: codexActiveCount, tone: "green" },
      { key: "auto-included", label: "参与轮换", value: count((profile) => !excludedProfileIds.has(profile.profileId)), tone: "blue" },
      { key: "auto-excluded", label: "排除轮换", value: count((profile) => excludedProfileIds.has(profile.profileId)), tone: "orange" },
    ];
  }, [props.codexAccountId, props.config?.profiles, props.config?.settings.autoSwitch.excludedProfileIds]);

  const selectedCount = Object.values(selectedProfiles).filter(Boolean).length;
  const selectedProfileIds = Object.keys(selectedProfiles).filter((id) => selectedProfiles[id]);
  const visibleProfileIds = useMemo(() => filteredProfiles.map((profile) => profile.profileId), [filteredProfiles]);

  async function exportProfiles(profileId?: string, ids?: string[]) {
    const body = ids ? { profileIds: ids } : { profileId };
    const result = await fetchJson<{ profile: unknown; config?: AdminConfig }>("/_gateway/admin/profiles/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: formatJson(body),
    });
    const suffix = ids ? `profiles-${ids.length}` : profileId || "active";
    downloadJsonFile(`ai-zero-token-${suffix}.json`, result.profile);
    if (result.config) {
      props.setConfig(result.config);
    } else {
      await props.refreshConfig({ silent: true });
    }
    props.setStatus(ids ? `已导出 ${ids.length} 个账号。` : "账号配置已导出。");
  }

  async function runProfileAction(action: "activate" | "apply-codex" | "sync-quota" | "remove" | "export", profile: ProfileSummary) {
    if (action === "remove" && !window.confirm(`确认删除 ${profileLabel(profile, props.showEmails)}？`)) return;
    if ((action === "activate" || action === "apply-codex") && isAuthInvalid(profile)) {
      props.setStatus(`${profileLabel(profile, props.showEmails)} 登录已失效，不能应用到${action === "activate" ? "网关" : "Codex"}。`);
      return;
    }
    if ((action === "activate" || action === "apply-codex") && isQuotaExhausted(profile)) {
      const target = action === "activate" ? "网关" : "Codex";
      if (!window.confirm(`${profileLabel(profile, props.showEmails)} 的额度看起来已耗尽，仍要应用到${target}吗？`)) {
        return;
      }
    }
    if (action === "export") {
      await exportProfiles(profile.profileId);
      return;
    }
    props.setBusy(`profile:${action}:${profile.profileId}`);
    try {
      const endpoints = {
        activate: "/_gateway/admin/profiles/activate",
        "apply-codex": "/_gateway/admin/codex/apply",
        "sync-quota": "/_gateway/admin/profiles/sync-quota",
        remove: "/_gateway/admin/profiles/remove",
      } as const;
      const result = await fetchJson<AdminConfig | { config: AdminConfig }>(endpoints[action], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ profileId: profile.profileId }),
      });
      const nextConfig = "config" in result ? result.config : result;
      props.setConfig(nextConfig);
      props.setStatus(action === "activate" ? "已应用到网关。" : action === "apply-codex" ? "已应用到本机 Codex。" : action === "sync-quota" ? "额度信息已同步。" : "账号已删除。");
      if (action === "apply-codex") {
        if (nextConfig.codexRestartSupported && window.confirm("Codex 账号已切换，是否现在重启 Codex 客户端？\n\nCodex 通常在启动时读取本机 auth.json，重启后新账号会立即生效。")) {
          try {
            await fetchJson<{ ok: boolean; restarted?: boolean }>("/_gateway/admin/desktop/restart-codex", { method: "POST" });
            props.setStatus("已应用到本机 Codex，并已重启 Codex 客户端。");
          } catch (error) {
            props.setStatus(`已应用到本机 Codex，但重启 Codex 失败: ${errorMessage(error)}`);
          }
        } else {
          props.setStatus("已应用到本机 Codex，重启 Codex 客户端后生效。");
        }
      }
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  async function removeSelectedProfiles() {
    const ids = selectedProfileIds;
    if (ids.length === 0) {
      props.setStatus("请先勾选要删除的账号。");
      return;
    }

    const selectedLabels = props.config?.profiles
      .filter((profile) => ids.includes(profile.profileId))
      .slice(0, 3)
      .map((profile) => profileLabel(profile, props.showEmails));
    const preview = selectedLabels?.length ? `\n\n${selectedLabels.join("\n")}${ids.length > selectedLabels.length ? `\n等 ${ids.length} 个账号` : ""}` : "";
    if (!window.confirm(`确认删除所选 ${ids.length} 个账号？此操作不可撤销。${preview}`)) {
      return;
    }

    props.setBusy("bulk-remove");
    props.setStatus(`正在删除 ${ids.length} 个账号...`);
    try {
      const result = await fetchJson<AdminConfig & { removedProfileCount?: number }>("/_gateway/admin/profiles/remove-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ profileIds: ids }),
      });

      props.setConfig(result);
      setSelectedProfiles({});
      props.setStatus(`已删除 ${result.removedProfileCount ?? ids.length} 个账号。`);
    } catch (error) {
      props.setStatus(`删除所选失败: ${errorMessage(error)}`);
    } finally {
      props.setBusy(null);
    }
  }

  function selectProfileIds(ids: string[], message: string) {
    if (ids.length === 0) {
      props.setStatus("没有可选择的账号。");
      return;
    }

    setSelectedProfiles((items) => {
      const next = { ...items };
      for (const id of ids) {
        next[id] = true;
      }
      return next;
    });
    props.setStatus(message);
  }

  return (
    <AccountsPanel
      config={props.config}
      profiles={filteredProfiles}
      accountStats={accountStats}
      showEmails={props.showEmails}
      filter={filter}
      selectedProfiles={selectedProfiles}
      expandedProfiles={expandedProfiles}
      selectedCount={selectedCount}
      visibleCount={visibleProfileIds.length}
      busy={props.busy}
      onFilter={setFilter}
      onSelect={(profileId, checked) => setSelectedProfiles((items) => ({ ...items, [profileId]: checked }))}
      onSelectVisible={() => selectProfileIds(visibleProfileIds, `已选择当前筛选结果 ${visibleProfileIds.length} 个账号。`)}
      onClearSelected={() => {
        setSelectedProfiles({});
        props.setStatus("已取消选择。");
      }}
      onToggle={(profileId) => setExpandedProfiles((items) => ({ ...items, [profileId]: !items[profileId] }))}
      onAction={runProfileAction}
      onLocate={() => props.activeProfile && document.querySelector(`[data-profile-card="${props.activeProfile.profileId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      onExportSelected={() => {
        const ids = selectedProfileIds;
        if (ids.length === 0) {
          props.setStatus("请先勾选要导出的账号。");
          return;
        }
        exportProfiles(undefined, ids).catch((error) => props.setStatus(error instanceof Error ? error.message : String(error)));
      }}
      onRemoveSelected={() => void removeSelectedProfiles()}
      onAddAccount={() => props.setAccountModalOpen(true)}
      onRefreshStatus={() => props.refreshConfig({ runtime: true })}
      onClearAccounts={() => props.logout()}
    />
  );
}
