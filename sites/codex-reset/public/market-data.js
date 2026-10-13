export const FX_URL = 'https://api.exchangerate.dev/v1/latest/USD';
export const FX_CACHE_KEY = 'codex-intel-fx-v1';
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = value => Number.isFinite(value) && value > 0;
const httpsHost = (value, hosts) => {
  try { const url = new URL(value); return url.protocol === 'https:' && hosts.includes(url.hostname); } catch { return false; }
};

export function assertFx(fx) {
  if (!fx || fx.rates?.USD !== 1 || !positive(fx.rates.CNY) || !validDate(fx.updatedAt) || !validDate(fx.effectiveAt?.CNY)) throw new Error('缺少有效的美元兑人民币汇率或行情时间');
  for (const [currency, rate] of Object.entries(fx.rates)) {
    if (!/^[A-Z]{3}$/.test(currency) || !positive(rate)) throw new Error(`汇率无效：${currency}`);
  }
  return fx;
}

export function assertMarket(data) {
  if (data?.schemaVersion !== 1 || !validDate(data.datasetUpdatedAt) || !validDate(data.usdVerifiedAt)) throw new Error('价格文件版本或更新时间无效');
  if (!httpsHost(data.usdSource, ['learn.chatgpt.com', 'openai.com', 'chatgpt.com'])) throw new Error('标准美元价来源无效');
  const ids = ['go', 'plus', 'pro100', 'pro200', 'pro500'];
  if (!Array.isArray(data.plans) || data.plans.length !== ids.length || new Set(data.plans.map(p => p.id)).size !== ids.length) throw new Error('需提供五个完整且不重复的订阅档位');
  for (const plan of data.plans) {
    if (!ids.includes(plan.id) || typeof plan.name !== 'string' || !plan.name || !positive(plan.usd) || !validDate(plan.updatedAt)) throw new Error(`档位信息无效：${plan.id}`);
    if (!Array.isArray(plan.quotes) || !plan.quotes.length || plan.quotes.length > 2000) throw new Error(`档位缺少报价：${plan.id}`);
    const seen = new Set();
    for (const q of plan.quotes) {
      const key = `${q.country}:${q.channel}`;
      if (!/^[A-Z]{2}$/.test(q.country) || !/^[A-Z]{3}$/.test(q.currency) || typeof q.region !== 'string' || !q.region || typeof q.label !== 'string' || !q.label || !positive(q.amount) || !['web_direct', 'app_store'].includes(q.channel) || seen.has(key)) throw new Error(`地区报价无效或重复：${plan.id}/${key}`);
      if (!httpsHost(q.source, q.channel === 'web_direct' ? ['chatgpt.com'] : ['apps.apple.com'])) throw new Error(`报价缺少官方来源：${plan.id}/${key}`);
      seen.add(key);
    }
  }
  assertFx(data.fx);
  return data;
}

export function parseFx(data, fetchedAt = new Date().toISOString(), delay = 900) {
  if (data?.result !== 'success' || data.base !== 'USD' || !data.rates || Object.keys(data.rates).length < 100) throw new Error('汇率响应不完整');
  const rates = Object.fromEntries(Object.entries(data.rates).filter(([currency, rate]) => /^[A-Z]{3}$/.test(currency) && positive(rate) && (currency === 'USD' || validDate(data.effective_at?.[currency]))));
  return assertFx({ rates: { ...rates, USD: 1 }, effectiveAt: data.effective_at || {}, stale: data.stale || {}, sources: data.sources || {}, updatedAt: data.effective_at?.CNY, fetchedAt, delaySeconds: Number.isFinite(delay) ? delay : 900, marketSession: data.market_session, source: 'exchangerate.dev', sourceUrl: 'https://exchangerate.dev/docs/api-reference', mode: 'live' });
}

// Merge per currency: a provider's partial/older response must not erase a usable rate.
export function mergeFx(current, incoming) {
  assertFx(current); assertFx(incoming);
  const merged = { ...current, rates: { ...current.rates }, effectiveAt: { ...current.effectiveAt }, stale: { ...current.stale }, sources: { ...current.sources } };
  for (const [currency, rate] of Object.entries(incoming.rates)) {
    if (currency === 'USD') continue;
    const nextAt = incoming.effectiveAt?.[currency];
    if (!validDate(nextAt) || Date.parse(nextAt) < Date.parse(current.effectiveAt?.[currency] || '1970-01-01')) continue;
    merged.rates[currency] = rate;
    merged.effectiveAt[currency] = nextAt;
    merged.stale[currency] = Boolean(incoming.stale?.[currency]);
    merged.sources[currency] = incoming.sources?.[currency] || 'reference';
    if (currency === 'CNY') {
      for (const key of ['fetchedAt', 'delaySeconds', 'marketSession', 'source', 'sourceUrl', 'mode']) merged[key] = incoming[key];
      merged.updatedAt = nextAt;
    }
  }
  return merged;
}

export async function fetchFx(fetcher = fetch, timeout = 6000) {
  const response = await fetcher(FX_URL, { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`汇率更新失败（${response.status}）`);
  return parseFx(await response.json(), new Date().toISOString(), Number(response.headers.get('X-Price-Delay-Seconds') || 900));
}

export function readCachedFx(storage) {
  try { return assertFx(JSON.parse(storage.getItem(FX_CACHE_KEY))); } catch { return null; }
}
export function cacheFx(storage, fx) {
  try { storage.setItem(FX_CACHE_KEY, JSON.stringify(assertFx(fx))); } catch { /* Storage is optional. */ }
}
