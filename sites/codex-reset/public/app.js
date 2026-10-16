import { setupIntelShare } from './intel-share.js';
import { renderHomeResets } from './home-render.js';
import { getResetFocus, getResetHeading } from './reset-focus.js';
import { getResetCopy } from './reset-copy.js';
import { assertMarket, mergeFx, readCachedFx, cacheFx, fetchFx } from './market-data.js';
import { isResetDataset as isDataset, pickResetDataset } from './reset-cache.js';
import { fetchResetUpdate, createResetResumeSync } from './reset-sync.js';
import { enrichResetTranslations, mergePublishedResetData, loadPublishedResetSnapshots } from './reset-translations.js';

const $ = (id) => document.getElementById(id);
const CACHE_KEY = 'azt-reset-radar-v1';
const assetUrl = (path) => new URL(path, import.meta.url).href;
const DAY = 86400000;
const shareRequest = new URLSearchParams(location.search).get('share');
let initialSharePending = Boolean(shareRequest && /^[a-zA-Z0-9_-]{1,128}$/.test(shareRequest));
const state = { data: null, snapshot: null, mode: 'snapshot', busy: false, retryAt: 0, lastAttemptAt: null, filter: 'all', selectedDay: null, visible: 6, syncError: '', historyError: '', priceMarket: null };
const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = (date) => Number.isFinite(Date.parse(date)) ? dateFormat.format(new Date(date)) : '时间未提供';
const dayKey = (date) => new Date(Date.parse(date) + 8 * 3600000).toISOString().slice(0,10);
const safeUrl = (url) => { try { const u = new URL(url); return u.protocol === 'https:' && ['x.com','twitter.com','codex-resets.com'].includes(u.hostname) ? u.href : ''; } catch { return ''; } };
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3800); }
function attachSummaries(d) {
  return enrichResetTranslations(d, [state.data, state.snapshot]);
}
function persistResets() {
  try { localStorage.setItem(CACHE_KEY,JSON.stringify(state.data)); } catch { /* Persistence is optional. */ }
}
async function refreshPublishedSnapshot() {
  const snapshots = await loadPublishedResetSnapshots();
  if (!snapshots.length) return;
  state.snapshot = mergePublishedResetData(state.snapshot, snapshots);
  const previous = state.data;
  state.data = mergePublishedResetData(previous, [state.snapshot]);
  if (!previous || Date.parse(state.data.generatedAt) > Date.parse(previous.generatedAt)) state.mode = 'snapshot';
  persistResets();
  render(); maybeOpenInitialShare();
}
function renderSync(error = '') {
  const el = $('sync-state');
  el.classList.toggle('stale', state.mode !== 'live');
  if (!state.data) { el.textContent = error || '正在读取公开数据'; return; }
  const prefix = state.mode === 'live' ? state.historyError || '已同步' : state.mode === 'cache' ? '缓存数据' : '离线快照';
  el.textContent = `${prefix} · ${dateLabel(state.data.generatedAt)}${error ? ' · 同步暂不可用' : ''}${state.data.historyComplete===false?' · 历史记录待完整核对':''}`;
  el.title = error || '页面每 5 分钟尝试同步，时间均为北京时间';
}
async function request(url, { signal = AbortSignal.timeout(6000) } = {}) {
  const response = await fetch(url, {cache:'no-store', signal});
  if (!response.ok) {
    if (response.status === 429) { const header = response.headers.get('Retry-After'); const delay = /^\d+$/.test(header || '') ? Number(header)*1000 : Date.parse(header || '') - Date.now(); state.retryAt = Math.max(state.retryAt, Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000)); }
    throw new Error(response.status === 429 ? '数据源请求较多，请稍后刷新' : `数据源暂不可用（${response.status}）`);
  }
  return response.json();
}
async function sync(manual = false) {
  if (state.busy) return;
  if (Date.now() < state.retryAt) { await refreshPublishedSnapshot(); if(manual) toast(`请在 ${Math.ceil((state.retryAt-Date.now())/1000)} 秒后刷新公开接口`); return; }
  state.busy = true; state.lastAttemptAt = Date.now(); $('refresh-button').disabled = true; $('refresh-button').textContent = '↻ 正在同步';
  const published = refreshPublishedSnapshot();
  try {
    const { data, historyError } = await fetchResetUpdate(request, { previous: state.data, fullHistory: true, historyLimit: 100 });
    if(state.data && Date.parse(data.generatedAt) < Date.parse(state.data.generatedAt)) throw new Error('数据源返回较旧记录，已保留较新数据');
    state.data = attachSummaries(data); state.mode = 'live'; state.syncError = ''; state.historyError = historyError;
    persistResets();
    render(); maybeOpenInitialShare(); if(manual) toast(historyError || '公开公告已同步');
  } catch (error) {
    if(state.mode === 'live') state.mode = 'cache';
    state.syncError = error.message || '网络连接失败'; if(state.data) render(true); else renderSync(state.syncError);
    if(manual) toast('暂时无法同步，已保留现有记录');
  } finally { await published; state.busy = false; state.retryAt = Math.max(state.retryAt, Date.now()+30000); $('refresh-button').disabled = false; $('refresh-button').textContent = '↻ 刷新数据'; resumeSync.settled(); }
}
let signalKey;
function render(timeOnly = false) {
  const {status,records} = state.data;
  const now = Date.now();
  const focus = getResetFocus(state.data, now);
  document.body.classList.toggle('reset-forecast', ['forecast', 'watch'].includes(focus.mode));
  $('reset-time-note').textContent = focus.note;
  const heading = getResetHeading(focus);
  $('reset-detail-title').innerHTML = `${escapeHTML(heading.title)}<span>${escapeHTML(heading.emphasis)}</span>`;
  $('reset-detail-description').textContent = heading.description;
  const key = `${focus.kind}:${focus.priority}:${focus.record?.id || ''}:${focus.targetAt || ''}:${focus.latest?.record?.id || ''}:${focus.next?.kind || ''}:${focus.next?.record?.id || ''}`;
  if (!timeOnly || key !== signalKey) {
    const active = document.activeElement;
    const activeLink = $('reset-detail-grid').contains(active) ? active.getAttribute('href') : null;
    $('reset-detail-grid').innerHTML = renderHomeResets(state.data, now).replaceAll('href="./resets/index.html"', 'href="#history"').replaceAll('src="./tibo-avatar.jpg"', 'src="../tibo-avatar.jpg"');
    if (activeLink) [...$('reset-detail-grid').querySelectorAll('a')].find(link => link.getAttribute('href') === activeLink)?.focus({ preventScroll: true });
    signalKey = key;
  } else if ($('home-reset-countdown')) $('home-reset-countdown').textContent = focus.countdownValue;
  $('stat-total').textContent = Number.isFinite(status.stats.total)?status.stats.total:records.length;
  $('stat-average').textContent = Number.isFinite(status.stats.avg_interval_days)?status.stats.avg_interval_days.toFixed(1):'—';
  const intervals = records.slice(1).map((r,i)=>(Date.parse(records[i].announced_at)-Date.parse(r.announced_at))/DAY);
  $('stat-longest').textContent = state.data.historyComplete && intervals.length ? Math.max(...intervals).toFixed(1):'—';
  renderSync(state.syncError); if(!timeOnly){renderCalendar(); renderAnnouncements();}
}
function renderCalendar() {
  const weeks = Number($('calendar-range').value); const today = new Date(`${dayKey(new Date().toISOString())}T00:00:00Z`);
  const mondayOffset=(today.getUTCDay()+6)%7; const start = new Date(today.getTime()-(mondayOffset+(weeks-1)*7)*DAY);
  const dateRecords = new Map(); for(const r of state.data.records){ const key=dayKey(r.announced_at); dateRecords.set(key,[...(dateRecords.get(key)||[]),r]); }
  document.querySelector('.calendar-scroll').style.setProperty('--weeks',weeks); $('heatmap').style.setProperty('--weeks',weeks); $('heatmap-months').style.setProperty('--weeks',weeks);
  const cells=[]; const months=[];
  for(let i=0;i<weeks*7;i++){
    const date = new Date(start.getTime()+i*DAY); const key=date.toISOString().slice(0,10); const entries=dateRecords.get(key)||[]; const future=date>today; const kind=entries.some(r=>r.reset_type==='banked')?'banked':entries.length?'regular':'';
    if(i%7===0){ const nextWeek=new Date(date.getTime()+6*DAY); months.push(`<span>${i===0||nextWeek.getUTCMonth()!==new Date(date.getTime()-DAY).getUTCMonth()?`${nextWeek.getUTCMonth()+1}月`:''}</span>`); }
    cells.push(`<button type="button" data-day="${key}" class="${kind} ${future?'future':''} ${state.selectedDay===key?'selected-day':''}" ${future?'disabled':''} title="${key} · ${entries.length?`${entries.length} 次重置`:'无记录'}" aria-label="${key}，${entries.length?`${entries.length} 次重置`:'无重置记录'}"></button>`);
  }
  $('heatmap').innerHTML=cells.join(''); $('heatmap-months').innerHTML=months.join(''); const scroller=document.querySelector('.calendar-scroll'); scroller.scrollLeft=scroller.scrollWidth;
}
function renderAnnouncements() {
  const rows=state.data.records.filter(r=>(state.filter==='all'||r.reset_type===state.filter)&&(!state.selectedDay||dayKey(r.announced_at)===state.selectedDay));
  $('clear-date').hidden=!state.selectedDay;
  $('calendar-detail').textContent=state.selectedDay?`${state.selectedDay} · ${rows.length} 条符合筛选的公告`:'点击有颜色的日期，查看当天公告';
  $('announcement-list').innerHTML=rows.slice(0,state.visible).map(r=>{
    const copy=getResetCopy(r); const text=copy.english; const zh=copy.chinese; const url=safeUrl(r.source.url);
    return `<article class="announcement"><div class="announcement-meta"><span class="type-label ${r.reset_type==='banked'?'banked-label':''}">${r.reset_type==='banked'?'储备重置':'常规重置'}</span><time datetime="${escapeHTML(r.announced_at)}">${escapeHTML(dateLabel(r.announced_at))}</time><span>UTC+8</span>${copy.label === '自动中文译文' ? '<span>自动译文</span>' : ''}</div><h3>${escapeHTML(zh)}</h3>${!text?'<p>本地快照仅保留此条日期与来源，可前往原帖阅读。</p>':''}${text?`<details><summary>阅读英文原文</summary><p>${escapeHTML(text)}</p></details>`:''}<div class="announcement-actions"><span>${r.source.type==='x_post'?'Tibo · @thsottiaux':'数据源观测记录'}</span><div>${url?`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">来源原文 ↗</a>`:''}</div></div></article>`;
  }).join('')||'<div class="empty-state">这个筛选下还没有重置记录。</div>';
  $('load-more').hidden=rows.length<=state.visible;
  $('load-more').textContent=`查看更多公告（还有 ${Math.max(0,rows.length-state.visible)} 条） ↓`;
}
function readPriceDataset(data) {
  assertMarket(data);
  let fx={...data.fx,mode:'snapshot'};
  try {const cached=readCachedFx(localStorage);if(cached)fx=mergeFx(fx,{...cached,mode:'cache'});}catch{}
  if(state.priceMarket)fx=mergeFx(fx,state.priceMarket.fx);
  state.priceMarket={...data,fx};
}
async function prepareSharePrices() {
  try{readPriceDataset(JSON.parse($('market-snapshot')?.textContent||'null'));}catch{}
  if(!state.priceMarket){
    try{const response=await fetch(assetUrl('./data/prices.json'),{signal:AbortSignal.timeout(6000)});if(response.ok)readPriceDataset(await response.json());}catch{}
  }
  try{const fx=await fetchFx();if(state.priceMarket){state.priceMarket.fx=mergeFx(state.priceMarket.fx,fx);try{cacheFx(localStorage,state.priceMarket.fx);}catch{}}}catch{}
}
const intelShare = setupIntelShare({getResetData:()=>state.data,getMarketData:()=>state.priceMarket});
const resumeSync = createResetResumeSync({ refresh: () => sync(), isVisible: () => !document.hidden,
  getState: () => ({ ...state, failed: Boolean(state.syncError || state.historyError) }) });
