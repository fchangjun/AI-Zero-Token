import { useEffect, useId, useRef, useState } from "react";
import { Bell, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { useT } from "@/i18n";
import { fetchJson } from "@/shared/api";
import type { ResetCalendarState, ResetNotificationSettings } from "./types";

export function NotificationSettingsModal({ state, onClose, onSaved }: {
  state: ResetCalendarState;
  onClose: () => void;
  onSaved: (state: ResetCalendarState) => void;
}) {
  const t = useT();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [draft, setDraft] = useState<ResetNotificationSettings>({ ...state.settings });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const busy = saving || testing;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  async function save() {
    if (busy) return;
    setSaving(true);
    setFeedback(null);
    try {
      const next = await fetchJson<ResetCalendarState>("/_gateway/admin/reset-calendar/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      });
      onSaved(next);
      onClose();
    } catch {
      setFeedback({ text: t("resetCalendar.settings.saveFailed"), error: true });
    } finally { setSaving(false); }
  }

  async function sendTest() {
    if (busy) return;
    setTesting(true);
    setFeedback(null);
    try {
      const result = await fetchJson<{ sent: boolean }>("/_gateway/admin/reset-calendar/test-notification", { method: "POST" });
      setFeedback({ text: t(result.sent ? "resetCalendar.settings.testSent" : "resetCalendar.settings.testNotSent"), error: !result.sent });
    } catch {
      setFeedback({ text: t("resetCalendar.settings.testFailed"), error: true });
    } finally { setTesting(false); }
  }

  return (
    <div className="modal-backdrop rc-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section ref={dialogRef} className="rc-modal" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <header className="rc-modal-head">
          <div><h2 id={titleId}>{t("resetCalendar.settings.title")}</h2><p id={descriptionId}>{t("resetCalendar.settings.description")}</p></div>
          <button className="btn-secondary icon-only" type="button" disabled={busy} onClick={onClose} aria-label={t("common.close")}><X size={18} /></button>
        </header>
        <div className="rc-modal-body">
          <div className="rc-modal-columns">
            <div className="rc-settings-controls">
              {(["signalNotifications", "confirmedNotifications"] as const).map((key) => {
                const signal = key === "signalNotifications";
                const Icon = signal ? Bell : CheckCircle2;
                return <label className="rc-setting-toggle" key={key}>
                  <span className={`rc-setting-icon ${signal ? "is-signal" : "is-confirmed"}`}><Icon size={25} /></span>
                  <span className="rc-setting-copy"><strong>{t(`resetCalendar.settings.${signal ? "signal" : "confirmed"}Title`)}</strong><span>{t(`resetCalendar.settings.${signal ? "signal" : "confirmed"}Description`)}</span></span>
                  <input className="rc-switch" type="checkbox" role="switch" checked={draft[key]} disabled={busy} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />
                </label>;
              })}
              <div className="rc-notification-support">
                <h3>{t("resetCalendar.settings.delivery")}</h3>
                <div className="rc-support-row"><span><Bell size={18} />{t("resetCalendar.settings.systemNotification")}</span><span className={`rc-badge ${state.notificationsSupported ? "is-confirmed" : "is-record"}`}>{t(`resetCalendar.settings.${state.notificationsSupported ? "supported" : "unsupported"}`)}</span></div>
                {!state.notificationsSupported && <p>{t("resetCalendar.settings.desktopRequired")}</p>}
                <button className="btn-secondary" type="button" disabled={!state.notificationsSupported || busy} onClick={() => void sendTest()}>{testing ? <Loader2 size={16} className="spin" /> : <Bell size={16} />}{t("resetCalendar.settings.sendTest")}</button>
                {feedback && <p className={`rc-modal-feedback ${feedback.error ? "is-error" : ""}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
              </div>
            </div>
            <div className="rc-notification-previews">
              <h3>{t("resetCalendar.settings.previewTitle")}</h3><p>{t("resetCalendar.settings.previewHint")}</p>
              {(["signal", "confirmed"] as const).map((kind) => <div className="rc-notification-preview" key={kind}>
                <span className="rc-preview-mark"><Bell size={22} /></span>
                <div><div className="rc-preview-meta"><strong>AI Zero Token</strong><span>{t("resetCalendar.settings.now")}</span></div><span className={`rc-badge is-${kind}`}>{t(`resetCalendar.settings.${kind}Badge`)}</span><h4>{t(`resetCalendar.settings.${kind}PreviewTitle`)}</h4><p>{t(`resetCalendar.settings.${kind}PreviewBody`)}</p></div>
              </div>)}
            </div>
          </div>
          <div className="rc-info-note"><Info size={18} /><p>{t("resetCalendar.settings.backgroundHint")}</p></div>
        </div>
        <footer className="rc-modal-footer"><button className="btn-secondary" type="button" disabled={busy} onClick={onClose}>{t("resetCalendar.settings.cancel")}</button><button className="btn-primary" type="button" disabled={busy} onClick={() => void save()}>{saving && <Loader2 size={16} className="spin" />}{t("resetCalendar.settings.save")}</button></footer>
      </section>
    </div>
  );
}
