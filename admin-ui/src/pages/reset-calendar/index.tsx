import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bell, CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Gift, Info, Loader2, Radio, RefreshCw } from "lucide-react";
import { useLocaleValue, useT } from "@/i18n";
import { fetchJson } from "@/shared/api";
import { announcementStage, beijingDay, buildMonthDays, calendarRecords, currentWatch, dayDate, filterRecords, formatBeijing, recordsByDay, scheduledIsPast, shiftMonth } from "./calendar";
import { NotificationSettingsModal } from "./NotificationSettingsModal";
import { SourceContent } from "./SourceContent";
import type { ResetAnnouncement, ResetCalendarState, ResetFilter, ResetStatus } from "./types";
import "./reset-calendar.css";

const endpoint = "/_gateway/admin/reset-calendar";

function RecordDetails({ record, status, locale }: { record: ResetAnnouncement; status: ResetStatus | null; locale: string }) {
  const t = useT();
  const stage = announcementStage(record, status);
  const scheduled = stage === "scheduled" ? status?.scheduled_reset : null;
  return <article className="rc-record-detail">
    <div className="rc-record-heading"><h3>{t(`resetCalendar.types.${record.reset_type}`)}</h3><span className={`rc-badge is-${stage}`} title={t(`resetCalendar.stage.${stage}`)}>{t(`resetCalendar.compactStage.${stage}`)}</span></div>
    {scheduled?.scheduled_for && <p className="rc-record-time"><CalendarDays size={15} /><span>{t("resetCalendar.expectedAt")} {formatBeijing(scheduled.scheduled_for, locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span></p>}
    <SourceContent text={record.text} translation={record.translation} source={record.source} at={record.announced_at} />
  </article>;
}

export function ResetCalendarPage({ setStatus }: { setStatus?: (message: string) => void }) {
  const t = useT();
  const locale = useLocaleValue();
  const [now, setNow] = useState(() => Date.now());
  const today = beijingDay(now)!;
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(() => today);
  const [filter, setFilter] = useState<ResetFilter>("all");
  const [data, setData] = useState<ResetCalendarState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mutation = useRef(false);
  const requestSequence = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const load = async () => {
      if (mutation.current) return;
      const sequence = ++requestSequence.current;
      try {
        const next = await fetchJson<ResetCalendarState>(endpoint, { signal: controller.signal });
        if (mounted.current && sequence === requestSequence.current) { setData(next); setLoadError(false); }
      } catch {
        if (mounted.current && !controller.signal.aborted && sequence === requestSequence.current) setLoadError(true);
      }
      if (mounted.current) setNow(Date.now());
    };
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => { mounted.current = false; controller.abort(); window.clearInterval(interval); };
  }, []);

  async function synchronize() {
    if (mutation.current) return;
    mutation.current = true;
    ++requestSequence.current;
    setRefreshing(true);
    try {
      const next = await fetchJson<ResetCalendarState>(`${endpoint}/sync`, { method: "POST" });
      if (!mounted.current) return;
      setData(next); setLoadError(false); setNow(Date.now());
      setStatus?.(t(next.sync.phase === "error" ? "resetCalendar.syncFailed" : next.sync.phase === "syncing" ? "resetCalendar.syncing" : "resetCalendar.syncDone"));
    } catch {
      if (mounted.current) { setLoadError(true); setStatus?.(t("resetCalendar.syncFailed")); }
    } finally { mutation.current = false; if (mounted.current) setRefreshing(false); }
  }

  const records = useMemo(() => calendarRecords(data?.records ?? [], data?.status ?? null), [data?.records, data?.status]);
  const visibleRecords = useMemo(() => filterRecords(records, filter), [records, filter]);
  const grouped = useMemo(() => recordsByDay(visibleRecords), [visibleRecords]);
  const monthDays = useMemo(() => buildMonthDays(month), [month]);
  const monthRecords = records.filter((record) => beijingDay(record.announced_at)?.startsWith(`${month}-`));
  const regularCount = monthRecords.filter((record) => record.reset_type === "regular").length;
  const bankedCount = monthRecords.filter((record) => record.reset_type === "banked").length;
  const latest = data?.status?.latest_reset;
  const scheduled = data?.status?.scheduled_reset;
  const watch = currentWatch(data?.status ?? null, now);
  const signal = scheduled ?? watch;
  const signalKind = scheduled ? "scheduled" : watch ? "watch" : "none";
  const syncBusy = refreshing || data?.sync.phase === "syncing";
  const syncError = loadError || data?.sync.phase === "error";
  const initialSync = data?.sync.phase === "syncing" && !data.sync.lastSyncedAt && records.length === 0;
  const retryAt = syncError && data?.sync.nextSyncAt && Date.parse(data.sync.nextSyncAt) > now
    ? formatBeijing(data.sync.nextSyncAt, locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : null;
  const retryHint = retryAt ? t("resetCalendar.nextRetry", { time: retryAt }) : undefined;
  const selectedRecords = grouped.get(selectedDay) ?? [];

  function changeMonth(delta: number) {
    const nextMonth = shiftMonth(month, delta);
    setMonth(nextMonth); setSelectedDay(`${nextMonth}-01`);
  }

  function pickDay(key: string) {
    setSelectedDay(key);
    if (!key.startsWith(month)) setMonth(key.slice(0, 7));
  }

  return <section className="rc-page" aria-label={t("resetCalendar.pageLabel")}>
    <div className="rc-toolbar">
      <span className="rc-time-zone"><Clock3 size={14} />{t("resetCalendar.timeZone")}</span>
      <div className="rc-actions"><button className="btn-secondary" type="button" disabled={syncBusy || Boolean(retryAt)} title={retryHint} onClick={() => void synchronize()}>{syncBusy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}{t(syncBusy ? "resetCalendar.syncing" : "resetCalendar.synchronize")}</button><button className="btn-primary" type="button" disabled={!data} onClick={() => setSettingsOpen(true)}><Bell size={16} />{t("resetCalendar.settings.title")}</button></div>
    </div>
    {syncError && <div className="rc-sync-error" role="alert"><Info size={18} /><p>{t(data && records.length > 0 ? "resetCalendar.cachedError" : "resetCalendar.loadError")}{retryHint && <span className="rc-retry-time">{retryHint}</span>}</p><button type="button" disabled={syncBusy || Boolean(retryAt)} title={retryHint} onClick={() => void synchronize()}>{t("resetCalendar.retry")}</button></div>}
    {(!data || initialSync) && !syncError ? <div className="rc-loading" role="status"><Loader2 className="spin" size={22} /><span>{t("resetCalendar.loading")}</span></div> : <>
      <div className="rc-summary-grid">
        <section className="rc-summary-card"><span className="rc-summary-icon is-blue"><CalendarDays size={25} /></span><div><span className="rc-summary-label">{t("resetCalendar.latestReset")}</span><div className="rc-summary-value"><strong>{latest ? formatBeijing(latest.announced_at, locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—"}</strong>{latest && <span className="rc-badge is-confirmed">{t("resetCalendar.confirmedShort")}</span>}</div><p>{latest ? t(`resetCalendar.types.${latest.reset_type}`) : t("resetCalendar.noConfirmedReset")}</p></div></section>
        <section className={`rc-summary-card rc-signal-card ${signalKind !== "none" ? "has-signal" : ""}`}><span className={`rc-summary-icon ${signalKind !== "none" ? "is-orange" : "is-green"}`}><Radio size={25} /></span><div><span className="rc-summary-label">{t("resetCalendar.currentSignal")}</span><div className="rc-summary-value"><strong>{t(`resetCalendar.signal.${signalKind}Title`)}</strong>{signalKind !== "none" && <span className="rc-badge is-signal">{t("resetCalendar.unconfirmed")}</span>}</div><p>{scheduled ? t(scheduledIsPast(data?.status ?? null, now) ? "resetCalendar.signal.overdueHint" : "resetCalendar.signal.scheduledHint") : watch ? t("resetCalendar.signal.watchHint") : t("resetCalendar.signal.noneHint")}</p></div></section>
        <section className="rc-summary-card"><span className="rc-summary-icon is-purple"><FileText size={25} /></span><div><span className="rc-summary-label">{t("resetCalendar.monthRecords")}</span><div className="rc-summary-value"><strong>{t("resetCalendar.recordCount", { count: monthRecords.length })}</strong></div><p>{t("resetCalendar.monthBreakdown", { regular: regularCount, banked: bankedCount })}</p></div></section>
      </div>
      <details className="rc-types-explanation">
        <summary aria-label={t("resetCalendar.typeGuide.title")}><Info size={14} /><span>{t("resetCalendar.typeGuide.summary")}</span><ChevronRight size={15} className="rc-guide-chevron" /></summary>
        <div className="rc-type-guide-details"><div className="rc-types-columns">
          <div><span className="rc-type-guide-icon is-regular"><RefreshCw size={19} /></span><div><h3>{t("resetCalendar.typeGuide.regularTitle")}</h3><p>{t("resetCalendar.typeGuide.regularDescription")}</p></div></div>
          <div><span className="rc-type-guide-icon is-banked"><Gift size={19} /></span><div><h3>{t("resetCalendar.typeGuide.bankedTitle")}</h3><p>{t("resetCalendar.typeGuide.bankedDescription")}</p></div></div>
        </div>
        <p className="rc-types-footnote">{t("resetCalendar.typeGuide.scopeNote")}</p></div>
      </details>
      {signal && <section className="rc-signal-detail" aria-label={t("resetCalendar.signal.details")}>
        <div><Radio size={19} /><strong>{t("resetCalendar.signal.details")}</strong>{scheduled?.scheduled_for && <span>{t("resetCalendar.expectedAt")} {formatBeijing(scheduled.scheduled_for, locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span>}{!scheduled && watch?.reset_chance_percent !== null && watch?.reset_chance_percent !== undefined && <span>{t("resetCalendar.signal.chance", { chance: watch.reset_chance_percent })}</span>}</div>
        {!scheduled && watch?.forecast_window && <p>{t("resetCalendar.signal.forecastWindow", { window: watch.forecast_window })}</p>}
        <SourceContent text={signal.text} translation={signal.translation} source={signal.source} at={"announced_at" in signal ? signal.announced_at : signal.observed_at} wide />
      </section>}
      {data && !data.sync.historyComplete && <div className="rc-partial-note"><Info size={15} /><span>{t("resetCalendar.partialHistory")}</span></div>}
      <div className="rc-main-grid">
        <section className="rc-calendar" aria-label={t("resetCalendar.calendarLabel")}>
          <header className="rc-calendar-head"><div className="rc-month-navigation"><h2>{formatBeijing(dayDate(`${month}-01`), locale, { year: "numeric", month: "long" })}</h2><div className="rc-month-buttons"><button className="btn-secondary icon-only" type="button" aria-label={t("resetCalendar.previousMonth")} onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></button><button className="btn-secondary icon-only" type="button" aria-label={t("resetCalendar.nextMonth")} onClick={() => changeMonth(1)}><ChevronRight size={17} /></button><button className="btn-secondary" type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }}>{t("resetCalendar.today")}</button></div></div><div className="rc-filters" role="group" aria-label={t("resetCalendar.filterLabel")}>{(["all", "regular", "banked"] as const).map((kind) => <button type="button" key={kind} aria-pressed={filter === kind} className={filter === kind ? "is-active" : ""} onClick={() => setFilter(kind)}>{t(`resetCalendar.types.${kind}`)}</button>)}</div></header>
          <table className="rc-month-table"><thead><tr>{Array.from({ length: 7 }, (_, index) => <th scope="col" key={index}>{t(`resetCalendar.weekdays.${index}`)}</th>)}</tr></thead><tbody>{Array.from({ length: monthDays.length / 7 }, (_, row) => <tr key={row}>{monthDays.slice(row * 7, row * 7 + 7).map((day) => {
            const dayRecords = grouped.get(day.key) ?? [];
            const fullLabel = formatBeijing(dayDate(day.key), locale, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
            return <td key={day.key}><button type="button" className={`rc-day ${day.inMonth ? "" : "is-outside"} ${day.key === selectedDay ? "is-selected" : ""} ${day.key === today ? "is-today" : ""}`} aria-label={t("resetCalendar.dayLabel", { date: fullLabel, count: dayRecords.length })} aria-pressed={day.key === selectedDay} aria-current={day.key === today ? "date" : undefined} onClick={() => pickDay(day.key)}><span className="rc-day-number">{day.day}</span>{day.key === today && <span className="rc-today-label">{t("resetCalendar.today")}</span>}<span className="rc-day-records">{dayRecords.slice(0, 2).map((record) => <span className={`rc-calendar-event is-${record.reset_type}`} key={record.id}><span className="rc-event-time">{formatBeijing(record.announced_at, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span><span className="rc-event-type">{record.reset_type === "banked" ? <Gift size={12} /> : <span className="rc-event-dot" />}<span className="rc-event-label">{t(`resetCalendar.types.${record.reset_type}`)}</span></span></span>)}{dayRecords.length > 2 && <span className="rc-more-records">{t("resetCalendar.moreRecords", { count: dayRecords.length - 2 })}</span>}</span></button></td>;
          })}</tr>)}</tbody></table>
          <footer className="rc-calendar-footer"><div className="rc-calendar-legend"><span><i className="is-regular" />{t("resetCalendar.types.regular")}</span><span><i className="is-banked" />{t("resetCalendar.types.banked")}</span></div><span>{t("resetCalendar.calendarBasis")}</span></footer>
        </section>
        <aside className="rc-detail-panel">
          <header><h2>{formatBeijing(dayDate(selectedDay), locale, { month: "long", day: "numeric", weekday: "long" })}</h2><p>{t("resetCalendar.dayCount", { count: selectedRecords.length })}</p></header>
          <div className="rc-detail-records">{selectedRecords.length ? selectedRecords.map((record) => <RecordDetails key={record.id} record={record} status={data?.status ?? null} locale={locale} />) : <div className="rc-empty"><CalendarDays size={29} /><strong>{t("resetCalendar.emptyDay")}</strong><p>{t(filter === "all" ? "resetCalendar.emptyDayHint" : "resetCalendar.emptyFilterHint")}</p></div>}</div>
          <p className="rc-account-note">{t("resetCalendar.accountDisclaimer")}</p>
          {data && <section className="rc-notification-status" aria-label={t("resetCalendar.notificationStatus")}>
            <div className="rc-notification-line"><div className="rc-notification-preferences"><Bell size={13} /><span title={t("resetCalendar.settings.signalTitle")}>{t("resetCalendar.signalPreference", { state: t(data.settings.signalNotifications ? "resetCalendar.enabled" : "resetCalendar.disabled") })}</span><span aria-hidden="true">·</span><span title={t("resetCalendar.settings.confirmedTitle")}>{t("resetCalendar.confirmedPreference", { state: t(data.settings.confirmedNotifications ? "resetCalendar.enabled" : "resetCalendar.disabled") })}</span></div><button className="rc-text-link" type="button" onClick={() => setSettingsOpen(true)}>{t("resetCalendar.manageNotifications")}<ArrowUpRight size={13} /></button></div>
            {!data.notificationsSupported && <p className="rc-desktop-hint">{t("resetCalendar.settings.desktopRequired")}</p>}
          </section>}
        </aside>
      </div>
    </>}
    <footer className="rc-page-footer"><span>{t("resetCalendar.dataSource")} <a href="https://codex-resets.com/" target="_blank" rel="noopener noreferrer">Codex Resets <ArrowUpRight size={13} /></a></span><span aria-live="polite">{t("resetCalendar.lastSynced")} {data?.sync.lastSyncedAt ? formatBeijing(data.sync.lastSyncedAt, locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : t("resetCalendar.neverSynced")}</span></footer>
    {settingsOpen && data && <NotificationSettingsModal state={data} onClose={() => setSettingsOpen(false)} onSaved={(next) => { ++requestSequence.current; setData(next); setStatus?.(t("resetCalendar.settings.saved")); }} />}
  </section>;
}