function maybeOpenInitialShare() {
  if (!initialSharePending || !state.data) return;
  initialSharePending = false;
  void intelShare.open();
}
$('refresh-button').addEventListener('click',()=>sync(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.data)render(true);resumeSync.resume();});
window.addEventListener('online',()=>resumeSync.resume());
$('calendar-range').addEventListener('change',()=>state.data&&renderCalendar());
$('heatmap').addEventListener('click',event=>{const button=event.target.closest('[data-day]');if(!button)return;state.selectedDay=button.dataset.day;state.visible=6;renderCalendar();renderAnnouncements();$('announcements').scrollIntoView({behavior:'smooth',block:'start'});});
$('clear-date').addEventListener('click',()=>{state.selectedDay=null;renderCalendar();renderAnnouncements();});
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{state.filter=button.dataset.filter;state.visible=6;for(const b of document.querySelectorAll('[data-filter]')){b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));}if(state.data)renderAnnouncements();});
$('load-more').addEventListener('click',()=>{state.visible+=10;renderAnnouncements();});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
$('today-label').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
async function init(){
  void prepareSharePrices();
  try{const d=JSON.parse($('reset-snapshot')?.textContent || 'null');if(isDataset(d)){state.snapshot=d;state.data=d;}}catch{}
  const cachedDatasets=[];
  for(const key of [CACHE_KEY,'codex-intel-home-resets-v1']){try{cachedDatasets.push(JSON.parse(localStorage.getItem(key)));}catch{}}
  const initial=pickResetDataset(state.snapshot,cachedDatasets);
  if(initial.data){state.data=attachSummaries(initial.data);state.mode=initial.mode;}
  if(state.data){render();maybeOpenInitialShare();}
  await sync();
  if(initialSharePending){initialSharePending=false;void intelShare.open();}
  if(!state.data){$('reset-detail-grid').textContent='暂时无法读取重置信号，请检查网络后刷新。';$('sync-state').textContent='数据未加载 · 可点击刷新重试';}
  setInterval(()=>{if(!document.hidden)sync();},5*60000);
  let displayedDay=dayKey(new Date().toISOString());
  setInterval(()=>{if(!state.data)return; const currentDay=dayKey(new Date().toISOString()); render(true); if(currentDay!==displayedDay){displayedDay=currentDay;renderCalendar();$('today-label').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());}},30000);
}
init();
