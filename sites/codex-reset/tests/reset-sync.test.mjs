import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchResetUpdate, createResetResumeSync } from '../public/reset-sync.js';
import { getResetFocus } from '../public/reset-focus.js';
import { isResetDataset } from '../public/reset-cache.js';

const record = (id, announced_at = '2026-10-15T06:00:00Z') => ({ id, announced_at, status: 'completed', reset_type: 'regular', text: 'Done and dusted', source: { type: 'x_post', author: 'thsottiaux', url: `https://x.com/thsottiaux/status/${id}` } });
const old = record('2109000000000000001');
const latest = record('2109000000000000002', '2026-10-16T04:00:00Z');
const previous = () => ({ version: 1, generatedAt: '2026-10-15T08:00:00Z', records: [old], historyComplete: true, status: { latest_reset: old, scheduled_reset: null, active_watch: null, stats: { total: 1, avg_interval_days: 1, days_since_last: 1 } } });
const statusResponse = overrides => ({ meta: { generated_at: '2026-10-16T06:00:00Z' }, data: { ...previous().status, latest_reset: latest, ...overrides } });
const page = (records, next = null) => ({ data: records, pagination: { has_more: next !== null, next_cursor: next } });
const watch = { observed_at: '2026-10-16T05:00:00Z', expires_at: '2026-10-17T05:00:00Z', reset_chance_percent: 40, forecast_window: 'within 24h', text: 'A related signal.', source: { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/2109000000000000003' } };
const now = Date.parse('2026-10-16T07:00:00Z');

test('status and history start in parallel under one shared abort signal', async () => {
  const calls = []; let resolveStatus, resolveHistory;
  const pending = fetchResetUpdate((url, { signal }) => {
    calls.push({ url, signal });
    return new Promise(resolve => { if (url.endsWith('/status')) resolveStatus = resolve; else resolveHistory = resolve; });
  }, { previous: previous() });
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal, calls[1].signal);
  assert.ok(calls[0].signal instanceof AbortSignal);
  resolveStatus(statusResponse({ active_watch: watch }));
  resolveHistory(page([latest]));
  const result = await pending;
  assert.equal(getResetFocus(result.data, now).mode, 'watch');
  assert.equal(result.data.historyComplete, false);
});

test('history failures still update current watch, forecast or completion and preserve known records', async () => {
  const scheduled = { ...record('2109000000000000004', '2026-10-16T05:00:00Z'), status: 'scheduled', scheduled_for: '2026-10-16T10:00:00Z', text: 'A reset is coming.' };
  for (const [changes, expected] of [[{ active_watch: watch }, 'watch'], [{ scheduled_reset: scheduled }, 'forecast'], [{}, 'confirmed']]) {
    const before = previous(), original = structuredClone(before);
    const result = await fetchResetUpdate(async url => {
      if (url.endsWith('/status')) return statusResponse(changes);
      throw new Error('History offline');
    }, { previous: before, fullHistory: true });
    assert.ok(isResetDataset(result.data));
    assert.equal(getResetFocus(result.data, now).mode, expected);
    assert.deepEqual(result.data.records.map(item => item.id), [latest.id, old.id]);
    assert.equal(result.data.generatedAt, '2026-10-16T06:00:00Z');
    assert.equal(result.data.status.latest_reset.announced_at, latest.announced_at);
    assert.equal(result.data.historyComplete, false);
    assert.equal(result.data.historyBaseGeneratedAt, before.generatedAt);
    assert.equal(result.historyError, '通告已更新，历史暂不可用');
    assert.deepEqual(before, original);
  }
});

test('invalid history cannot contaminate a valid status update, even without previous data', async () => {
  for (const invalid of [{ data: null }, page([{ ...old, source: { type: 'x_post', author: 'stranger', url: 'https://evil.example/post' } }])]) {
    const { data, historyError } = await fetchResetUpdate(async url => url.endsWith('/status') ? statusResponse({ active_watch: watch }) : invalid);
    assert.equal(getResetFocus(data, now).mode, 'watch');
    assert.deepEqual(data.records, [latest]);
    assert.equal(data.historyComplete, false);
    assert.ok(historyError);
  }
});

test('status failure, invalid status and older responses never manufacture an updated snapshot', async () => {
  const before = previous(), original = structuredClone(before);
  const failures = [new Error('Status offline'), { data: null }, { ...statusResponse(), meta: { generated_at: '2026-10-14T08:00:00Z' } }];
  for (const failure of failures) {
    await assert.rejects(fetchResetUpdate(async url => {
      if (!url.endsWith('/status')) return page([latest]);
      if (failure instanceof Error) throw failure;
      return failure;
    }, { previous: before, fullHistory: true }));
    assert.deepEqual(before, original);
  }
});

test('complete history follows encoded cursors, deduplicates records, and replaces stale history', async () => {
  const stale = record('2109000000000000000', '2026-10-13T06:00:00Z');
  const before = previous(); before.records.push(stale);
  const calls = [], signals = [];
  const { data, historyError } = await fetchResetUpdate(async (url, { signal }) => {
    calls.push(url); signals.push(signal);
    if (url.endsWith('/status')) return statusResponse();
    if (url.includes('cursor=')) return page([latest, old]);
    return page([latest], 'next / cursor');
  }, { previous: before, fullHistory: true, historyLimit: 12 });
  assert.equal(calls.filter(url => url.includes('limit=100')).length, 2);
  assert.ok(calls.some(url => url.includes('cursor=next%20%2F%20cursor')));
  assert.ok(signals.every(signal => signal === signals[0]));
  assert.deepEqual(data.records.map(item => item.id), [latest.id, old.id]);
  assert.equal(data.historyComplete, true);
  assert.equal(data.historyBaseGeneratedAt, undefined);
  assert.equal(historyError, '');
});

test('pagination failure and repeating cursors preserve history while accepting fresh status', async () => {
  for (const fail of ['network', 'cursor', 'invalid']) {
    let pages = 0;
    const { data, historyError } = await fetchResetUpdate(async url => {
      if (url.endsWith('/status')) return statusResponse({ active_watch: watch });
      if (++pages === 1) return page([latest], 'again');
      if (fail === 'network') throw new Error('Page unavailable');
      return fail === 'cursor' ? page([old], 'again') : { data: [old], pagination: null };
    }, { previous: previous(), fullHistory: true });
    assert.equal(pages, 2);
    assert.equal(data.historyComplete, false);
    assert.deepEqual(data.records.map(item => item.id), [latest.id, old.id]);
    assert.equal(getResetFocus(data, now).mode, 'watch');
    assert.ok(historyError);
  }
});

test('homepage reads only its first 12-record page and never marks partial history complete', async () => {
  const calls = [];
  const result = await fetchResetUpdate(async url => {
    calls.push(url);
    return url.endsWith('/status') ? statusResponse() : page([latest], 'more');
  }, { previous: previous(), historyLimit: 12 });
  assert.equal(calls.length, 2);
  assert.ok(calls.some(url => url.includes('limit=12&order=desc')));
  assert.equal(result.data.historyComplete, false);
  assert.equal(result.historyError, '');
  assert.deepEqual(result.data.records.map(item => item.id), [latest.id, old.id]);
});

test('a complete feed missing the new status completion cannot claim verified completeness', async () => {
  const { data, historyError } = await fetchResetUpdate(async url => url.endsWith('/status') ? statusResponse() : page([old]), { previous: previous(), fullHistory: true });
  assert.equal(data.historyComplete, false);
  assert.deepEqual(data.records.map(item => item.id), [latest.id, old.id]);
  assert.equal(historyError, '');
});

test('a matching history post enriches status with Chinese without overwriting its source or time', async () => {
  const translated = { ...latest, translationZh: '已经全部完成。', summaryZh: '重置已完成' };
  const { data } = await fetchResetUpdate(async url => url.endsWith('/status') ? statusResponse() : page([translated, old]), { fullHistory: true });
  assert.equal(data.records[0].translationZh, translated.translationZh);
  assert.equal(data.records[0].summaryZh, translated.summaryZh);
  assert.equal(data.status.latest_reset.translationZh, translated.translationZh);
  assert.equal(data.status.latest_reset.summaryZh, translated.summaryZh);
  assert.equal(data.records[0].announced_at, latest.announced_at);
  assert.deepEqual(data.records[0].source, latest.source);
  const changed = { ...translated, text: 'Different source text' };
  const different = await fetchResetUpdate(async url => url.endsWith('/status') ? statusResponse() : page([changed, old]), { fullHistory: true });
  assert.equal(different.data.records[0].translationZh, undefined);
});

function resumeHarness() {
  let time = 100000, visible = true, calls = 0, id = 0;
  const timers = new Map();
  const state = { busy: false, lastAttemptAt: 0, failed: false, retryAt: 0 };
  const scheduler = createResetResumeSync({
    now: () => time, isVisible: () => visible, getState: () => state,
    setTimer(fn, delay) { timers.set(++id, { fn, at: time + delay }); return id; },
    clearTimer(key) { timers.delete(key); },
    refresh() { calls++; state.busy = true; state.lastAttemptAt = time; },
  });
  return { scheduler, state, timers, get calls() { return calls; }, get time() { return time; },
    visible(value) { visible = value; },
    advance(ms) { time += ms; for (const [key, timer] of [...timers]) if (timer.at <= time) { timers.delete(key); timer.fn(); } },
    finish({ failed = false, cooldown = 30000 } = {}) { state.busy = false; state.failed = failed; state.retryAt = Math.max(state.retryAt, time + cooldown); scheduler.settled(); },
  };
}

test('foreground recovery refreshes stale data once and deduplicates rapid visible/online events', () => {
  const h = resumeHarness();
  h.scheduler.resume(); h.scheduler.resume(); h.scheduler.resume();
  assert.equal(h.calls, 1);
  h.finish();
  h.scheduler.resume(); h.advance(30000); h.scheduler.resume();
  assert.equal(h.calls, 1);
  h.advance(30000); h.scheduler.resume();
  assert.equal(h.calls, 2);
});

test('network recovery after failure waits out ordinary cooldown and retries without another event', () => {
  const h = resumeHarness();
  h.scheduler.resume(); h.finish({ failed: true, cooldown: 60000 });
  h.scheduler.resume(); h.scheduler.resume();
  assert.equal(h.timers.size, 1);
  h.advance(59999); assert.equal(h.calls, 1);
  h.advance(1); assert.equal(h.calls, 2);
});

test('rate-limit backoff survives recovery events and an in-flight attempt', () => {
  const h = resumeHarness();
  h.scheduler.resume(); h.scheduler.resume();
  h.state.retryAt = h.time + 120000;
  h.finish({ failed: true });
  h.scheduler.resume(); h.advance(60000); h.scheduler.resume();
  assert.equal(h.calls, 1);
  assert.equal(h.timers.size, 1);
  h.advance(59999); assert.equal(h.calls, 1);
  h.advance(1); assert.equal(h.calls, 2);
});

test('hidden tabs cancel recovery timers and retry on return; disposal never triggers a request', () => {
  const h = resumeHarness();
  h.scheduler.resume(); h.finish({ failed: true }); h.scheduler.resume();
  h.visible(false); h.scheduler.resume();
  assert.equal(h.timers.size, 0);
  h.advance(60000); assert.equal(h.calls, 1);
  h.visible(true); h.scheduler.resume(); assert.equal(h.calls, 2);
  h.finish({ failed: true }); h.scheduler.resume(); h.scheduler.dispose();
  h.advance(60000); h.scheduler.resume(); assert.equal(h.calls, 2);
});
