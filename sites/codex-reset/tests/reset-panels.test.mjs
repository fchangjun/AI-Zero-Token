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
  assert.match(html, /id="home-reset-target">15:00<\/strong>/);
  assert.match(html, /id="home-reset-countdown">03时00分<\/strong>/);
  assert.match(html, /<details class="reset-compact-source">/);
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
  assert.match(html, /id="home-reset-countdown">待确认<\/strong>/);
  assert.match(html, /最近一次已确认/);
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
