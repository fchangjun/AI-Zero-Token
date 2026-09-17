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
  isCodexActiveProfile,
  isQuotaExhausted,
  profileHealth,
  profileLabel,
  primaryRemaining,
  primaryUsage,
  profileSortGroup,
} from "@/shared/lib/profiles";
import { AccountsPanel } from "./components/AccountsPanel";
import { useT } from "@/i18n";

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
  const t = useT();
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
      const haystack = [label, profile.accountId, profile.codexAccountId || "", profile.profileId, profile.email || ""].join(" ").toLowerCase();
      const health = profileHealth(profile, t);
      const codexActive = isCodexActiveProfile(profile, props.codexAccountId);
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
    const codexActiveCount = count((profile) => isCodexActiveProfile(profile, props.codexAccountId));
    return [
      { key: "all", label: t("accounts.summaryAll"), value: profiles.length, tone: "blue" },
      { key: "available", label: t("accounts.summaryAvailable"), value: count((profile) => ["healthy", "warning", "unknown"].includes(profileHealth(profile, t).key)), tone: "green" },
      { key: "unavailable", label: t("accounts.summaryUnavailable"), value: count((profile) => ["invalid", "expired", "exhausted"].includes(profileHealth(profile, t).key)), tone: "red" },
      { key: "unknown", label: t("accounts.summaryUnknown"), value: count((profile) => profileHealth(profile, t).key === "unknown"), tone: "blue" },
      { key: "login-invalid", label: t("accounts.summaryLoginInvalid"), value: count((profile) => profile.authStatus?.state === "token_invalidated"), tone: "red" },
      { key: "auth-error", label: t("accounts.summaryAuthError"), value: count((profile) => profile.authStatus?.state === "auth_error"), tone: "red" },
      { key: "exhausted", label: t("accounts.summaryExhausted"), value: count((profile) => profileHealth(profile, t).key === "exhausted"), tone: "orange" },
      { key: "free", label: "Free", value: count((profile) => getPlanKey(profile) === "free"), tone: "muted" },
      { key: "plus", label: "Plus", value: count((profile) => getPlanKey(profile) === "plus"), tone: "brand" },
      { key: "pro-team", label: "Pro/Team", value: count((profile) => ["pro", "team", "enterprise", "premium"].includes(getPlanKey(profile))), tone: "blue" },
      { key: "api-active", label: t("accounts.summaryApiActive"), value: count((profile) => profile.isActive), tone: "green" },
      { key: "codex-active", label: t("accounts.summaryCodexActive"), value: codexActiveCount, tone: "green" },
      { key: "auto-included", label: t("accounts.summaryAutoIncluded"), value: count((profile) => !excludedProfileIds.has(profile.profileId)), tone: "blue" },
      { key: "auto-excluded", label: t("accounts.summaryAutoExcluded"), value: count((profile) => excludedProfileIds.has(profile.profileId)), tone: "orange" },
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
    props.setStatus(ids ? t("accounts.exportBatch", { count: ids.length }) : t("accounts.exportSingle"));
  }

  async function runProfileAction(action: "activate" | "apply-codex" | "sync-quota" | "remove" | "export", profile: ProfileSummary) {
    if (action === "remove" && !window.confirm(t("accounts.removeSingleConfirm", { label: profileLabel(profile, props.showEmails) }))) return;
    if ((action === "activate" || action === "apply-codex") && isAuthInvalid(profile)) {
      props.setStatus(t("accounts.loginInvalidFor", { label: profileLabel(profile, props.showEmails), target: t(action === "activate" ? "accounts.targetGateway" : "accounts.targetCodex") }));
      return;
    }
    if (action === "apply-codex" && !profile.codexApplySupported) {
      props.setStatus(profile.codexApplyReason || t("accounts.codexApplyReasonDefault"));
      return;
    }
    if ((action === "activate" || action === "apply-codex") && isQuotaExhausted(profile)) {
      const target = t(action === "activate" ? "accounts.targetGateway" : "accounts.targetCodex");
      if (!window.confirm(t("accounts.quotaExhaustedConfirm", { label: profileLabel(profile, props.showEmails), target }))) {
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
      props.setStatus(
        action === "activate"
          ? t("accounts.appliedGateway")
          : action === "apply-codex"
            ? t("accounts.appliedCodex")
            : action === "sync-quota"
              ? t("accounts.syncedQuota")
              : t("accounts.removedProfile"),
      );
      if (action === "apply-codex") {
        if (nextConfig.codexRestartSupported && window.confirm(t("accounts.codexRestartConfirm").replace(/\\n/g, "\n"))) {
          try {
            await fetchJson<{ ok: boolean; restarted?: boolean }>("/_gateway/admin/desktop/restart-codex", { method: "POST" });
            props.setStatus(t("accounts.codexAppliedWithRestart"));
          } catch (error) {
            props.setStatus(t("accounts.codexAppliedRestartFailed", { error: errorMessage(error) }));
          }
        } else {
          props.setStatus(t("accounts.codexAppliedPendingRestart"));
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
      props.setStatus(t("accounts.removePleaseSelect"));
      return;
    }

    const selectedLabels = props.config?.profiles
      .filter((profile) => ids.includes(profile.profileId))
      .slice(0, 3)
      .map((profile) => profileLabel(profile, props.showEmails));
    const preview = selectedLabels?.length
      ? "\n\n" + selectedLabels.join("\n") + (ids.length > selectedLabels.length ? t("accounts.removePreviewMore", { count: ids.length }) : "")
      : "";
    if (!window.confirm(t("accounts.removeConfirm", { count: ids.length, preview }))) {
      return;
    }

    props.setBusy("bulk-remove");
    props.setStatus(t("accounts.removeInProgress", { count: ids.length }));
    try {
      const result = await fetchJson<AdminConfig & { removedProfileCount?: number }>("/_gateway/admin/profiles/remove-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ profileIds: ids }),
      });

      props.setConfig(result);
      setSelectedProfiles({});
      props.setStatus(t("accounts.removeDone", { count: result.removedProfileCount ?? ids.length }));
    } catch (error) {
      props.setStatus(t("accounts.removeFailed", { error: errorMessage(error) }));
    } finally {
      props.setBusy(null);
    }
  }

  function selectProfileIds(ids: string[], message: string) {
    if (ids.length === 0) {
      props.setStatus(t("accounts.removeNoSelection"));
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
      onSelectVisible={() => selectProfileIds(visibleProfileIds, t("accounts.selectedVisible", { count: visibleProfileIds.length }))}
      onClearSelected={() => {
        setSelectedProfiles({});
        props.setStatus(t("accounts.selectionCleared"));
      }}
      onToggle={(profileId) => setExpandedProfiles((items) => ({ ...items, [profileId]: !items[profileId] }))}
      onAction={runProfileAction}
      onLocate={() => props.activeProfile && document.querySelector(`[data-profile-card="${props.activeProfile.profileId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      onExportSelected={() => {
        const ids = selectedProfileIds;
        if (ids.length === 0) {
          props.setStatus(t("accounts.exportPleaseSelect"));
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
