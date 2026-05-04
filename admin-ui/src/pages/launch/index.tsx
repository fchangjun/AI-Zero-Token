import { Activity, Download, ExternalLink, Server, Users, Zap } from "lucide-react";
import appMark from "@/assets/app-mark.svg";
import launchVisual from "@/assets/launch-visual.svg";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import { InfoRow } from "@/shared/components/InfoRow";
import { profileLabel } from "@/shared/lib/profiles";

const DESKTOP_RELEASES_URL = "https://github.com/fchangjun/AI-Zero-Token/releases";

export function LaunchPage(props: {
  config: AdminConfig | null;
  visualSrc?: string;
  status: string;
  showEmails: boolean;
  activeProfile: ProfileSummary | null;
  onRoute: (route: "accounts" | "tester") => void;
}) {
  return (
    <section className="launch-page">
      <div className="launch-copy">
        <div className="launch-identity">
          <div className="launch-app-icon">
            <img src={appMark} alt="" />
          </div>
          <div>
            <span className="badge brand">Desktop Gateway</span>
            <h2>AI Zero Token</h2>
            <p>本地 OpenAI 兼容网关、账号池和接口测试工作台。</p>
          </div>
        </div>

        <div className="launch-metrics">
          <div>
            <Users size={18} />
            <span>账号池</span>
            <strong>{props.config?.status.profileCount || 0}</strong>
          </div>
          <div>
            <Server size={18} />
            <span>网关</span>
            <strong>{props.config?.status.loggedIn ? "运行中" : "待登录"}</strong>
          </div>
          <div>
            <Activity size={18} />
            <span>模型</span>
            <strong>{props.config?.settings.defaultModel || "-"}</strong>
          </div>
        </div>

        <div className="launch-actions">
          <button className="btn-secondary" type="button" onClick={() => props.onRoute("accounts")}>
            <Users size={16} />
            管理账号
          </button>
          <button className="btn-secondary" type="button" onClick={() => props.onRoute("tester")}>
            <Zap size={16} />
            测试接口
          </button>
          <a className="btn-secondary" href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer">
            <Download size={16} />
            桌面版下载
          </a>
          <a className="btn-secondary" href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer" title="桌面版安装包发布后会放在这里">
            <ExternalLink size={16} />
            发布页
          </a>
        </div>

        <p className="launch-download-note">当前还没有公开安装包时，这里会先打开 GitHub Releases 发布页。</p>

        <div className="launch-status">
          <InfoRow label="当前账号" value={profileLabel(props.activeProfile, props.showEmails)} />
          <InfoRow label="服务状态" value={props.config?.status.loggedIn ? "已登录并运行" : "等待登录"} />
          <InfoRow label="Base URL" value={props.config?.baseUrl || "http://127.0.0.1:8787/v1"} code />
          <InfoRow label="同步消息" value={props.status} />
        </div>
      </div>
      <div className="launch-visual">
        <div className="launch-visual-stage">
          <img className="launch-visual-mark" src={appMark} alt="AI Zero Token 图标" />
          <img className="launch-visual-dashboard" src={props.visualSrc || launchVisual} alt="AI Zero Token 桌面端启动页配图" />
        </div>
      </div>
    </section>
  );
}
