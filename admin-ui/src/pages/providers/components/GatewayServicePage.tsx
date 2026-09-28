import { Loader2 } from "lucide-react";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";
import { AccountsPage } from "@/pages/accounts";
import { SettingsForm } from "@/pages/settings/SettingsForm";
import { autoSwitchEligibility } from "@/shared/lib/profiles";
import { useT } from "@/i18n";
import type { GatewayTab } from "../ModelServicesPage";
import { AccountPoolDetail } from "./AccountPoolDetail";
import { GatewayOverview } from "./GatewayOverview";

export function GatewayServicePage({ workspace: w, tab }: { workspace: UseAdminWorkspaceResult; tab: GatewayTab }) {
  const t = useT();
  const config = w.config;
  if (!config) return <div className="providers-loading"><Loader2 className="provider-spin" />正在读取账号池</div>;
  const excluded = new Set(config.settings.autoSwitch.excludedProfileIds);
  const available = config.profiles.filter(p => !excluded.has(p.profileId) && autoSwitchEligibility(p, t).key === "ready").length;
  const formProps = { config, showEmails: w.showEmails, setShowEmails: w.setShowEmails, busy: w.busy, status: w.status, setBusy: w.setBusy, setConfig: w.setConfig, setStatus: w.setStatus, refreshConfig: w.refreshConfig };
  return <div className="gateway-service-page">
    <div className="gateway-service-head"><div><h2>账号池 API 服务</h2><p>将已有账号统一提供为 API，供 Codex 和其他客户端调用。</p></div><span className="provider-status-badge is-success">API 服务运行中</span></div>
    <section className="provider-metrics">
      <div><span>账号总数</span><strong>{config.profiles.length}</strong></div>
      <div><span>符合轮换条件</span><strong>{available}</strong></div>
      <div><span>可用模型目录</span><strong>{config.models.length}</strong></div>
      <div><span>自动轮换</span><strong className="is-status">{config.settings.autoSwitch.enabled ? "已开启" : "未开启"}</strong></div>
    </section>
    <nav className="gateway-tabs" aria-label="账号池服务管理">{([ ["overview", "服务概览"], ["accounts", `账号池（${config.profiles.length}）`], ["models", "可用模型"], ["rotation", "轮换策略"] ] as const).map(([id, label]) => <a key={id} href={`#providers/gateway/${id}`} className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined}>{label}</a>)}</nav>
    <div hidden={tab !== "overview"} className="gateway-tab-panel"><GatewayOverview config={config} setConfig={w.setConfig} setStatus={w.setStatus} refresh={() => w.refreshConfig({ silent: true })} /><details className="gateway-server-settings"><summary>服务端口</summary><SettingsForm {...formProps} scope="service" /></details></div>
    <div hidden={tab !== "accounts"} className="gateway-tab-panel"><AccountsPage config={config} showEmails={w.showEmails} busy={w.busy} activeProfile={w.activeProfile} codexAccountId={w.codexAccountId} setAccountModalOpen={w.setAccountModalOpen} setBusy={w.setBusy} setConfig={w.setConfig} setStatus={w.setStatus} refreshConfig={w.refreshConfig} logout={w.logout} /></div>
    <div hidden={tab !== "models"} className="gateway-tab-panel"><AccountPoolDetail config={config} /><SettingsForm {...formProps} scope="models" /></div>
    <div hidden={tab !== "rotation"} className="gateway-tab-panel"><div className="gateway-section-head"><div><h3>账号轮换与请求策略</h3><p>选择参与轮换的账号，并设置额度同步和请求节奏。</p></div></div><SettingsForm {...formProps} scope="rotation" /></div>
  </div>;
}
