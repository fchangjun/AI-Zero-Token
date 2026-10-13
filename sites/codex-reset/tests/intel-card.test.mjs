import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getIntelCardData, intelCardCaption, renderIntelCard } from '../public/intel-card.js';
import { getFeaturedDeals } from '../public/deals.js';
const market = JSON.parse(await readFile(new URL('../public/data/prices.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL('./fixtures/reset-scheduled.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-10-13T04:30:00Z');
function recordingCanvas() {
  const texts = [], stack = [];
  const ctx = {
    font: '20px system-ui', textAlign: 'left', textBaseline: 'top',
    measureText(value) { const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 20); return { width: Array.from(value).reduce((n, c) => n + (c.codePointAt(0) > 255 ? 1 : .57) * size, 0) }; },
    fillText(value, x, y) { const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 20); texts.push({ value, x, y, width: this.measureText(value).width, height: size }); },
    save() { stack.push({ font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline }); },
    restore() { Object.assign(this, stack.pop() || {}); },
  };
  for (const method of ['beginPath', 'moveTo', 'arcTo', 'arc', 'closePath', 'fill', 'fillRect', 'stroke', 'clip', 'drawImage']) ctx[method] = () => {};
  return { width: 0, height: 0, texts, getContext: () => ctx };
}
function assertBounds(canvas) {
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1160);
  for (const t of canvas.texts) { assert.ok(t.x >= 0 && t.x + t.width <= canvas.width, `horizontal clipping: ${t.value}`); assert.ok(t.y >= 0 && t.y + t.height <= canvas.height, `vertical clipping: ${t.value}`); }
}

