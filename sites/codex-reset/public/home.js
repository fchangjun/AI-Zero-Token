import { assertMarket, mergeFx, fetchFx, readCachedFx, cacheFx } from './market-data.js';
import { PRO_PLANS } from './deals.js';
import { renderHomeDeals, renderHomeResets, homeMarketMeta, homeTime } from './home-render.js';
import { setupIntelShare } from './intel-share.js';
import { getResetFocus } from './reset-focus.js';
import { getHomeLayout } from './home-layout.js';

const $ = id => document.getElementById(id);
const RESET_API = 'https://codex-resets.com/api/v1';
const RESET_CACHE = 'codex-intel-home-resets-v1';
const state = { market: null, reset: null, resetSnapshot: null, resetMode: 'snapshot', proPlanId: 'pro200', busy: false, retryAt: 0, marketError: false, fxError: false, resetError: false };
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const sourceUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && ['x.com', 'twitter.com', 'codex-resets.com', 'ai-resets.com'].includes(url.hostname) ? url.href : ''; } catch { return ''; } };
const validSource = source => source && ((source.type === 'observed' && Boolean(sourceUrl(source.url))) || (source.type === 'x_post' && source.author === 'thsottiaux' && /^https:\/\/(?:x|twitter)\.com\/thsottiaux\/status\/\d+(?:[/?#]|$)/.test(sourceUrl(source.url))));
const validRecord = record => record && typeof record.id === 'string' && record.id.length > 0 && validDate(record.announced_at) && ['regular', 'banked'].includes(record.reset_type) && validSource(record.source);
const validResetData = data => data && validDate(data.generatedAt) && Array.isArray(data.records) && data.records.length < 5001 && data.records.every(validRecord) && data.status && (data.status.latest_reset === null || (validRecord(data.status.latest_reset) && data.status.latest_reset.status !== 'scheduled')) && (data.status.scheduled_reset === null || (validRecord(data.status.scheduled_reset) && data.status.scheduled_reset.status === 'scheduled' && (data.status.scheduled_reset.scheduled_for === null || validDate(data.status.scheduled_reset.scheduled_for))));
const storage = () => { try { return localStorage; } catch { return null; } };
const readJson = id => { try { return JSON.parse($(id)?.textContent || 'null'); } catch { return null; } };
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600);
}

function mergeTranslations(data) {
  const known = [state.resetSnapshot, state.reset].filter(Boolean).flatMap(item => [...item.records, item.status.latest_reset, item.status.scheduled_reset]).filter(Boolean);
  const attach = record => {
    if (!record) return record;
    const previous = known.find(item => item.id === record.id && item.text === record.text && item.status === record.status && item.reset_type === record.reset_type && item.source?.url === record.source?.url && item.source?.type === record.source?.type);
    return previous ? { ...record, ...(previous.summaryZh ? { summaryZh: previous.summaryZh } : {}), ...(previous.translationZh ? { translationZh: previous.translationZh } : {}) } : record;
  };
  return { ...data, records: data.records.map(attach), status: { ...data.status, latest_reset: attach(data.status.latest_reset), scheduled_reset: attach(data.status.scheduled_reset) } };
}

function renderMarket() {
  if (!state.market) return;
  const activePro = document.activeElement?.dataset.homePro;
  $('featured-deals').innerHTML = renderHomeDeals(state.market, state.proPlanId);
  if (activePro) document.querySelector(`[data-home-pro="${activePro}"]`)?.focus({ preventScroll: true });
  const regions = new Set(state.market.plans.flatMap(plan => plan.quotes.map(quote => quote.country))).size;
  $('home-region-count').innerHTML = `${regions}<small>已收录地区</small>`;
  const fx = state.market.fx;
  const latest = fx.mode === 'live' && !fx.stale?.CNY && Date.now() - Date.parse(fx.updatedAt) < 36 * 3600000;
  $('home-market-time').textContent = `${homeMarketMeta(state.market)} · ${latest ? '已检查参考行情' : '本地 / 已保存参考汇率'}`;
}

let renderedResetKey;
function renderResets(clockOnly = false) {
  if (!state.reset) return;
  const now = Date.now();
  const focus = getResetFocus(state.reset, now);
  $('home-reset-note').textContent = focus.note;
  const key = `${focus.kind}:${focus.record?.id || ''}:${focus.targetAt || ''}`;
  if (!clockOnly || key !== renderedResetKey) {
    const layout = getHomeLayout(focus);
    const active = document.activeElement;
    const activeResetLink = $('home-reset-grid').contains(active) ? active.getAttribute('href') : null;
    const feed = $('home-feed');
    for (const [index, id] of layout.sectionIds.entries()) {
      if (feed.children[index]?.id !== id) feed.insertBefore($(id), feed.children[index] || null);
    }
    document.body.classList.toggle('reset-priority', layout.priority);
    $('home-title').innerHTML = layout.titleHtml;
    for (const [id, text] of Object.entries(layout.texts)) $(id).textContent = text;
    $('home-reset-grid').innerHTML = renderHomeResets(state.reset, now);
    if (activeResetLink) {
      [...$('home-reset-grid').querySelectorAll('a')].find(link => link.getAttribute('href') === activeResetLink)?.focus({ preventScroll: true });
    } else if (active && active !== document.body && document.activeElement !== active) active.focus({ preventScroll: true });
    renderedResetKey = key;
  } else if ($('home-reset-countdown') && $('home-reset-countdown').textContent !== focus.countdownValue) {
    $('home-reset-countdown').textContent = focus.countdownValue;
  }
  $('home-reset-time').textContent = `${state.resetMode === 'live' ? '公开通告已同步' : state.resetMode === 'cache' ? '已保存通告' : '本地通告快照'} · ${homeTime(state.reset.generatedAt)}${state.resetError ? ' · 更新暂不可用，保留现有记录' : ''}`;
}

function renderErrors() {
  const notes = [];
  if (state.marketError) notes.push('站内价格暂时无法检查，保留已加载报价。');
  if (state.fxError) notes.push('汇率更新暂不可用，继续按已保存汇率比较。');
  if (state.market?.plans.some(plan => Date.now() - Date.parse(plan.updatedAt) > 30 * 86400000)) notes.push('部分报价超过 30 天未核对，请核对官方结账价格。');
  $('home-data-alert').textContent = notes.join(' ');
  $('home-data-alert').hidden = !notes.length;
}

function setMarket(data) {
  assertMarket(data);
  if (state.market && (Date.parse(data.datasetUpdatedAt) < Date.parse(state.market.datasetUpdatedAt) || data.plans.some(plan => Date.parse(plan.updatedAt) < Date.parse(state.market.plans.find(previous => previous.id === plan.id)?.updatedAt || '1970-01-01')))) return;
  let fx = { ...data.fx, mode: 'snapshot' };
  const cache = readCachedFx(storage());
  if (cache) fx = mergeFx(fx, { ...cache, mode: 'cache' });
  if (state.market) fx = mergeFx(fx, state.market.fx);
  state.market = { ...data, fx };
  renderMarket();
}

function setReset(data, mode) {
  if (!validResetData(data)) throw new Error('公开通告校验未通过');
  if (state.reset && (Date.parse(data.generatedAt) < Date.parse(state.reset.generatedAt) || (Date.parse(data.generatedAt) === Date.parse(state.reset.generatedAt) && state.resetMode === 'live' && mode !== 'live'))) return false;
  state.reset = mergeTranslations(data);
  state.resetMode = mode;
  renderResets();
  return true;
}

async function requestJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!response.ok) {
    if (response.status === 429) {
      const header = response.headers.get('Retry-After');
      const delay = /^\d+$/.test(header || '') ? Number(header) * 1000 : Date.parse(header || '') - Date.now();
      state.retryAt = Math.max(state.retryAt, Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000));
    }
    throw new Error(`数据源暂不可用（${response.status}）`);
  }
  return response.json();
}

