import { useEffect, useId, useRef, useState } from "react";
import { Copy, Download, Loader2, Share2 } from "lucide-react";
import { useLocaleValue, useT } from "@/i18n";
import { Modal } from "@/shared/components/Modal";
import { getIntelCardData, intelCardCaption, renderIntelCard } from "../../../../../sites/codex-reset/public/intel-card.js";
import tiboAvatar from "../../../../../sites/codex-reset/public/tibo-avatar.jpg";
import type { ResetCalendarState, ResetTranslation } from "../types";
import "./intel-share.css";

export interface IntelShareDialogProps {
  reset: ResetCalendarState | null;
  market: unknown;
  onClose: () => void;
}

type Translation = ResetTranslation & {
  machine?: boolean;
  provider?: string;
  modelRevision?: string;
  translatedAt?: string;
};

function shareRecord<T extends { text: string; translation?: ResetTranslation }>(record: T | null | undefined) {
  if (!record) return null;
  const { translation: rawTranslation, ...original } = record;
  const translation = rawTranslation as Translation | undefined;
  if (!translation?.zhCN.trim() || translation.originalText !== record.text) return original;
  if (translation.machine || translation.provider) {
    if (translation.provider !== "opus-mt-en-zh" || !translation.modelRevision?.trim()
      || !translation.translatedAt || !Number.isFinite(Date.parse(translation.translatedAt))) return original;
    return { ...original, translationZh: translation.zhCN, translationMeta: {
      provider: translation.provider, modelRevision: translation.modelRevision,
      translatedAt: translation.translatedAt, sourceText: record.text,
    } };
  }
  return { ...original, translationZh: translation.zhCN };
}

function shareReset(reset: ResetCalendarState | null) {
  if (!reset?.status) return null;
  return {
    generatedAt: reset.sync.generatedAt,
    records: reset.records.map(record => shareRecord(record)),
    status: reset.status && { ...reset.status,
      latest_reset: shareRecord(reset.status.latest_reset),
      scheduled_reset: shareRecord(reset.status.scheduled_reset),
      active_watch: shareRecord(reset.status.active_watch),
    },
  };
}

const copy = {
  zh: { title: "分享今日情报", description: "重置信号与 Plus / Pro 好价，一张图分享。", loading: "正在生成情报图片…", unavailable: "暂时无法生成图片，可复制情报摘要。", noData: "暂时没有可分享的情报，请稍后重试。", alt: "包含重置信号、Tibo 中英文消息和 Plus / Pro 地区低价的情报图片", summary: "复制摘要", save: "保存 PNG", share: "分享图片", copied: "情报摘要已复制。", copyFailed: "复制失败，请稍后重试。", saved: "PNG 已保存。", fallback: "系统分享暂不可用，已保存 PNG。", shared: "图片已分享。", frozen: "图片保留打开时的情报与价格。", processing: "正在处理…" },
  en: { title: "Share today's intelligence", description: "Reset signals and Plus / Pro deals in one image.", loading: "Generating the intelligence image…", unavailable: "The image could not be generated. You can still copy the summary.", noData: "No intelligence is available to share yet. Please try again later.", alt: "Intelligence image with reset signals, Tibo's Chinese and English message, and regional Plus / Pro prices", summary: "Copy summary", save: "Save PNG", share: "Share image", copied: "Summary copied.", copyFailed: "Copy failed. Please try again.", saved: "PNG saved.", fallback: "System sharing is unavailable. The PNG has been saved.", shared: "Image shared.", frozen: "The image keeps the intelligence and prices captured when opened.", processing: "Working…" },
};

async function copySummary(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* Older or insecure contexts can still support selection copying. */ }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
  document.body.append(field);
  try {
    field.focus(); field.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally { field.remove(); previous?.focus(); }
}

