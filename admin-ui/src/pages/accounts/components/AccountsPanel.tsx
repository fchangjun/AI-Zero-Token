import { Code2, Globe2, Loader2, RefreshCw, Search } from "lucide-react";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import { profileHealth, profileInitial, profileLabel, getPlanKey, isAuthInvalid, primaryUsage, quotaBarTone, resetLabel, resetTime, secondaryUsage, usageCorner, authStatusText, imageCapability, getPlanType } from "@/shared/lib/profiles";
import type { AccountStatItem, BusyAction, ProfileFilter } from "@/shared/lib/app-types";
import { InfoRow } from "@/shared/components/InfoRow";
import { formatFullTime } from "@/shared/lib/format";

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
  const codexAccountId = props.config?.codex?.accountId;
  const gridCountClass =
    props.profiles.length <= 0 ? "" : props.profiles.length === 1 ? "profile-count-1" : props.profiles.length === 2 ? "profile-count-2" : props.profiles.length === 3 ? "profile-count-3" : "profile-count-many";

  return (
    <section className="card" id="accounts">
      <div className="section-head">
        <div>
          <h2>账号额度预览</h2>
          <p>账号信息采用卡片式布局展示，支持搜索、状态筛选和额度排序。</p>
        </div>
        <div className="section-actions">
          <button className="btn-secondary" type="button" onClick={props.onLocate}>
            定位当前账号
          </button>
          <button className="btn-secondary" type="button" onClick={props.onExportSelected}>
            导出所选
          </button>
          <button className="btn-secondary" type="button" onClick={props.onSelectVisible} disabled={props.visibleCount === 0}>
            全选筛选结果
          </button>
          <button className="btn-secondary" type="button" onClick={props.onClearSelected} disabled={props.selectedCount === 0}>
            取消选择
          </button>
          <button className="btn-danger" type="button" onClick={props.onRemoveSelected} disabled={props.selectedCount === 0 || props.busy === "bulk-remove"}>
            删除所选
          </button>
          <button className="btn-primary" type="button" onClick={props.onAddAccount}>
            新增账号
          </button>
          <button className="btn-secondary" type="button" onClick={props.onRefreshStatus}>
            刷新状态
          </button>
          <button className="btn-danger" type="button" onClick={props.onClearAccounts}>
            清空账号
          </button>
        </div>
      </div>

      <div className="account-stat-strip" aria-label="账号池统计">
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
          <input value={props.filter.search} onChange={(event) => props.onFilter({ ...props.filter, search: event.target.value })} placeholder="搜索邮箱、账号 ID 或 Profile ID" />
        </label>
        <select className="control" value={props.filter.status} onChange={(event) => props.onFilter({ ...props.filter, status: event.target.value as ProfileFilter["status"] })}>
          <option value="all">全部状态</option>
          <option value="available">可用</option>
          <option value="unavailable">不可用</option>
          <option value="active">使用中</option>
          <option value="api-active">API 使用中</option>
          <option value="codex-active">Codex 使用中</option>
          <option value="healthy">健康</option>
          <option value="warning">即将耗尽</option>
          <option value="exhausted">额度耗尽</option>
          <option value="invalid">登录/认证异常</option>
          <option value="login-invalid">登录失效</option>
          <option value="auth-error">认证异常</option>
          <option value="expired">已过期</option>
          <option value="free">Free</option>
          <option value="plus">Plus</option>
          <option value="pro-team">Pro/Team</option>
          <option value="auto-included">参与轮换</option>
          <option value="auto-excluded">排除轮换</option>
        </select>
        <select className="control" value={props.filter.sort} onChange={(event) => props.onFilter({ ...props.filter, sort: event.target.value as ProfileFilter["sort"] })}>
          <option value="quota-desc">默认排序</option>
          <option value="latency-asc">按额度更新时间</option>
          <option value="expiry-asc">按过期时间</option>
          <option value="name-asc">按名称排序</option>
          <option value="quota-asc">按剩余额度升序</option>
          <option value="plan-desc">按套餐排序</option>
          <option value="email-asc">按邮箱排序</option>
        </select>
        <span className="account-selected-count">已选择 {props.selectedCount} 个</span>
      </div>

      <div className={`account-grid ${gridCountClass}`}>
        {props.profiles.length === 0 ? (
          <div className="empty-state">还没有匹配的账号。可以新增账号或调整筛选条件。</div>
        ) : (
          props.profiles.map((profile) => {
            const health = profileHealth(profile);
            const primary = primaryUsage(profile);
            const secondary = secondaryUsage(profile);
            const expanded = Boolean(props.expandedProfiles[profile.profileId]);
            const codexActive = Boolean(codexAccountId && profile.accountId === codexAccountId);
            const corner = usageCorner(profile, codexActive);
            const authInvalid = isAuthInvalid(profile);
            const imageAbility = imageCapability(profile);
            const exportAudit = profile.exportAudit;
            const exportAuditLabel = exportAudit?.exported ? `已导出 ${exportAudit.count} 次` : "未导出";
            const busyPrefix = `profile:` as const;
            const isBusy = typeof props.busy === "string" && props.busy.startsWith(`${busyPrefix}`) && props.busy.endsWith(profile.profileId);
            const refreshBusy = props.busy === `profile:sync-quota:${profile.profileId}`;
            return (
              <article className={`account-card plan-${getPlanKey(profile)} ${authInvalid ? "is-auth-invalid" : ""}`} data-profile-card={profile.profileId} key={profile.profileId} title={authInvalid ? authStatusText(profile) : undefined}>
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
                      <button aria-label="刷新额度" className="account-icon-btn" disabled={isBusy} onClick={() => props.onAction("sync-quota", profile)} title="刷新额度" type="button">
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
                    <span>选择</span>
                  </label>
                </div>

                <div className="account-metrics">
                  <QuotaBar label={resetLabel(profile, "primary")} value={primary} tone={quotaBarTone(primary)} />
                  <QuotaBar label={resetLabel(profile, "secondary")} value={secondary} tone={quotaBarTone(secondary)} />
                </div>

                <div className="usage-status-row">
                  <span className={`usage-status ${profile.isActive ? "is-active" : ""}`}>
                    <Globe2 size={14} />
                    <span>API</span>
                    <span className={`usage-dot ${profile.isActive ? "active" : ""}`} />
                    <span className="usage-state-text">{profile.isActive ? "使用中" : "未使用"}</span>
                  </span>
                  <span className={`usage-status ${codexActive ? "is-active" : ""}`}>
                    <Code2 size={14} />
                    <span>Codex</span>
                    <span className={`usage-dot ${codexActive ? "active" : ""}`} />
                    <span className="usage-state-text">{codexActive ? "使用中" : "未使用"}</span>
                  </span>
                </div>

                <div className="compact-meta-row">
                  <div className="compact-reset-list">
                    <div className="compact-meta-item">
                      <label>{resetLabel(profile, "primary")}</label>
                      <strong>{resetTime(profile, "primary")}</strong>
                    </div>
                    <div className="compact-meta-item">
                      <label>{resetLabel(profile, "secondary")}</label>
                      <strong>{resetTime(profile, "secondary")}</strong>
                    </div>
                  </div>
                  <div className="compact-meta-actions">
                    <button className={`details-toggle ${expanded ? "is-expanded" : ""}`} type="button" onClick={() => props.onToggle(profile.profileId)}>
                      <span>{expanded ? "收起详情" : "查看详情"}</span>
                      <ChevronIcon />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="meta-grid">
                    <InfoRow label="套餐" value={getPlanType(profile)} />
                    <InfoRow label="Account ID" value={props.showEmails ? profile.accountId : profile.accountId} code />
                    <InfoRow label="Profile ID" value={props.showEmails ? profile.profileId : profile.profileId} code />
                    <InfoRow label="认证状态" value={authStatusText(profile)} />
                    <InfoRow label="生图能力" value={imageAbility.ok ? "gpt-image-2 可用" : imageAbility.detail} />
                    <InfoRow label="导出记录" value={formatExportAudit(exportAudit)} />
                    <InfoRow label="过期时间" value={profile.expiresAt ? new Date(profile.expiresAt).toLocaleString("zh-CN") : "-"} />
                    <InfoRow label="额度快照" value={profile.quota?.capturedAt ? new Date(profile.quota.capturedAt).toLocaleString("zh-CN") : "-"} />
                  </div>
                )}

                <div className="account-actions">
                  <button className={`btn-secondary ${profile.isActive ? "is-current" : ""}`} type="button" onClick={() => props.onAction("activate", profile)} disabled={profile.isActive || isBusy || authInvalid}>
                    {authInvalid ? "网关不可用" : profile.isActive ? "网关使用中" : "应用网关"}
                  </button>
                  <button className={`btn-secondary ${codexActive ? "is-current codex" : ""}`} type="button" onClick={() => props.onAction("apply-codex", profile)} disabled={codexActive || isBusy || authInvalid}>
                    {authInvalid ? "Codex 不可用" : codexActive ? "Codex 使用中" : "应用 Codex"}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => props.onAction("export", profile)} disabled={isBusy}>
                    导出
                  </button>
                  <button className="btn-danger" type="button" onClick={() => props.onAction("remove", profile)} disabled={isBusy}>
                    删除
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

function formatExportAudit(audit: ProfileSummary["exportAudit"]): string {
  if (!audit?.exported) {
    return "未导出";
  }

  const kindLabel = audit.lastExportKind === "single" ? "单账号导出" : audit.lastExportKind === "batch" ? "批量导出" : "全部导出";
  return `${audit.count} 次，最近 ${formatFullTime(audit.lastExportedAt)}，方式 ${kindLabel}`;
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function QuotaBar(props: { label: string; value: number; tone: "blue" | "orange" | "red" }) {
  return (
    <div className="quota-row">
      <div className="quota-line">
        <span>{props.label} · 已用 {props.value}% / 剩余 {100 - props.value}%</span>
        <strong>剩余 {100 - props.value}%</strong>
      </div>
      <div className="progress-track">
        <div className={`progress-bar ${props.tone}`} style={{ width: `${props.value}%` }} />
      </div>
    </div>
  );
}
