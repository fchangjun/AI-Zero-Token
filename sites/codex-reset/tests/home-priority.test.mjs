import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { renderHome } from '../scripts/prerender-home.mjs';
import { getHomeLayout } from '../public/home-layout.js';
import { getResetFocus } from '../public/reset-focus.js';

const template = await readFile(new URL('../pages/home.html', import.meta.url), 'utf8');
const market = JSON.parse(await readFile(new URL('../public/data/prices.json', import.meta.url), 'utf8'));
const source = { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/12345' };
const completed = { id: 'complete', announced_at: '2026-10-11T04:00:00Z', reset_type: 'regular', source, text: 'All propagated.' };
const scheduled = { id: 'scheduled', status: 'scheduled', announced_at: '2026-10-13T01:00:00Z', scheduled_for: '2026-10-13T07:00:00Z', reset_type: 'regular', source, text: 'Global reset landing by EOD PST time.' };
const snapshot = { generatedAt: '2026-10-13T02:00:00Z', status: { latest_reset: completed, scheduled_reset: scheduled }, records: [completed] };
const order = html => [...html.matchAll(/<section id="(home-(?:prices|resets)-section)"/g)].map(match => match[1]);

test('scheduled reset is first in static HTML with a qualified clock and matching browser layout', () => {
  const now = Date.parse('2026-10-13T04:42:00Z');
  const html = renderHome(template, market, snapshot, now);
  assert.deepEqual(order(html), ['home-resets-section', 'home-prices-section']);
  assert.deepEqual(order(html), getHomeLayout(getResetFocus(snapshot, now)).sectionIds);
  assert.match(html, /<body class="home-page reset-priority reset-forecast">/);
  assert.match(html, /id="home-reset-target"[^>]*>15:00<\/strong>/);
  assert.match(html, /id="home-reset-countdown">02时18分<\/(?:strong|b)>/);
  assert.match(html, /预计重置时间/);
  assert.match(html, /仅供参考/);
  assert.match(html, /原帖仅给出 EOD PST/);
  assert.match(html, /id="home-resets-eyebrow">01 \/ CODEX RESET WATCH/);
  assert.equal((html.match(/data-share-intel/g) || []).length, 1);
  for (const id of ['home-feed', 'home-reset-target', 'home-reset-countdown', 'home-reset-refresh', 'featured-deals']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});

test('reference deadline stays pending while older news returns prices to the top', () => {
  const due = renderHome(template, market, snapshot, Date.parse('2026-10-13T07:00:00Z'));
  assert.match(due, /data-reset-focus="overdue"/);
  assert.match(due, /id="home-reset-countdown">待确认<\/(?:strong|b)>/);
  assert.deepEqual(order(due), ['home-resets-section', 'home-prices-section']);
  const later = Date.parse('2026-10-14T07:00:00Z');
  const quiet = renderHome(template, market, snapshot, later);
  assert.deepEqual(order(quiet), ['home-prices-section', 'home-resets-section']);
  assert.deepEqual(order(quiet), getHomeLayout(getResetFocus(snapshot, later)).sectionIds);
  assert.match(quiet, /<body class="home-page reset-forecast">/);
  assert.match(quiet, /data-reset-focus="overdue"/);
  assert.match(quiet, /id="home-reset-target"[^>]*>15:00<\/strong>/);
  assert.match(quiet, /id="home-reset-countdown">待确认<\/(?:strong|b)>/);
  assert.match(quiet, /data-reset-panel="latest"/);
  assert.match(quiet, /data-reset-panel="next"/);
  assert.match(quiet, /id="home-prices-eyebrow">01 \/ SUBSCRIPTION SHORTLIST/);
  assert.equal((quiet.match(/data-share-intel/g) || []).length, 1);
  assert.doesNotMatch(quiet, /data-share-price|\?share=scheduled/);
});

test('new completion replaces old forecast and never implies another scheduled reset', () => {
  const latest = { ...completed, id: 'new-complete', announced_at: '2026-10-13T05:00:00Z', text: '<script>untrusted source</script> All propagated.' };
  const data = { ...snapshot, generatedAt: '2026-10-13T05:01:00Z', status: { ...snapshot.status, latest_reset: latest }, records: [latest, completed] };
  const html = renderHome(template, market, data, Date.parse('2026-10-13T06:00:00Z'));
  assert.deepEqual(order(html), ['home-resets-section', 'home-prices-section']);
  assert.match(html, /data-reset-focus="recent"/);
  assert.match(html, /data-reset-mode="confirmed"/);
  assert.match(html, /最近一次重置，已确认/);
  assert.doesNotMatch(html, /尚未公布|下一次重置时间|home-reset-countdown/);
  assert.match(html, /id="home-reset-target">13:00<\/strong>/);
  assert.match(html, /2026年10月13日/);
  assert.match(html, /&lt;script&gt;untrusted source&lt;\/script&gt;/);
  assert.doesNotMatch(html, /id="home-reset-target">15:00/);
});

test('reset detail shares forecast and confirmed headings with its server-rendered focus', async () => {
  const { renderResets } = await import('../scripts/prerender.mjs');
  const detail = await readFile(new URL('../pages/resets.html', import.meta.url), 'utf8');
  const future = renderResets(detail, snapshot, Date.parse('2026-10-13T04:42:00Z'));
  assert.match(future, /id="reset-detail-title">下一次重置，<span>有新预告/);
  assert.match(future, /id="home-reset-target"[^>]*>15:00/);
  assert.match(future, /<body class="reset-page reset-forecast">/);
  const quiet = renderResets(detail, { ...snapshot, status: { ...snapshot.status, scheduled_reset: null } }, Date.parse('2026-10-16T04:42:00Z'));
  assert.match(quiet, /id="reset-detail-title">最近一次重置，<span>已确认/);
  assert.match(quiet, /id="home-reset-target">12:00/);
  assert.doesNotMatch(quiet, /尚未公布|下一次重置时间|home-reset-countdown/);
  assert.match(quiet, /data-reset-panel="latest"/);
  assert.match(quiet, /data-reset-panel="next"/);
  assert.match(quiet, /暂无新预告/);
});

test('an active watch leads both static pages without pretending its expiry is an arrival time', async () => {
  const watch = { level: 'elevated', reset_chance_percent: 40, forecast_window: 'within 24h',
    observed_at: '2026-10-13T04:00:00Z', expires_at: '2026-10-14T05:00:00Z',
    text: '@maria_rcks Can’t argue with that, Let’s break the cycle.',
    source: { ...source, url: 'https://x.com/thsottiaux/status/987654321' } };
  const data = { ...snapshot, generatedAt: '2026-10-13T04:01:00Z', status: { ...snapshot.status, scheduled_reset: null, active_watch: watch } };
  const now = Date.parse('2026-10-13T04:42:00Z');
  const home = renderHome(template, market, data, now);
  assert.deepEqual(order(home), ['home-resets-section', 'home-prices-section']);
  assert.match(home, /<body class="home-page reset-priority reset-forecast">/);
  assert.match(home, /data-reset-mode="watch"/);
  assert.match(home, /无法反驳，那就让我们打破这个循环吧/);
  assert.match(home, /非正式预告/);
  assert.doesNotMatch(home, /home-reset-countdown|预计重置时间/);
  const { renderResets } = await import('../scripts/prerender.mjs');
  const detail = renderResets(await readFile(new URL('../pages/resets.html', import.meta.url), 'utf8'), data, now);
  assert.match(detail, /<body class="reset-page reset-forecast">/);
  assert.match(detail, /id="reset-detail-title">下一次重置，<span>有新迹象/);
  assert.match(detail, /data-reset-mode="watch"/);
  const expired = renderHome(template, market, data, Date.parse(watch.expires_at));
  assert.deepEqual(order(expired), ['home-prices-section', 'home-resets-section']);
  assert.match(expired, /<body class="home-page">/);
  assert.doesNotMatch(expired, /data-reset-mode="watch"|home-reset-countdown/);
  assert.match(expired, /最近一次已确认/);
});
