import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHomeResets } from '../public/home-render.js';

const source = id => ({ type: 'x_post', author: 'thsottiaux', url: `https://x.com/thsottiaux/status/${id}` });
const completed = { id: '111', reset_type: 'regular', announced_at: '2026-10-13T05:00:00Z', source: source('111'), text: 'The reset is done.', translationZh: '本次重置已完成。' };
const scheduled = { id: '222', status: 'scheduled', reset_type: 'regular', announced_at: '2026-10-14T01:00:00Z', scheduled_for: '2026-10-14T07:00:00Z', source: source('222'), text: 'Next reset by EOD PST.', translationZh: '下一次重置将在 PST 日终前进行。' };
const dataset = (latest = completed, next = null) => ({ generatedAt: '2026-10-14T01:01:00Z', status: { latest_reset: latest, scheduled_reset: next }, records: latest ? [latest] : [] });
const now = Date.parse('2026-10-14T04:00:00Z');
const panels = html => [...html.matchAll(/data-reset-panel="([^"]+)"/g)].map(match => match[1]);
const assertUniqueHooks = html => {
  assert.equal((html.match(/id="home-reset-target"/g) || []).length, 1);
  assert.ok((html.match(/id="home-reset-countdown"/g) || []).length <= 1);
  assert.equal((html.match(/href="\.\/resets\/index\.html"/g) || []).length, 1);
};

test('a confirmed reset stays prominent alongside an independent empty next-forecast panel', () => {
  const html = renderHomeResets(dataset(), now);
  assert.deepEqual(panels(html), ['latest', 'next']);
  assert.match(html, /最近一次已确认/);
  assert.match(html, /公开确认时间/);
  assert.match(html, /id="home-reset-target">13:00<\/strong>/);
  assert.match(html, /reset-next-quiet/);
  assert.match(html, /暂无新预告/);
  assert.match(html, /The reset is done\./);
  assert.match(html, /本次重置已完成。/);
  assert.match(html, /tibo-avatar\.jpg/);
  assert.doesNotMatch(html, /尚未公布|home-reset-countdown|NEXT RESET SIGNAL/);
  assertUniqueHooks(html);
});

test('a forecast leads while the last confirmation remains separately readable with its own source', () => {
  const html = renderHomeResets(dataset(completed, scheduled), now);
  assert.deepEqual(panels(html), ['next', 'latest']);
  assert.match(html, /id="home-reset-target"[^>]*>15:00<\/strong>/);
  assert.match(html, /id="home-reset-countdown">03时00分<\/(?:strong|b)>/);
  assert.match(html, /class="reset-latest-feature"/);
  assert.doesNotMatch(html, /<details/);
  assert.match(html, /本次重置已完成。/);
  assert.match(html, /The reset is done\./);
  assert.match(html, /Next reset by EOD PST\./);
  assert.match(html, /https:\/\/x\.com\/thsottiaux\/status\/111/);
  assert.match(html, /https:\/\/x\.com\/thsottiaux\/status\/222/);
  assertUniqueHooks(html);
});

test('an elapsed forecast is awaiting confirmation instead of disappearing or completing itself', () => {
  const html = renderHomeResets(dataset(completed, scheduled), Date.parse('2026-10-16T07:00:00Z'));
  assert.deepEqual(panels(html), ['next', 'latest']);
  assert.match(html, /data-reset-focus="overdue"/);
  assert.match(html, /id="home-reset-countdown">待确认<\/(?:strong|b)>/);
  assert.match(html, /最近一次已确认/);
  assertUniqueHooks(html);
});

test('a new English-only two-hour forecast has Chinese in the visible source card', () => {
  const next = { ...scheduled, text: 'Landing within the next 2 hours', translationZh: undefined };
  const html = renderHomeResets(dataset(completed, next), now);
  assert.match(html, /中文释义/);
  assert.match(html, /预计在接下来的 2 小时内到账。/);
  assert.match(html, /Landing within the next 2 hours/);
  assert.doesNotMatch(html, /<details/);
  assertUniqueHooks(html);
});

test('a newer completion clears the forecast panel without hiding the future-reset state', () => {
  const done = { ...completed, id: '333', announced_at: '2026-10-14T03:00:00Z', source: source('333'), text: 'All done. <script>unsafe</script>' };
  const html = renderHomeResets(dataset(done, scheduled), now);
  assert.deepEqual(panels(html), ['latest', 'next']);
  assert.match(html, /id="home-reset-target">11:00<\/strong>/);
  assert.match(html, /暂无新预告/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|Next reset by EOD PST|home-reset-countdown/);
  assertUniqueHooks(html);
});

