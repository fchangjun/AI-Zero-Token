import { Download, RefreshCw, RotateCcw, X } from "lucide-react";
import { useT } from "@/i18n";
import type { useDesktopUpdater } from "@/hooks/useDesktopUpdater";
import "../styles/desktop-update.css";

export function DesktopUpdatePanel({ updater }: { updater: ReturnType<typeof useDesktopUpdater> }) {
  const t = useT();
  const { state, bridgeError, action, supported } = updater;
  if (!supported) return null;
  const phase = state?.phase ?? "idle";
  const busy = ["checking", "downloading", "preparing", "installing"].includes(phase);
  const available = Boolean(state?.version);
  const canDownload = available && !busy && phase !== "ready" && state?.errorCode !== "missing-digest";

  return (
    <section className={`desktop-update-card ${available ? "has-update" : ""}`} aria-label={t("update.nativeTitle")}>
      <div className="desktop-update-row">
        <div className="desktop-update-summary">
          <RefreshCw size={17} aria-hidden="true" />
          <strong>{t(`update.phases.${phase}`)}</strong>
          {state && <span className="desktop-update-version">v{state.currentVersion}{available ? ` → v${state.version}` : ""}</span>}
        </div>
        <div className="desktop-update-buttons">
          {canDownload && <button type="button" className="btn-primary" onClick={() => void action("download")}><Download size={15} />{t("update.downloadNative")}</button>}
          {phase === "ready" && <button type="button" className="btn-primary" onClick={() => void action("install")}><RotateCcw size={15} />{t("update.installNative")}</button>}
          {phase === "downloading" && <button type="button" className="btn-secondary" onClick={() => void action("cancel")}><X size={15} />{t("update.cancelDownload")}</button>}
          {!busy && phase !== "ready" && <button type="button" className="btn-secondary" onClick={() => void action("check")}>{t("update.checkNative")}</button>}
        </div>
      </div>
      <div aria-live="polite">
        {state?.recovered && <p className="desktop-update-warning">{t("update.recovered")}</p>}
        {bridgeError && <p className="desktop-update-warning">{t("update.bridgeError")}</p>}
        {state?.errorCode && <p className="desktop-update-warning">{t(`update.errors.${state.errorCode}`)} <a href={state.releaseUrl || "https://github.com/fchangjun/AI-Zero-Token/releases"} target="_blank" rel="noreferrer">{t("update.manualDownload")}</a></p>}
        {phase === "downloading" && <div className="desktop-update-progress"><progress aria-label={t("update.downloadProgress")} value={state?.percent ?? 0} max={100} /><span>{state?.percent ?? 0}%</span></div>}
        {phase === "ready" && <p className="desktop-update-hint">{t("update.restartHint")}</p>}
      </div>
      {available && state?.releaseNotes && <details className="desktop-update-notes"><summary>{t("update.releaseNotes")}</summary><pre>{state.releaseNotes}</pre></details>}
    </section>
  );
}