test('brief freezes the selected quote, full precision amount, source dates and reset signal', () => {
  const reset = structuredClone(snapshot), prices = structuredClone(market);
  const info = getIntelCardData(reset, prices, { now, proPlanId: 'pro500' });
  const before = intelCardCaption(info);
  assert.equal(info.focus.kind, 'scheduled'); assert.equal(info.focus.timeLabel, '15:00');
  assert.equal(info.capturedAt, '2026-10-13T04:30:00.000Z');
  assert.deepEqual(info.deals.map(d => d.planId), ['plus', 'pro500']);
  assert.equal(info.deals[0].quote.rmb, getFeaturedDeals(prices)[0].quote.rmb);
  assert.equal(info.deals[0].updatedAt, prices.plans.find(p => p.id === 'plus').updatedAt);
  assert.equal(info.reset.announcedAt, reset.status.scheduled_reset.announced_at);
  reset.status.scheduled_reset.text = 'changed'; prices.fx.rates.CNY *= 2; prices.plans.find(p => p.id === 'plus').quotes[0].amount *= 9;
  assert.equal(intelCardCaption(info), before);
  assert.ok(Object.isFrozen(info) && Object.isFrozen(info.deals) && Object.isFrozen(info.deals[0].quote) && Object.isFrozen(info.focus));
  assert.throws(() => { info.deals[0].quote.rmb = 0; }, TypeError);
  assert.match(before, /预计重置/); assert.match(before, /北京时间/);
  assert.match(before, /https:\/\/x.com\/thsottiaux\/status\//); assert.match(before, /订阅好价/); assert.match(before, /约 ¥/);
});

test('brief represents scheduled, overdue, recent and quiet without a fabricated probability or completed countdown', () => {
  const overdue = getIntelCardData(snapshot, market, { now: Date.parse('2026-10-13T07:01:00Z') });
  assert.equal(overdue.focus.kind, 'overdue'); assert.equal(overdue.focus.countdownValue, '待确认');
  assert.doesNotMatch(intelCardCaption(overdue), /已完成|90%/);
  const recentReset = structuredClone(snapshot); recentReset.status.scheduled_reset = null;
  recentReset.status.latest_reset.announced_at = '2026-10-13T03:00:00Z';
  const recent = getIntelCardData(recentReset, market, { now });
  assert.equal(recent.focus.kind, 'recent'); assert.equal(recent.focus.targetAt, null); assert.equal(recent.focus.timeLabel, '11:00');
  const quiet = getIntelCardData(snapshot, market, { now: Date.parse('2026-10-17T00:00:00Z') });
  assert.equal(quiet.focus.kind, 'quiet'); assert.equal(quiet.focus.targetAt, null);
  for (const info of [recent, quiet]) {
    assert.equal(info.focus.mode, 'confirmed');
    assert.equal(Date.parse(info.focus.confirmedAt), Date.parse(info.reset.announcedAt));
    assert.match(intelCardCaption(info), /最近重置确认/);
    assert.doesNotMatch(intelCardCaption(info), /尚未公布|待公布|暂无新预告/);
  }
  const unknown = structuredClone(snapshot); unknown.status.scheduled_reset.scheduled_for = null;
  assert.equal(getIntelCardData(unknown, market, { now }).focus.timeLabel, '已有预告');
});

test('missing market or FX produces readable partial information rather than zero prices', () => {
  assert.equal(getIntelCardData(null, null), null);
  const noFx = getIntelCardData(snapshot, { ...market, fx: null }, { now });
  assert.ok(noFx.deals.every(d => d.quote === null));
  assert.match(intelCardCaption(noFx), /人民币价格待更新/); assert.doesNotMatch(intelCardCaption(noFx), /¥0\.00/);
  const pricesOnly = getIntelCardData(null, market, { now });
  assert.equal(pricesOnly.focus.kind, 'quiet'); assert.equal(pricesOnly.reset.sourceUrl, '');
  assert.ok(pricesOnly.deals.every(d => d.quote));
  const invalid = getIntelCardData(null, { plans: [{ id: 'plus', name: 'Plus', usd: 20 }] }, { now });
  assert.equal(invalid.deals[0].quote, null);
});

test('compact artwork fits every state and retains independent prices, source and bilingual post', async () => {
  const recent = structuredClone(snapshot); recent.status.scheduled_reset = null; recent.status.latest_reset.announced_at = '2026-10-13T03:00:00Z';
  const cases = [[snapshot, now], [snapshot, Date.parse('2026-10-13T07:01:00Z')], [snapshot, Date.parse('2026-10-17T00:00:00Z')], [recent, now]];
  for (const [reset, at] of cases) {
    const canvas = recordingCanvas(), info = getIntelCardData(reset, market, { now: at });
    await renderIntelCard(canvas, info); assertBounds(canvas);
    const visible = canvas.texts.map(t => t.value).join('\n');
    assert.ok(visible.includes(info.focus.timeLabel)); assert.match(visible, /Tibo/);
    assert.ok(visible.includes(info.reset.english.slice(0, 20))); assert.ok(visible.includes(info.reset.chinese.slice(0, 10)));
    assert.match(visible, /美区常规/); assert.match(visible, /AI ZERO TOKEN/);
  }
});

test('long source text is explicitly excerpted and stays inside fixed artwork even when redrawn later', async () => {
  const reset = structuredClone(snapshot), prices = structuredClone(market);
  reset.status.scheduled_reset.text = 'A long original announcement about reset timing. '.repeat(100);
  reset.status.scheduled_reset.translationZh = '这是非常长的中文译文内容。'.repeat(100);
  prices.plans.forEach(plan => { plan.name = `${plan.name} ${'long title '.repeat(30)}`; plan.quotes.forEach(q => q.region = '非常长的地区名称'.repeat(50)); });
  const info = getIntelCardData(reset, prices, { now });
  assert.ok(info.reset.englishExcerpt && info.reset.chineseExcerpt);
  assert.match(intelCardCaption(info), /English excerpt/);
  const canvas = recordingCanvas();
  const savedClock = Date.now;
  try { Date.now = () => { throw new Error('render must not read current time'); }; await renderIntelCard(canvas, info); } finally { Date.now = savedClock; }
  assertBounds(canvas);
  assert.ok(canvas.texts.some(t => t.value.startsWith('EN EXCERPT')));
  assert.ok(canvas.texts.some(t => t.value.startsWith('摘录')));
});
