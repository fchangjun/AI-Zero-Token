import { getFeaturedDeals, PRO_PLANS } from './deals.js';
import { CHANNELS } from './market-utils.js';
import { getResetState } from './reset-focus.js';

export const escapeHome = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export const homeAmount = value => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
export const homeTime = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未提供时间';
const e = escapeHome;
const flag = code => /^[A-Z]{2}$/.test(code) ? [...code].map(character => String.fromCodePoint(character.charCodeAt(0) + 127397)).join('') : '◉';
const safeSource = value => { try { const url = new URL(value); return url.protocol === 'https:' && ['x.com', 'twitter.com', 'codex-resets.com'].includes(url.hostname) ? url.href : ''; } catch { return ''; } };

function renderDeal(deal) {
  const pro = deal.planId !== 'plus';
  const quote = deal.quote;
  const parts = homeAmount(quote?.rmb).split('.');
  const favorable = deal.savingRmb > 0;
  const link = `./prices/index.html?plan=${encodeURIComponent(deal.planId)}${quote ? `&country=${encodeURIComponent(quote.country)}&channel=${encodeURIComponent(quote.channel)}` : ''}#regional-prices`;
  return `<article class="deal-card ${pro ? 'deal-pro' : 'deal-plus'} ${parts[0].length > 3 ? 'deal-wide-price' : ''}" aria-label="${e(deal.name)} 已收录地区最低价比较">
    <div class="deal-head"><div class="deal-product"><span class="deal-product-icon" aria-hidden="true">${pro ? '✳' : '✦'}</span><div><span class="deal-product-label">CHATGPT</span><h3>${pro ? 'Pro' : 'Plus'}</h3></div></div>${pro ? `<div class="home-pro-switch" role="group" aria-label="首页 Pro 订阅档位">${PRO_PLANS.map(id => `<button data-home-pro="${id}" aria-pressed="${id === deal.planId}" class="${id === deal.planId ? 'selected' : ''}">$${id.replace('pro', '')}</button>`).join('')}</div>` : '<span class="deal-pick">月度订阅</span>'}</div>
    <div class="deal-price-line"><div><span class="deal-best-label">已收录地区最低价</span><div class="deal-price" aria-label="约 ${homeAmount(quote?.rmb)} 元每月"><span>≈ ¥</span>${parts[0]}${parts[1] ? `<small>.${parts[1]}</small>` : ''}<em>/ 月</em></div></div>${quote ? `<div class="deal-discount"><strong>${favorable ? `省 ${deal.savingsPct.toFixed(1)}<small>%</small>` : '同档比价'}</strong><span>${favorable ? `少花 ¥${homeAmount(deal.savingRmb)}` : '暂无价格优势'}</span></div>` : ''}</div>
    <div class="deal-baseline">美区标准价 <strong>$${e(deal.usd)} USD</strong><span>≈ ¥${homeAmount(deal.baselineRmb)} / 月</span></div>
    ${quote ? `<div class="deal-destination"><span class="deal-flag" aria-hidden="true">${flag(quote.country)}</span><div><strong>${e(quote.region)} <span>${e(CHANNELS[quote.channel] || quote.channel)}</span></strong><small>${e(quote.label)} ${e(quote.currency)} / 月</small></div><a href="${e(link)}" aria-label="查看 ${e(deal.name)} ${e(quote.region)} 价格依据">查看渠道 <span aria-hidden="true">↗</span></a></div>` : '<div class="deal-destination deal-empty">暂缺地区报价，请检查更新</div>'}
  </article>`;
}

export function renderHomeDeals(data, proPlanId = 'pro200') {
  const deals = getFeaturedDeals(data, proPlanId);
  return deals.length ? deals.map(renderDeal).join('') : '<p class="home-empty">暂时无法读取订阅报价，请检查更新。</p>';
}

function renderResetSource(record) {
  if (!record) return '';
  const isPublic = record.source?.type === 'x_post';
  const english = String(record.text || '').replace(/https:\/\/t\.co\/\S+/g, '').trim();
  const chinese = record.translationZh || record.summaryZh || '';
  const source = safeSource(record.source?.url);
  return `<div class="home-tibo-card"><div class="home-tibo-header">${isPublic ? '<img src="./tibo-avatar.jpg" width="46" height="46" alt="Tibo 的头像">' : ''}<div><strong>${isPublic ? 'Tibo' : '重置观测'}</strong><span>${isPublic ? '@thsottiaux' : '数据源观测记录'}</span></div>${isPublic ? '<span class="x-mark" aria-label="X">𝕏</span>' : ''}</div><div class="home-tibo-message">${chinese ? `<span class="home-message-label">${record.translationZh ? '中文译文' : '中文速读'}</span><p>${e(chinese)}</p>` : ''}${english ? `<blockquote lang="en">${e(english)}</blockquote>` : ''}</div><div class="home-tibo-bottom"><time datetime="${e(record.announced_at)}">${e(homeTime(record.announced_at))} · 北京时间</time>${source ? `<a href="${e(source)}" target="_blank" rel="noopener noreferrer">${isPublic ? 'X 原帖' : '查看来源'} <span aria-hidden="true">↗</span></a>` : ''}</div></div>`;
}

