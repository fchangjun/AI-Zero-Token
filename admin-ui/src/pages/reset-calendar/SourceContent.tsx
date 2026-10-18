import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLocaleValue, useT } from "@/i18n";
import { copyText } from "@/shared/lib/app-utils";
import { formatBeijing, safeSourceUrl } from "./calendar";
import type { ResetSource, ResetTranslation } from "./types";
import tiboAvatar from "../../../../sites/codex-reset/public/tibo-avatar.jpg";

export function SourceContent({ text, source, at, translation, wide = false }: {
  text: string;
  source: ResetSource;
  at: string;
  translation?: ResetTranslation;
  wide?: boolean;
}) {
  const t = useT();
  const locale = useLocaleValue();
  const url = safeSourceUrl(source.url);
  const displayText = (value: string) => value.replace(/https?:\/\/t\.co\/[a-z0-9]+(?:[?#][^\s]*)?/giu, "").trim();
  const chinese = translation?.originalText === text ? displayText(translation.zhCN) : "";
  const translationNoteKey = translation?.machine ? "automaticTranslationNote" : translation?.source === "codex-intel" ? "intelTranslationNote" : translation?.source === "ai-zero-token" ? "localTranslationNote" : "translationNote";
  const fullTime = `${formatBeijing(at, locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} · ${t("resetCalendar.timeZone")}`;
  const [feedback, setFeedback] = useState<{ url: string; key: string; error: boolean } | null>(null);
  const shownFeedback = feedback?.url === url ? feedback : null;
  const copied = shownFeedback?.key === "resetCalendar.sourceContent.copied";

  async function copySource() {
    if (!url) return;
    let success = false;
    try { success = await copyText(url); } catch { /* A selectable link remains available if the clipboard is unavailable. */ }
    setFeedback({ url, key: success ? "resetCalendar.sourceContent.copied" : "resetCalendar.sourceContent.copyFailed", error: !success });
  }

  return <section className={`rc-source-content ${wide ? "is-wide" : ""}`} aria-label={t("resetCalendar.sourceContent.title")}>
    <p className="rc-source-meta-line">{source.author === "thsottiaux" && <img src={tiboAvatar} alt="Tibo" />}<span>{source.author === "thsottiaux" ? "Tibo · @thsottiaux" : source.author || t("resetCalendar.sourceContent.authorUnknown")}</span><span aria-hidden="true">·</span><span>{t(source.type === "x_post" ? "resetCalendar.xPost" : "resetCalendar.publicObservation")}</span><span aria-hidden="true">·</span><time dateTime={at} title={fullTime} aria-label={fullTime}>{formatBeijing(at, locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</time></p>
    <div className="rc-source-texts">
      <section className="rc-source-text is-chinese" lang="zh-CN"><h5 lang={locale}>{t(translation?.machine && chinese ? "resetCalendar.sourceContent.automaticChineseTitle" : "resetCalendar.sourceContent.chineseTitle")}</h5><p className={chinese ? undefined : "rc-translation-empty"} lang={chinese ? "zh-CN" : locale}>{chinese || t("resetCalendar.sourceContent.chineseUnavailable")}</p></section>
      <section className="rc-source-text is-english" lang="en"><h5 lang={locale}>{t("resetCalendar.sourceContent.englishTitle")}</h5><p lang={text ? "en" : locale}>{displayText(text) || t("resetCalendar.noOriginalText")}</p></section>
    </div>
    <footer className="rc-source-footer">
      {chinese && <small className="rc-translation-note" title={t(`resetCalendar.sourceContent.${translationNoteKey}`)}>{t(`resetCalendar.sourceContent.${translationNoteKey}Short`)}</small>}
      {url ? <button className="rc-copy-source" type="button" onClick={() => void copySource()}>{copied ? <Check size={13} /> : <Copy size={13} />}{t(copied ? "resetCalendar.sourceContent.copyDone" : "resetCalendar.sourceContent.copyLink")}</button> : <p className="rc-source-no-link">{t("resetCalendar.sourceContent.linkUnavailable")}</p>}
    </footer>
    {shownFeedback && <p className={`rc-source-feedback ${shownFeedback.error ? "is-error" : ""}`} role={shownFeedback.error ? "alert" : "status"}>{t(shownFeedback.key)}</p>}
    {url && shownFeedback?.error && <input className="rc-source-copy-fallback" aria-label={t("resetCalendar.sourceContent.originalLink")} readOnly value={url} dir="ltr" onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} />}
  </section>;
}
