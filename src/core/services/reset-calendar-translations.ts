import type { ResetAnnouncement, ResetSource, ResetTranslation, ResetWatch } from "../reset-calendar-types.js";

export const resetTranslationSourceUrl = "https://fchangjun.github.io/AI-Zero-Token/snapshot.json";
const legacyTranslationSourceUrl = "https://ai-resets.com/";
export const resetTranslationMaxHtmlLength = 2 * 1024 * 1024;

export type PublicResetTranslation = {
  sourceId: string;
  originalText: string;
  zhCN: string;
  /** Absent in old caches, which contain ai-resets reference translations. */
  source?: ResetTranslation["source"];
  sourceUrl?: string;
  originalSourceUrl?: string;
  exactOriginal?: boolean;
  machine?: boolean;
  provider?: string;
  modelRevision?: string;
  translatedAt?: string;
};

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key: string) => {
    if (!key.startsWith("#")) return named[key.toLowerCase()] ?? entity;
    const code = key[1]?.toLowerCase() === "x" ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  });
}

function htmlText(fragment: string): string {
  return decodeHtmlEntities(fragment.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "")).trim();
}

/** The Chinese site omits X's t.co links in its English display. */
export function normalizeResetOriginalText(text: string): string {
  return decodeHtmlEntities(text).replace(/https:\/\/t\.co\/[A-Za-z0-9_-]+/g, "").replace(/\s+/g, " ").trim();
}

function postId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname)) return null;
    return /^\/thsottiaux\/status\/([0-9]+)\/?$/.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Read rendered article text only. Never execute scripts or use private endpoints. */
export function parsePublicResetTranslations(html: string): PublicResetTranslation[] {
  if (html.length > resetTranslationMaxHtmlLength) return [];
  const entries = new Map<string, PublicResetTranslation>();
  for (const article of html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article\s*>/gi)) {
    const classes = /\bclass\s*=\s*["']([^"']*)["']/i.exec(article[1]!)?.[1]?.split(/\s+/);
    if (!classes?.includes("announcement")) continue;
    const body = article[2]!;
    const zhFragment = /<h3\b[^>]*>([\s\S]*?)<\/h3\s*>/i.exec(body)?.[1];
    const details = /<details\b[^>]*>([\s\S]*?)<\/details\s*>/i.exec(body)?.[1];
    const englishFragment = details && /<p\b[^>]*>([\s\S]*?)<\/p\s*>/i.exec(details)?.[1];
    const sourceId = [...body.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)]
      .map((match) => postId(decodeHtmlEntities(match[1]!))).find(Boolean);
    if (!sourceId || !zhFragment || !englishFragment) continue;
    const zhCN = htmlText(zhFragment);
    const originalText = htmlText(englishFragment);
    const normalizedEnglish = normalizeResetOriginalText(originalText);
    const normalizedChinese = normalizeResetOriginalText(zhCN);
    if (!normalizedEnglish || !normalizedChinese || !/[\u3400-\u9fff]/.test(zhCN)) continue;
    // Conservative mismatch screening: the source has at least one short English
    // confirmation paired with a much longer Chinese forecast/lyrics. This cannot
    // establish translation accuracy; the UI must still label it as reference text.
    if (normalizedChinese.length > Math.max(100, normalizedEnglish.length * 1.5)) continue;
    entries.set(sourceId, { sourceId, originalText, zhCN });
  }
  return [...entries.values()];
}

