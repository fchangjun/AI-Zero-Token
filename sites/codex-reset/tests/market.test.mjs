import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAmount, parsePricePage, parseFx, PLANS } from '../lib/market.mjs';
import { convertQuote, rankedRegions } from '../public/market-utils.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/prices.json',import.meta.url)));

test('locale currency amounts keep thousands and decimals distinct',()=>{
  for(const [label,channel,expected] of [
    ['CLP 428,563','web_direct',428563],['₹1,694.07','web_direct',1694.07],
    ['5 599,00 kr','app_store',5599],['R$ 2.599,90','app_store',2599.9],
    ['14.199.000đ','app_store',14199000],['Rp 9,399juta','app_store',9399000],
    ['Rp 75ribu','app_store',75000],['HUF199,990.00','app_store',199990],
    ['599,00 USD','app_store',599],['¥84,000','app_store',84000],
  ])assert.equal(parseAmount(label,channel),expected,label);
  assert.equal(parseAmount('¥0','web_direct'),null);
  assert.equal(parseAmount('not available','web_direct'),null);
});
test('all captured rows have positive amounts and official provenance',()=>{
  assert.deepEqual(data.plans.map(p=>p.usd),[8,20,100,200,500]);
  for(const p of data.plans){
    assert.equal(new Set(p.quotes.map(q=>q.country+q.channel)).size,p.quotes.length);
    for(const q of p.quotes){assert.ok(q.amount>0);assert.ok(q.source.startsWith(q.channel==='web_direct'?'https://chatgpt.com/':'https://apps.apple.com/'));}
  }
});
test('RMB uses USD cross rates; USD base and missing currencies are handled',()=>{
  const fx={rates:{USD:1,EUR:0.8,CNY:7},effectiveAt:{CNY:new Date().toISOString(),EUR:new Date().toISOString()},stale:{}};
  assert.equal(convertQuote({amount:16,currency:'EUR'},fx,20).rmb,140);
  assert.equal(convertQuote({amount:20,currency:'USD'},fx,20).savings,0);
  assert.equal(convertQuote({amount:20,currency:'ZZZ'},fx,20).rmb,null);
});
test('Top 3 deduplicates regions and respects channel filters',()=>{
  const p={usd:20,quotes:[{country:'US',currency:'USD',amount:20,channel:'web_direct'},{country:'US',currency:'USD',amount:19.99,channel:'app_store'},{country:'CA',currency:'USD',amount:18,channel:'web_direct'}]};
  const fx={rates:{USD:1,CNY:7}};
  assert.deepEqual(rankedRegions(p,fx).map(q=>[q.country,q.amount]),[['CA',18],['US',19.99]]);
  assert.deepEqual(rankedRegions(p,fx,'web_direct').map(q=>q.amount),[18,20]);
  assert.equal(rankedRegions(p,fx,'app_store').length,1);
});
test('each captured tier has three ranked distinct regions with valid FX',()=>{
  for(const p of data.plans)for(const channel of ['all','web_direct','app_store']){
    const top=rankedRegions(p,data.fx,channel).slice(0,3);
    assert.equal(top.length,3);assert.equal(new Set(top.map(q=>q.country)).size,3);
    assert.ok(top.every(q=>Number.isFinite(q.rmb)&&q.rmb>0));
    assert.ok(top[0].rmb<=top[1].rmb&&top[1].rmb<=top[2].rmb);
  }
});
test('stale FX and the older side of cross rates are exposed',()=>{
  const fx={rates:{CNY:7,EUR:0.9},effectiveAt:{CNY:'2026-10-13T00:00:00Z',EUR:'2026-10-12T00:00:00Z'},stale:{EUR:true}};
  const q=convertQuote({amount:20,currency:'EUR'},fx,20);
  assert.equal(q.fxUpdatedAt,'2026-10-12T00:00:00Z');assert.equal(q.fxStale,true);
});
test('changed upstream HTML and incomplete FX fail closed',()=>{
  assert.throws(()=>parsePricePage('<html>maintenance</html>',PLANS[0]));
  assert.throws(()=>parseFx({result:'success',base:'EUR',rates:{CNY:7}}));
  assert.throws(()=>parseFx({result:'success',base:'USD',rates:{CNY:7}}));
});
