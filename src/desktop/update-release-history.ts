import { compareSemver } from "../core/services/version-service.js";
import type { UpdateFetch, UpdateRelease } from "./update-release.js";
import type { ReleaseHistoryEntry } from "./update-types.js";

export const RELEASES_URL = "https://github.com/fchangjun/AI-Zero-Token/releases";
const RELEASES_API_URL = "https://api.github.com/repos/fchangjun/AI-Zero-Token/releases";
export const RELEASE_API_URL = `${RELEASES_API_URL}/latest`;
const PAGE_SIZE = 30;
const MAX_PAGES = 5;

// Select the author's feature titles; do not manufacture descriptions or repeat
// old installation commands, validation reports and download lists in the overview.
export function releaseHighlights(notes: string): string[] {
  const highlights: string[] = [];
  let excludedLevel: number | undefined;
  let featureSection = false;
  let fenced = false;
  const add = (text: string) => {
    const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*`_]/g, "").trim();
    if (!plain || /^(?:https?:|npm\s|xattr\s|验证[：:]|测试[：:])/i.test(plain)) return;
    const brief = plain.length > 200 ? `${plain.slice(0, 199)}…` : plain;
    if (!highlights.includes(brief) && highlights.length < 8) highlights.push(brief);
  };
  let introduction = "";
  for (const line of notes.slice(0, 16_000).replace(/\r\n?/g, "\n").split("\n")) {
    const text = line.trim();
    if (/^```|^~~~/.test(text)) { fenced = !fenced; continue; }
    if (fenced || !text) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(text);
    if (heading) {
      const level = heading[1].length;
      if (excludedLevel !== undefined && level > excludedLevel) continue;
      excludedLevel = undefined;
      const title = heading[2].replace(/[*`_]/g, "").trim();
      if (/^(?:(?:升级|更新)(?:方式|步骤|方法|指南|须知|提醒)|下载|安装|使用提醒|注意事项|验证|测试|签名|构建|发布信息|upgrade(?:\s+(?:guide|steps|instructions))?|installation|downloads?|validation|testing|checksums?|build\s+details|known\s+issues|notes?\s+for\s+upgrading)/i.test(title)) {
        excludedLevel = level; featureSection = false; continue;
      }
      // General headings contain the feature list, whereas feature headings are
      // already concise, user-written summaries of their following paragraphs.
      featureSection = !/^(?:(?:本次)?(?:更新|升级)(?:内容|记录)?|新增功能|功能亮点|改进|修复|what['’]s new|release notes|changes|highlights|features|improvements|fixes|v?\d+\.\d+\.\d+|AI Zero Token\b.*)$/i.test(title);
      if (featureSection) add(title);
      continue;
    }
    if (excludedLevel !== undefined) continue;
    const bullet = /^(?:[-*+]\s+|\d+\.\s+)(.+)$/.exec(text);
    if (bullet && !featureSection) {
      const titled = /^\*\*([^*]+)\*\*/.exec(bullet[1]);
      add(titled ? titled[1] : bullet[1].split(/(?<=[。！？])\s*|(?<=[.!?])\s+/u)[0]);
    } else if (!introduction && !featureSection && !/^\*\*.*(?:提醒|注意)/.test(text)) {
      introduction = text;
    }
  }
  if (!highlights.length && introduction) add(introduction);
  return highlights;
}

export async function fetchReleaseJson(fetcher: UpdateFetch, url: string, signal: AbortSignal): Promise<{ value: unknown; link: string | null }> {
  const response = await fetcher(url, {
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "ai-zero-token-updater" },
    redirect: "error", credentials: "omit", signal,
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Release check returned HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 ** 2) throw new Error("Release metadata is too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")), link: response.headers.get("link") };
}

export async function fetchReleaseHistory(fetcher: UpdateFetch, currentVersion: string, latest: UpdateRelease, signal: AbortSignal): Promise<{ entries: ReleaseHistoryEntry[]; complete: boolean }> {
  const entries = new Map<string, ReleaseHistoryEntry>([[latest.version, {
    version: latest.version, highlights: releaseHighlights(latest.notes),
    publishedAt: latest.publishedAt, releaseUrl: latest.releaseUrl,
  }]]);
  const current = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion);
  const next = /^(\d+)\.(\d+)\.(\d+)$/.exec(latest.version)!;
  // There cannot be another stable release between adjacent patch versions.
  if (current && current[1] === next[1] && current[2] === next[2] && Number(next[3]) === Number(current[3]) + 1) {
    return { entries: [...entries.values()], complete: true };
  }
  const historySignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
  let complete = false;
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { value, link } = await fetchReleaseJson(fetcher, `${RELEASES_API_URL}?per_page=${PAGE_SIZE}&page=${page}`, historySignal);
      if (!Array.isArray(value)) throw new Error("Invalid release history");
      for (const item of value) {
        if (!item || typeof item !== "object" || item.draft !== false || item.prerelease !== false
          || typeof item.tag_name !== "string" || !/^v?\d+\.\d+\.\d+$/.test(item.tag_name)) continue;
        const version = item.tag_name.replace(/^v/, "");
        if (compareSemver(version, currentVersion) <= 0 || compareSemver(version, latest.version) > 0 || entries.has(version)) continue;
        entries.set(version, {
          version, highlights: releaseHighlights(typeof item.body === "string" ? item.body : ""),
          releaseUrl: `${RELEASES_URL}/tag/${encodeURIComponent(item.tag_name)}`,
          publishedAt: typeof item.published_at === "string" && Number.isFinite(Date.parse(item.published_at)) ? item.published_at : undefined,
        });
      }
      // GitHub orders by release creation, not semantic version. Read all pages,
      // including when an old version was republished ahead of a newer one.
      const more = link !== null ? /rel="next"/.test(link) : value.length === PAGE_SIZE;
      if (!more) { complete = true; break; }
    }
  } catch { /* History is optional: keep the validated update downloadable. */ }
  return { entries: [...entries.values()].sort((a, b) => compareSemver(b.version, a.version)), complete };
}