function renderPrimaryReset(state, panel) {
  const forecast = panel === 'next';
  const clock = /^\d{1,2}:\d{2}$/.test(state.timeLabel || '');
  const confirmed = state.mode === 'confirmed';
  const heading = forecast ? '下一次重置预告' : confirmed ? '最近一次已确认' : state.mode === 'observed' ? '最近一次观测' : '最近一次重置';
  const caption = forecast && state.targetAt ? '预计重置时间' : confirmed ? '公开确认时间' : state.timeCaption;
  return `<article class="home-reset-focus ${state.mode === 'empty' ? 'is-quiet' : ''} ${state.priority ? 'is-priority' : ''}" data-reset-panel="${panel}" data-reset-focus="${e(state.kind)}" data-reset-mode="${e(state.mode)}" aria-label="${e(heading)}">
    <div class="reset-focus-top"><span class="reset-focus-eyebrow"><span class="reset-focus-dot" aria-hidden="true"></span>${e(heading)}<small>${forecast ? 'NEXT RESET' : 'LATEST RESET'}</small></span><span class="reset-focus-badge">${e(state.badge)}</span></div>
    <div class="reset-signal-body ${state.record ? '' : 'reset-signal-empty'}">
      <div class="reset-signal-timing"><div class="reset-focus-main"><h3>${e(caption)}${forecast && state.targetAt ? '<span>仅供参考</span>' : ''}</h3><div class="reset-focus-clock ${clock ? '' : 'is-text'}"><strong id="home-reset-target">${e(state.timeLabel)}</strong>${clock ? '<span class="reset-focus-zone">北京时间</span>' : ''}</div><p class="reset-focus-date">${e((state.dateLabel || state.title).replace(' · 北京时间', ''))}</p></div>
      ${forecast && state.targetAt ? `<div class="reset-focus-countdown"><span>${e(state.countdownLabel)}</span><strong id="home-reset-countdown">${e(state.countdownValue)}</strong><span class="reset-countdown-arrow" aria-hidden="true">↗</span></div>` : ''}
      </div>
      ${renderResetSource(state.record)}
    </div>
  </article>`;
}

function renderLatestCompact(latest) {
  const confirmed = latest.mode === 'confirmed';
  const heading = confirmed ? '最近一次已确认' : latest.mode === 'observed' ? '最近一次观测' : '最近一次重置';
  const summary = latest.record?.summaryZh || latest.record?.translationZh || latest.dateLabel || '暂无公开记录';
  return `<article class="reset-secondary reset-latest-compact" data-reset-panel="latest" data-reset-mode="${e(latest.mode)}" aria-label="${e(heading)}"><div class="reset-secondary-header"><h3><span class="reset-secondary-icon" aria-hidden="true">${confirmed ? '✓' : '◷'}</span>${e(heading)}</h3><span class="reset-secondary-badge">${e(latest.badge)}</span></div><div class="reset-compact-summary"><div class="reset-compact-when"><strong>${e(latest.timeLabel)}</strong><span>${e(latest.dateLabel)}</span></div><p>${e(summary)}</p></div>${latest.record ? `<details class="reset-compact-source"><summary>查看这次${confirmed ? '确认' : '观测'}的原文与来源 <span aria-hidden="true">＋</span></summary>${renderResetSource(latest.record)}</details>` : ''}</article>`;
}

function renderNextQuiet(next) {
  const unannounced = next.kind === 'unannounced';
  const title = unannounced ? '暂无新预告' : '预告状态待同步';
  return `<article class="reset-secondary reset-next-quiet" data-reset-panel="next" data-reset-mode="${e(next.mode)}" data-next-state="${e(next.kind)}" aria-label="下一次重置：${title}"><div class="reset-next-top"><div class="reset-next-label"><span>下一次重置</span><small>NEXT RESET</small></div><span class="reset-next-state-tag">${unannounced ? '等待新消息' : '等待同步'}</span></div><div class="reset-next-body"><span class="reset-next-symbol" aria-hidden="true"><i></i></span><div class="reset-next-status"><h3>${title}</h3><p>${unannounced ? '还没有下一次重置的公开消息。' : '暂时无法确认下一次预告的状态。'}</p></div></div><div class="reset-next-update"><span aria-hidden="true"></span>${unannounced ? '有新消息后更新' : '获得有效数据后更新'}</div></article>`;
}

export function renderHomeResets(data, now = Date.now()) {
  const { latest, next } = getResetState(data, now);
  const forecast = next.mode === 'forecast';
  return `<div class="reset-panels ${forecast ? 'has-forecast' : 'has-latest'}">${forecast ? `${renderPrimaryReset(next, 'next')}${renderLatestCompact(latest)}` : `${renderPrimaryReset(latest, 'latest')}${renderNextQuiet(next)}`}<div class="reset-panels-footer"><a href="./resets/index.html">查看重置历史 <span aria-hidden="true">↗</span></a></div></div>`;
}

export function homeMarketMeta(data) {
  const plans = data?.plans || [];
  const dates = plans.map(plan => plan.updatedAt).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b));
  return `报价 ${homeTime(dates[0])}${dates[0] !== dates.at(-1) ? ` — ${homeTime(dates.at(-1))}` : ''} · 汇率 ${homeTime(data?.fx?.updatedAt)} · 北京时间`;
}
