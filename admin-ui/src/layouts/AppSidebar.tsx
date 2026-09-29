import appMark from "@/assets/app-mark.svg";
import { ArrowUpCircle, Code2, Copy, Download, ExternalLink, Globe, RefreshCw } from "lucide-react";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";
import type { useDesktopUpdater } from "@/hooks/useDesktopUpdater";
import { useLocale, useT } from "@/i18n";
import type { Locale } from "@/i18n";

const DESKTOP_RELEASES_URL = "https://github.com/fchangjun/AI-Zero-Token/releases";

export function AppSidebar({ workspace, updater }: { workspace: UseAdminWorkspaceResult; updater: ReturnType<typeof useDesktopUpdater> }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { routes, activeRoute, goRoute, config, copyBaseUrl, setContactOpen } = workspace;
  const isOnline = Boolean(config?.status.loggedIn);
  const versionStatus = config?.versionStatus;
  const desktopVersion = versionStatus?.desktop;
  const nativeState = updater.supported ? updater.state : null;
  const versionTone = nativeState ? nativeState.version ? "blue" : "green" : desktopVersion?.status === "update-available" ? "orange" : desktopVersion?.status === "error" ? "red" : desktopVersion?.status === "ahead" ? "blue" : "green";
  const versionLabel =
    nativeState ? t(`update.phases.${nativeState.phase}`) : desktopVersion?.status === "update-available"
      ? t("sidebar.versionUpdateAvailable")
      : desktopVersion?.status === "error"
        ? t("sidebar.versionCheckFailed")
        : desktopVersion?.status === "ahead"
          ? t("sidebar.versionAhead")
          : desktopVersion?.status === "ok"
            ? t("sidebar.versionUpToDate")
            : t("common.notChecked");

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src={appMark} alt="" />
        </div>
        <div>
          <strong>{t("meta.name")}</strong>
          <span>{t("meta.brandTagline")}</span>
        </div>
      </div>

      <nav className="nav" aria-label={t("sidebar.navLabel")}>
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
          <strong>{t("sidebar.serviceAndVersion")}</strong>
          <span>{versionLabel}</span>
        </div>
        <div className="sidebar-status-summary">
          <span className={`status-dot ${isOnline ? "" : "offline"}`} />
          <div>
            <strong>{isOnline ? t("sidebar.serviceRunning") : t("sidebar.waitingForLogin")}</strong>
            <span>{config?.status.activeProvider || t("sidebar.defaultProvider")}</span>
          </div>
        </div>
        <button className="sidebar-base-url" type="button" onClick={copyBaseUrl} title={t("sidebar.copyBaseUrlTitle")}>
          <span>{t("sidebar.baseUrl")}</span>
          <code>{config?.baseUrl || t("sidebar.defaultBaseUrl")}</code>
        </button>
        <div className="sidebar-meta-grid">
          <div className="sidebar-meta">
            <span>{t("sidebar.currentDesktopVersion")}</span>
            <strong>{nativeState?.currentVersion || desktopVersion?.currentVersion || t("common.na")}</strong>
          </div>
          <div className="sidebar-meta">
            <span>{t("sidebar.latestDesktopVersion")}</span>
            <strong>{nativeState ? nativeState.version || (nativeState.phase === "up-to-date" ? nativeState.currentVersion : t("common.na")) : desktopVersion?.latestVersion || t("common.na")}</strong>
          </div>
          {!updater.supported && <div className="sidebar-meta">
            <span>{t("sidebar.currentNpmVersion")}</span>
            <strong>{versionStatus?.npm.currentVersion || t("common.na")}</strong>
          </div>}
          {!updater.supported && <div className="sidebar-meta">
            <span>{t("sidebar.latestNpmVersion")}</span>
            <strong>{versionStatus?.npm.latestVersion || t("common.na")}</strong>
          </div>}
        </div>
        {updater.supported && <button className={`desktop-update-entry ${nativeState?.version ? "has-update" : ""}`} type="button" onClick={() => {
          void updater.action("openDetails");
          if (!nativeState?.version) void updater.action("check");
        }}>
          {nativeState?.version ? <ArrowUpCircle size={15} /> : <RefreshCw size={14} />}
          <span>{t(nativeState?.phase === "ready" ? "update.viewReady" : nativeState?.version ? "update.viewDetails" : "update.checkNative")}</span>
          {nativeState?.version && <span className="desktop-update-entry-dot" />}
        </button>}
      </section>

      <section className="service-card sidebar-links">
        <div className="service-head">
          <strong>{t("sidebar.contactMe")}</strong>
        </div>
        <div className="sidebar-link-list">
          <a className="sidebar-link" href="https://github.com/fchangjun/AI-Zero-Token" target="_blank" rel="noreferrer">
            <Code2 size={14} />
            {t("sidebar.githubRepo")}
          </a>
          <a className="sidebar-link" href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer">
            <Download size={14} />
            {t("sidebar.desktopDownload")}
          </a>
          <button className="sidebar-link" type="button" onClick={() => setContactOpen(true)}>
            <ExternalLink size={14} />
            {t("sidebar.feedback")}
          </button>
          <button className="sidebar-link" type="button" onClick={copyBaseUrl}>
            <Copy size={14} />
            {t("sidebar.copyBaseUrl")}
          </button>
        </div>
      </section>

      <section className="service-card sidebar-language">
        <div className="service-head">
          <strong>{t("sidebar.languageLabel")}</strong>
          <Globe size={14} aria-hidden="true" />
        </div>
        <div className="sidebar-language-options" role="group" aria-label={t("sidebar.languageLabel")}>
          {(["zh-CN", "en"] as Locale[]).map((code) => (
            <button
              key={code}
              type="button"
              className={`sidebar-language-option ${locale === code ? "is-active" : ""}`}
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
            >
              {code === "zh-CN" ? t("sidebar.languageZh") : t("sidebar.languageEn")}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
