import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { downloadJsonFile, fetchJson } from "@/shared/api";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import type { BusyAction, ProfileFilter } from "@/shared/lib/app-types";
import { formatJson } from "@/shared/lib/format";
import { errorMessage } from "@/shared/lib/app-utils";
import {
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
    const search = filter.search.trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
      const label = profileLabel(profile, true).toLowerCase();
      const haystack = [label, profile.accountId, profile.profileId, profile.email || ""].join(" ").toLowerCase();
      const health = profileHealth(profile);
      const codexActive = Boolean(props.codexAccountId && profile.accountId === props.codexAccountId);
      if (search && !haystack.includes(search)) return false;
      if (filter.status === "active") return profile.isActive || codexActive;
      if (filter.status === "healthy") return health.key === "healthy";
      if (filter.status === "warning") return health.key === "warning";
      if (filter.status === "exhausted") return health.key === "exhausted";
      if (filter.status === "expired") return health.key === "expired";
      if (filter.status === "invalid") return health.key === "invalid";
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
  }, [filter, props.codexAccountId, props.config?.profiles]);

  const selectedCount = Object.values(selectedProfiles).filter(Boolean).length;

  async function exportProfiles(profileId?: string, ids?: string[]) {
    const body = ids ? { profileIds: ids } : { profileId };
    const result = await fetchJson<{ profile: unknown }>("/_gateway/admin/profiles/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: formatJson(body),
    });
    const suffix = ids ? `profiles-${ids.length}` : profileId || "active";
    downloadJsonFile(`ai-zero-token-${suffix}.json`, result.profile);
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
      props.setConfig("config" in result ? result.config : result);
      props.setStatus(action === "activate" ? "已应用到网关。" : action === "apply-codex" ? "已应用到本机 Codex。" : action === "sync-quota" ? "额度信息已同步。" : "账号已删除。");
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  return (
    <AccountsPanel
      config={props.config}
      profiles={filteredProfiles}
      showEmails={props.showEmails}
      filter={filter}
      selectedProfiles={selectedProfiles}
      expandedProfiles={expandedProfiles}
      selectedCount={selectedCount}
      busy={props.busy}
      onFilter={setFilter}
      onSelect={(profileId, checked) => setSelectedProfiles((items) => ({ ...items, [profileId]: checked }))}
      onToggle={(profileId) => setExpandedProfiles((items) => ({ ...items, [profileId]: !items[profileId] }))}
      onAction={runProfileAction}
      onLocate={() => props.activeProfile && document.querySelector(`[data-profile-card="${props.activeProfile.profileId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      onExportSelected={() => {
        const ids = Object.keys(selectedProfiles).filter((id) => selectedProfiles[id]);
        if (ids.length === 0) {
          props.setStatus("请先勾选要导出的账号。");
          return;
        }
        exportProfiles(undefined, ids).catch((error) => props.setStatus(error instanceof Error ? error.message : String(error)));
      }}
      onAddAccount={() => props.setAccountModalOpen(true)}
      onRefreshStatus={() => props.refreshConfig({ runtime: true })}
      onClearAccounts={() => props.logout()}
    />
  );
}