/** Read our versioned static snapshot; translation identity binds exact text and source. */
export function parseCentralResetTranslations(value: unknown): PublicResetTranslation[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.records)) return [];
  const status = snapshot.status && typeof snapshot.status === "object" ? snapshot.status as Record<string, unknown> : {};
  const entries = new Map<string, PublicResetTranslation>();
  for (const candidate of [...snapshot.records, status.latest_reset, status.scheduled_reset, status.active_watch]) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const source = record.source && typeof record.source === "object" ? record.source as Record<string, unknown> : null;
    const originalSourceUrl = source?.url;
    if (typeof originalSourceUrl !== "string") continue;
    const id = postId(originalSourceUrl);
    const sourceId = id ?? (typeof record.id === "string" && source?.type === "observed" ? `record:${record.id}` : null);
    if (!sourceId || typeof record.text !== "string" || typeof record.translationZh !== "string"
      || !record.translationZh.trim() || !/[\u3400-\u9fff]/.test(record.translationZh)) continue;
    try { if (new URL(originalSourceUrl).protocol !== "https:") continue; } catch { continue; }
    const meta = record.translationMeta;
    let machine: Pick<PublicResetTranslation, "machine" | "provider" | "modelRevision" | "translatedAt"> = {};
    if (meta !== undefined) {
      if (!meta || typeof meta !== "object") continue;
      const details = meta as Record<string, unknown>;
      if (details.sourceText !== record.text || typeof details.provider !== "string" || !details.provider.trim()
        || typeof details.modelRevision !== "string" || !details.modelRevision.trim()
        || typeof details.translatedAt !== "string" || !Number.isFinite(Date.parse(details.translatedAt))) continue;
      machine = { machine: true, provider: details.provider, modelRevision: details.modelRevision, translatedAt: details.translatedAt };
    }
    entries.set(sourceId, { sourceId, originalText: record.text, zhCN: record.translationZh.trim(),
      source: "codex-intel", sourceUrl: resetTranslationSourceUrl, originalSourceUrl, exactOriginal: true, ...machine });
  }
  return [...entries.values()];
}

export function matchPublicResetTranslation(
  record: { text: string; source: ResetSource; id?: string },
  translations: ReadonlyMap<string, PublicResetTranslation>,
): ResetTranslation | undefined {
  const sourceId = postId(record.source.url) ?? (record.id && translations.has(`record:${record.id}`)
    ? `record:${record.id}` : record.id && /^[0-9]+$/.test(record.id) ? record.id : null);
  const translation = sourceId ? translations.get(sourceId) : undefined;
  if (translation?.source === "codex-intel") {
    if (translation.originalText === record.text && translation.originalSourceUrl === record.source.url) return {
      zhCN: translation.zhCN, source: "codex-intel", sourceUrl: resetTranslationSourceUrl, originalText: record.text,
      ...(translation.machine ? { machine: true, provider: translation.provider,
        modelRevision: translation.modelRevision, translatedAt: translation.translatedAt } : {}),
    };
  }
  // This one public observation is paired with unrelated forecast text on the
  // Chinese site. Its reviewed local translation applies only to this exact ID
  // and original sentence; it is not a generic or generated translation fallback.
  if (record.id === "observed-2097043464538264003"
    && normalizeResetOriginalText(record.text) === "All reset for everyone. Enjoy the week with Astra."
    && record.source.url) {
    try {
      if (new URL(record.source.url).protocol === "https:") return {
        zhCN: "所有人的额度都已重置。祝大家本周愉快使用 Astra。",
        source: "ai-zero-token", sourceUrl: record.source.url, originalText: record.text,
      };
    } catch {
      // Invalid source links cannot establish provenance for a local correction.
    }
  }
  if (!translation || translation.source === "codex-intel"
    || normalizeResetOriginalText(translation.originalText) !== normalizeResetOriginalText(record.text)) return undefined;
  return { zhCN: translation.zhCN, source: "ai-resets.com", sourceUrl: legacyTranslationSourceUrl, originalText: record.text };
}

export function attachPublicResetTranslation<T extends ResetAnnouncement | ResetWatch>(
  record: T, translations: ReadonlyMap<string, PublicResetTranslation>,
): T {
  const translation = matchPublicResetTranslation(record, translations)
    ?? (record.translation?.originalText === record.text ? record.translation : undefined);
  const result = { ...record };
  delete result.translation;
  if (translation) result.translation = translation;
  return result;
}
