import appMark from "@/assets/app-mark.svg";
import { Code2, Copy, Download, ExternalLink } from "lucide-react";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";

const DESKTOP_RELEASES_URL = "https://github.com/fchangjun/AI-Zero-Token/releases";

export function AppSidebar({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const { routes, activeRoute, goRoute, config, copyBaseUrl, setContactOpen } = workspace;
  const isOnline = Boolean(config?.status.loggedIn);
  const versionStatus = config?.versionStatus;
  const versionTone = versionStatus?.status === "update-available" ? "orange" : versionStatus?.status === "error" ? "red" : "green";
  const versionLabel =
    versionStatus?.status === "update-available"
      ? "可更新"
      : versionStatus?.status === "error"
        ? "检查失败"
        : versionStatus?.status === "ok"
          ? "已是最新"
          : "未检查";

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src={appMark} alt="" />
        </div>
        <div>
          <strong>AI Zero Token</strong>
          <span>本地 AI 网关工作台</span>
        </div>
      </div>

      <nav className="nav" aria-label="主导航">
        {routes.map((route) => {
          const Icon = route.icon;
          return (
            <button className={`nav-item ${activeRoute === route.id ? "is-active" : ""}`} key={route.id} type="button" onClick={() => goRoute(route.id)}>
              <Icon size={16} />
              <span>{route.label}</span>
            </button>
          );
        })}
      </nav>

      <section className={`service-card sidebar-status tone-${versionTone}`}>
        <div className="service-head">
          <strong>服务与版本</strong>
          <span>{versionLabel}</span>
        </div>
        <div className="sidebar-status-summary">
          <span className={`status-dot ${isOnline ? "" : "offline"}`} />
          <div>
            <strong>{isOnline ? "服务运行中" : "等待登录"}</strong>
            <span>{config?.status.activeProvider || "openai-codex"}</span>
          </div>
        </div>
        <button className="sidebar-base-url" type="button" onClick={copyBaseUrl} title="复制 Base URL">
          <span>Base URL</span>
          <code>{config?.baseUrl || "http://127.0.0.1:8787/v1"}</code>
        </button>
        <div className="sidebar-meta-grid">
          <div className="sidebar-meta">
            <span>当前版本</span>
            <strong>{versionStatus?.currentVersion || "—"}</strong>
          </div>
          <div className="sidebar-meta">
            <span>最新版本</span>
            <strong>{versionStatus?.latestVersion || "—"}</strong>
          </div>
        </div>
      </section>

      <section className="service-card sidebar-links">
        <div className="service-head">
          <strong>联系我</strong>
        </div>
        <div className="sidebar-link-list">
          <a className="sidebar-link" href="https://github.com/fchangjun/AI-Zero-Token" target="_blank" rel="noreferrer">
            <Code2 size={14} />
            GitHub 仓库
          </a>
          <a className="sidebar-link" href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer">
            <Download size={14} />
            桌面版下载
          </a>
          <button className="sidebar-link" type="button" onClick={() => setContactOpen(true)}>
            <ExternalLink size={14} />
            交流反馈
          </button>
          <button className="sidebar-link" type="button" onClick={copyBaseUrl}>
            <Copy size={14} />
            复制 Base URL
          </button>
        </div>
      </section>
    </aside>
  );
}
