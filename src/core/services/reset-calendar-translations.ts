import type { ResetAnnouncement, ResetSource, ResetTranslation, ResetWatch } from "../reset-calendar-types.js";

export const resetTranslationSourceUrl = "https://ai-resets.com/";
export const resetTranslationMaxHtmlLength = 2 * 1024 * 1024;

export type PublicResetTranslation = {
  sourceId: string;
  originalText: string;
  zhCN: string;
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
    if (parsed.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname)) return null;
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

export function matchPublicResetTranslation(
  record: { text: string; source: ResetSource; id?: string },
  translations: ReadonlyMap<string, PublicResetTranslation>,
): ResetTranslation | undefined {
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
  const sourceId = postId(record.source.url) ?? (record.id && /^[0-9]+$/.test(record.id) ? record.id : null);
  const translation = sourceId ? translations.get(sourceId) : undefined;
  if (!translation || normalizeResetOriginalText(translation.originalText) !== normalizeResetOriginalText(record.text)) return undefined;
  return { zhCN: translation.zhCN, source: "ai-resets.com", sourceUrl: resetTranslationSourceUrl, originalText: record.text };
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
