import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFeaturedDeals } from '../public/deals.js';
import { matchesRegion } from '../public/market-utils.js';

const quote = (country, amount, currency = 'USD', channel = 'web_direct') => ({country, amount, currency, channel, region:country});
const data = {
  fx: {rates:{USD:1,CNY:7,PHP:50}, effectiveAt:{CNY:'2026-10-12T10:00:00Z',PHP:'2026-10-11T10:00:00Z'}},
  plans:[
    {id:'plus',name:'Plus',usd:20,updatedAt:'2026-10-10T00:00:00Z',quotes:[quote('US',19.99,'USD','app_store'),quote('US',20),quote('PH',750,'PHP')]},
    {id:'pro200',name:'Pro 200',usd:200,updatedAt:'2026-10-10T00:00:00Z',quotes:[quote('US',200),quote('PH',7000,'PHP')]},
    {id:'pro100',name:'Pro 100',usd:100,quotes:[quote('US',100)]},
  ],
};

test('featured comparisons use US web baselines and full precision savings with quote/FX dates', () => {
  const before=JSON.stringify(data);
  const [plus,pro]=getFeaturedDeals(data);
  assert.equal(plus.usd,20);
  assert.equal(plus.baselineRmb,140);
  assert.equal(plus.quote.rmb,105);
  assert.equal(plus.savingRmb,35);
  assert.equal(plus.savingsPct,25);
  assert.equal(plus.discountLabel,'7.5 折');
  assert.equal(plus.quote.fxUpdatedAt,'2026-10-11T10:00:00Z');
  assert.equal(plus.updatedAt,'2026-10-10T00:00:00Z');
  assert.equal(pro.quote.rmb,980);
  assert.equal(pro.discountLabel,'7.0 折');
  assert.equal(JSON.stringify(data),before);
});

test('missing FX and no savings do not fabricate a low price or positive saving', () => {
  assert.equal(getFeaturedDeals(data,'pro100')[1].discountLabel,'无价格优势');
  const missing=structuredClone(data);delete missing.fx.rates.PHP;
  assert.equal(getFeaturedDeals(missing)[0].quote.country,'US');
  delete missing.fx.rates.CNY;
  const deal=getFeaturedDeals(missing)[0];
  assert.equal(deal.quote,null);assert.equal(deal.baselineRmb,null);
  assert.equal(deal.savingRmb,null);assert.equal(deal.savingsPct,null);
  assert.deepEqual(getFeaturedDeals(null),[]);
  assert.equal(getFeaturedDeals(data,'<script>')[1].planId,'pro200');
});

test('country deep links match the country rather than other regions using USD', () => {
  assert.equal(matchesRegion(quote('US',20),'US','US'),true);
  assert.equal(matchesRegion(quote('AR',20),'US','US'),false);
  assert.equal(matchesRegion(quote('AR',20),'usd'),true);
  assert.equal(matchesRegion(quote('PH',750,'PHP'),'php'),true);
});
