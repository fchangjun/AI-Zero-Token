import { getFeaturedDeals, PRO_PLANS } from './deals.js';
import { CHANNELS } from './market-utils.js';
import { getResetFocus } from './reset-focus.js';

export const escapeHome = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export const homeAmount = value => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
export const homeTime = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未提供时间';
const e = escapeHome;
const flag = code => /^[A-Z]{2}$/.test(code) ? [...code].map(character => String.fromCodePoint(character.charCodeAt(0) + 127397)).join('') : '◉';
const safeSource = value => { try { const url = new URL(value); return url.protocol === 'https:' && ['x.com', 'twitter.com', 'codex-resets.com', 'ai-resets.com'].includes(url.hostname) ? url.href : ''; } catch { return ''; } };

function renderDeal(deal) {
  const pro = deal.planId !== 'plus';
  const quote = deal.quote;
  const parts = homeAmount(quote?.rmb).split('.');
  const favorable = deal.savingRmb > 0;
  const link = `./prices/?plan=${encodeURIComponent(deal.planId)}${quote ? `&country=${encodeURIComponent(quote.country)}&channel=${encodeURIComponent(quote.channel)}` : ''}#regional-prices`;
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

export function renderHomeResets(data, now = Date.now()) {
  const focus = getResetFocus(data, now);
  const announced = focus.record;
  const isPublic = announced?.source?.type === 'x_post';
  const english = String(announced?.text || '').replace(/https:\/\/t\.co\/\S+/g, '').trim();
  const chinese = announced?.translationZh || announced?.summaryZh || '';
  const source = safeSource(announced?.source?.url);
  const timed = focus.mode === 'forecast';
  const timeIsClock = /^\d{1,2}:\d{2}$/.test(focus.timeLabel || '');
  const previous = timed ? getResetFocus({ ...data, status: { ...data?.status, scheduled_reset: null } }, now).record : null;
  const label = focus.mode === 'confirmed' ? 'LATEST CONFIRMED RESET' : timed ? 'NEXT RESET SIGNAL' : 'RESET WATCH';
  return `<article class="home-reset-focus ${focus.mode === 'empty' ? 'is-quiet' : ''} ${focus.priority ? 'is-priority' : ''}" data-reset-focus="${e(focus.kind)}" data-reset-mode="${e(focus.mode)}" aria-label="${e(focus.title)}">
    <div class="reset-focus-top"><span class="reset-focus-eyebrow"><span class="reset-focus-dot" aria-hidden="true"></span>${label}</span><span class="reset-focus-badge">${e(focus.badge)}</span></div>
    <div class="reset-signal-body">
      <div class="reset-signal-timing">
        <div class="reset-focus-main"><h3>${e(timed && focus.targetAt ? '预计重置时间' : focus.timeCaption)}${timed && focus.targetAt ? '<span>仅供参考</span>' : ''}</h3><div class="reset-focus-clock ${timeIsClock ? '' : 'is-text'}"><strong id="home-reset-target">${e(focus.timeLabel)}</strong>${timeIsClock ? '<span class="reset-focus-zone">北京时间</span>' : ''}</div><p class="reset-focus-date">${e((focus.dateLabel || focus.title).replace(' · 北京时间', ''))}</p></div>
        ${focus.targetAt ? `<div class="reset-focus-countdown"><span>${e(focus.countdownLabel)}</span><strong id="home-reset-countdown">${e(focus.countdownValue)}</strong><span class="reset-countdown-arrow" aria-hidden="true">↗</span></div>` : ''}
      </div>
      ${announced ? `<div class="home-tibo-card"><div class="home-tibo-header">${isPublic ? '<img src="./tibo-avatar.jpg" width="46" height="46" alt="Tibo 的头像">' : ''}<div><strong>${isPublic ? 'Tibo' : '重置观测'}</strong><span>${isPublic ? '@thsottiaux' : '数据源观测记录'}</span></div>${isPublic ? '<span class="x-mark" aria-label="X">𝕏</span>' : ''}</div><div class="home-tibo-message">${chinese ? `<span class="home-message-label">${announced.translationZh ? '中文译文' : '中文速读'}</span><p>${e(chinese)}</p>` : ''}${english ? `<blockquote lang="en">${e(english)}</blockquote>` : ''}</div><div class="home-tibo-bottom"><time datetime="${e(announced.announced_at)}">${e(homeTime(announced.announced_at))} · 北京时间</time>${source ? `<a href="${e(source)}" target="_blank" rel="noopener noreferrer">${isPublic ? 'X 原帖' : '查看来源'} <span aria-hidden="true">↗</span></a>` : ''}</div></div>` : ''}
    </div>
    <div class="reset-focus-last">${previous ? `<span>${previous.source?.type === 'observed' ? '最近观测' : '上次重置'} <strong>${e(homeTime(previous.announced_at))}</strong></span>` : ''}<a href="./resets/">查看重置历史 <span aria-hidden="true">↗</span></a></div>
  </article>`;
}

export function homeMarketMeta(data) {
  const plans = data?.plans || [];
  const dates = plans.map(plan => plan.updatedAt).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b));
  return `报价 ${homeTime(dates[0])}${dates[0] !== dates.at(-1) ? ` — ${homeTime(dates.at(-1))}` : ''} · 汇率 ${homeTime(data?.fx?.updatedAt)} · 北京时间`;
}