async function refreshMarket() {
  const prices = requestJson(new URL('./data/prices.json', import.meta.url)).then(data => { setMarket(data); state.marketError = false; }).catch(() => { state.marketError = true; });
  const rates = fetchFx().then(fx => ({ fx })).catch(() => ({ fx: null }));
  const [, result] = await Promise.all([prices, rates]);
  state.fxError = !result.fx;
  if (result.fx && state.market) {
    state.market.fx = mergeFx(state.market.fx, result.fx);
    cacheFx(storage(), state.market.fx);
  }
  renderMarket();
  renderErrors();
}

async function refreshResets() {
  const snapshot = requestJson(new URL('./snapshot.json', import.meta.url)).then(data => {
    if (!validResetData(data)) throw new Error('站内通告无效');
    if (!state.resetSnapshot || Date.parse(data.generatedAt) >= Date.parse(state.resetSnapshot.generatedAt)) state.resetSnapshot = data;
    if (!setReset(data, 'snapshot') && state.reset) {
      state.reset = mergeTranslations(state.reset);
      renderResets();
    }
  }).catch(() => { /* A valid embedded snapshot or cache remains available. */ });
  const live = Promise.all([requestJson(`${RESET_API}/status`), requestJson(`${RESET_API}/resets?limit=12&order=desc`)]).then(([status, history]) => {
    if (!Array.isArray(history.data)) throw new Error('通告格式不完整');
    const data = { version: 1, generatedAt: status.meta?.generated_at, status: status.data, records: [...new Map(history.data.map(record => [record.id, record])).values()].sort((a, b) => Date.parse(b.announced_at) - Date.parse(a.announced_at)), historyComplete: false };
    if (!setReset(data, 'live')) throw new Error('来源返回较旧通告，已保留较新记录');
    state.resetError = false;
    try { storage()?.setItem(RESET_CACHE, JSON.stringify(state.reset)); } catch { /* Persistence is optional. */ }
  }).catch(() => { state.resetError = true; if (state.resetMode === 'live') state.resetMode = 'cache'; });
  await Promise.all([snapshot, live]);
  renderResets();
}

