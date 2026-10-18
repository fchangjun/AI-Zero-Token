import { ExternalLink } from "lucide-react";
import { useLocale } from "@/i18n";
import type { ReleaseHistoryEntry } from "../../../../src/desktop/update-types";

export function ReleaseHistory({ entries, complete, busy, onRetry }: {
  entries: ReleaseHistoryEntry[];
  complete: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const { t, locale } = useLocale();
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
  return <div>
    <p className="desktop-release-range">{t(complete ? "update.historyCount" : "update.historyLoadedCount", { count: entries.length })}</p>
    {!complete && <div className="desktop-release-history-warning" role="status">
      <p>{t("update.historyIncomplete")}</p>
      <button type="button" className="desktop-update-later" onClick={onRetry} disabled={busy}>{t("update.checkNative")}</button>
    </div>}
    <ol className="desktop-release-history">
      {entries.map(entry => <li key={entry.version}>
        <div className="desktop-release-version-heading">
          <h4>v{entry.version}</h4>
          {entry.publishedAt && Number.isFinite(Date.parse(entry.publishedAt)) && <time dateTime={entry.publishedAt}>{date.format(new Date(entry.publishedAt))}</time>}
          <a href={entry.releaseUrl} target="_blank" rel="noreferrer noopener" aria-label={t("update.versionDetails", { version: entry.version })}>{t("update.historyDetails")}<ExternalLink size={12} /></a>
        </div>
        {entry.highlights.length ? <ul className="desktop-release-highlights">{entry.highlights.map((highlight, index) => <li key={index}>{highlight}</li>)}</ul>
          : <p className="desktop-update-hint">{t("update.noHistorySummary")}</p>}
      </li>)}
    </ol>
  </div>;
}
