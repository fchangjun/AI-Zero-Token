import { Code2, Globe2, Info, Loader2, RefreshCw, Search } from "lucide-react";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import { profileHealth, profileInitial, profileLabel, getPlanKey, isAuthInvalid, isCodexActiveProfile, primaryUsage, quotaBarTone, resetLabel, resetTime, secondaryUsage, usageCorner, authStatusText, imageCapability, getPlanType } from "@/shared/lib/profiles";
import type { AccountStatItem, BusyAction, ProfileFilter } from "@/shared/lib/app-types";
import { InfoRow } from "@/shared/components/InfoRow";
import { formatFullTime } from "@/shared/lib/format";
import { useLocaleValue, useT } from "@/i18n";

export function AccountsPanel(props: {
  config: AdminConfig | null;
  profiles: ProfileSummary[];
  accountStats: AccountStatItem[];
  showEmails: boolean;
  filter: ProfileFilter;
  selectedProfiles: Record<string, boolean>;
  expandedProfiles: Record<string, boolean>;
  selectedCount: number;
  visibleCount: number;
  busy: BusyAction;
  onFilter: (filter: ProfileFilter) => void;
  onSelect: (profileId: string, checked: boolean) => void;
  onSelectVisible: () => void;
  onClearSelected: () => void;
  onToggle: (profileId: string) => void;
  onAction: (action: "activate" | "apply-codex" | "sync-quota" | "remove" | "export", profile: ProfileSummary) => void;
  onLocate: () => void;
  onExportSelected: () => void;
  onRemoveSelected: () => void;
  onAddAccount: () => void;
  onRefreshStatus: () => void;
  onClearAccounts: () => void;
}) {
  const t = useT();
  const locale = useLocaleValue();
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";
  const codexAccountId = props.config?.codex?.accountId;
  const gridCountClass =
    props.profiles.length <= 0 ? "" : props.profiles.length === 1 ? "profile-count-1" : props.profiles.length === 2 ? "profile-count-2" : props.profiles.length === 3 ? "profile-count-3" : "profile-count-many";

  return (
    <section className="card" id="accounts">
      <div className="section-head">
        <div>
          <h2>{t("accountsPanel.title")}</h2>
          <p>{t("accountsPanel.description")}</p>
        </div>
        <div className="section-actions">
          <button className="btn-secondary" type="button" onClick={props.onLocate}>
            {t("accountsPanel.locateCurrent")}
          </button>
          <button className="btn-secondary" type="button" onClick={props.onExportSelected}>
            {t("accountsPanel.exportSelected")}
          </button>
          <button className="btn-secondary" type="button" onClick={props.onSelectVisible} disabled={props.visibleCount === 0}>
            {t("accountsPanel.selectAllVisible")}
          </button>
          <button className="btn-secondary" type="button" onClick={props.onClearSelected} disabled={props.selectedCount === 0}>
            {t("accountsPanel.clearSelection")}
          </button>
          <button className="btn-danger" type="button" onClick={props.onRemoveSelected} disabled={props.selectedCount === 0 || props.busy === "bulk-remove"}>
            {t("accountsPanel.removeSelected")}
          </button>
          <button className="btn-primary" type="button" onClick={props.onAddAccount}>
            {t("accountsPanel.addAccount")}
          </button>
          <button className="btn-secondary" type="button" onClick={props.onRefreshStatus}>
            {t("accountsPanel.refreshStatus")}
          </button>
          <button className="btn-danger" type="button" onClick={props.onClearAccounts}>
            {t("accountsPanel.clearAccounts")}
          </button>
        </div>
      </div>

      <div className="account-stat-strip" aria-label={t("accountsPanel.statAriaLabel")}>
        {props.accountStats.map((item) => (
          <button
            className={`account-stat-pill tone-${item.tone} ${props.filter.status === item.key ? "is-active" : ""}`}
            key={item.key}
            type="button"
            onClick={() => props.onFilter({ ...props.filter, status: item.key })}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </button>
        ))}
      </div>

      <div className="filter-row">
        <label className="search-box">
          <Search size={16} />
          <input value={props.filter.search} onChange={(event) => props.onFilter({ ...props.filter, search: event.target.value })} placeholder={t("accountsPanel.searchPlaceholder")} />
        </label>
        <select className="control" value={props.filter.status} onChange={(event) => props.onFilter({ ...props.filter, status: event.target.value as ProfileFilter["status"] })}>
          <option value="all">{t("accountsPanel.filterStatusAll")}</option>
          <option value="available">{t("accountsPanel.filterStatusAvailable")}</option>
          <option value="unavailable">{t("accountsPanel.filterStatusUnavailable")}</option>
          <option value="active">{t("accountsPanel.filterStatusActive")}</option>
          <option value="api-active">{t("accountsPanel.filterStatusApiActive")}</option>
          <option value="codex-active">{t("accountsPanel.filterStatusCodexActive")}</option>
          <option value="healthy">{t("accountsPanel.filterStatusHealthy")}</option>
          <option value="warning">{t("accountsPanel.filterStatusWarning")}</option>
          <option value="unknown">{t("accountsPanel.filterStatusUnknown")}</option>
          <option value="exhausted">{t("accountsPanel.filterStatusExhausted")}</option>
          <option value="invalid">{t("accountsPanel.filterStatusInvalid")}</option>
          <option value="login-invalid">{t("accountsPanel.filterStatusLoginInvalid")}</option>
          <option value="auth-error">{t("accountsPanel.filterStatusAuthError")}</option>
          <option value="expired">{t("accountsPanel.filterStatusExpired")}</option>
          <option value="free">{t("accountsPanel.filterStatusFree")}</option>
          <option value="plus">{t("accountsPanel.filterStatusPlus")}</option>
          <option value="pro-team">{t("accountsPanel.filterStatusProTeam")}</option>
          <option value="auto-included">{t("accountsPanel.filterStatusAutoIncluded")}</option>
          <option value="auto-excluded">{t("accountsPanel.filterStatusAutoExcluded")}</option>
        </select>
        <select className="control" value={props.filter.sort} onChange={(event) => props.onFilter({ ...props.filter, sort: event.target.value as ProfileFilter["sort"] })}>
          <option value="quota-desc">{t("accountsPanel.sortDefault")}</option>
          <option value="latency-asc">{t("accountsPanel.sortQuotaUpdated")}</option>
          <option value="expiry-asc">{t("accountsPanel.sortExpiry")}</option>
          <option value="name-asc">{t("accountsPanel.sortName")}</option>
          <option value="quota-asc">{t("accountsPanel.sortQuotaAsc")}</option>
          <option value="plan-desc">{t("accountsPanel.sortPlan")}</option>
          <option value="email-asc">{t("accountsPanel.sortEmail")}</option>
        </select>
        <span className="account-selected-count">{t("accountsPanel.selectedCount", { count: props.selectedCount })}</span>
      </div>

      <div className={`account-grid ${gridCountClass}`}>
        {props.profiles.length === 0 ? (
          <div className="empty-state">{t("accountsPanel.emptyState")}</div>
        ) : (
          props.profiles.map((profile) => {
            const health = profileHealth(profile, t);
            const primary = primaryUsage(profile);
            const secondary = secondaryUsage(profile);
            const expanded = Boolean(props.expandedProfiles[profile.profileId]);
            const codexActive = isCodexActiveProfile(profile, codexAccountId);
            const corner = usageCorner(profile, codexActive, t);
            const authInvalid = isAuthInvalid(profile);
            const busyPrefix = `profile:` as const;
            const isBusy = typeof props.busy === "string" && props.busy.startsWith(`${busyPrefix}`) && props.busy.endsWith(profile.profileId);
            const refreshBusy = props.busy === `profile:sync-quota:${profile.profileId}`;
            const codexApplyUnsupported = profile.codexApplySupported === false;
            const codexApplyReason = profile.codexApplyReason || t("accountsPanel.codexApplyReasonDefault");
            const codexButtonDisabled = codexActive || isBusy || authInvalid || codexApplyUnsupported;
            const codexButtonLabel = authInvalid ? t("accountsPanel.codexButtonUnavailable") : codexActive ? t("accountsPanel.codexButtonActive") : codexApplyUnsupported ? t("accountsPanel.codexButtonGatewayOnly") : t("accountsPanel.codexButtonApply");
            const imageAbility = imageCapability(profile, t);
            const exportAudit = profile.exportAudit;
            const exportAuditLabel = exportAudit?.exported ? t("accountsPanel.exportedCount", { count: exportAudit.count }) : t("accountsPanel.notExported");
            return (
              <article className={`account-card plan-${getPlanKey(profile)} ${authInvalid ? "is-auth-invalid" : ""}`} data-profile-card={profile.profileId} key={profile.profileId} title={authInvalid ? authStatusText(profile, t, locale) : undefined}>
                {corner && (
                  <span className={`usage-corner ${corner.className}`}>
                    <span>{corner.label}</span>
                  </span>
                )}
                <div className="account-head">
                  <div className="account-title">
                    <div className="account-name">
                      <span className="avatar">{profileInitial(profile)}</span>
                      <strong>{profileLabel(profile, props.showEmails)}</strong>
                      <button aria-label={t("accountsPanel.refreshQuotaAria")} className="account-icon-btn" disabled={isBusy} onClick={() => props.onAction("sync-quota", profile)} title={t("accountsPanel.refreshQuota")} type="button">
                        {refreshBusy ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                      </button>
                    </div>
                    <div className="badge-row">
                      <span className="badge brand">{getPlanType(profile)}</span>
                      <span className={`badge ${health.tone}`}>{health.label}</span>
                      <span className={`badge ${imageAbility.ok ? "green" : "orange"}`}>gpt-image-2</span>
                      <span className={`badge ${exportAudit?.exported ? "orange" : "muted"}`}>{exportAuditLabel}</span>
                    </div>
                  </div>
                  <label className="account-select">
                    <input type="checkbox" checked={Boolean(props.selectedProfiles[profile.profileId])} onChange={(event) => props.onSelect(profile.profileId, event.target.checked)} />
                    <span>{t("accountsPanel.select")}</span>
                  </label>
                </div>

                <div className="account-metrics">
                  <QuotaBar label={resetLabel(profile, "primary", t)} value={primary} tone={quotaBarTone(primary)} usedLabel={t("accountsPanel.quotaUsed")} remainingLabel={t("accountsPanel.quotaRemaining")} remainingStrongLabel={t("accountsPanel.quotaRemainingStrong")} />
                  <QuotaBar label={resetLabel(profile, "secondary", t)} value={secondary} tone={quotaBarTone(secondary)} usedLabel={t("accountsPanel.quotaUsed")} remainingLabel={t("accountsPanel.quotaRemaining")} remainingStrongLabel={t("accountsPanel.quotaRemainingStrong")} />
                </div>

                <div className="usage-status-row">
                  <span className={`usage-status ${profile.isActive ? "is-active" : ""}`}>
                    <Globe2 size={14} />
                    <span>API</span>
                    <span className={`usage-dot ${profile.isActive ? "active" : ""}`} />
                    <span className="usage-state-text">{profile.isActive ? t("accountsPanel.usageInUse") : t("accountsPanel.usageIdle")}</span>
                  </span>
                  <span className={`usage-status ${codexActive ? "is-active" : ""}`}>
                    <Code2 size={14} />
                    <span>Codex</span>
                    <span className={`usage-dot ${codexActive ? "active" : ""}`} />
                    <span className="usage-state-text">{codexActive ? t("accountsPanel.usageInUse") : t("accountsPanel.usageIdle")}</span>
                  </span>
                </div>

                <div className="compact-meta-row">
                  <div className="compact-reset-list">
                    <div className="compact-meta-item">
                      <label>{resetLabel(profile, "primary", t)}</label>
                      <strong>{resetTime(profile, "primary")}</strong>
                    </div>
                    <div className="compact-meta-item">
                      <label>{resetLabel(profile, "secondary", t)}</label>
                      <strong>{resetTime(profile, "secondary")}</strong>
                    </div>
                  </div>
                  <div className="compact-meta-actions">
                    <button className={`details-toggle ${expanded ? "is-expanded" : ""}`} type="button" onClick={() => props.onToggle(profile.profileId)}>
                      <span>{expanded ? t("accountsPanel.collapseDetails") : t("accountsPanel.expandDetails")}</span>
                      <ChevronIcon />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="meta-grid">
                    <InfoRow label={t("accountsPanel.plan")} value={getPlanType(profile)} />
                    <InfoRow label="Account ID" value={props.showEmails ? profile.accountId : profile.accountId} code />
                    <InfoRow label={t("accountsPanel.codexApp")} value={codexApplyUnsupported ? codexApplyReason : t("accountsPanel.codexApplyOk")} />
                    <InfoRow label="Profile ID" value={props.showEmails ? profile.profileId : profile.profileId} code />
                    <InfoRow label={t("accountsPanel.authStatus")} value={authStatusText(profile, t, locale)} />
                    <InfoRow label={t("accountsPanel.imageCapability")} value={imageAbility.ok ? t("accountsPanel.imageOk") : imageAbility.detail} />
                    <InfoRow label={t("accountsPanel.exportRecord")} value={formatExportAudit(exportAudit, t, intlLocale)} />
                    <InfoRow label={t("accountsPanel.expiresAt")} value={profile.expiresAt ? new Date(profile.expiresAt).toLocaleString(intlLocale) : "-"} />
                    <InfoRow label={t("accountsPanel.quotaSnapshot")} value={profile.quota?.capturedAt ? new Date(profile.quota.capturedAt).toLocaleString(intlLocale) : "-"} />
                  </div>
                )}

                <div className="account-actions">
                  <button className={`btn-secondary ${profile.isActive ? "is-current" : ""}`} type="button" onClick={() => props.onAction("activate", profile)} disabled={profile.isActive || isBusy || authInvalid}>
                    {authInvalid ? t("accountsPanel.gatewayUnavailable") : profile.isActive ? t("accountsPanel.gatewayActive") : t("accountsPanel.applyGateway")}
                  </button>
                  <span className={`codex-action-wrap ${codexApplyUnsupported ? "is-unsupported" : ""}`} title={codexApplyUnsupported ? codexApplyReason : undefined}>
                    <button className={`btn-secondary ${codexActive ? "is-current codex" : ""}`} type="button" onClick={() => props.onAction("apply-codex", profile)} disabled={codexButtonDisabled}>
                      <span>{codexButtonLabel}</span>
                      {codexApplyUnsupported && <Info className="codex-disabled-icon" size={13} aria-hidden="true" />}
                    </button>
                  </span>
                  <button className="btn-secondary" type="button" onClick={() => props.onAction("export", profile)} disabled={isBusy}>
                    {t("accountsPanel.export")}
                  </button>
                  <button className="btn-danger" type="button" onClick={() => props.onAction("remove", profile)} disabled={isBusy}>
                    {t("accountsPanel.remove")}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function formatExportAudit(audit: ProfileSummary["exportAudit"], t: (key: string, values?: Record<string, string | number>) => string, locale: string): string {
  if (!audit?.exported) {
    return t("accountsPanel.exportNotExported");
  }

  const kindLabel = audit.lastExportKind === "single" ? t("accountsPanel.exportKindSingle") : audit.lastExportKind === "batch" ? t("accountsPanel.exportKindBatch") : t("accountsPanel.exportKindAll");
  return t("accountsPanel.exportAuditDetail", { count: audit.count, time: formatFullTime(audit.lastExportedAt, locale), kind: kindLabel });
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function QuotaBar(props: { label: string; value: number; tone: "blue" | "orange" | "red"; usedLabel: string; remainingLabel: string; remainingStrongLabel: string }) {
  return (
    <div className="quota-row">
      <div className="quota-line">
        <span>{props.label} · {props.usedLabel} {props.value}% / {props.remainingLabel} {100 - props.value}%</span>
        <strong>{props.remainingStrongLabel} {100 - props.value}%</strong>
      </div>
      <div className="progress-track">
        <div className={`progress-bar ${props.tone}`} style={{ width: `${props.value}%` }} />
      </div>
    </div>
  );
}
