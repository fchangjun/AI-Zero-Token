import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isResetDataset } from '../public/reset-cache.js';
import { getResetCopy } from '../public/reset-copy.js';
import { getResetFocus } from '../public/reset-focus.js';
import { fetchResetUpdate } from '../public/reset-sync.js';
import { getIntelCardData, intelCardCaption } from '../public/intel-card.js';
import { renderHomeResets } from '../public/home-render.js';
import { renderResets } from '../scripts/prerender.mjs';
import { CENTRAL_RESET_SNAPSHOT, sameResetPost, getRecordTranslation, enrichResetTranslations,
  mergePublishedResetData, publishedSnapshotUrls, loadPublishedResetSnapshots } from '../public/reset-translations.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/reset-scheduled.json', import.meta.url), 'utf8'));
const resetPage = await readFile(new URL('../pages/resets.html', import.meta.url), 'utf8');
const now = Date.parse('2026-10-13T04:30:00Z');
function base() {
  const data = structuredClone(fixture);
  data.capturedAt = data.generatedAt;
  for (const record of [...data.records, data.status.latest_reset, data.status.scheduled_reset]) {
    delete record.translationZh; delete record.translationMeta; delete record.summaryZh;
  }
  return data;
}
const machine = (record, text = '全局重置将于今天结束前生效。', translatedAt = '2026-10-13T04:20:00Z') => ({
  ...record, translationZh: text,
  translationMeta: { provider: 'opus-mt-en-zh', modelRevision: 'fixed-model-revision', translatedAt, sourceText: record.text },
});
function watchData() {
  const data = base(); data.status.scheduled_reset = null;
  data.status.active_watch = {
    level: 'elevated', observed_at: '2026-10-13T04:00:00Z', expires_at: '2026-10-14T04:00:00Z',
    reset_chance_percent: 40, forecast_window: 'within 24h', text: '@someone Let us try something new.',
    source: { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/2110000000000000001' },
  };
  return data;
}

test('older published copy enriches a newer live status without restoring a canceled forecast', () => {
  const published = base();
  published.status.scheduled_reset = machine({ ...published.status.scheduled_reset, summaryZh: '等待即将到来的重置。' });
  const live = base(); live.generatedAt = '2026-10-13T04:25:00Z';
  live.status.scheduled_reset.status = 'canceled';
  const before = structuredClone(live);
  const result = mergePublishedResetData(live, [published]);
  assert.equal(result.generatedAt, live.generatedAt);
  assert.equal(result.status.scheduled_reset.status, 'canceled');
  assert.equal(result.status.scheduled_reset.translationZh, published.status.scheduled_reset.translationZh);
  assert.deepEqual(result.status.scheduled_reset.translationMeta, published.status.scheduled_reset.translationMeta);
  assert.equal(result.status.scheduled_reset.summaryZh, undefined, 'a forecast summary must not describe the canceled state');
  assert.equal(getResetFocus(result, now).next.kind, 'unannounced');
  assert.deepEqual(live, before, 'enrichment does not mutate browser state or donors');
});

test('translation identity uses the entire raw original and precise post source', () => {
  const record = base().status.scheduled_reset;
  assert.equal(sameResetPost(record, { ...record, status: 'completed', reset_type: 'banked' }), true);
  assert.equal(sameResetPost(record, { ...record, id: undefined }), true, 'watches can lack a top-level ID');
  for (const changed of [
    { ...record, id: 'different' }, { ...record, text: `${record.text} ` },
    { ...record, text: record.text.toLowerCase() }, { ...record, text: `${record.text} It may be delayed.` },
    { ...record, source: { ...record.source, type: 'observed' } },
    { ...record, source: { ...record.source, author: 'another-author' } },
    { ...record, source: { ...record.source, url: `${record.source.url}?different-source` } },
  ]) assert.equal(sameResetPost(record, changed), false);
  const published = base(); published.status.scheduled_reset = machine(published.status.scheduled_reset);
  const revised = base(); revised.status.scheduled_reset.text += ' This applies only to a test.';
  assert.equal(enrichResetTranslations(revised, [published]).status.scheduled_reset.translationZh, undefined);
});

test('human translations outrank automated copy and explicit repository corrections can prefer donors', () => {
  const live = base(), published = base();
  live.status.scheduled_reset = machine(live.status.scheduled_reset);
  published.status.scheduled_reset.translationZh = '人工核对的完整译文。';
  const human = enrichResetTranslations(live, [published]).status.scheduled_reset;
  assert.equal(human.translationZh, published.status.scheduled_reset.translationZh);
  assert.equal(human.translationMeta, undefined);
  assert.equal(getResetCopy(human).label, '中文译文');
  live.status.scheduled_reset = { ...human, translationZh: '已有人工译文。' };
  assert.equal(enrichResetTranslations(live, [published]).status.scheduled_reset.translationZh, '已有人工译文。');
  assert.equal(enrichResetTranslations(live, [published], { preferDonors: true }).status.scheduled_reset.translationZh, '人工核对的完整译文。');
  published.status.scheduled_reset = machine(published.status.scheduled_reset, '较新的机器译文。', '2026-10-13T04:29:00Z');
  assert.equal(enrichResetTranslations(live, [published], { preferDonors: true }).status.scheduled_reset.translationZh, '已有人工译文。');
});

test('machine translations require exact original provenance and never relabel a summary as translation', () => {
  const record = machine({ ...base().status.scheduled_reset, summaryZh: '预告速读内容。' });
  assert.equal(getRecordTranslation(record).automatic, true);
  assert.equal(getResetCopy(record).label, '自动中文译文');
  for (const meta of [
    { ...record.translationMeta, sourceText: `${record.text} ` },
    { ...record.translationMeta, translatedAt: 'invalid' },
    { ...record.translationMeta, modelRevision: '' },
    { ...record.translationMeta, provider: 'unrecognized' }, {}, 'invalid', null,
  ]) {
    const invalid = { ...record, translationMeta: meta };
    assert.equal(getRecordTranslation(invalid), null);
    assert.deepEqual(getResetCopy(invalid), { english: record.text, chinese: record.summaryZh, label: '中文速读', type: 'summary' });
  }
  assert.equal(getRecordTranslation({ ...record, translationZh: ' ' }), null);
  assert.equal(getRecordTranslation({ text: record.text, summaryZh: '中文摘要。' }), null);
});

test('newer machine metadata can repair an older machine translation with unchanged API dates', () => {
  const live = base(), published = base();
  live.status.scheduled_reset = machine(live.status.scheduled_reset, '旧机器译文。', '2026-10-13T04:10:00Z');
  published.status.scheduled_reset = machine(published.status.scheduled_reset, '新机器译文。');
  const result = mergePublishedResetData(live, [published]);
  assert.equal(result.status.scheduled_reset.translationZh, '新机器译文。');
  assert.equal(result.generatedAt, live.generatedAt);
  assert.equal(result.status.scheduled_reset.translationMeta.translatedAt, '2026-10-13T04:20:00Z');
});

test('watch, history, homepage and share retain translation provenance and original text', () => {
  const live = watchData(), published = watchData();
  published.status.active_watch = machine(published.status.active_watch, '@someone 让我们尝试一些新东西。');
  published.status.latest_reset = machine(published.status.latest_reset, '已经全部生效。');
  published.records[0] = machine(published.records[0], '已经全部生效。');
  const result = mergePublishedResetData(live, [published]);
  assert.equal(isResetDataset(result), true);
  assert.equal(result.records[0].translationZh, '已经全部生效。');
  assert.equal(result.status.latest_reset.translationZh, '已经全部生效。');
  assert.equal(getResetCopy(result.records[0]).label, '自动中文译文');
  assert.equal(getResetCopy(result.status.latest_reset).label, '自动中文译文');
  const focus = getResetFocus(result, now);
  assert.equal(focus.mode, 'watch');
  assert.deepEqual(focus.record.translationMeta, published.status.active_watch.translationMeta);
  assert.equal(getResetCopy(focus.record).label, '自动中文译文');
  const info = getIntelCardData(result, null, { now });
  assert.equal(info.reset.chineseLabel, '自动中文译文');
  assert.equal(info.reset.chineseType, 'translation');
  assert.equal(info.reset.english, live.status.active_watch.text);
  const frozenCaption = intelCardCaption(info);
  assert.match(frozenCaption, /自动中文译文/);
  assert.match(renderHomeResets(result, now), /自动中文译文/);
  result.status.active_watch.translationZh = '后续修订。';
  assert.equal(intelCardCaption(info), frozenCaption, 'an open share remains a frozen capture');
});

test('API/history deduplication and partial cache merges retain good and bad machine provenance', async () => {
  const live = base(); live.status.scheduled_reset = null;
  const translated = machine(live.records[0], '已经全部生效。');
  const { data } = await fetchResetUpdate(async url => url.endsWith('/status')
    ? { meta: { generated_at: live.generatedAt }, data: live.status }
    : { data: [translated, live.records[1]], pagination: { has_more: false } }, { fullHistory: true });
  assert.deepEqual(data.status.latest_reset.translationMeta, translated.translationMeta);
  assert.equal(getResetCopy(data.status.latest_reset).label, '自动中文译文');
  const bad = base(); bad.status.scheduled_reset = null;
  bad.records[0] = { ...translated, translationMeta: { ...translated.translationMeta, sourceText: 'A different original.' } };
  const merged = mergePublishedResetData(live, [bad]);
  assert.deepEqual(merged.records[0].translationMeta, bad.records[0].translationMeta);
  assert.equal(getResetCopy(merged.records[0]).type, 'summary', 'invalid machine copy must not lose metadata and become human copy');
});

test('watch normalization preserves explicit null metadata as invalid rather than making it human copy', () => {
  const data = watchData();
  data.status.active_watch.translationZh = '不应冒充人工核验的译文。';
  data.status.active_watch.translationMeta = null;
  const record = getResetFocus(data, now).record;
  assert.equal(Object.hasOwn(record, 'translationMeta'), true);
  assert.equal(record.translationMeta, null);
  assert.equal(getRecordTranslation(record), null);
  assert.equal(getResetCopy(record, { mode: 'watch' }).type, 'summary');
});

test('status/history deduplication reuses a full translation across states but never a state summary', async () => {
  const live = base(); live.status.scheduled_reset = null;
  live.status.latest_reset.status = 'confirmed';
  const previousState = machine({ ...live.records[0], status: 'scheduled', summaryZh: '等待预告中的重置。' }, '把这次重置装进袋子。');
  const { data } = await fetchResetUpdate(async url => url.endsWith('/status')
    ? { meta: { generated_at: live.generatedAt }, data: live.status }
    : { data: [previousState, live.records[1]], pagination: { has_more: false } }, { fullHistory: true });
  assert.equal(data.status.latest_reset.status, 'confirmed');
  assert.equal(data.status.latest_reset.summaryZh, undefined);
  assert.equal(data.status.latest_reset.translationZh, previousState.translationZh);
  assert.deepEqual(data.status.latest_reset.translationMeta, previousState.translationMeta);
});

test('portable bundles read local and central JSON while the central deployment deduplicates itself', () => {
  const urls = publishedSnapshotUrls({ assetBase: 'https://assets.example/app/154/home.js', now });
  assert.deepEqual(urls.map(value => { const url = new URL(value); url.search = ''; return url.href; }), [
    'https://assets.example/app/154/snapshot.json', CENTRAL_RESET_SNAPSHOT,
  ]);
  assert.ok(urls.every(url => new URL(url).searchParams.get('_snapshot') === String(Math.floor(now / 300000))));
  assert.equal(publishedSnapshotUrls({ assetBase: 'https://fchangjun.github.io/AI-Zero-Token/app.js', now }).length, 1);
});

test('an already-open copied bundle checks newly published Chinese on its next synchronization', async () => {
  const local = base(), central = base();
  let deployed = central;
  let checks = 0;
  const request = async (url, options) => {
    assert.equal(options.cache, 'no-store'); assert.ok(options.signal instanceof AbortSignal);
    checks++;
    return structuredClone(new URL(url).hostname === 'assets.example' ? local : deployed);
  };
  let displayed = base(); displayed.generatedAt = '2026-10-13T04:25:00Z';
  displayed.status.scheduled_reset.status = 'canceled';
  const read = time => loadPublishedResetSnapshots({ request, assetBase: 'https://assets.example/app/home.js', now: time });
  displayed = mergePublishedResetData(displayed, await read(now));
  assert.equal(displayed.status.scheduled_reset.translationZh, undefined);
  deployed = structuredClone(central);
  deployed.status.scheduled_reset = machine(deployed.status.scheduled_reset);
  displayed = mergePublishedResetData(displayed, await read(now + 300000));
  assert.equal(checks, 4, 'published JSON is reread even when an embedded snapshot exists');
  assert.equal(displayed.status.scheduled_reset.translationZh, deployed.status.scheduled_reset.translationZh);
  assert.equal(displayed.status.scheduled_reset.status, 'canceled');
  assert.equal(displayed.generatedAt, '2026-10-13T04:25:00Z');
});

test('failed or invalid static responses preserve a good newer browser dataset', async () => {
  const current = watchData(); current.status.active_watch = machine(current.status.active_watch);
  const before = structuredClone(current);
  const failed = await loadPublishedResetSnapshots({ assetBase: 'https://assets.example/app.js', now,
    request: async url => { if (new URL(url).hostname === 'assets.example') throw new Error('offline'); return { status: 'invalid' }; } });
  assert.deepEqual(failed, []);
  assert.deepEqual(mergePublishedResetData(current, failed), before);
  const partial = await loadPublishedResetSnapshots({ assetBase: 'https://assets.example/app.js', now,
    request: async url => { if (new URL(url).hostname === 'assets.example') throw new Error('offline'); return current; } });
  assert.equal(partial.length, 1, 'one unavailable origin does not suppress the valid other origin');
  assert.deepEqual(current, before);
});

test('static/API completion order yields the same newest state and translated copy', () => {
  const published = base(); published.status.scheduled_reset = machine(published.status.scheduled_reset);
  const live = base(); live.generatedAt = '2026-10-13T04:25:00Z'; live.status.scheduled_reset.status = 'canceled';
  const staticFirst = mergePublishedResetData(mergePublishedResetData(base(), [published]), [live]);
  const liveFirst = mergePublishedResetData(mergePublishedResetData(base(), [live]), [published]);
  for (const result of [staticFirst, liveFirst]) {
    assert.equal(result.generatedAt, live.generatedAt);
    assert.equal(result.status.scheduled_reset.status, 'canceled');
    assert.equal(result.status.scheduled_reset.translationZh, published.status.scheduled_reset.translationZh);
  }
});

test('SSR history uses translated original instead of replacing it with a state summary', () => {
  const data = base(); data.status.scheduled_reset = null;
  data.records[0] = machine({ ...data.records[0], summaryZh: '这只是一个状态摘要。' }, '把重置装进袋子，现已全部生效。');
  const html = renderResets(resetPage, data, now);
  assert.match(html, /<h3>把重置装进袋子，现已全部生效。<\/h3>/);
  assert.doesNotMatch(html, /<h3>这只是一个状态摘要。<\/h3>/);
  assert.match(html, /Put the reset in the bag/);
});
