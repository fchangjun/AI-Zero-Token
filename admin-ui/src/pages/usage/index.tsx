import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Archive, BarChart3, Camera, Clock3, Database, DollarSign, Loader2, RefreshCw, Sigma, Zap } from "lucide-react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig, UsageAggregate, UsageDimensionRow, UsageResetResult, UsageSummary } from "@/shared/types";
import { formatDuration, formatFullTime } from "@/shared/lib/format";
import { errorMessage } from "@/shared/lib/app-utils";
import { StatCard } from "@/shared/components/StatCard";
import { useT, useLocaleValue } from "@/i18n";
import type { Translator } from "@/shared/lib/profiles";

function emptyAggregate(): UsageAggregate {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    inputTokens: 0,
    uncachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    cacheCreationCostUsd: 0,
    cacheReadCostUsd: 0,
    estimatedCostUsd: 0,
    unknownTokenCount: 0,
    unknownTokenStatusCounts: {},
    imageCount: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
    p95DurationMs: 0,
    durationBuckets: {},
  };
}

function formatNumber(value: number, intlLocale: string = "zh-CN"): string {
  return new Intl.NumberFormat(intlLocale).format(Math.round(value || 0));
}

function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  }
  return formatNumber(value);
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0.00";
  }
  if (value < 0.01) {
    return `$${value.toFixed(5)}`;
  }
  if (value < 1) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

function summarizeLabel(aggregate: UsageAggregate, t: Translator, intlLocale: string): string {
  return t("usage.summarize", { success: formatNumber(aggregate.successCount, intlLocale), failure: formatNumber(aggregate.failureCount, intlLocale) });
}

function cacheHitLabel(aggregate: UsageAggregate, t: Translator): string {
  const inputTokens = aggregate.inputTokens || 0;
  const cacheReadTokens = aggregate.cacheReadTokens || 0;
  if (inputTokens <= 0 || cacheReadTokens <= 0) {
    return t("usage.cacheHitZero");
  }
  return t("usage.cacheHitRate", { rate: Math.min(100, (cacheReadTokens / inputTokens) * 100).toFixed(1) });
}

function tokenUsageStatusLabel(status: string, t: Translator): string {
  switch (status) {
    case "captured":
      return t("usage.tokenStatus.captured");
    case "missing_terminal":
      return t("usage.tokenStatus.missingTerminal");
    case "terminal_without_usage":
      return t("usage.tokenStatus.terminalWithoutUsage");
    case "parse_failed":
      return t("usage.tokenStatus.parseFailed");
    case "upstream_error":
      return t("usage.tokenStatus.upstreamError");
    default:
      return t("usage.unknownUsageFallback");
  }
}

function unknownTokenReasonLabel(aggregate: UsageAggregate, t: Translator, intlLocale: string): string {
  const entries = Object.entries(aggregate.unknownTokenStatusCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) {
    return t("usage.unknownTokenAggregate", { count: formatNumber(aggregate.unknownTokenCount, intlLocale) });
  }
  const [status, count] = entries[0] ?? ["not_returned", 0];
  return t("usage.unknownTokenTop", {
    count: formatNumber(aggregate.unknownTokenCount, intlLocale),
    status: tokenUsageStatusLabel(status, t),
    subCount: formatNumber(count, intlLocale),
  });
}

