export const CHANNELS = { all: '全部渠道', web_direct: '官网直购', app_store: 'iOS Store' };
export function matchesRegion(quote, query = '', country = '') {
  if (country) return quote.country === country;
  return `${quote.region} ${quote.country} ${quote.currency}`.toLowerCase().includes(query.toLowerCase().trim());
}
export function convertQuote(quote, fx, usd) {
  const rate = fx?.rates?.[quote.currency], cny = fx?.rates?.CNY;
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(cny) || cny <= 0) return { ...quote, rmb: null, usdEquivalent: null, savings: null, fxStale: true };
  const rmb = quote.amount / rate * cny;
  const stamps = [fx.effectiveAt?.CNY, quote.currency === 'USD' ? fx.effectiveAt?.CNY : fx.effectiveAt?.[quote.currency]].filter(Boolean);
  const fxUpdatedAt = stamps.length ? stamps.sort((a,b) => Date.parse(a)-Date.parse(b))[0] : null;
  const fxStale = fx.mode === 'snapshot' || fx.mode === 'stale' || !fxUpdatedAt || Boolean(fx.stale?.CNY || fx.stale?.[quote.currency]) || Date.now()-Date.parse(fxUpdatedAt) > 36*3600000;
  return { ...quote, rmb, usdEquivalent: quote.amount / rate, savings: 1-rmb/(usd*cny), fxUpdatedAt, fxStale };
}
export function rankedRegions(plan, fx, channel = 'all') {
  const best = new Map();
  for (const raw of plan.quotes) {
    if (channel !== 'all' && raw.channel !== channel) continue;
    const q = convertQuote(raw, fx, plan.usd);
    if (q.rmb === null) continue;
    if (!best.has(q.country) || q.rmb < best.get(q.country).rmb) best.set(q.country, q);
  }
  return [...best.values()].sort((a,b) => a.rmb-b.rmb || a.country.localeCompare(b.country));
}