test('observed data is not mislabeled as a public confirmation', () => {
  const observed = { ...completed, source: { type: 'observed', url: 'https://codex-resets.com' }, text: 'Observed reset.' };
  const html = renderHomeResets(dataset(observed), now);
  assert.deepEqual(panels(html), ['latest', 'next']);
  assert.match(html, /最近一次观测/);
  assert.doesNotMatch(html, /最近一次已确认|Tibo 的头像/);
  assertUniqueHooks(html);
});

const activeWatch = {
  level: 'elevated', reset_chance_percent: 40, forecast_window: 'within 24h',
  observed_at: '2026-10-16T04:30:52.000Z', expires_at: '2026-10-17T05:00:00.000Z',
  text: '@maria_rcks Can’t argue with that, Let’s break the cycle.',
  source: source('2110951585983631505'),
};
const watchData = overrides => ({
  generatedAt: '2026-10-16T05:54:42.880Z',
  status: { latest_reset: completed, scheduled_reset: null, active_watch: { ...activeWatch, ...overrides } },
  records: [completed],
});
const watchNow = Date.parse('2026-10-16T06:00:00Z');

test('an active watch leads with attributed probability and both source posts, never a scheduled deadline', () => {
  const html = renderHomeResets(watchData(), watchNow);
  assert.deepEqual(panels(html), ['next', 'latest']);
  assert.match(html, /class="reset-panels has-forecast has-watch"/);
  assert.match(html, /data-reset-mode="watch"/);
  assert.match(html, /id="home-reset-target"[^>]*>40%<\/strong>/);
  assert.match(html, /来源站概率估算/);
  assert.match(html, /来源观察窗口 · 24 小时/);
  assert.match(html, /发现于 2026\/10\/16 12:30 · 北京时间/);
  assert.match(html, /发现新信号，尚无正式预告/);
  assert.match(html, /观察有效至/);
  assert.match(html, /2026年10月17日 13:00 · 北京时间/);
  assert.match(html, /观察截止不代表预计到账时间/);
  assert.match(html, /@maria_rcks 无法反驳，那就让我们打破这个循环吧。/);
  assert.match(html, /@maria_rcks Can’t argue with that, Let’s break the cycle\./);
  assert.match(html, /https:\/\/x\.com\/thsottiaux\/status\/2110951585983631505/);
  assert.match(html, /The reset is done\./);
  assert.equal((html.match(/alt="Tibo 的头像"/g) || []).length, 2);
  assert.doesNotMatch(html, /home-reset-countdown|预计重置时间|Tibo 已公开预告|已有新预告，重置尚未确认/);
  assertUniqueHooks(html);
});

test('watch signals without a usable estimate use a qualitative status without inventing a probability', () => {
  const html = renderHomeResets(watchData({ reset_chance_percent: null }), watchNow);
  assert.match(html, /id="home-reset-target"[^>]*>有迹象<\/strong>/);
  assert.match(html, /发现重置相关动态/);
  assert.doesNotMatch(html, /来源站概率估算|40%|NaN|home-reset-countdown/);
  assertUniqueHooks(html);
});

test('an expired watch returns to the visible no-announcement card without claiming completion', () => {
  const html = renderHomeResets(watchData(), Date.parse('2026-10-17T05:00:00Z'));
  assert.deepEqual(panels(html), ['latest', 'next']);
  assert.match(html, /暂无新预告/);
  assert.doesNotMatch(html, /data-reset-mode="watch"|40%|home-reset-countdown/);
  assertUniqueHooks(html);
});

test('a valid formal forecast retains the scheduled presentation when a watch is also present', () => {
  const data = watchData();
  data.status.scheduled_reset = { ...scheduled, announced_at: '2026-10-16T05:00:00Z', scheduled_for: '2026-10-16T08:00:00Z' };
  const html = renderHomeResets(data, watchNow);
  assert.match(html, /data-reset-mode="forecast"/);
  assert.match(html, /id="home-reset-target"[^>]*>16:00<\/strong>/);
  assert.match(html, /id="home-reset-countdown">02时00分<\/(?:strong|b)>/);
  assert.doesNotMatch(html, /data-reset-mode="watch"|40%|观察有效至/);
  assertUniqueHooks(html);
});
