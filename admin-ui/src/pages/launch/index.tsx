import { Activity, Download, ExternalLink, Server, Users, Zap } from "lucide-react";
import appMark from "@/assets/app-mark.svg";
import launchVisual from "@/assets/launch-visual.svg";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import { InfoRow } from "@/shared/components/InfoRow";
import { profileLabel } from "@/shared/lib/profiles";
import { useT } from "@/i18n";

const DESKTOP_RELEASES_URL = "https://github.com/fchangjun/AI-Zero-Token/releases";

export function LaunchPage(props: {
  config: AdminConfig | null;
  visualSrc?: string;
  status: string;
  showEmails: boolean;
  activeProfile: ProfileSummary | null;
  onRoute: (route: "accounts" | "tester") => void;
}) {
  const t = useT();
  return (
    <section className="launch-page">
      <div className="launch-copy">
        <div className="launch-identity">
          <div className="launch-app-icon">
            <img src={appMark} alt="" />
          </div>
          <div>
            <span className="badge brand">Desktop Gateway</span>
            <h2>{t("meta.name")}</h2>
            <p>{t("launch.tagline")}</p>
          </div>
        </div>

        <div className="launch-metrics">
          <div>
            <Users size={18} />
            <span>{t("launch.accounts")}</span>
            <strong>{props.config?.status.profileCount || 0}</strong>
          </div>
          <div>
            <Server size={18} />
            <span>{t("launch.gateway")}</span>
            <strong>{props.config?.status.loggedIn ? t("overview.running") : t("overview.waitingLogin")}</strong>
          </div>
          <div>
            <Activity size={18} />
            <span>{t("launch.model")}</span>
            <strong>{props.config?.settings.defaultModel || "-"}</strong>
          </div>
        </div>

        <div className="launch-actions">
          <button className="btn-secondary" type="button" onClick={() => props.onRoute("accounts")}>
            <Users size={16} />
            {t("launch.manageAccounts")}
          </button>
          <button className="btn-secondary" type="button" onClick={() => props.onRoute("tester")}>
            <Zap size={16} />
            {t("launch.testEndpoints")}
          </button>
          <a className="btn-secondary" href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer">
            <Download size={16} />
            {t("launch.desktopDownload")}
          </a>
          <a className="btn-secondary" href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer" title={t("launch.releaseTitle")}>
            <ExternalLink size={16} />
            {t("launch.release")}
          </a>
        </div>

        <p className="launch-download-note">{t("launch.downloadNote")}</p>

        <div className="launch-status">
          <InfoRow label={t("launch.currentAccount")} value={profileLabel(props.activeProfile, props.showEmails)} />
          <InfoRow label={t("launch.serviceStatus")} value={props.config?.status.loggedIn ? t("launch.serviceLoggedIn") : t("overview.waitingLogin")} />
          <InfoRow label="Base URL" value={props.config?.baseUrl || "http://127.0.0.1:8787/v1"} code />
          <InfoRow label={t("launch.syncMessage")} value={props.status} />
        </div>
      </div>
      <div className="launch-visual">
        <div className="launch-visual-stage">
          <img className="launch-visual-mark" src={appMark} alt={t("launch.appMarkAlt")} />
          <img className="launch-visual-dashboard" src={props.visualSrc || launchVisual} alt={t("launch.visualAlt")} />
        </div>
      </div>
    </section>
  );
}
