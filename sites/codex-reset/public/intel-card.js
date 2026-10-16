import { getResetFocus } from './reset-focus.js';
import { getResetCopy } from './reset-copy.js';
import { getFeaturedDeals, PRO_PLANS } from './deals.js';
import { CHANNELS } from './market-utils.js';

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
const INK = '#183E30', MUTED = '#667165', CREAM = '#F8F6EB', LIME = '#D8F59E', LINE = '#D5DBCA';
const clean = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
const positive = value => Number.isFinite(value) && value > 0 ? value : null;
const amount = value => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '待更新';
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const safeX = value => { const url = safeUrl(value); return /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(url) ? url : ''; };
function date(value, compact = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return compact ? value.slice(5).replaceAll('-', '/') : value.replaceAll('-', '/');
  if (!Number.isFinite(Date.parse(value))) return '时间未提供';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...(compact ? {} : { year: 'numeric' }), month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function excerpt(value, length) {
  const chars = Array.from(clean(value));
  return { text: chars.length > length ? `${chars.slice(0, length).join('').trimEnd()}…` : chars.join(''), shortened: chars.length > length };
}
function saving(deal) {
  if (!deal?.quote || !Number.isFinite(deal.baselineRmb)) return '人民币价格待更新';
  if (deal.savingRmb > 0) return `省 ${deal.savingsPct.toFixed(1)}% · ${deal.discountLabel}`;
  return deal.savingRmb < 0 ? '当前无美区价差优势' : '与美区基准同价';
}
function timeNote(focus) {
  if (!focus.targetAt) return focus.note;
  return /\bEOD\b/i.test(focus.record?.text || '')
    ? '原帖仅给出 EOD（日终）窗口。此时刻由数据源换算，仅供参考，仍待完成确认。'
    : '预告时间仅供参考；到点不代表已完成，以后续通告为准。';
}

/** A share captures one immutable snapshot; drawing and captions never query the clock or live data. */
export function getIntelCardData(resetData, marketData, { proPlanId = 'pro200', now = Date.now() } = {}) {
  if (!resetData && !marketData) return null;
  const current = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(current)) throw new Error('无法确定分享时间，请检查设备时间。');
  const focus = getResetFocus(resetData, current);
  const record = focus.record;
  const copy = getResetCopy(record, { mode: focus.mode });
  const english = excerpt(copy.english, 240);
  const chinese = excerpt(copy.chinese, 100);
  const proId = PRO_PLANS.includes(proPlanId) ? proPlanId : 'pro200';
  // Filter malformed entries defensively without changing full-precision ranking for valid data.
  const validMarket = marketData && { ...marketData, plans: (marketData.plans || []).filter(plan => plan && typeof plan.id === 'string').map(plan => ({ ...plan, quotes: (Array.isArray(plan.quotes) ? plan.quotes : []).filter(quote => quote && positive(quote.amount) && typeof quote.country === 'string') })) };
  const featured = getFeaturedDeals(validMarket, proId);
  const deals = ['plus', proId].map(planId => {
    const deal = featured.find(item => item.planId === planId);
    const plan = validMarket?.plans.find(item => item.id === planId);
    const quote = deal?.quote;
    const fxUpdatedAt = quote?.fxUpdatedAt || marketData?.fx?.updatedAt || null;
    const stale = Boolean(quote && (marketData?.fx?.mode === 'snapshot' || marketData?.fx?.mode === 'stale' || !Number.isFinite(Date.parse(fxUpdatedAt)) || current - Date.parse(fxUpdatedAt) > 36 * 3600000 || marketData?.fx?.stale?.CNY || marketData?.fx?.stale?.[quote.currency]));
    return {
      planId, name: clean(plan?.name) || (planId === 'plus' ? 'Plus' : `Pro $${planId.slice(3)}`),
      usd: positive(deal?.usd), baselineRmb: positive(deal?.baselineRmb),
      updatedAt: plan?.updatedAt || null, sourceUrl: safeUrl(plan?.url),
      quote: quote ? { country: clean(quote.country), region: clean(quote.region), channel: clean(quote.channel), channelLabel: CHANNELS[quote.channel] || clean(quote.channel), currency: clean(quote.currency), amount: quote.amount, rmb: positive(quote.rmb), label: clean(quote.label), source: safeUrl(quote.source), fxUpdatedAt, fxStale: stale } : null,
      savingRmb: Number.isFinite(deal?.savingRmb) ? deal.savingRmb : null,
      savingsPct: Number.isFinite(deal?.savingsPct) ? deal.savingsPct : null,
      discountLabel: clean(deal?.discountLabel),
    };
  });
  const snapshot = {
    capturedAt: new Date(current).toISOString(),
    focus: { kind: focus.kind, mode: focus.mode, priority: focus.priority, badge: focus.badge, title: focus.title,
      targetAt: focus.targetAt, confirmedAt: focus.confirmedAt,
      observedAt: focus.observedAt || null, expiresAt: focus.expiresAt || null,
      watchChance: Number.isFinite(focus.watchChance) ? focus.watchChance : null,
      timeLabel: focus.timeLabel, dateLabel: focus.dateLabel,
      timeCaption: focus.mode === 'watch' ? '观察信号 · 尚无正式预告' : `${focus.targetAt ? '预计重置' : focus.timeCaption} · 北京时间`,
      countdownLabel: focus.countdownLabel, countdownValue: focus.countdownValue, note: timeNote(focus) },
    reset: { id: clean(record?.id), isTibo: /^(?:@)?thsottiaux$/i.test(clean(record?.source?.author)), authorName: /^(?:@)?thsottiaux$/i.test(clean(record?.source?.author)) ? 'Tibo' : clean(record?.source?.author) || '公开重置信息', authorHandle: clean(record?.source?.author).replace(/^@/, ''), sourceUrl: safeX(record?.source?.url), announcedAt: record?.announced_at || null, datasetAt: resetData?.generatedAt || null, chinese: chinese.text, chineseLabel: copy.label, chineseType: copy.type, chineseExcerpt: chinese.shortened, english: english.text, englishExcerpt: english.shortened },
    deals, usdSource: safeUrl(marketData?.usdSource), usdVerifiedAt: marketData?.usdVerifiedAt || null,
    fxSource: safeUrl(marketData?.fx?.sourceUrl), fxUpdatedAt: marketData?.fx?.updatedAt || null,
  };
  return freeze(snapshot);
}