async function refresh(manual = false) {
  if (state.busy) return;
  if (Date.now() < state.retryAt) {
    if (manual) toast(`已保留现有情报，${Math.ceil((state.retryAt - Date.now()) / 1000)} 秒后可再检查`);
    return;
  }
  state.busy = true;
  for (const id of ['home-refresh', 'home-reset-refresh']) {
    $(id).disabled = true;
    $(id).textContent = '检查更新…';
  }
  try {
    await Promise.all([refreshMarket(), refreshResets()]);
    if (!state.market) $('featured-deals').innerHTML = '<p class="home-empty">暂时无法读取价格，请稍后点击「检查更新」。</p>';
    if (!state.reset) $('home-reset-grid').innerHTML = '<p class="home-empty">暂时无法读取通告，请稍后点击「检查更新」。</p>';
    if (manual) toast(state.marketError || state.fxError || state.resetError ? '部分来源暂不可用，已保留可用价格与通告' : '已检查价格、参考汇率与公开通告');
  } finally {
    state.busy = false;
    state.retryAt = Math.max(state.retryAt, Date.now() + 60000);
    $('home-refresh').disabled = false;
    $('home-refresh').textContent = '更新价格 ↻';
    $('home-reset-refresh').disabled = false;
    $('home-reset-refresh').textContent = '更新通告 ↻';
  }
}

$('featured-deals').addEventListener('click', event => {
  const button = event.target.closest('[data-home-pro]');
  if (!button || !PRO_PLANS.includes(button.dataset.homePro)) return;
  state.proPlanId = button.dataset.homePro;
  renderMarket();
});
$('home-refresh').addEventListener('click', () => refresh(true));
$('home-reset-refresh').addEventListener('click', () => refresh(true));
const intelShare = setupIntelShare({ getMarketData: () => state.market, getResetData: () => state.reset, getProPlanId: () => state.proPlanId });

try { const data = readJson('market-snapshot'); if (data) setMarket(data); } catch { /* Retain prerendered content while checking the published JSON. */ }
const reset = readJson('reset-snapshot');
if (validResetData(reset)) { state.resetSnapshot = reset; setReset(reset, 'snapshot'); }
for (const key of ['azt-reset-radar-v1', RESET_CACHE]) {
  try { const cache = JSON.parse(storage()?.getItem(key) || 'null'); if (validResetData(cache) && (!state.reset || Date.parse(cache.generatedAt) > Date.parse(state.reset.generatedAt))) setReset(cache, 'cache'); } catch { /* Cache is optional. */ }
}
if (new URLSearchParams(location.search).get('share') === 'latest') void intelShare.open();
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60000);
// Tick locally without refetching or rebuilding focused links every minute.
setInterval(() => { if (!document.hidden) renderResets(true); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderResets(true); });
