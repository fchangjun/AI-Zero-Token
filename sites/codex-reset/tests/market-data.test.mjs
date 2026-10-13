import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertMarket, fetchFx, mergeFx, readCachedFx, cacheFx } from '../public/market-data.js';
const data = JSON.parse(await readFile(new URL('../public/data/prices.json', import.meta.url), 'utf8'));

test('maintained JSON is complete, rejects bad prices, duplicates and unsafe links', () => {
  assert.equal(assertMarket(data), data);
  for (const mutate of [d => d.plans.pop(), d => d.plans[0].quotes[0].amount = 0, d => d.plans[0].quotes.push(d.plans[0].quotes[0]), d => d.plans[0].quotes[0].source = 'javascript:alert(1)', d => d.fx.rates.CNY = null, d => d.plans[0].updatedAt = 'invalid']) {
    const invalid = structuredClone(data); mutate(invalid); assert.throws(() => assertMarket(invalid));
  }
});
test('unavailable or malformed external FX never changes the local dataset', async () => {
  const original = structuredClone(data);
  for (const fetcher of [async () => { throw new Error('offline'); }, async () => new Response('', { status: 429 }), async () => new Response('{broken'), async () => Response.json({ result: 'success', base: 'USD', rates: { CNY: 7 } })]) {
    await assert.rejects(fetchFx(fetcher));
    assert.deepEqual(data, original);
  }
});
test('FX merge accepts newer currency values while preserving missing and older values', () => {
  const current = { ...data.fx, rates: { USD: 1, CNY: 7, EUR: 0.9 }, effectiveAt: { CNY: '2026-10-12T00:00:00Z', EUR: '2026-10-12T00:00:00Z' }, updatedAt: '2026-10-12T00:00:00Z' };
  const incoming = { ...current, rates: { USD: 1, CNY: 7.1 }, effectiveAt: { CNY: '2026-10-13T00:00:00Z' }, updatedAt: '2026-10-13T00:00:00Z', mode: 'live' };
  const merged = mergeFx(current, incoming);
  assert.equal(merged.rates.CNY, 7.1); assert.equal(merged.rates.EUR, 0.9);
  assert.deepEqual(mergeFx(merged, current).rates, merged.rates);
  assert.equal(current.rates.CNY, 7);
});
test('disabled or corrupt browser storage is optional', () => {
  const disabled = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.equal(readCachedFx(disabled), null);
  assert.doesNotThrow(() => cacheFx(disabled, data.fx));
  assert.equal(readCachedFx({ getItem: () => '{broken' }), null);
  assert.equal(readCachedFx({ getItem: () => '{"rates":{"CNY":0}}' }), null);
});
