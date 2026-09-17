import { useState } from "react";
import { CheckCircle2, Clock3, Globe2, ShieldCheck, Users, Zap } from "lucide-react";
import type { AdminConfig, ProfileSummary, RequestLog } from "@/shared/types";
import type { TrendWindow } from "@/shared/lib/app-types";
import { getPlanType } from "@/shared/lib/profiles";
import { StatCard } from "@/shared/components/StatCard";
import { UsageAccountSummary } from "@/shared/components/UsageAccountSummary";
import { TrendCard } from "@/shared/components/TrendCard";
import { GatewayInfoCard } from "@/shared/components/GatewayInfoCard";
import { formatDuration } from "@/shared/lib/format";
import { useLocaleValue, useT } from "@/i18n";

export function OverviewPage(props: {
  config: AdminConfig | null;
  activeProfile: ProfileSummary | null;
  codexProfile: ProfileSummary | null;
  codexAccountId?: string;
  codexEmail?: string;
  showEmails: boolean;
  requestLogs: RequestLog[];
}) {
  const t = useT();
  const locale = useLocaleValue();
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(60);
  const averageDuration = props.requestLogs.length ? props.requestLogs.reduce((sum, item) => sum + item.durationMs, 0) / props.requestLogs.length : 0;
  const todayUsage = props.config?.usage?.today;
  const todayFailureCount = todayUsage?.failureCount ?? 0;

  const formatNumber = (value: number) => new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN").format(Math.round(value || 0));

  return (
    <>
      <section className="summary-grid desktop-summary-grid overview-summary-grid">
        <StatCard icon={Users} label={t("overview.accountCount")} value={String(props.config?.status.profileCount || 0)} detail={t("overview.accountCountDetail")} tone="blue" />
        <StatCard
          icon={Globe2}
          label={t("overview.activeAccountStatus")}
          value={
            <UsageAccountSummary
              apiProfile={props.activeProfile}
              codexProfile={props.codexProfile}
              codexEmail={props.codexEmail}
              codexAccountId={props.codexAccountId}
              showEmails={props.showEmails}
            />
          }
          detail={props.config?.status.loggedIn || props.codexProfile ? "" : t("overview.needsLogin")}
          tone={props.config?.status.loggedIn || props.codexProfile ? "green" : "orange"}
          compact
        />
        <StatCard
          icon={Zap}
          label={t("overview.todayRequests")}
          value={formatNumber(todayUsage?.requestCount ?? props.requestLogs.length)}
          detail={todayUsage ? t("overview.todayRequestsDetailWithUsage", { success: formatNumber(todayUsage.successCount), failure: formatNumber(todayUsage.failureCount) }) : t("overview.todayRequestsDetail")}
          tone="blue"
        />
        <StatCard
          icon={Clock3}
          label={t("overview.todayTokens")}
          value={formatNumber(todayUsage?.totalTokens ?? 0)}
          detail={todayUsage ? t("overview.todayTokensDetailWithUsage", { unknown: formatNumber(todayUsage.unknownTokenCount) }) : t("overview.todayTokensDetailFallback", { count: props.requestLogs.length })}
          tone="orange"
        />
        <StatCard
          icon={ShieldCheck}
          label={t("overview.serviceStatus")}
          value={props.config?.status.loggedIn ? t("overview.running") : t("overview.waitingLogin")}
          detail={t("overview.canForward")}
          tone={props.config?.status.loggedIn ? "green" : "orange"}
        />
        <StatCard
          icon={CheckCircle2}
          label={t("overview.todayErrors")}
          value={formatNumber(todayFailureCount)}
          detail={t("overview.averageDuration", { duration: todayUsage ? formatDuration(todayUsage.averageDurationMs) : formatDuration(averageDuration) })}
          tone={todayFailureCount > 0 ? "orange" : "green"}
        />
      </section>

      <section className="overview-grid">
        <TrendCard config={props.config} requestLogs={props.requestLogs} windowMinutes={trendWindow} onWindow={setTrendWindow} />
        <GatewayInfoCard config={props.config} />
      </section>
    </>
  );
}

// getPlanType import is preserved for downstream helper callers; the overview page itself does not use it directly.
void getPlanType;