export function intelCardCaption(info, { pageUrl = '', aztUrl = '' } = {}) {
  if (!info) return '';
  const f = info.focus, r = info.reset;
  const timing = f.mode === 'watch' ? `观察信号 · 尚无正式预告\n发现时间：${date(f.observedAt || r.announcedAt)}（北京时间）` : f.targetAt ? `预计重置：${date(f.targetAt)}（北京时间）` : f.confirmedAt ? `最近重置确认：${date(f.confirmedAt)}（北京时间）` : f.kind === 'scheduled' ? '已有新预告 · 时间待定' : f.mode === 'observed' ? `最近观测：${date(r.announcedAt)}（北京时间）` : '暂无公开重置记录';
  const reset = `重置信号：${f.badge}\n${timing}\n${r.authorName} · ${r.chineseLabel || '中文速读'}${r.chineseExcerpt ? '（摘录）' : ''}：${r.chinese}${r.english ? `\n${r.englishExcerpt ? 'English excerpt' : 'Original'}: ${r.english}` : ''}${r.sourceUrl ? `\n原帖：${r.sourceUrl}` : ''}`;
  const rows = info.deals.map(deal => `${deal.name}：${deal.quote ? `约 ¥${amount(deal.quote.rmb)}/月 · ${deal.quote.region} · ${deal.quote.channelLabel}\n美区 $${deal.usd ?? '—'}/月 · ${saving(deal)}` : '人民币价格待更新'}`).join('\n\n');
  return `Codex 情报站 · ${date(info.capturedAt, true)}\n\n${reset}\n\n订阅好价\n${rows}${safeUrl(pageUrl) ? `\n\n最新情报：${safeUrl(pageUrl)}` : ''}${safeUrl(aztUrl) ? `\nAI Zero Token：${safeUrl(aztUrl)}` : ''}`;
}

