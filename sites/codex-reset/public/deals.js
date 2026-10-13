import { rankedRegions } from './market-utils.js';

export const PRO_PLANS = ['pro100', 'pro200', 'pro500'];

// Use the same full-precision comparison as the detailed rankings.
export function getFeaturedDeals(data, proPlanId = 'pro200') {
  if (!Array.isArray(data?.plans)) return [];
  const ids = ['plus', PRO_PLANS.includes(proPlanId) ? proPlanId : 'pro200'];
  return ids.flatMap(id => {
    const plan = data.plans.find(item => item.id === id);
    if (!plan) return [];
    const cny = data.fx?.rates?.CNY;
    const baselineRmb = Number.isFinite(cny) && cny > 0 ? plan.usd * cny : null;
    const quote = rankedRegions(plan, data.fx).find(item => Number.isFinite(item.rmb) && item.rmb > 0) || null;
    const savingRmb = quote && baselineRmb !== null ? baselineRmb - quote.rmb : null;
    const savingsPct = quote?.savings == null ? null : quote.savings * 100;
    return [{ planId: plan.id, name: plan.name, usd: plan.usd, baselineRmb,
      updatedAt: plan.updatedAt, quote, savingRmb, savingsPct,
      discountLabel: quote && baselineRmb > 0 && savingRmb > 0 ? `${(quote.rmb / baselineRmb * 10).toFixed(1)} 折` : '无价格优势' }];
  });
}
