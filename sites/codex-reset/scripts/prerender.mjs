import { CHANNELS, convertQuote, rankedRegions } from '../public/market-utils.js';
import { renderHomeResets } from '../public/home-render.js';
import { getResetFocus, getResetHeading } from '../public/reset-focus.js';
import { getResetCopy } from '../public/reset-copy.js';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const amount = value => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const time = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未提供';
const flag = code => /^[A-Z]{2}$/.test(code) ? [...code].map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('') : '◉';
const saving = quote => quote.savings === null ? '暂无汇率' : `${quote.savings >= 0 ? '低' : '高'} ${(Math.abs(quote.savings) * 100).toFixed(1)}%`;
const safeSource = source => { try { const u = new URL(source); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

// Only replace the contents of a known template element; preserve its attributes and all siblings.
export function replaceElement(html, id, content) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bid=["']${escapedId}["'][^>]*>`, 'i').exec(html);
  if (!match) throw new Error(`预渲染模板缺少 #${id}`);
  const start = match.index + match[0].length;
  const tags = new RegExp(`<(/?)${match[1]}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 1, token;
  while ((token = tags.exec(html))) {
    depth += token[1] ? -1 : /\/>$/.test(token[0]) ? 0 : 1;
    if (!depth) return html.slice(0, start) + content + html.slice(token.index);
  }
  throw new Error(`预渲染模板 #${id} 缺少闭合标签`);
}

function setTexts(html, values) {
  for (const [id, value] of Object.entries(values)) html = replaceElement(html, id, escapeHTML(value));
  return html;
}

export function renderMarket(html, data) {
  const { plans } = data;
  const fx = { ...data.fx, mode: 'snapshot' };
  const regions = new Set(plans.flatMap(p => p.quotes.map(q => q.country))).size;
  const dates = plans.map(p => p.updatedAt).sort((a, b) => Date.parse(a) - Date.parse(b));
  html = setTexts(html, {
    'region-count': `${regions} 个已收录地区`,
    'fx-rate': `¥${Number(fx.rates.CNY).toFixed(4)}`,
    'fx-state': '参考汇率',
    'fx-time': `行情时间 ${time(fx.updatedAt)} · 北京时间 · CNY / USD`,
    'price-status': `本地报价 · ${time(dates[0])}${dates[0] !== dates.at(-1) ? ` — ${time(dates.at(-1))}` : ''} · 北京时间`,
    'report-date': '01 / PRICE REPORT · 本地报价快照',
    'usd-verified': data.usdVerifiedAt,
  });
  html = replaceElement(html, 'rankings', plans.map(plan => {
    const top = rankedRegions(plan, fx).slice(0, 3);
    return `<article class="ranking-row" aria-label="${escapeHTML(plan.name)} 最低价地区"><div class="plan-cell"><div class="plan-name"><h3>${escapeHTML(plan.name)}</h3><span>${escapeHTML(plan.note)}</span></div><div class="baseline"><strong>$${plan.usd}</strong> USD <small>/ 月</small></div><div class="baseline-rmb">标准价 ≈ ¥${amount(plan.usd * fx.rates.CNY)}</div><button class="text-button" data-explore="${escapeHTML(plan.id)}">查看全部地区 ↗</button></div>${top.length ? top.map((q, i) => `<button class="rank-cell ${i === 0 ? 'winner' : ''}" data-explore="${escapeHTML(plan.id)}" data-country="${escapeHTML(q.country)}" aria-label="查看 ${escapeHTML(plan.name)} ${escapeHTML(q.region)} ${CHANNELS[q.channel]}，约 ${amount(q.rmb)} 元每月"><span class="rank-region" data-rank="0${i + 1}"><span class="flag" aria-hidden="true">${flag(q.country)}</span>${escapeHTML(q.region)}<small class="rank-channel">${CHANNELS[q.channel]}</small></span><div class="rank-money"><span class="yen">¥</span>${amount(q.rmb)}<small>/ 月</small></div><div class="rank-local">${escapeHTML(q.label)} ${escapeHTML(q.currency)}</div><div class="rank-bottom"><span class="saving ${q.savings < 0 ? 'expensive' : ''}">较标准价${saving(q)}</span></div></button>`).join('') : '<div class="rank-empty">暂无可比较的地区报价。</div>'}</article>`;
  }).join(''));
  const plan = plans.find(p => p.id === 'plus') || plans[0];
  const quotes = plan.quotes.map(q => convertQuote(q, fx, plan.usd)).sort((a, b) => a.rmb === null ? 1 : b.rmb === null ? -1 : a.rmb - b.rmb || a.country.localeCompare(b.country));
  html = setTexts(html, {
    'detail-summary': `${plan.name} · ${new Set(quotes.map(q => q.country)).size} 个地区 / ${quotes.length} 条报价`,
    'detail-baseline': `标准美元价 $${plan.usd} / 月 ≈ ¥${amount(plan.usd * fx.rates.CNY)} / 月`,
    'table-count': `已显示 ${Math.min(15, quotes.length)} / ${quotes.length} 条报价`,
  });
  html = replaceElement(html, 'price-rows', quotes.slice(0, 15).map(q => `<tr><td><div class="table-region"><span class="flag" aria-hidden="true">${flag(q.country)}</span><div><strong>${escapeHTML(q.region)}</strong><small>${escapeHTML(q.country)} · ${CHANNELS[q.channel]}</small></div></div></td><td><div class="table-local">${escapeHTML(q.label)}<small>${escapeHTML(q.currency)} / 月</small></div></td><td><div class="table-rmb" title="汇率 ${time(q.fxUpdatedAt)} · 北京时间">${q.rmb === null ? '暂无汇率' : `¥${amount(q.rmb)}`}</div></td><td><span class="saving ${q.savings < 0 ? 'expensive' : ''}">${saving(q)}</span></td><td><a class="table-source" href="${escapeHTML(safeSource(q.source))}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a></td></tr>`).join(''));
  return html;
}

export function renderResets(html, data, now = Date.now()) {
  const { status, records } = data;
  const focus = getResetFocus(data, now);
  html = html.replace('<body class="reset-page">', `<body class="reset-page${['forecast', 'watch'].includes(focus.mode) ? ' reset-forecast' : ''}">`);
  const heading = getResetHeading(focus);
  html = replaceElement(html, 'reset-detail-title', `${escapeHTML(heading.title)}<span>${escapeHTML(heading.emphasis)}</span>`);
  const values = {
    'today-label': '公开通告记录',
    'sync-state': `本地快照 · ${time(data.generatedAt || data.capturedAt)}`,
    'reset-time-note': focus.note,
    'reset-detail-description': heading.description,
    'stat-total': Number.isFinite(status.stats?.total) ? status.stats.total : records.length,
    'stat-average': Number.isFinite(status.stats?.avg_interval_days) ? status.stats.avg_interval_days.toFixed(1) : '—',
  };
  const intervals = records.slice(1).map((r, i) => (Date.parse(records[i].announced_at) - Date.parse(r.announced_at)) / 86400000);
  values['stat-longest'] = data.historyComplete && intervals.length ? Math.max(...intervals).toFixed(1) : '—';
  html = setTexts(html, values);
  html = replaceElement(html, 'reset-detail-grid', renderHomeResets(data, now).replaceAll('href="./resets/index.html"', 'href="#history"').replaceAll('src="./tibo-avatar.jpg"', 'src="../tibo-avatar.jpg"'));
  html = replaceElement(html, 'announcement-list', records.slice(0, 6).map(record => {
    const copy = getResetCopy(record);
    const text = copy.english;
    const source = safeSource(record.source?.url);
    const title = record.summaryZh || copy.chinese;
    return `<article class="announcement"><div class="announcement-meta"><span class="type-label ${record.reset_type === 'banked' ? 'banked-label' : ''}">${record.reset_type === 'banked' ? '储备重置' : '常规重置'}</span><time datetime="${escapeHTML(record.announced_at)}">${time(record.announced_at)}</time><span>UTC+8</span></div><h3>${escapeHTML(title)}</h3>${text ? `<details><summary>阅读英文原文</summary><p>${escapeHTML(text)}</p></details>` : '<p>本地快照仅保留此条日期与来源，可前往原帖阅读。</p>'}<div class="announcement-actions"><span>${record.source?.type === 'x_post' ? 'Tibo · @thsottiaux' : '数据源观测记录'}</span><div>${source ? `<a href="${escapeHTML(source)}" target="_blank" rel="noopener noreferrer">来源原文 ↗</a>` : ''}</div></div></article>`;
  }).join('') || '<p>暂未收录公开通告。</p>');
  return html;
}
