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
  const pending = getIntelCardData(snapshot, market, { now: Date.parse('2026-10-17T00:00:00Z') });
  assert.equal(pending.focus.kind, 'overdue');
  assert.equal(pending.focus.priority, false);
  assert.equal(pending.focus.countdownValue, '待确认');
  assert.equal(pending.reset.id, snapshot.status.scheduled_reset.id);
  assert.doesNotMatch(intelCardCaption(pending), /最近重置确认|已完成/);
  const quiet = getIntelCardData(recentReset, market, { now: Date.parse('2026-10-17T00:00:00Z') });
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
  assert.ok(canvas.texts.some(t => t.value.startsWith('中文译文（摘录）')));
});


test('a live landing forecast without Chinese fields uses the same precise local explanation in the card', async () => {
  const reset = structuredClone(snapshot);
  reset.status.scheduled_reset.text = 'Landing within the next 2 hours https://t.co/test123';
  delete reset.status.scheduled_reset.translationZh;
  delete reset.status.scheduled_reset.summaryZh;
  const info = getIntelCardData(reset, market, { now });
  assert.equal(info.reset.chinese, '预计在接下来的 2 小时内到账。');
  assert.equal(info.reset.chineseLabel, '中文释义');
  assert.equal(info.reset.chineseType, 'translation');
  assert.equal(info.reset.english, 'Landing within the next 2 hours');
  assert.match(intelCardCaption(info), /中文释义：预计在接下来的 2 小时内到账/);
  const canvas = recordingCanvas();
  await renderIntelCard(canvas, info); assertBounds(canvas);
  assert.ok(canvas.texts.some(t => t.value.includes('中文释义：预计在接下来的 2 小时内到账')));
  assert.ok(canvas.texts.some(t => t.value.includes('Landing within the next 2 hours')));
});

test('unknown forecast summaries stay labelled as summaries rather than translations', async () => {
  const reset = structuredClone(snapshot);
  reset.status.scheduled_reset.text = 'Landing within the next 2 hours, unless delayed.';
  delete reset.status.scheduled_reset.translationZh;
  delete reset.status.scheduled_reset.summaryZh;
  const info = getIntelCardData(reset, market, { now });
  assert.equal(info.reset.chineseLabel, '中文速读');
  assert.equal(info.reset.chineseType, 'summary');
  assert.match(info.reset.chinese, /具体安排请查看英文原文/);
  assert.doesNotMatch(info.reset.chinese, /2 小时|已完成/);
  assert.match(intelCardCaption(info), /中文速读/);
  const canvas = recordingCanvas(); await renderIntelCard(canvas, info); assertBounds(canvas);
  assert.ok(canvas.texts.some(t => t.value.startsWith('中文速读：')));
});

const watchNow = Date.parse('2026-10-16T05:00:00Z');
function watchDataset() {
  const data = structuredClone(snapshot);
  data.generatedAt = '2026-10-16T04:55:00Z';
  data.status.scheduled_reset = null;
  data.status.latest_reset = {
    id: '2110618732666257557', reset_type: 'regular', announced_at: '2026-10-15T06:28:13.000Z',
    text: 'Done and dusted', source: { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/2110618732666257557' },
  };
  data.status.active_watch = {
    level: 'elevated', reset_chance_percent: 40, forecast_window: 'within 24h',
    observed_at: '2026-10-16T04:30:52.000Z', expires_at: '2026-10-17T05:00:00.000Z',
    text: '@maria_rcks Can’t argue with that, Let’s break the cycle.',
    source: { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/2110951585983631505' },
  };
  return data;
}

test('active watch sharing selects the current signal without turning the observation expiry into a reset deadline', async () => {
  const data = watchDataset(), info = getIntelCardData(data, market, { now: watchNow });
  assert.equal(info.focus.mode, 'watch'); assert.equal(info.focus.kind, 'watch');
  assert.equal(info.focus.priority, true); assert.equal(info.reset.id, '2110951585983631505');
  assert.notEqual(info.reset.id, data.status.latest_reset.id);
  assert.equal(info.focus.targetAt, null); assert.equal(info.focus.confirmedAt, null);
  assert.equal(info.focus.countdownValue, ''); assert.equal(info.focus.countdownLabel, '');
  assert.equal(info.focus.observedAt, data.status.active_watch.observed_at);
  assert.equal(info.focus.expiresAt, data.status.active_watch.expires_at);
  assert.equal(info.focus.watchChance, 40);
  assert.equal(info.reset.chinese, '@maria_rcks 无法反驳，那就让我们打破这个循环吧。');
  const caption = intelCardCaption(info);
  assert.match(caption, /观察信号.*尚无正式预告/);
  assert.match(caption, /发现时间：2026\/10\/16 12:30/);
  assert.match(caption, /2110951585983631505/);
  assert.doesNotMatch(caption, /预计重置|最近重置确认|2026\/10\/17|Done and dusted/);
  const canvas = recordingCanvas(); await renderIntelCard(canvas, info); assertBounds(canvas);
  const visible = canvas.texts.map(t => t.value).join('\n');
  assert.match(visible, /有新迹象/); assert.match(visible, /观察信号 · 尚无正式预告/);
  assert.match(visible, /无法反驳/);
  assert.doesNotMatch(visible, /预计重置|距离参考时点|2026\/10\/17|✓/);
  data.status.active_watch.text = 'Changed later'; data.status.active_watch.reset_chance_percent = 90;
  assert.equal(intelCardCaption(info), caption); assert.equal(info.focus.watchChance, 40);
});

test('unknown watch copy remains a signal and an expired watch returns to the true latest completion', async () => {
  const data = watchDataset(); data.status.active_watch.text = 'Something may happen.';
  const watch = getIntelCardData(data, market, { now: watchNow });
  assert.equal(watch.reset.chineseType, 'summary');
  assert.equal(watch.reset.chinese, '出现新的重置相关信号，尚无正式预告，请查看原文。');
  assert.equal(watch.focus.timeLabel, '有新迹象');
  const expired = getIntelCardData(data, market, { now: Date.parse('2026-10-17T05:00:01Z') });
  assert.equal(expired.focus.mode, 'confirmed');
  assert.equal(expired.reset.id, data.status.latest_reset.id);
  assert.equal(expired.reset.chinese, '已经全部完成。');
  assert.doesNotMatch(intelCardCaption(expired), /有新迹象|Something may happen|2110951585983631505/);
});