function font(ctx, size, weight = 400) { ctx.font = `${weight} ${size}px ${FONT}`; }
function lines(ctx, value, width) {
  const out = []; let line = '';
  for (const token of clean(value).match(/\S+|\s+/gu) || []) {
    for (const part of ctx.measureText(token).width > width ? Array.from(token) : [token]) {
      if (line && ctx.measureText(line + part).width > width) { out.push(line.trimEnd()); line = part.trimStart(); }
      else line += line ? part : part.trimStart();
    }
  }
  if (line) out.push(line.trimEnd());
  return out;
}
function bounded(ctx, value, x, y, width, size, { color = INK, weight = 400, maxLines = 1, leading = 1.3, minSize = size, ellipsis = true } = {}) {
  let all;
  do { font(ctx, size, weight); all = lines(ctx, value, width); if (all.length <= maxLines || size <= minSize) break; size--; } while (true);
  const shortened = all.length > maxLines;
  const visible = all.slice(0, maxLines);
  if (shortened && ellipsis) {
    let last = visible[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = Array.from(last).slice(0, -1).join('');
    visible[maxLines - 1] = `${last.trimEnd()}…`;
  }
  ctx.fillStyle = color; visible.forEach((line, i) => ctx.fillText(line, x, y + i * size * leading));
  return shortened;
}
function panel(ctx, x, y, width, height, color, radius = 28, stroke = null) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.arcTo(x, y, x + width, y, radius); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
const avatarCache = new Map();
async function localAvatar(value) {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return null;
  let url; try { url = new URL(value, location.href); if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null; } catch { return null; }
  if (!avatarCache.has(url.href)) avatarCache.set(url.href, new Promise(resolve => {
    const img = new Image(); let timer;
    const done = value => { clearTimeout(timer); img.onload = null; img.onerror = null; resolve(value); };
    img.onload = () => done(img.naturalWidth ? img : null); img.onerror = () => done(null); timer = setTimeout(() => done(null), 3000); img.src = url.href;
  }));
  const result = await avatarCache.get(url.href); if (!result) avatarCache.delete(url.href); return result;
}
function avatar(ctx, image, x, y) {
  ctx.save(); ctx.beginPath(); ctx.arc(x + 23, y + 23, 23, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = INK; ctx.fillRect(x, y, 46, 46);
  if (image) { const side = Math.min(image.naturalWidth, image.naturalHeight); ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, x, y, 46, 46); }
  else bounded(ctx, 'T', x + 15, y + 7, 25, 27, { color: CREAM, weight: 700 });
  ctx.restore();
}

/** A compact, fixed-size digest: original reset signal above independently sourced prices. */
export async function renderIntelCard(canvas, info, { avatarUrl = './tibo-avatar.jpg' } = {}) {
  if (!info) throw new Error('暂时没有可分享的情报，请稍后重试。');
  const ctx = canvas?.getContext?.('2d'); if (!ctx) throw new Error('当前浏览器无法绘制图片，可以复制情报文案。');
  const image = info.reset.isTibo ? await localAvatar(avatarUrl) : null;
  canvas.width = 1080; canvas.height = 1160; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 1080, 1160);
  bounded(ctx, '✳  CODEX 情报站', 56, 43, 620, 28, { weight: 700 });
  bounded(ctx, date(info.capturedAt, true), 840, 49, 184, 18, { color: MUTED });
  bounded(ctx, '重置信号，订阅好价。', 56, 108, 968, 62, { weight: 750 });

  const f = info.focus, r = info.reset;
  panel(ctx, 56, 202, 968, 520, LIME, 32);
  bounded(ctx, '重置信号', 84, 232, 400, 22, { weight: 650 });
  const status = f.badge;
  panel(ctx, 712, 222, 284, 42, '#EDFCD6', 21);
  bounded(ctx, status, 737, 234, 235, 18, { weight: 600, minSize: 16 });
  bounded(ctx, f.timeCaption, 84, 284, 620, 25, { weight: 600 });
  bounded(ctx, f.timeLabel, 78, 322, 598, 96, { weight: 750, minSize: 70 });
  if (f.targetAt) {
    panel(ctx, 722, 326, 274, 98, INK, 18);
    bounded(ctx, f.countdownLabel, 742, 342, 234, 18, { color: '#C5D7C0' });
    bounded(ctx, f.countdownValue, 742, 373, 234, 30, { weight: 650, color: '#E1F9BA', minSize: 23 });
  } else if (f.mode === 'confirmed') {
    panel(ctx, 868, 316, 108, 108, INK, 54);
    bounded(ctx, '✓', 890, 337, 72, 64, { color: LIME, weight: 700 });
  }
  bounded(ctx, f.mode === 'watch' ? `发现于 ${date(f.observedAt || r.announcedAt)} · 北京时间` : f.targetAt || f.confirmedAt ? date(f.targetAt || f.confirmedAt).slice(0, 10) : f.dateLabel, 84, 432, 886, 21, { color: '#416438' });
  panel(ctx, 80, 476, 920, 222, '#FCFFF7', 20);
  if (r.isTibo) avatar(ctx, image, 102, 493);
  bounded(ctx, r.authorName, r.isTibo ? 162 : 104, 493, 380, 22, { weight: 650 });
  bounded(ctx, r.authorHandle ? `@${r.authorHandle}` : '公开消息', r.isTibo ? 162 : 104, 523, 500, 17, { color: MUTED });
  bounded(ctx, r.announcedAt ? `${f.mode === 'watch' ? '发现 ' : ''}${date(r.announcedAt, true)}${f.mode === 'watch' ? '' : ' · X'}` : '', 756, 499, 220, 17, { color: MUTED });
  const chineseLabel = r.chineseLabel || '中文速读';
  font(ctx, 25, 550); const zhTruncated = lines(ctx, `${chineseLabel}：${r.chinese}`, 870).length > 2;
  bounded(ctx, `${chineseLabel}${r.chineseExcerpt || zhTruncated ? '（摘录）' : ''}：${r.chinese}`, 104, 556, 870, 25, { weight: 550, maxLines: 2, leading: 1.3 });
  font(ctx, 20); const enTruncated = lines(ctx, r.english, 870).length > 2;
  const englishLabel = r.englishExcerpt || enTruncated ? 'EN EXCERPT · ' : '';
  bounded(ctx, r.english ? englishLabel + r.english : '英文原文暂未提供', 104, 632, 870, 20, { color: MUTED, maxLines: 2, leading: 1.3 });

  bounded(ctx, '订阅好价', 58, 754, 600, 24, { weight: 650 });
  info.deals.forEach((deal, index) => {
    const x = 56 + index * 496, width = 472, q = deal.quote;
    panel(ctx, x, 800, width, 255, '#FFFFFF', 24, LINE);
    bounded(ctx, deal.name, x + 25, 822, 420, 28, { weight: 700, minSize: 22 });
    bounded(ctx, `美区常规 ${deal.usd ? `$${deal.usd}` : '价格待更新'} / 月`, x + 25, 865, 420, 20, { color: MUTED });
    bounded(ctx, q?.rmb ? `≈ ¥${amount(q.rmb)}` : '价格待更新', x + 23, 902, 418, q?.rmb ? 53 : 42, { weight: 750, minSize: 34 });
    bounded(ctx, q ? `${q.region} · ${q.channelLabel} / 月` : '等待报价更新', x + 25, 968, 420, 21, { color: MUTED });
    bounded(ctx, saving(deal), x + 25, 1009, 420, 25, { weight: 650, color: '#5D45A0', minSize: 21 });
  });
  ctx.fillStyle = LINE; ctx.fillRect(56, 1090, 968, 1);
  bounded(ctx, 'AI ZERO TOKEN', 58, 1114, 350, 22, { weight: 750 });
  bounded(ctx, 'github.com/fchangjun/AI-Zero-Token  ↗', 596, 1119, 428, 17, { color: MUTED });
  return canvas;
}
