import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getResetFocus } from '../public/reset-focus.js';

const now = Date.parse('2026-10-13T04:42:00.000Z');
const snapshot = JSON.parse(await readFile(new URL('./fixtures/reset-scheduled.json', import.meta.url), 'utf8'));
const record = (at, changes = {}) => ({
  id: 'public-reset', announced_at: at, reset_type: 'regular',
  source: { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/2109812360596865224' },
  ...changes,
});
const makeData = (scheduled, latest = record('2026-10-11T04:01:09.000Z'), records = []) => ({
  status: { latest_reset: latest, scheduled_reset: scheduled }, records,
});
const schedule = changes => record('2026-10-13T01:03:59.000Z', {
  status: 'scheduled', scheduled_for: '2026-10-13T07:00:00.000Z', text: 'Global reset landing by EOD PST time. Enjoy', ...changes,
});

test('a valid future preview leads the page with a Beijing reference time and minute countdown', () => {
  const result = getResetFocus(snapshot, now);
  assert.equal(result.priority, true);
  assert.equal(result.kind, 'scheduled');
  assert.equal(result.record.id, snapshot.status.scheduled_reset.id);
  assert.equal(result.timeLabel, '15:00');
  assert.equal(result.dateLabel, '2026年10月13日 · 北京时间');
  assert.equal(result.countdownValue, '02时18分');
  assert.equal(result.remainingMs, 138 * 60000);
  assert.match(result.timeCaption, /预计最晚.*参考时点/);
  assert.match(result.note, /EOD.*数据源换算.*并非精确到账承诺/);
});

test('countdown rounds upward and never announces completion at the reference time', () => {
  const data = makeData(schedule());
  assert.equal(getResetFocus(data, Date.parse('2026-10-13T06:59:59Z')).countdownValue, '00时01分');
  for (const at of ['2026-10-13T07:00:00Z', '2026-10-14T06:59:59Z']) {
    const result = getResetFocus(data, Date.parse(at));
    assert.equal(result.priority, true);
    assert.equal(result.kind, 'overdue');
    assert.equal(result.remainingMs, 0);
    assert.equal(result.countdownValue, '待确认');
    assert.match(result.note, /尚未收录完成确认/);
  }
  assert.equal(getResetFocus(data, Date.parse('2026-10-14T07:00:00Z')).priority, false);
});

test('a fresh preview without a time is prominent but cannot invent a countdown', () => {
  const data = makeData(schedule({ scheduled_for: null }));
  const result = getResetFocus(data, now);
  assert.equal(result.priority, true);
  assert.equal(result.kind, 'scheduled');
  assert.equal(result.targetAt, null);
  assert.equal(result.remainingMs, null);
  assert.equal(result.timeLabel, '已有预告');
  assert.equal(result.countdownValue, '');
  assert.match(result.dateLabel, /预告发布：2026年10月13日 09:03/);
  assert.equal(getResetFocus(data, Date.parse('2026-10-14T01:03:59Z')).priority, false);
});

test('a newer completed reset from either status or history supersedes a pending preview', () => {
  const latest = record('2026-10-13T04:00:00.000Z', { id: 'new-completed' });
  for (const data of [makeData(schedule(), latest), makeData(schedule(), undefined, [latest])]) {
    const result = getResetFocus(data, now);
    assert.equal(result.kind, 'recent');
    assert.equal(result.record.id, 'new-completed');
    assert.equal(result.targetAt, null);
    assert.equal(result.timeLabel, '12:00');
    assert.equal(result.mode, 'confirmed');
    assert.equal(result.confirmedAt, latest.announced_at);
  }
  const sameTime = makeData(schedule(), record('2026-10-13T01:03:59.000Z'));
  assert.equal(getResetFocus(sameTime, now).kind, 'recent');
});

test('recent public notices lead for 24 hours while observations and older notices do not', () => {
  const latest = record('2026-10-13T03:00:00.000Z');
  const data = makeData(null, latest);
  const result = getResetFocus(data, now);
  assert.equal(result.priority, true);
  assert.equal(result.kind, 'recent');
  assert.equal(result.timeLabel, '11:00');
  assert.equal(result.dateLabel, '2026年10月13日 · 北京时间');
  const old = getResetFocus(data, Date.parse('2026-10-16T03:00:00Z'));
  assert.equal(old.priority, false);
  assert.equal(old.mode, 'confirmed');
  assert.equal(old.timeLabel, '11:00');
  assert.equal(old.record.id, latest.id);
  assert.equal(old.badge, '✓ 已确认');
  assert.equal(getResetFocus(data, Date.parse('2026-10-14T03:00:00Z')).kind, 'quiet');
  assert.equal(getResetFocus(makeData(null, { ...latest, source: { type: 'observed' } }), now).priority, false);
  assert.equal(getResetFocus(makeData(null, undefined, [latest]), now).kind, 'recent');
});

test('malformed or future dates cannot create urgency, with five minutes allowed for clock skew', () => {
  for (const at of ['bad-date', '2026-10-13T04:47:01Z', '2026-02-30T01:00:00Z', '2026-10-13T04:40:00']) {
    assert.equal(getResetFocus(makeData(schedule({ announced_at: at })), now).priority, false, at);
    assert.equal(getResetFocus(makeData(null, record(at)), now).priority, false, at);
  }
  assert.equal(getResetFocus(makeData(schedule({ announced_at: '2026-10-13T04:47:00Z' })), now).priority, true);
  assert.equal(getResetFocus(makeData(schedule({ scheduled_for: 'invalid' })), now).priority, false);
  assert.equal(getResetFocus({ ...snapshot, generatedAt: '2027-01-01T00:00:00Z' }, now).priority, false);
  assert.equal(getResetFocus({ ...snapshot, generatedAt: 'invalid' }, now).priority, false);
  assert.equal(getResetFocus(snapshot, NaN).priority, false);
});

test('future completed records do not suppress a valid preview and cancelled previews stay quiet', () => {
  const data = makeData(schedule(), record('2026-10-14T01:00:00Z'));
  assert.equal(getResetFocus(data, now).kind, 'scheduled');
  assert.equal(getResetFocus(makeData(schedule({ status: 'cancelled' })), now).priority, false);
});

test('empty input is quiet, output stays plain text, and input is not mutated', () => {
  for (const data of [null, undefined, {}, { records: null }]) {
    const result = getResetFocus(data, now);
    assert.equal(result.priority, false);
    assert.equal(result.kind, 'quiet');
    assert.equal(result.targetAt, null);
  }
  const original = structuredClone(snapshot);
  const result = getResetFocus(snapshot, now);
  assert.deepEqual(snapshot, original);
  for (const key of ['badge', 'title', 'timeCaption', 'timeLabel', 'dateLabel', 'countdownLabel', 'countdownValue', 'note']) {
    assert.equal(typeof result[key], 'string');
    assert.doesNotMatch(result[key], /<[^>]+>/);
  }
});

test('a genuinely newer preview takes over the last confirmed reset, then its confirmation wins', () => {
  const latest = record('2026-10-13T04:00:00Z', { id: 'confirmed' });
  const upcoming = schedule({ id: 'next', announced_at: '2026-10-13T04:10:00Z' });
  const data = makeData(upcoming, latest);
  assert.equal(getResetFocus(data, now).record.id, 'next');
  assert.equal(getResetFocus(data, now).mode, 'forecast');
  data.records = [record('2026-10-13T04:20:00Z', { id: 'done', status: 'confirmed' })];
  const done = getResetFocus(data, now);
  assert.equal(done.mode, 'confirmed');
  assert.equal(done.record.id, 'done');
  assert.equal(done.timeLabel, '12:20');
  assert.equal(done.countdownValue, '');
});

test('observation-only data and missing data cannot claim a confirmed public reset', () => {
  const observed = record('2026-10-13T03:00:00Z', { source: { type: 'observed', url: 'https://codex-resets.com/' } });
  const focus = getResetFocus(makeData(null, observed), now);
  assert.equal(focus.mode, 'observed');
  assert.equal(focus.confirmedAt, null);
  assert.equal(focus.timeLabel, '11:00');
  assert.doesNotMatch(focus.badge, /已确认/);
  const empty = getResetFocus(null, now);
  assert.equal(empty.mode, 'empty');
  assert.equal(empty.record, null);
  assert.equal(empty.timeLabel, '暂无记录');
});