function ScopeCard(props: {
  title: string;
  detail: string;
  aggregate?: UsageAggregate;
  t: Translator;
  intlLocale: string;
}) {
  const aggregate = props.aggregate ?? emptyAggregate();
  const t = props.t;
  return (
    <article className="usage-scope-card">
      <div>
        <span>{props.title}</span>
        <strong>{t("usage.scope.knownTokens", { tokens: formatTokens(aggregate.totalTokens) })}</strong>
        <p>{props.detail}</p>
      </div>
      <dl>
        <div>
          <dt>{t("usage.scope.newInput")}</dt>
          <dd>{formatTokens(aggregate.uncachedInputTokens)}</dd>
        </div>
        <div>
          <dt>{t("usage.scope.cacheRead")}</dt>
          <dd>{formatTokens(aggregate.cacheReadTokens)}</dd>
        </div>
        <div>
          <dt>{t("usage.scope.estimatedCost")}</dt>
          <dd>{formatUsd(aggregate.estimatedCostUsd)}</dd>
        </div>
        <div>
          <dt>{t("usage.scope.average")}</dt>
          <dd>{formatDuration(aggregate.averageDurationMs)}</dd>
        </div>
        <div>
          <dt>{t("usage.scope.p95")}</dt>
          <dd>{formatDuration(aggregate.p95DurationMs)}</dd>
        </div>
      </dl>
      <p className="usage-scope-footer">{summarizeLabel(aggregate, props.t, props.intlLocale)} · {cacheHitLabel(aggregate, props.t)} · {unknownTokenReasonLabel(aggregate, props.t, props.intlLocale)}</p>
    </article>
  );
}

