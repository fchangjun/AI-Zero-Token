import type { ResetCalendarNotification } from "../core/reset-calendar-types.js";

export const resetCardWidth = 400;
export const openAction = "azt-card://open";
export const dismissAction = "azt-card://dismiss";
export function resetCardHeight(event: ResetCalendarNotification): number { return 182 + (event.detail ? 26 : 0); }
export type ResetCardLabels = Record<"now" | "test" | "watch" | "scheduled" | "confirmed" | "view", string>;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** One renderer for both test and real reset events; no network or renderer scripts. */
export function renderResetNotificationCard(event: ResetCalendarNotification, labels: Partial<ResetCardLabels> = {}): string {
  const text = { now: "现在", test: "测试", watch: "重置信号", scheduled: "重置预告", confirmed: "重置确认", view: "查看日历", ...labels };
  const confirmed = event.kind === "confirmed";
  const test = event.kind === "test";
  const title = test ? event.title.replace(/ · 测试$/, "") : event.title;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="color-scheme" content="light">
<title>AI Zero Token · 桌面提醒</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; -webkit-font-smoothing: antialiased; }
.card { position: relative; height: ${resetCardHeight(event) - 32}px; border: 1px solid #e4e7f0; border-radius: 16px; background: #fff; box-shadow: 0 6px 14px #20254514, 0 1px 3px #20254508; }
.content { display: flex; align-items: flex-start; gap: 12px; height: 100%; padding: 16px; color: inherit; text-decoration: none; border-radius: inherit; outline-offset: -3px; }
.content:focus-visible, .dismiss:focus-visible { outline: 2px solid #7463ff; }
.mark { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px; color: #7662eb; border: 1px solid #e5dfff; border-radius: 11px; background: #f4f0ff; box-shadow: inset 0 1px 0 #fff; }
.copy { flex: 1; min-width: 0; }
.meta { display: flex; align-items: center; gap: 7px; padding-right: 22px; line-height: 16px; }
.brand { font-size: 11px; font-weight: 600; color: #59657b; letter-spacing: .1px; }
.test { padding: 0 4px; border: 1px solid #e9ebf2; border-radius: 4px; color: #8b94a6; font-size: 9px; line-height: 13px; }
.time { margin-left: auto; color: #9ba3b3; font-size: 10px; }
h1 { margin: 8px 0 4px; color: #20263d; font-size: 15px; font-weight: 650; line-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
p { margin: 0; color: #7b869c; font-size: 12px; line-height: 19px; height: 38px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.detail-line { margin-top: 6px; color: #8f763e; font-size: 11px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; line-height: 17px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; border-radius: 5px; color: ${confirmed ? "#248365" : "#aa782d"}; background: ${confirmed ? "#edf8f2" : "#fff7e8"}; font-size: 10px; font-weight: 500; }
.dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.detail { display: inline-flex; align-items: center; gap: 4px; color: #8b84a5; font-size: 10px; }
.content:hover .detail { color: #7463cf; }
.dismiss { position: absolute; top: 12px; right: 10px; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; color: #a3aabb; text-decoration: none; }
.dismiss:hover { background: #f1f3f8; color: #46536b; }
</style></head><body>
<article class="card" aria-label="重置日历提醒">
  <a class="content" href="${openAction}" aria-label="${escapeHtml(event.title)}。${escapeHtml(event.body)}">
    <span class="mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></span>
    <div class="copy"><div class="meta"><strong class="brand">AI Zero Token</strong>${test ? `<span class="test">${escapeHtml(text.test)}</span>` : ""}<span class="time">${escapeHtml(text.now)}</span></div>
      <h1>${escapeHtml(title)}</h1><p>${escapeHtml(event.body)}</p>${event.detail ? `<div class="detail-line">${escapeHtml(event.detail)}</div>` : ""}
      <div class="footer"><span class="badge"><span class="dot" aria-hidden="true"></span>${escapeHtml(confirmed ? text.confirmed : event.stage === "scheduled" ? text.scheduled : text.watch)}</span><span class="detail">${escapeHtml(text.view)}<svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10m-4-4 4 4-4 4"/></svg></span></div>
    </div>
  </a>
  <a class="dismiss" href="${dismissAction}" aria-label="关闭提醒"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></a>
</article></body></html>`;
}