export function IntelShareDialog({ reset, market, onClose }: IntelShareDialogProps) {
  const t = useT();
  const locale = useLocaleValue();
  const text = copy[locale.startsWith("zh") ? "zh" : "en"];
  const titleId = useId();
  const descriptionId = useId();
  const shell = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const alive = useRef(false);
  const downloadUrls = useRef(new Set<string>());
  const [snapshot] = useState(() => {
    try {
      const info = getIntelCardData(shareReset(reset), market, { now: Date.now() });
      return { info, caption: intelCardCaption(info, {
        pageUrl: "https://fchangjun.github.io/AI-Zero-Token/index.html",
        aztUrl: "https://github.com/fchangjun/AI-Zero-Token",
      }) };
    } catch { return { info: null, caption: "" }; }
  });
  const [png, setPng] = useState<Blob | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = shell.current?.querySelector<HTMLElement>('[role="dialog"]');
    const heading = dialog?.querySelector(".modal-head h3");
    if (heading) heading.id = titleId;
    dialog?.setAttribute("aria-labelledby", titleId);
    dialog?.setAttribute("aria-describedby", descriptionId);
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled)') ?? []);
    focusable()[0]?.focus();
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", keyDown);
    return () => {
      alive.current = false;
      document.removeEventListener("keydown", keyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
      downloadUrls.current.forEach(url => URL.revokeObjectURL(url));
      downloadUrls.current.clear();
    };
  }, [descriptionId, titleId]);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      if (!snapshot.info || !canvas.current) return;
      try {
        const rendered = await renderIntelCard(canvas.current, snapshot.info, { avatarUrl: tiboAvatar });
        const blob = await new Promise<Blob>((resolve, reject) => rendered.toBlob(value => value ? resolve(value) : reject(new Error("PNG unavailable")), "image/png"));
        if (!cancelled) setPng(blob);
      } catch { if (!cancelled) setRenderFailed(true); }
    };
    void draw();
    return () => { cancelled = true; };
  }, [snapshot]);

  const filename = `codex-intel-${(snapshot.info?.capturedAt || "snapshot").replace(/[:.]/g, "-")}.png`;

  function savePng(message = text.saved) {
    if (!png) return;
    const url = URL.createObjectURL(png);
    downloadUrls.current.add(url);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 1000);
    if (alive.current) setFeedback({ message });
  }

  async function sharePng() {
    if (!png || busy) return;
    const file = new File([png], filename, { type: "image/png" });
    const payload = { files: [file], title: text.title };
    try {
      if (!navigator.share || !navigator.canShare?.(payload)) { savePng(text.fallback); return; }
      setBusy(true); setFeedback(null);
      await navigator.share(payload);
      if (alive.current) setFeedback({ message: text.shared });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError") && alive.current) savePng(text.fallback);
    } finally { if (alive.current) setBusy(false); }
  }

  async function copyCaption() {
    if (!snapshot.caption || busy) return;
    setBusy(true); setFeedback(null);
    try {
      await copySummary(snapshot.caption);
      if (alive.current) setFeedback({ message: t("common.copySuccess") });
    } catch { if (alive.current) setFeedback({ message: text.copyFailed, error: true }); }
    finally { if (alive.current) setBusy(false); }
  }

  return <div className="intel-share-shell" ref={shell}>
    <Modal title={text.title} onClose={onClose}>
      <div className="intel-share-content">
        <p className="intel-share-description" id={descriptionId}>{text.description}</p>
        <div className="intel-share-preview" aria-busy={!!snapshot.info && !png && !renderFailed}>
          <canvas ref={canvas} role="img" aria-label={text.alt} hidden={!png} />
          {!snapshot.info ? <p role="status">{text.noData}</p> : renderFailed ? <p role="alert">{text.unavailable}</p> : !png && <p role="status"><Loader2 size={20} className="spin" />{text.loading}</p>}
        </div>
        <p className="intel-share-frozen">{text.frozen}</p>
        <div className="intel-share-feedback" role="status" aria-live="polite"><span className={feedback?.error ? "is-error" : ""}>{feedback?.message || (busy ? text.processing : "")}</span></div>
        <div className="intel-share-actions">
          <button className="btn-secondary" type="button" disabled={!snapshot.caption || busy} onClick={() => void copyCaption()}><Copy size={16} />{text.summary}</button>
          <button className="btn-secondary" type="button" disabled={!png || busy} onClick={() => savePng()}><Download size={16} />{text.save}</button>
          <button className="btn-primary" type="button" disabled={!png || busy} onClick={() => void sharePng()}><Share2 size={16} />{text.share}</button>
        </div>
      </div>
    </Modal>
  </div>;
}
