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

export function OverviewPage(props: {
  config: AdminConfig | null;
  activeProfile: ProfileSummary | null;
  codexProfile: ProfileSummary | null;
  codexAccountId?: string;
  codexEmail?: string;
  showEmails: boolean;
  requestLogs: RequestLog[];
}) {
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(60);
  const averageDuration = props.requestLogs.length ? props.requestLogs.reduce((sum, item) => sum + item.durationMs, 0) / props.requestLogs.length : 0;

  return (
    <>
      <section className="summary-grid desktop-summary-grid overview-summary-grid">
        <StatCard icon={Users} label="账号总数" value={String(props.config?.status.profileCount || 0)} detail="已保存到本地账号池" tone="blue" />
        <StatCard
          icon={Globe2}
          label="当前账号状态"
          value={
            <UsageAccountSummary
              apiProfile={props.activeProfile}
              codexProfile={props.codexProfile}
              codexEmail={props.codexEmail}
              codexAccountId={props.codexAccountId}
              showEmails={props.showEmails}
            />
          }
          detail={props.config?.status.loggedIn || props.codexProfile ? "" : "需要先登录或导入账号"}
          tone={props.config?.status.loggedIn || props.codexProfile ? "green" : "orange"}
          compact
        />
        <StatCard icon={Zap} label="今日请求数" value={String(props.requestLogs.length)} detail="基于本页最近测试记录" tone="blue" />
        <StatCard icon={Clock3} label="平均耗时" value={props.requestLogs.length ? formatDuration(averageDuration) : "-"} detail={`统计最近 ${props.requestLogs.length} 次`} tone="orange" />
        <StatCard icon={ShieldCheck} label="服务状态" value={props.config?.status.loggedIn ? "运行中" : "等待登录"} detail="网关可转发请求" tone={props.config?.status.loggedIn ? "green" : "orange"} />
        <StatCard icon={CheckCircle2} label="默认模型" value={props.config?.settings.defaultModel || "-"} detail="未显式指定 model 时生效" tone="green" />
      </section>

      <section className="overview-grid">
        <TrendCard config={props.config} requestLogs={props.requestLogs} windowMinutes={trendWindow} onWindow={setTrendWindow} />
        <GatewayInfoCard config={props.config} />
      </section>
    </>
  );
}
