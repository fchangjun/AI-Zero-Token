import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, CheckCircle2, Download, ExternalLink, LoaderCircle, RefreshCw, RotateCcw, Sparkles, X } from "lucide-react";
import { useLocale } from "@/i18n";
import type { useDesktopUpdater } from "@/hooks/useDesktopUpdater";
import { ReleaseNotes } from "./ReleaseNotes";
import appMark from "@/assets/app-mark.svg";
import "../styles/desktop-update.css";

export function DesktopUpdatePanel({ updater }: { updater: ReturnType<typeof useDesktopUpdater> }) {
  const { t, locale } = useLocale();
  const { state, bridgeError, action, supported } = updater;
  const dialog = useRef<HTMLDialogElement>(null);
  const open = supported && Boolean(state?.detailsOpen);

  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  if (!supported) return null;
  const phase = state?.phase ?? "idle";
  const busy = ["checking", "downloading", "preparing", "installing"].includes(phase);
  const available = Boolean(state?.version);
  const manualOnly = ["missing-digest", "install-location", "install-permission", "recovery-required"].includes(state?.errorCode ?? "");
  const canDownload = available && !busy && phase !== "ready" && !manualOnly;
  const releaseUrl = state?.releaseUrl || "https://github.com/fchangjun/AI-Zero-Token/releases";
  const status = t(`update.phases.${phase}`);
  const title = available ? t("update.versionAvailable", { version: state!.version! }) : t("update.nativeTitle");
  const publishedAt = state?.publishedAt && Number.isFinite(Date.parse(state.publishedAt))
    ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(state.publishedAt)) : null;
  const downloadSize = state?.downloadSize ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(state.downloadSize / 1024 ** 2)} MB` : null;
  const close = () => { if (phase !== "installing") void action("closeDetails"); };
  const defer = () => { if (phase !== "installing") void action("dismissNotice"); };
  const Icon = busy ? LoaderCircle : phase === "ready" || phase === "up-to-date" ? CheckCircle2 : available ? Sparkles : RefreshCw;
  const progressStep = phase === "downloading" ? 0 : phase === "preparing" ? 1 : phase === "ready" || phase === "installing" ? 2 : -1;
  const showNotice = (available && !state?.noticeDismissed) || bridgeError || state?.recovered;

  return (
    <>
      {showNotice && <section className={`desktop-update-card ${available ? "has-update" : ""}`} aria-label={t("update.nativeTitle")}>
        <div className="desktop-update-summary" role="status">
          <span className="desktop-update-icon"><Icon size={18} className={busy ? "desktop-update-spin" : undefined} aria-hidden="true" /></span>
          <div>
            <strong>{phase === "available" ? title : status}</strong>
            <span className="desktop-update-version">v{state?.currentVersion ?? "—"}{available ? ` → v${state!.version}` : ""}{phase === "downloading" ? ` · ${state?.percent ?? 0}%` : ""}</span>
          </div>
        </div>
        <div className="desktop-update-buttons"><button type="button" className={available ? "btn-primary" : "btn-secondary"} onClick={() => {
          void action("openDetails");
          if (!available && !busy) void action("check");
        }}>
          {phase === "ready" ? t("update.viewReady") : available || busy ? t("update.viewDetails") : t("update.checkNative")}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        {phase !== "installing" && !bridgeError && !state?.recovered && <button className="desktop-update-close" type="button" aria-label={t("update.dismissNotice")} onClick={defer}><X size={16} /></button>}</div>
        {(bridgeError || state?.recovered) && <p className="desktop-update-warning">{t(bridgeError ? "update.bridgeError" : "update.recovered")}</p>}
      </section>}

      {createPortal(
        <dialog ref={dialog} className="desktop-update-dialog" aria-labelledby="desktop-update-title" aria-describedby="desktop-update-subtitle"
          onCancel={(event) => { event.preventDefault(); close(); }}
          onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className="desktop-update-dialog-content">
            <header className="desktop-update-header">
              <span className="desktop-update-hero-icon"><img src={appMark} alt="" />{phase === "ready" && <span className="desktop-update-ready-badge"><Check size={13} /></span>}</span>
              <div className="desktop-update-heading">
                <span className="desktop-update-eyebrow">AI ZERO TOKEN{available && <span className="desktop-update-version-pill">v{state!.version}</span>}</span>
                <h2 id="desktop-update-title">{t(phase === "ready" ? "update.readyTitle" : phase === "installing" ? "update.installingTitle" : available ? "update.availableTitle" : "update.nativeTitle")}</h2>
                <p id="desktop-update-subtitle">{available ? t("update.currentToLatest", { current: state!.currentVersion, latest: state!.version! }) : t("update.currentVersion", { version: state?.currentVersion ?? "—" })}</p>
              </div>
              <button type="button" className="desktop-update-close" aria-label={t("update.closeDetails")} onClick={close} disabled={phase === "installing"} autoFocus><X size={20} /></button>
            </header>

            <div className="desktop-update-body">
              {available ? <>
                <div className="desktop-update-notes-heading"><h3>{t("update.releaseNotes")}</h3><span>{[publishedAt, downloadSize].filter(Boolean).join(" · ")}</span></div>
                {state?.releaseNotes?.trim() ? <ReleaseNotes notes={state.releaseNotes} /> : <p className="desktop-update-hint">{t("update.noReleaseNotes")}</p>}
                <a className="desktop-update-release-link" href={releaseUrl} target="_blank" rel="noreferrer">{t("update.fullReleaseNotes")}<ExternalLink size={13} /></a>
              </> : <div className="desktop-update-empty" role="status"><Icon size={32} className={busy ? "desktop-update-spin" : undefined} /><strong>{status}</strong><p>{t(phase === "up-to-date" ? "update.upToDateHint" : phase === "checking" ? "update.checkHint" : "update.retryCheckHint")}</p></div>}
            </div>

            <footer className="desktop-update-footer">
              <div aria-live="polite">
                {state?.recovered && <p className="desktop-update-warning">{t("update.recovered")}</p>}
                {bridgeError && <p className="desktop-update-warning">{t("update.bridgeError")}</p>}
                {state?.errorCode && <p className="desktop-update-warning">{t(`update.errors.${state.errorCode}`)} <a href={releaseUrl} target="_blank" rel="noreferrer">{t("update.manualDownload")}</a></p>}
                {progressStep >= 0 && <>
                  <ol className="desktop-update-steps" aria-label={t("update.progressSteps")}>
                    {["stepDownload", "stepVerify", "stepRestart"].map((step, index) => <li key={step} className={index <= progressStep ? "is-active" : undefined} aria-current={index === progressStep ? "step" : undefined}><span>{index < progressStep ? <Check size={12} /> : index + 1}</span>{t(`update.${step}`)}</li>)}
                  </ol>
                  <div className="desktop-update-progress-status"><strong>{status}</strong>{phase === "downloading" && <span>{state?.percent ?? 0}%</span>}</div>
                  {phase === "downloading" && <progress className="desktop-update-progress" aria-label={t("update.downloadProgress")} value={state?.percent ?? 0} max={100} />}
                </>}
              </div>
              {available && <p className="desktop-update-hint">{t(phase === "ready" || phase === "installing" ? "update.restartHint" : phase === "downloading" || phase === "preparing" ? "update.backgroundHint" : "update.beforeUpdateHint")}</p>}
              <div className="desktop-update-actions">
                <button type="button" className="desktop-update-later" onClick={available ? defer : close} disabled={phase === "installing"}>{t(phase === "downloading" || phase === "preparing" ? "update.continueInBackground" : available ? "update.later" : "update.closeDetails")}</button>
                <div className="desktop-update-buttons">
                  {!busy && (!available || manualOnly || phase === "error" && state?.errorCode === "check-failed") && <button type="button" className="btn-secondary" onClick={() => void action("check")}>{t("update.checkNative")}</button>}
                  {manualOnly && !busy && <a className="btn-primary" href={releaseUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />{t("update.manualDownload")}</a>}
                  {canDownload && <button type="button" className="btn-primary" onClick={() => void action("download")}><Download size={15} />{t(phase === "error" ? "update.retryDownload" : "update.downloadNative")}</button>}
                  {phase === "ready" && <button type="button" className="btn-primary" onClick={() => void action("install")}><RotateCcw size={15} />{t("update.installNative")}</button>}
                  {phase === "downloading" && <button type="button" className="btn-secondary" onClick={() => void action("cancel")}><X size={15} />{t("update.cancelDownload")}</button>}
                  {(phase === "preparing" || phase === "installing") && <button type="button" className="btn-primary" disabled><LoaderCircle size={15} className="desktop-update-spin" />{t(phase === "preparing" ? "update.stepVerify" : "update.stepRestart")}</button>}
                </div>
              </div>
            </footer>
          </div>
        </dialog>, document.body)}
    </>
  );
}
