import { ArrowDown, Clock3, Megaphone, Radio } from "lucide-react";
import { useLocaleValue, useT } from "@/i18n";
import { formatBeijing, formatWatchWindow } from "./calendar";
import { SourceContent } from "./SourceContent";
import type { ResetWatch, ScheduledReset } from "./types";

export function SignalPanel({ scheduled, watch, overdue, onViewRecord }: {
  scheduled: ScheduledReset | null;
  watch: ResetWatch | null;
  overdue: boolean;
  onViewRecord: () => void;
}) {
  const t = useT();
  const locale = useLocaleValue();
  const signal = scheduled ?? watch;
  if (!signal) return null;
  const expected = scheduled?.scheduled_for;
  const hasExpectedTime = Boolean(expected && Number.isFinite(Date.parse(expected)));
  return <section className={`rc-signal-detail ${scheduled ? "is-scheduled" : "is-watch"}`} aria-labelledby="rc-signal-title">
    <div className="rc-signal-overview">
      <div className="rc-signal-heading" aria-live="polite">
        <div className="rc-signal-eyebrow">{scheduled ? <Megaphone size={17} /> : <Radio size={17} />}<span>{t(scheduled ? "resetCalendar.signal.previewLabel" : "resetCalendar.signal.watchLabel")}</span><span className="rc-signal-state">{t(scheduled ? "resetCalendar.unconfirmed" : "resetCalendar.signal.watchStatus")}</span></div>
        <h2 id="rc-signal-title">{scheduled ? t("resetCalendar.signal.previewTitle", { type: t(`resetCalendar.types.${scheduled.reset_type}`) }) : t("resetCalendar.signal.watchTitle")}</h2>
        <p className="rc-signal-description">{t(scheduled ? overdue ? "resetCalendar.signal.overdueHint" : "resetCalendar.signal.scheduledHint" : "resetCalendar.signal.watchHint")}</p>
      </div>
      {scheduled ? <div className="rc-signal-timing">
        <span><Clock3 size={14} />{t("resetCalendar.expectedAt")} · {t("resetCalendar.timeZone")}</span>
        {hasExpectedTime ? <time dateTime={expected!}><span>{formatBeijing(expected, locale, { month: "short", day: "numeric" })}</span><strong>{formatBeijing(expected, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</strong></time> : <strong className="rc-signal-time-unknown">{t("resetCalendar.signal.timeUnknown")}</strong>}
      </div> : watch && <div className="rc-signal-forecast">
        {watch.reset_chance_percent !== null && Number.isFinite(watch.reset_chance_percent) && watch.reset_chance_percent >= 0 && watch.reset_chance_percent <= 100 && <p>{t("resetCalendar.signal.chance", { chance: watch.reset_chance_percent })}</p>}
        {watch.forecast_window && <p>{t("resetCalendar.signal.forecastWindow", { window: formatWatchWindow(watch.forecast_window, locale) })}</p>}
        <p>{t("resetCalendar.signal.watchUntil", { time: `${formatBeijing(watch.expires_at, locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} · ${t("resetCalendar.timeZone")}` })}</p>
      </div>}
      {scheduled && <button type="button" className="rc-signal-view" onClick={onViewRecord}>{t("resetCalendar.signal.viewRecord")}<ArrowDown size={15} /></button>}
    </div>
    <SourceContent key={scheduled?.id ?? watch?.observed_at} text={signal.text} translation={signal.translation} source={signal.source} at={"announced_at" in signal ? signal.announced_at : signal.observed_at} wide />
  </section>;
}
