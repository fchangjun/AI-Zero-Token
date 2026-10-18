import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bell, CalendarDays, ChevronLeft, ChevronRight, Clock3, DollarSign, Gift, Info, Loader2, MessageCircle, Radio, RefreshCw, Share2 } from "lucide-react";
import { useLocaleValue, useT } from "@/i18n";
import { fetchJson } from "@/shared/api";
import { announcementStage, beijingDay, buildMonthDays, calendarRecords, currentWatch, dayDate, filterRecords, formatBeijing, recordsByDay, scheduledIsPast, shiftMonth } from "./calendar";
import { NotificationSettingsModal } from "./NotificationSettingsModal";
import { SourceContent } from "./SourceContent";
import { SignalPanel } from "./SignalPanel";
import { ContactModal } from "@/shared/components/ContactModal";
import { PricesPanel, useIntelligencePrices } from "./intelligence/prices";
import { IntelShareDialog } from "./intelligence/IntelShareDialog";
import "./intelligence/intelligence.css";
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
  const market = useIntelligencePrices();
  const [activeTab, setActiveTab] = useState<"resets" | "prices">("resets");
  const [contactOpen, setContactOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const today = beijingDay(now)!;
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(() => today);
  const [filter, setFilter] = useState<ResetFilter>("all");
  const [data, setData] = useState<ResetCalendarState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordNavigation, setRecordNavigation] = useState(0);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const mutation = useRef(false);
  const requestSequence = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    const revealCalendar = () => { setSettingsOpen(false); setActiveTab("resets"); };
    window.addEventListener("azt:open-reset-calendar", revealCalendar);
    return () => window.removeEventListener("azt:open-reset-calendar", revealCalendar);
  }, []);

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
  const syncBusy = refreshing || data?.sync.phase === "syncing";
  const syncError = loadError || data?.sync.phase === "error";
  const initialSync = data?.sync.phase === "syncing" && !data.sync.lastSyncedAt && records.length === 0;
  const retryAt = syncError && data?.sync.nextSyncAt && Date.parse(data.sync.nextSyncAt) > now
    ? formatBeijing(data.sync.nextSyncAt, locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : null;
  const retryHint = retryAt ? t("resetCalendar.nextRetry", { time: retryAt }) : undefined;
  // Older backends expose only the shared retry deadline.
  const manualDeadline = data?.sync.manualRetryAt === undefined ? data?.sync.nextSyncAt : data.sync.manualRetryAt;
  const manualBlocked = Boolean(syncError && manualDeadline && Date.parse(manualDeadline) > now);
  const manualHint = manualBlocked ? t("resetCalendar.manualRetry", { time: formatBeijing(manualDeadline!, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }) }) : undefined;

  useEffect(() => {
    if (!manualBlocked) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [manualBlocked]);
  const selectedRecords = grouped.get(selectedDay) ?? [];

  useEffect(() => {
    if (!recordNavigation) return;
    detailsHeading.current?.focus({ preventScroll: true });
    detailsHeading.current?.scrollIntoView({ block: "center" });
  }, [recordNavigation]);

  function changeMonth(delta: number) {
    const nextMonth = shiftMonth(month, delta);
    setMonth(nextMonth); setSelectedDay(`${nextMonth}-01`);
  }

  function pickDay(key: string) {
    setSelectedDay(key);
    if (!key.startsWith(month)) setMonth(key.slice(0, 7));
  }

  function viewScheduledRecord() {
    const day = scheduled && beijingDay(scheduled.announced_at);
    if (!day) return;
    setFilter("all");
    pickDay(day);
    setRecordNavigation((value) => value + 1);
  }

  return <section className="rc-page" aria-label={t("resetCalendar.pageLabel")}>
    <div className="rc-toolbar">
      <span className="rc-time-zone"><Clock3 size={14} />{t("resetCalendar.timeZone")}</span>
      <div className="rc-actions"><button className="btn-secondary" type="button" disabled={activeTab === "prices" ? market.busy : syncBusy || manualBlocked} title={activeTab === "resets" ? manualHint : undefined} onClick={() => void (activeTab === "prices" ? market.refresh() : synchronize())}>{(activeTab === "prices" ? market.busy : syncBusy) ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}{t((activeTab === "prices" ? market.busy : syncBusy) ? "resetCalendar.syncing" : "resetCalendar.synchronize")}</button><button className="btn-secondary" type="button" disabled={!data?.status && !market.data} onClick={() => setShareOpen(true)}><Share2 size={16} />{t("intelStation.share")}</button><button className="btn-primary" type="button" disabled={!data} onClick={() => setSettingsOpen(true)}><Bell size={16} />{t("resetCalendar.settings.title")}</button></div>
    </div>
    <div className="rc-intel-tabs" role="tablist" aria-label={t("resetCalendar.pageLabel")}>{(["resets", "prices"] as const).map((tab, index) => <button id={`intel-tab-${tab}`} key={tab} role="tab" type="button" aria-selected={activeTab === tab} aria-controls={`intel-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "resets" : event.key === "End" ? "prices" : index === 0 ? "prices" : "resets"; setActiveTab(next); document.getElementById(`intel-tab-${next}`)?.focus(); }}>{tab === "resets" ? <Radio size={16} /> : <DollarSign size={16} />}{t(tab === "resets" ? "intelStation.resetTab" : "intelStation.pricesTab")}</button>)}</div>
    <div id={`intel-panel-${activeTab}`} className="rc-intel-panel" role="tabpanel" aria-labelledby={`intel-tab-${activeTab}`}>
    {activeTab === "prices" && <PricesPanel locale={locale} market={market} />}
    {activeTab === "resets" && syncError && <div className="rc-sync-error" role="alert"><Info size={18} /><p>{data?.sync.source === "snapshot" ? t("intelStation.fallbackSnapshot", { time: formatBeijing(data.sync.generatedAt, locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) }) : t(data && records.length > 0 ? "resetCalendar.cachedError" : "resetCalendar.loadError")}{retryHint && <span className="rc-retry-time">{retryHint}</span>}{manualHint && <span className="rc-retry-time">{manualHint}</span>}</p><button type="button" disabled={syncBusy || manualBlocked} title={manualHint} onClick={() => void synchronize()}>{t("resetCalendar.retry")}</button></div>}
    {activeTab === "resets" && ((!data || initialSync) && !syncError ? <div className="rc-loading" role="status"><Loader2 className="spin" size={22} /><span>{t("resetCalendar.loading")}</span></div> : <>
      <SignalPanel scheduled={scheduled ?? null} watch={watch} overdue={scheduledIsPast(data?.status ?? null, now)} onViewRecord={viewScheduledRecord} />
      <div className={`rc-intel-confirmation-grid ${signal ? "has-signal" : ""}`}>
        <section className="rc-intel-confirmation"><header><span><CalendarDays size={17} />{t(latest?.source.type === "observed" ? "intelStation.latestObserved" : "intelStation.latestConfirmed")}</span>{latest && <span className={`rc-badge ${latest.source.type === "observed" ? "is-record" : "is-confirmed"}`}>{t(latest.source.type === "observed" ? "intelStation.observedShort" : "resetCalendar.confirmedShort")}</span>}</header><div className="rc-intel-confirmation-body"><div className="rc-intel-confirmed-time"><strong>{latest ? formatBeijing(latest.announced_at, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—"}</strong><span>{latest ? formatBeijing(latest.announced_at, locale, { year: "numeric", month: "long", day: "numeric" }) : t("resetCalendar.noConfirmedReset")}</span>{latest && <small>{t(`resetCalendar.types.${latest.reset_type}`)}</small>}</div>{latest && <SourceContent text={latest.text} translation={latest.translation} source={latest.source} at={latest.announced_at} />}</div></section>
        {!signal && <section className="rc-intel-no-preview"><span><Radio size={18} />{t("intelStation.nextReset")}</span><strong>{data?.status ? t("intelStation.noPreview") : t("resetCalendar.loading")}</strong><p>{data?.status ? t("intelStation.noPreviewHint") : t("resetCalendar.loadError")}</p></section>}
      </div>
      {data?.sync.phase === "ready" && data.sync.error && <div className="rc-partial-note" role="status"><Info size={15} /><span>{t("intelStation.partialUpdate")}</span></div>}
      <details className="rc-types-explanation">
        <summary aria-label={t("resetCalendar.typeGuide.title")}><Info size={14} /><span>{t("resetCalendar.typeGuide.summary")}</span><ChevronRight size={15} className="rc-guide-chevron" /></summary>
        <div className="rc-type-guide-details"><div className="rc-types-columns">
          <div><span className="rc-type-guide-icon is-regular"><RefreshCw size={19} /></span><div><h3>{t("resetCalendar.typeGuide.regularTitle")}</h3><p>{t("resetCalendar.typeGuide.regularDescription")}</p></div></div>
          <div><span className="rc-type-guide-icon is-banked"><Gift size={19} /></span><div><h3>{t("resetCalendar.typeGuide.bankedTitle")}</h3><p>{t("resetCalendar.typeGuide.bankedDescription")}</p></div></div>
        </div>
        <p className="rc-types-footnote">{t("resetCalendar.typeGuide.scopeNote")}</p></div>
      </details>
      {data && !data.sync.historyComplete && <div className="rc-partial-note"><Info size={15} /><span>{t("resetCalendar.partialHistory")}</span></div>}
      <div className="rc-main-grid">
        <section className="rc-calendar" aria-label={t("resetCalendar.calendarLabel")}>
          <header className="rc-calendar-head"><div className="rc-month-navigation"><h2>{formatBeijing(dayDate(`${month}-01`), locale, { year: "numeric", month: "long" })}</h2><small className="rc-intel-month-summary">{t("intelStation.monthSummary", { count: monthRecords.length, regular: regularCount, banked: bankedCount })}</small><div className="rc-month-buttons"><button className="btn-secondary icon-only" type="button" aria-label={t("resetCalendar.previousMonth")} onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></button><button className="btn-secondary icon-only" type="button" aria-label={t("resetCalendar.nextMonth")} onClick={() => changeMonth(1)}><ChevronRight size={17} /></button><button className="btn-secondary" type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }}>{t("resetCalendar.today")}</button></div></div><div className="rc-filters" role="group" aria-label={t("resetCalendar.filterLabel")}>{(["all", "regular", "banked"] as const).map((kind) => <button type="button" key={kind} aria-pressed={filter === kind} className={filter === kind ? "is-active" : ""} onClick={() => setFilter(kind)}>{t(`resetCalendar.types.${kind}`)}</button>)}</div></header>
          <table className="rc-month-table"><thead><tr>{Array.from({ length: 7 }, (_, index) => <th scope="col" key={index}>{t(`resetCalendar.weekdays.${index}`)}</th>)}</tr></thead><tbody>{Array.from({ length: monthDays.length / 7 }, (_, row) => <tr key={row}>{monthDays.slice(row * 7, row * 7 + 7).map((day) => {
            const dayRecords = [...(grouped.get(day.key) ?? [])].sort((left, right) => Number(right.id === scheduled?.id) - Number(left.id === scheduled?.id));
            const hasScheduled = dayRecords.some((record) => record.id === scheduled?.id);
            const fullLabel = formatBeijing(dayDate(day.key), locale, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
            return <td key={day.key}><button type="button" className={`rc-day ${day.inMonth ? "" : "is-outside"} ${day.key === selectedDay ? "is-selected" : ""} ${day.key === today ? "is-today" : ""}`} aria-label={`${t("resetCalendar.dayLabel", { date: fullLabel, count: dayRecords.length })}${hasScheduled ? ` · ${t("resetCalendar.signal.scheduledDayHint")}` : ""}`} aria-pressed={day.key === selectedDay} aria-current={day.key === today ? "date" : undefined} onClick={() => pickDay(day.key)}><span className="rc-day-number">{day.day}</span>{day.key === today && <span className="rc-today-label">{t("resetCalendar.today")}</span>}<span className="rc-day-records">{dayRecords.slice(0, 2).map((record) => <span className={`rc-calendar-event is-${record.reset_type} ${record.id === scheduled?.id ? "is-scheduled" : ""}`} key={record.id}><span className="rc-event-meta"><span className="rc-event-time">{formatBeijing(record.announced_at, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span>{record.id === scheduled?.id && <span className="rc-event-stage">{t("resetCalendar.signal.previewShort")}</span>}</span><span className="rc-event-type">{record.reset_type === "banked" ? <Gift size={12} /> : <span className="rc-event-dot" />}<span className="rc-event-label">{t(`resetCalendar.types.${record.reset_type}`)}</span></span></span>)}{dayRecords.length > 2 && <span className="rc-more-records">{t("resetCalendar.moreRecords", { count: dayRecords.length - 2 })}</span>}</span></button></td>;
          })}</tr>)}</tbody></table>
          <footer className="rc-calendar-footer"><div className="rc-calendar-legend"><span><i className="is-regular" />{t("resetCalendar.types.regular")}</span><span><i className="is-banked" />{t("resetCalendar.types.banked")}</span>{scheduled && <span><i className="is-scheduled" />{t("resetCalendar.signal.previewLabel")}</span>}</div><span>{t("resetCalendar.calendarBasis")}</span></footer>
        </section>
        <aside className="rc-detail-panel">
          <header><h2 ref={detailsHeading} tabIndex={-1}>{formatBeijing(dayDate(selectedDay), locale, { month: "long", day: "numeric", weekday: "long" })}</h2><p>{t("resetCalendar.dayCount", { count: selectedRecords.length })}</p></header>
          <div className="rc-detail-records">{selectedRecords.length ? selectedRecords.map((record) => <RecordDetails key={record.id} record={record} status={data?.status ?? null} locale={locale} />) : <div className="rc-empty"><CalendarDays size={29} /><strong>{t("resetCalendar.emptyDay")}</strong><p>{t(filter === "all" ? "resetCalendar.emptyDayHint" : "resetCalendar.emptyFilterHint")}</p></div>}</div>
          <p className="rc-account-note">{t("resetCalendar.accountDisclaimer")}</p>
          {data && <section className="rc-notification-status" aria-label={t("resetCalendar.notificationStatus")}>
            <div className="rc-notification-line"><div className="rc-notification-preferences"><Bell size={13} /><span title={t("resetCalendar.settings.signalTitle")}>{t("resetCalendar.signalPreference", { state: t(data.settings.signalNotifications ? "resetCalendar.enabled" : "resetCalendar.disabled") })}</span><span aria-hidden="true">·</span><span title={t("resetCalendar.settings.confirmedTitle")}>{t("resetCalendar.confirmedPreference", { state: t(data.settings.confirmedNotifications ? "resetCalendar.enabled" : "resetCalendar.disabled") })}</span></div><button className="rc-text-link" type="button" onClick={() => setSettingsOpen(true)}>{t("resetCalendar.manageNotifications")}<ArrowUpRight size={13} /></button></div>
            {!data.notificationsSupported && <p className="rc-desktop-hint">{t("resetCalendar.settings.desktopRequired")}</p>}
          </section>}
        </aside>
      </div>
    </>)}
    </div>
    <aside className="rc-intel-subscription"><div><MessageCircle size={19} /><span><strong>{t("intelStation.subscriptionTitle")}</strong><small>{t("intelStation.subscriptionHint")}</small></span></div><button className="btn-secondary" type="button" onClick={() => setContactOpen(true)}>{t("intelStation.subscriptionButton")}<ArrowUpRight size={14} /></button></aside>
    <footer className="rc-page-footer"><span>{t("resetCalendar.dataSource")} <a href="https://codex-resets.com/" target="_blank" rel="noopener noreferrer">Codex Resets <ArrowUpRight size={13} /></a></span><span aria-live="polite">{t(data?.sync.source === "snapshot" ? "intelStation.snapshotTime" : "resetCalendar.lastSynced")} {(data?.sync.source === "snapshot" ? data.sync.generatedAt : data?.sync.lastSyncedAt) ? formatBeijing(data?.sync.source === "snapshot" ? data.sync.generatedAt : data?.sync.lastSyncedAt, locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : t("resetCalendar.neverSynced")}</span></footer>
    {contactOpen && <ContactModal purpose="subscription" onClose={() => setContactOpen(false)} />}
    {shareOpen && <IntelShareDialog reset={data ?? null} market={market.data} onClose={() => setShareOpen(false)} />}
    {settingsOpen && data && <NotificationSettingsModal state={data} onClose={() => setSettingsOpen(false)} onSaved={(next) => { ++requestSequence.current; setData(next); setStatus?.(t("resetCalendar.settings.saved")); }} />}
  </section>;
}
