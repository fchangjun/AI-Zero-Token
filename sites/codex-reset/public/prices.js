import { CHANNELS, convertQuote, rankedRegions, matchesRegion } from './market-utils.js';
import { assertMarket, mergeFx, fetchFx, readCachedFx, cacheFx } from './market-data.js';
import { setupIntelShare } from './intel-share.js';
import { isResetDataset, pickResetDataset } from './reset-cache.js';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const RESET_API = 'https://codex-resets.com/api/v1';
const RESET_CACHE = 'codex-intel-home-resets-v1';
const initialPlan = ['go','plus','pro100','pro200','pro500'].includes(params.get('plan')) ? params.get('plan') : 'plus';
const initialChannel = ['all','web_direct','app_store'].includes(params.get('channel')) ? params.get('channel') : 'all';
const initialCountry = /^[A-Z]{2}$/.test(params.get('country') || '') ? params.get('country') : '';
const state = { data: null, channel: initialChannel, plan: initialPlan, query: initialCountry, country: initialCountry, sort: 'asc', limit: 15, busy: false, retryAt: 0, priceError: false, fxError: false, reset: null, resetSnapshot: null, resetError: false, resetRetryAt: 0 };
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const amount = value => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const time = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone:'Asia/Shanghai', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date(value)) : '未提供';
const flag = code => /^[A-Z]{2}$/.test(code) ? [...code].map(c => String.fromCodePoint(c.charCodeAt(0)+127397)).join('') : '◉';
const fallback = item => ['snapshot','stale'].includes(item?.mode);
const saving = q => q.savings === null ? '暂无汇率' : `${q.savings >= 0 ? '低' : '高'} ${(Math.abs(q.savings)*100).toFixed(1)}%`;
let toastTimer;
function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500); }
function renderMeta() {
  const {plans,fx,usdVerifiedAt} = state.data;
  const regions = new Set(plans.flatMap(p=>p.quotes.map(q=>q.country))).size;
  $('region-count').textContent=`${regions} 个已收录地区`;
  $('fx-rate').textContent=`¥${Number(fx.rates.CNY).toFixed(4)}`;
  const stale = fallback(fx) || fx.stale?.CNY || Date.now()-Date.parse(fx.updatedAt)>36*3600000;
  const session = ['weekend','interbank_closed'].includes(fx.marketSession);
  $('fx-state').textContent = state.fxError || stale ? '已保存汇率' : fx.mode === 'cache' ? '已保存汇率' : session ? '休市行情' : fx.sources?.CNY !== 'live' ? '参考汇率' : '日内汇率';
  $('fx-time').textContent=`行情时间 ${time(fx.updatedAt)} · 北京时间 · CNY / USD`;
  const latest = plans.map(p=>p.updatedAt).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const quoteStale = plans.some(p=>Date.now()-Date.parse(p.updatedAt)>30*86400000);
  $('price-status').textContent=`本地报价 · ${time(latest[0])}${latest[0]!==latest.at(-1)?` — ${time(latest.at(-1))}`:''} · 北京时间`;

  const alerts=[];
  if (state.priceError) alerts.push('暂时无法检查站内价格更新，继续显示已加载的报价。');
  if (quoteStale) alerts.push('部分地区报价已超过 30 天未核对，请以官方结账页为准。');
  if (state.fxError) alerts.push('汇率更新暂不可用，已保留上次可用汇率；比价和地区查询仍可使用。');
  if (state.resetError) alerts.push('重置信号暂时无法更新，分享将保留已有通告。');
  if (stale) alerts.push(`当前为 ${time(fx.updatedAt)} 的历史汇率，人民币金额仅供参考。`);
  $('market-alert').hidden=!alerts.length; $('market-alert').textContent=alerts.join(' ');
  $('usd-verified').textContent=usdVerifiedAt;
  $('report-date').textContent=`01 / ${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())} · PRICE REPORT`;
}
function renderRankings() {
  const {plans,fx} = state.data;
  $('rankings').innerHTML=plans.map(plan=>{
    const top=rankedRegions(plan,fx,state.channel).slice(0,3);
    return `<article class="ranking-row" aria-label="${e(plan.name)} 最低价地区"><div class="plan-cell"><div class="plan-name"><h3>${e(plan.name)}</h3><span>${e(plan.note)}</span></div><div class="baseline"><strong>$${plan.usd}</strong> USD <small>/ 月</small></div><div class="baseline-rmb">标准价 ≈ ¥${amount(plan.usd*fx.rates.CNY)}</div><button class="text-button" data-explore="${e(plan.id)}">查看全部地区 ↗</button></div>${top.length?top.map((q,i)=>`<button class="rank-cell ${i===0?'winner':''}" data-explore="${e(plan.id)}" data-country="${e(q.country)}" aria-label="查看 ${e(plan.name)} ${e(q.region)} ${CHANNELS[q.channel]}，约 ${amount(q.rmb)} 元每月"><span class="rank-region" data-rank="0${i+1}"><span class="flag" aria-hidden="true">${flag(q.country)}</span>${e(q.region)}<small class="rank-channel">${CHANNELS[q.channel]}</small></span><div class="rank-money"><span class="yen">¥</span>${amount(q.rmb)}<small>/ 月</small></div><div class="rank-local">${e(q.label)} ${e(q.currency)}</div><div class="rank-bottom"><span class="saving ${q.savings<0?'expensive':''}">较标准价${saving(q)}</span></div></button>`).join(''):'<div class="rank-empty">所选渠道暂无可比较的地区报价。</div>'}</article>`;
  }).join('');
}
function renderDetails() {
  const plan=state.data.plans.find(p=>p.id===state.plan), fx=state.data.fx;
  if(!plan) return;
  let quotes=plan.quotes.filter(q=>(state.channel==='all'||q.channel===state.channel)&&matchesRegion(q,state.query,state.country)).map(q=>convertQuote(q,fx,plan.usd));
  quotes.sort((a,b)=>state.sort==='region'?a.region.localeCompare(b.region,'zh-CN') : a.rmb===null?1:b.rmb===null?-1:((a.rmb-b.rmb)*(state.sort==='desc'?-1:1)||a.country.localeCompare(b.country)));
  $('detail-summary').innerHTML=`<strong>${e(plan.name)}</strong> · ${new Set(quotes.map(q=>q.country)).size} 个地区 / ${quotes.length} 条报价`;
  $('detail-baseline').textContent=`标准美元价 $${plan.usd} / 月 ≈ ¥${amount(plan.usd*fx.rates.CNY)} / 月`;
  $('no-results').hidden=quotes.length>0;
  $('price-rows').innerHTML=quotes.slice(0,state.limit).map(q=>`<tr><td><div class="table-region"><span class="flag" aria-hidden="true">${flag(q.country)}</span><div><strong>${e(q.region)}</strong><small>${e(q.country)} · ${CHANNELS[q.channel]}</small></div></div></td><td><div class="table-local">${e(q.label)}<small>${e(q.currency)} / 月</small></div></td><td><div class="table-rmb" title="汇率 ${time(q.fxUpdatedAt)} · 北京时间">${q.rmb===null?'暂无汇率':`¥${amount(q.rmb)}`}</div></td><td><span class="saving ${q.savings<0?'expensive':''}">${saving(q)}</span></td><td><a class="table-source" href="${e(q.source)}" target="_blank" rel="noopener noreferrer" aria-label="查看${e(q.region)}${CHANNELS[q.channel]}价格依据">官方来源 ↗</a></td></tr>`).join('');
  $('table-count').textContent=`已显示 ${Math.min(state.limit,quotes.length)} / ${quotes.length} 条报价`;
  $('load-prices').hidden=state.limit>=quotes.length;
  document.querySelectorAll('[data-plan]').forEach(b=>{b.classList.toggle('selected',b.dataset.plan===state.plan);b.setAttribute('aria-pressed',String(b.dataset.plan===state.plan));});
}
function render(){renderMeta();renderRankings();renderDetails();}
function setChannel(channel) {
  state.channel=channel;state.limit=15;$('detail-channel').value=channel;
  document.querySelectorAll('[data-channel]').forEach(b=>{b.classList.toggle('selected',b.dataset.channel===channel);b.setAttribute('aria-pressed',String(b.dataset.channel===channel));});
  if(state.data){renderRankings();renderDetails();}
}
function cachedFx() {
  try { return readCachedFx(localStorage); } catch { return null; }
}
function setDataset(data) {
  assertMarket(data);
  if(state.data && Date.parse(data.datasetUpdatedAt)<Date.parse(state.data.datasetUpdatedAt)) return;
  let fx = {...data.fx,mode:'snapshot'};
  const cached = cachedFx();
  if(cached) fx=mergeFx(fx,{...cached,mode:'cache'});
  if(state.data) fx=mergeFx(fx,state.data.fx);
  state.data={...data,fx};render();
}
function setResetDataset(data) {
  if (!isResetDataset(data)) throw new Error('重置信号校验未通过');
  if (state.reset && Date.parse(data.generatedAt) < Date.parse(state.reset.generatedAt)) return false;
  const previous = [state.resetSnapshot, state.reset].filter(Boolean);
  const known = previous.flatMap(item => [item.status.latest_reset, item.status.scheduled_reset, ...item.records]).filter(Boolean);
  const translated = record => {
    if (!record) return record;
    const old = known.find(item => item.id === record.id && item.text === record.text && item.status === record.status && item.reset_type === record.reset_type && item.source?.type === record.source?.type && item.source?.url === record.source?.url);
    return old ? { ...record, ...(!record.summaryZh && old.summaryZh ? { summaryZh: old.summaryZh } : {}), ...(!record.translationZh && old.translationZh ? { translationZh: old.translationZh } : {}) } : record;
  };
  const incoming = { ...data, records: data.records.map(translated), status: { ...data.status, latest_reset: translated(data.status.latest_reset), scheduled_reset: translated(data.status.scheduled_reset) } };
  state.reset = pickResetDataset(state.resetSnapshot, [state.reset, incoming]).data;
  return true;
}
function readInitialResets() {
  try { const snapshot = JSON.parse($('reset-snapshot')?.textContent || 'null'); if (isResetDataset(snapshot)) state.resetSnapshot = snapshot; } catch { /* Use cached data if the embedded snapshot is unavailable. */ }
  const caches = [];
  for (const key of ['azt-reset-radar-v1', RESET_CACHE]) {
    try { caches.push(JSON.parse(localStorage.getItem(key) || 'null')); } catch { /* Persistence is optional. */ }
  }
  const initial = pickResetDataset(state.resetSnapshot, caches).data;
  if (initial) setResetDataset(initial);
}
async function refreshResetSignal() {
  if (Date.now() < state.resetRetryAt) return;
  // This page owns synchronization; opening a share only freezes the available data.
  const snapshot = !state.resetSnapshot ? (async () => {
    try {
      const response = await fetch(new URL('./snapshot.json', import.meta.url), { cache: 'no-cache', signal: AbortSignal.timeout(6000) });
      if (!response.ok) return;
      const data = await response.json();
      if (!isResetDataset(data)) return;
      state.resetSnapshot = data;
      setResetDataset(data);
    } catch { /* Keep a valid cached reset signal when offline. */ }
  })() : Promise.resolve();
  const requestReset = async path => {
    const response = await fetch(`${RESET_API}/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      if (response.status === 429) {
        const header = response.headers.get('Retry-After');
        const delay = /^\d+$/.test(header || '') ? Number(header) * 1000 : Date.parse(header || '') - Date.now();
        state.resetRetryAt = Math.max(state.resetRetryAt, Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000));
      }
      throw new Error('重置信号暂不可用');
    }
    return response.json();
  };
  const live = (async () => {
    try {
      const [status, history] = await Promise.all([requestReset('status'), requestReset('resets?limit=12&order=desc')]);
      if (!Array.isArray(history.data)) throw new Error('重置历史格式不完整');
      const data = { version: 1, generatedAt: status.meta?.generated_at, status: status.data, records: [...new Map(history.data.map(record => [record.id, record])).values()].sort((a, b) => Date.parse(b.announced_at) - Date.parse(a.announced_at)), historyComplete: false };
      if (!setResetDataset(data)) throw new Error('保留较新的重置记录');
      state.resetError = false;
      try { localStorage.setItem(RESET_CACHE, JSON.stringify(state.reset)); } catch { /* Sharing works without persistence. */ }
    } catch { state.resetError = true; }
  })();
  await Promise.all([snapshot, live]);
}
async function refresh(manual=false) {
  if(state.busy) return;
  if(Date.now()<state.retryAt) {if(manual)toast(`已保留当前数据，请在 ${Math.ceil((state.retryAt-Date.now())/1000)} 秒后重试`);return;}
  state.busy=true;$('refresh-market').disabled=true;$('refresh-market').textContent='检查更新…';
  const priceUpdate = (async()=>{
    try {
      const response=await fetch(new URL('./data/prices.json',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(6000)});
      if(!response.ok) throw new Error('站内价格暂不可用');
      const data=assertMarket(await response.json());
      state.priceError=false;setDataset(data);
    } catch { state.priceError=true; }
  })();
  const fxUpdate = fetchFx().then(fx=>({fx})).catch(()=>({fx:null}));
  const [,result]=await Promise.all([priceUpdate,fxUpdate,refreshResetSignal()]);
  state.fxError=!result.fx;
  if(state.data){
    if(result.fx){
      state.data.fx=mergeFx(state.data.fx,result.fx);
      try { cacheFx(localStorage,state.data.fx); } catch { /* Browser storage is optional. */ }
    }
    render();
  } else {
    $('rankings').innerHTML='<div class="empty-prices">站内价格暂时无法加载，请稍后点击「检查更新」。</div>';
    $('fx-state').textContent='暂无可用数据';$('price-status').textContent='数据尚未读取';
  }
  if(manual)toast(!state.data?'站内数据暂不可用，请稍后重试':state.fxError?'报价已保留，汇率更新暂不可用':state.priceError?'汇率已更新，继续使用已加载的地区报价':state.resetError?'价格与汇率已检查，分享保留已保存的重置信号':'已检查价格、参考汇率与重置信号');
  state.busy=false;state.retryAt=Date.now()+60000;$('refresh-market').disabled=false;$('refresh-market').textContent='检查更新 ↻';
}
function init() {
  $('region-search').value=state.query;
  setChannel(state.channel);
  try { setDataset(JSON.parse($('market-snapshot')?.textContent)); } catch { /* Non-static previews can read the same JSON below. */ }
  readInitialResets();
  setupIntelShare({getMarketData:()=>state.data,getResetData:()=>state.reset,getProPlanId:()=>state.plan.startsWith('pro')?state.plan:'pro200'});
  if(location.hash==='#regional-prices') requestAnimationFrame(()=>$('regional-prices').scrollIntoView());
  void refresh();
}
$('refresh-market').addEventListener('click',()=>refresh(true));
document.querySelectorAll('[data-channel]').forEach(b=>b.addEventListener('click',()=>setChannel(b.dataset.channel)));
$('detail-channel').addEventListener('change',ev=>setChannel(ev.target.value));
document.querySelectorAll('[data-plan]').forEach(b=>b.addEventListener('click',()=>{state.plan=b.dataset.plan;state.limit=15;if(state.data)renderDetails();}));
$('rankings').addEventListener('click',ev=>{const b=ev.target.closest('[data-explore]');if(!b||!state.data)return;state.plan=b.dataset.explore;state.country=b.dataset.country||'';state.query=state.country;state.limit=15;$('region-search').value=state.query;renderDetails();$('regional-prices').scrollIntoView({behavior:'smooth'});});
$('region-search').addEventListener('input',ev=>{state.country='';state.query=ev.target.value;state.limit=15;if(state.data)renderDetails();});
$('price-sort').addEventListener('change',ev=>{state.sort=ev.target.value;state.limit=15;if(state.data)renderDetails();});
$('load-prices').addEventListener('click',()=>{state.limit+=30;if(state.data)renderDetails();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},300000);
init();