function DimensionTable(props: {
  title: string;
  rows: UsageDimensionRow[];
  empty: string;
  t: Translator;
  intlLocale: string;
}) {
  const t = props.t;
  return (
    <section className="usage-table-card">
      <div className="usage-table-head">
        <h3>{props.title}</h3>
        <span>{t("usage.dimension.rowCount", { count: props.rows.length })}</span>
      </div>
      {props.rows.length === 0 ? (
        <div className="usage-empty">{props.empty}</div>
      ) : (
        <div className="usage-table-scroll">
          <table className="usage-table">
            <thead>
              <tr>
                <th>{t("usage.table.dim")}</th>
                <th>{t("usage.table.requests")}</th>
                <th>{t("usage.table.failures")}</th>
                <th>{t("usage.table.newInput")}</th>
                <th>{t("usage.table.cacheRead")}</th>
                <th>{t("usage.table.estimatedCost")}</th>
                <th>{t("usage.table.knownTokens")}</th>
                <th>{t("usage.table.unknownUsage")}</th>
                <th>{t("usage.table.images")}</th>
                <th>{t("usage.table.avgDuration")}</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{formatNumber(row.aggregate.requestCount, props.intlLocale)}</td>
                  <td>{formatNumber(row.aggregate.failureCount, props.intlLocale)}</td>
                  <td>{formatTokens(row.aggregate.uncachedInputTokens)}</td>
                  <td>{formatTokens(row.aggregate.cacheReadTokens)}</td>
                  <td>{formatUsd(row.aggregate.estimatedCostUsd)}</td>
                  <td>{formatTokens(row.aggregate.totalTokens)}</td>
                  <td>{formatNumber(row.aggregate.unknownTokenCount, props.intlLocale)}</td>
                  <td>{formatNumber(row.aggregate.imageCount, props.intlLocale)}</td>
                  <td>{formatDuration(row.aggregate.averageDurationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DailyTable(props: { rows: UsageSummary["daily"]; t: Translator; intlLocale: string }) {
  const t = props.t;
  return (
    <section className="usage-table-card usage-daily-card">
      <div className="usage-table-head">
        <h3>{t("usage.daily.title")}</h3>
        <span>{t("usage.daily.recentDays", { count: props.rows.length })}</span>
      </div>
      {props.rows.length === 0 ? (
        <div className="usage-empty">{t("usage.daily.empty")}</div>
      ) : (
        <div className="usage-table-scroll">
          <table className="usage-table">
            <thead>
              <tr>
                <th>{t("usage.table.date")}</th>
                <th>{t("usage.table.requests")}</th>
                <th>{t("usage.table.success")}</th>
                <th>{t("usage.table.failures")}</th>
                <th>{t("usage.table.newInput")}</th>
                <th>{t("usage.table.cacheRead")}</th>
                <th>{t("usage.table.estimatedCost")}</th>
                <th>{t("usage.table.knownInput")}</th>
                <th>{t("usage.table.knownOutput")}</th>
                <th>{t("usage.table.knownTotal")}</th>
                <th>{t("usage.table.unknownUsage")}</th>
                <th>{t("usage.table.images")}</th>
                <th>{t("usage.scope.p95")}</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{formatNumber(row.aggregate.requestCount, props.intlLocale)}</td>
                  <td>{formatNumber(row.aggregate.successCount, props.intlLocale)}</td>
                  <td>{formatNumber(row.aggregate.failureCount, props.intlLocale)}</td>
                  <td>{formatTokens(row.aggregate.uncachedInputTokens)}</td>
                  <td>{formatTokens(row.aggregate.cacheReadTokens)}</td>
                  <td>{formatUsd(row.aggregate.estimatedCostUsd)}</td>
                  <td>{formatTokens(row.aggregate.inputTokens)}</td>
                  <td>{formatTokens(row.aggregate.outputTokens)}</td>
                  <td>{formatTokens(row.aggregate.totalTokens)}</td>
                  <td>{formatNumber(row.aggregate.unknownTokenCount, props.intlLocale)}</td>
                  <td>{formatNumber(row.aggregate.imageCount, props.intlLocale)}</td>
                  <td>{formatDuration(row.aggregate.p95DurationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function UsagePage(props: {
  config: AdminConfig | null;
  setStatus: Dispatch<SetStateAction<string>>;
}) {
  const [usage, setUsage] = useState<UsageSummary | null>(props.config?.usage ?? null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const t = useT();
  const locale = useLocaleValue();
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";

  useEffect(() => {
    setUsage(props.config?.usage ?? null);
  }, [props.config?.usage]);

  async function refreshUsage() {
    setLoading(true);
    try {
      const next = await fetchJson<UsageSummary>("/_gateway/admin/usage");
      setUsage(next);
      props.setStatus(t("usage.refreshDone"));
    } catch (error) {
      props.setStatus(t("usage.refreshFailed", { error: errorMessage(error) }));
    } finally {
      setLoading(false);
    }
  }

  async function backupAndResetUsage() {
    if (!window.confirm(t("usage.backupConfirm"))) {
      return;
    }
    setResetting(true);
    try {
      const result = await fetchJson<UsageResetResult>("/_gateway/admin/usage/reset", { method: "POST" });
      setUsage(result.usage);
      props.setStatus(t("usage.backupDone", { dir: result.backupDir }));
    } catch (error) {
      props.setStatus(t("usage.backupFailed", { error: errorMessage(error) }));
    } finally {
      setResetting(false);
    }
  }

  const summary = usage;
  const lifetime = summary?.lifetime ?? emptyAggregate();
  const today = summary?.today ?? emptyAggregate();
  const startup = summary?.startup ?? emptyAggregate();
  const failureRate = useMemo(() => {
    if (lifetime.requestCount === 0) return "0%";
    return `${((lifetime.failureCount / lifetime.requestCount) * 100).toFixed(1)}%`;
  }, [lifetime.failureCount, lifetime.requestCount]);

  return (
    <section className="usage-page">
      <div className="usage-actions">
        <div>
          <span>{t("usage.actions.storageLabel")}</span>
          <code>{summary?.storageDir || t("usage.actions.storageDir")}</code>
        </div>
        <div className="usage-action-buttons">
          <button className="btn-secondary" type="button" onClick={() => void refreshUsage()} disabled={loading || resetting}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            {t("usage.actions.refresh")}
          </button>
          <button className="btn-danger" type="button" onClick={() => void backupAndResetUsage()} disabled={loading || resetting}>
            {resetting ? <Loader2 className="spin" size={16} /> : <Archive size={16} />}
            {t("usage.actions.backup")}
          </button>
        </div>
      </div>

      <section className="summary-grid desktop-summary-grid usage-summary-grid">
        <StatCard icon={Sigma} label={t("usage.stat.lifetimeTokensLabel")} value={formatTokens(lifetime.totalTokens)} detail={t("usage.stat.lifetimeTokensDetail", { newInput: formatTokens(lifetime.uncachedInputTokens), cacheRead: formatTokens(lifetime.cacheReadTokens) })} tone="blue" />
        <StatCard icon={Zap} label={t("usage.stat.todayTokensLabel")} value={formatTokens(today.totalTokens)} detail={t("usage.stat.todayTokensDetail", { date: summary?.todayDate || t("usage.today"), cache: cacheHitLabel(today, t) })} tone="green" />
        <StatCard icon={BarChart3} label={t("usage.stat.startupTokensLabel")} value={formatTokens(startup.totalTokens)} detail={t("usage.stat.startupTokensDetail", { cacheRead: formatTokens(startup.cacheReadTokens), startedAt: formatFullTime(summary?.startedAt, locale) })} tone="brand" />
        <StatCard icon={DollarSign} label={t("usage.stat.todayCostLabel")} value={formatUsd(today.estimatedCostUsd)} detail={t("usage.stat.todayCostDetail", { input: formatUsd(today.inputCostUsd + today.cacheCreationCostUsd + today.cacheReadCostUsd), output: formatUsd(today.outputCostUsd) })} tone="green" />
        <StatCard icon={Camera} label={t("usage.stat.imagesLabel")} value={formatNumber(lifetime.imageCount, intlLocale)} detail={t("usage.stat.imagesDetail")} tone="orange" />
        <StatCard icon={Clock3} label={t("usage.stat.lifetimeP95Label")} value={formatDuration(lifetime.p95DurationMs)} detail={t("usage.stat.lifetimeP95Detail", { average: formatDuration(lifetime.averageDurationMs) })} tone="orange" />
        <StatCard icon={Database} label={t("usage.stat.failureRateLabel")} value={failureRate} detail={t("usage.stat.failureRateDetail", { count: formatNumber(lifetime.failureCount, intlLocale) })} tone={lifetime.failureCount > 0 ? "orange" : "green"} />
      </section>

      <section className="usage-scope-grid">
        <ScopeCard title={t("usage.scope.todayTitle")} detail={t("usage.scope.todayDetail")} aggregate={today} t={t} intlLocale={intlLocale} />
        <ScopeCard title={t("usage.scope.startupTitle")} detail={t("usage.scope.startupDetail")} aggregate={startup} t={t} intlLocale={intlLocale} />
        <ScopeCard title={t("usage.scope.lifetimeTitle")} detail={t("usage.scope.lifetimeDetail")} aggregate={lifetime} t={t} intlLocale={intlLocale} />
      </section>

      <DailyTable rows={summary?.daily ?? []} t={t} intlLocale={intlLocale} />

      <section className="usage-dimension-grid">
        <DimensionTable title={t("usage.dimension.byAccount")} rows={summary?.byAccount ?? []} empty={t("usage.dimension.emptyAccount")} t={t} intlLocale={intlLocale} />
        <DimensionTable title={t("usage.dimension.byModel")} rows={summary?.byModel ?? []} empty={t("usage.dimension.emptyModel")} t={t} intlLocale={intlLocale} />
        <DimensionTable title={t("usage.dimension.byEndpoint")} rows={summary?.byEndpoint ?? []} empty={t("usage.dimension.emptyEndpoint")} t={t} intlLocale={intlLocale} />
        <DimensionTable title={t("usage.dimension.byTokenStatus")} rows={summary?.byTokenUsageStatus ?? []} empty={t("usage.dimension.emptyTokenStatus")} t={t} intlLocale={intlLocale} />
        <DimensionTable title={t("usage.dimension.byError")} rows={summary?.byError ?? []} empty={t("usage.dimension.emptyError")} t={t} intlLocale={intlLocale} />
        <DimensionTable title={t("usage.dimension.byImageRoute")} rows={summary?.byImageRoute ?? []} empty={t("usage.dimension.emptyImageRoute")} t={t} intlLocale={intlLocale} />
        <DimensionTable title={t("usage.dimension.bySource")} rows={summary?.bySource ?? []} empty={t("usage.dimension.emptySource")} t={t} intlLocale={intlLocale} />
      </section>
    </section>
  );
}
