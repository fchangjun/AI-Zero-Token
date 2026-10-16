import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { isResetDataset } from '../public/reset-cache.js';
import { updateResetSnapshot, updateResetSnapshotFile, writeResetSnapshot, isUsableChineseTranslation } from '../scripts/update-reset-snapshot.mjs';

const NOW = Date.parse('2026-10-16T09:00:00Z');
const record = (digit, extra = {}) => ({
  id: `21100000000000000${digit}`, reset_type: 'regular', status: 'completed',
  announced_at: '2026-10-15T08:00:00Z', text: `A complete reset message number ${digit}.`,
  source: { type: 'x_post', author: 'thsottiaux', url: `https://x.com/thsottiaux/status/21100000000000000${digit}` }, ...extra,
});
const old = record('01', { translationZh: '原有人工译文。', summaryZh: '已确认重置。' });
const fresh = record('02');
const base = () => ({ version: 1, capturedAt: '2026-10-15T09:00:00Z', generatedAt: '2026-10-15T08:30:00Z', historyGeneratedAt: '2026-10-15T08:20:00Z', historyComplete: true,
  status: { latest_reset: structuredClone(old), scheduled_reset: null, active_watch: null, stats: { total: 1, avg_interval_days: 1, days_since_last: 1 } }, records: [structuredClone(old)] });
const response = (changes = {}) => ({ meta: { generated_at: '2026-10-16T08:00:00Z' }, data: { ...base().status, latest_reset: fresh, ...changes } });
const page = (records, next = null) => ({ meta: { generated_at: '2026-10-16T07:50:00Z' }, data: records, pagination: { has_more: next !== null, next_cursor: next } });
const requester = ({ changes, records = [fresh, old], historyError = false, statusError = false, status = response(changes) } = {}) => async url => {
  if (url.endsWith('/status')) { if (statusError) throw new Error('Offline'); return structuredClone(status); }
  if (historyError) throw new Error('History offline');
  return structuredClone(page(records));
};
const translator = (operation = async () => '这是自动中文译文。') => Object.assign(operation, { info: { provider: 'opus-mt-en-zh', modelRevision: 'a'.repeat(40) } });
const run = options => updateResetSnapshot({ previous: base(), request: requester(), translate: translator(), now: () => NOW, ...options });
const watch = { observed_at: '2026-10-16T07:00:00Z', expires_at: '2026-10-17T07:00:00Z', text: 'An emerging reset signal.', source: record('03').source };

test('valid collection preserves upstream clocks and records a separate real capture/translation time', async () => {
  const previous = base(), original = structuredClone(previous);
  const result = await run({ previous });
  assert.ok(isResetDataset(result.data));
  assert.equal(result.data.generatedAt, '2026-10-16T08:00:00Z');
  assert.equal(result.data.historyGeneratedAt, '2026-10-16T07:50:00Z');
  assert.equal(result.data.capturedAt, new Date(NOW).toISOString());
  assert.equal(result.data.status.latest_reset.announced_at, fresh.announced_at);
  assert.equal(result.data.historyComplete, true);
  assert.equal(result.data.source.statusUrl, 'https://codex-resets.com/api/v1/status');
  assert.equal(result.data.records[1].translationZh, old.translationZh);
  assert.deepEqual(previous, original);
});

test('history failure accepts new status and keeps the real previous history date and translated records', async () => {
  const result = await run({ request: requester({ changes: { active_watch: watch }, historyError: true }) });
  assert.equal(result.data.status.active_watch.text, watch.text);
  assert.equal(result.data.status.latest_reset.id, fresh.id);
  assert.equal(result.data.historyComplete, false);
  assert.equal(result.data.historyBaseGeneratedAt, base().generatedAt);
  assert.equal(result.data.historyGeneratedAt, base().historyGeneratedAt);
  assert.equal(result.data.records.find(item => item.id === old.id).translationZh, old.translationZh);
  assert.ok(result.historyError);
  assert.equal(result.data.generatedAt, '2026-10-16T08:00:00Z');
  assert.match(result.warnings.at(-1), /历史接口/);
});

test('paginated history retains its actual metadata instead of replacing it with capture time', async () => {
  const calls = [];
  const result = await run({ request: async url => {
    calls.push(url);
    if (url.endsWith('/status')) return response();
    if (url.includes('cursor=')) return { ...page([old]), meta: { generated_at: '2026-10-16T07:55:00Z' } };
    return page([fresh], 'next page');
  } });
  assert.equal(result.data.historyGeneratedAt, '2026-10-16T07:50:00Z');
  assert.ok(calls.some(url => url.includes('next%20page')));
  assert.equal(result.data.historyComplete, true);
});

test('missing history metadata is not manufactured from a generated or capture date', async () => {
  const previous = base(); delete previous.historyGeneratedAt;
  const result = await run({ previous, request: async url => {
    if (url.endsWith('/status')) return response();
    const result = page([fresh, old]); delete result.meta; return result;
  } });
  assert.equal(result.data.historyGeneratedAt, undefined);
});

test('new current signals are translated before forecasts, confirmations and history, with one job per post', async () => {
  const scheduled = record('04', { status: 'scheduled', scheduled_for: '2026-10-16T12:00:00Z', text: 'A forecast has arrived.' });
  const seen = [];
  const result = await run({ request: requester({ changes: { active_watch: watch, scheduled_reset: scheduled }, records: [fresh, record('05'), old] }),
    translate: translator(async text => { seen.push(text); return `中文译文第${seen.length}条。`; }), maxTranslations: 3 });
  assert.deepEqual(seen, [watch.text, scheduled.text, fresh.text]);
  assert.equal(result.attempted, 3);
  assert.equal(result.translated, 3);
  assert.equal(result.data.status.latest_reset.translationZh, result.data.records.find(item => item.id === fresh.id).translationZh);
  assert.equal(result.data.records.find(item => item.id === '2110000000000000005').translationZh, undefined);
  const meta = result.data.status.active_watch.translationMeta;
  assert.deepEqual(meta, { provider: 'opus-mt-en-zh', modelRevision: 'a'.repeat(40), translatedAt: new Date(NOW).toISOString(), sourceText: watch.text });
});

test('a known exact source translation crosses status, but a confirmation summary never becomes forecast copy', async () => {
  const previous = base();
  previous.status.latest_reset = { ...old, status: 'completed' };
  const scheduled = { ...old, status: 'scheduled', scheduled_for: '2026-10-16T12:00:00Z', translationZh: undefined, summaryZh: undefined };
  const result = await run({ previous, request: requester({ changes: { scheduled_reset: scheduled } }) });
  assert.equal(result.data.status.scheduled_reset.translationZh, old.translationZh);
  assert.equal(result.data.status.scheduled_reset.summaryZh, undefined);
});

test('changed source text, author, URL or explicit post ID cannot reuse an old human translation', async () => {
  for (const change of [{ text: 'The original post was edited.' }, { id: '2110000000000000099' }, { source: record('99').source }]) {
    const changed = { ...old, translationZh: undefined, summaryZh: undefined, ...change };
    const result = await run({ request: requester({ status: response({ latest_reset: changed }), records: [changed] }), translate: translator(async () => '这是新原文的新译文。') });
    assert.equal(result.data.status.latest_reset.translationZh, '这是新原文的新译文。');
    assert.equal(result.data.status.latest_reset.summaryZh, undefined);
  }
  const invalid = { ...old, source: { ...old.source, author: 'another-person' } };
  await assert.rejects(run({ request: requester({ status: response({ latest_reset: invalid }) }) }), /校验/);
});

test('a repo human correction overrides baseline machine and old human copy without changing current status', async () => {
  const previous = base();
  const corrected = base(); corrected.records[0].translationZh = '仓库中重新校对的人工译文。'; corrected.status.latest_reset.translationZh = corrected.records[0].translationZh;
  const result = await run({ previous, translationSources: [corrected], request: requester({ status: response({ latest_reset: { ...old, translationZh: undefined } }), records: [{ ...old, translationZh: undefined }] }) });
  assert.equal(result.data.status.latest_reset.translationZh, corrected.records[0].translationZh);
  assert.equal(result.data.status.latest_reset.translationMeta, undefined);
  assert.equal(result.data.generatedAt, '2026-10-16T08:00:00Z');
});

test('valid machine translations are reused only for the exact raw text and provenance', async () => {
  const previous = base();
  const machine = { ...fresh, translationZh: '已有自动译文。', translationMeta: { provider: 'opus-mt-en-zh', modelRevision: 'b'.repeat(40), translatedAt: '2026-10-15T09:00:00Z', sourceText: fresh.text } };
  previous.records.push(machine);
  let calls = 0;
  const result = await run({ previous, translate: translator(async () => { calls++; return '不应调用。'; }) });
  assert.equal(calls, 0);
  assert.equal(result.data.status.latest_reset.translationZh, machine.translationZh);
  assert.deepEqual(result.data.status.latest_reset.translationMeta, machine.translationMeta);
  previous.records[1].translationMeta.sourceText = 'Different original.';
  const retry = await run({ previous });
  assert.equal(retry.data.status.latest_reset.translationZh, '这是自动中文译文。');
});

test('reviewed complete-sentence rules run before the machine without pretending summaries are translations', async () => {
  const known = record('06', { text: 'Landing within the next 2 hours https://t.co/AbC123' });
  const result = await run({ request: requester({ status: response({ latest_reset: known }), records: [known, old] }), translate: translator(async () => { throw new Error('Must not run'); }) });
  assert.equal(result.data.status.latest_reset.translationZh, '预计在接下来的 2 小时内到账。');
  assert.equal(result.data.status.latest_reset.translationMeta, undefined);
  assert.equal(result.attempted, 0);
  assert.equal(result.localTranslations, 1);
});

test('invalid machine output never overwrites original messages and is retried in a later collection', async () => {
  for (const output of ['', 'English only.', fresh.text, '翻译失败：网络错误', 'Error: 服务不可用']) {
    const first = await run({ translate: translator(async () => output) });
    assert.equal(first.data.status.latest_reset.translationZh, undefined);
    assert.equal(first.data.status.latest_reset.text, fresh.text);
    assert.equal(first.translationFailures, 1);
    assert.equal(first.pendingTranslations, 1);
    const second = await run({ previous: first.data });
    assert.equal(second.data.status.latest_reset.translationZh, '这是自动中文译文。');
  }
  assert.equal(isUsableChineseTranslation('服务不可用，请稍后重试', fresh.text), false);
});

test('one translation failure cannot block later messages or valid new status', async () => {
  const result = await run({ request: requester({ changes: { active_watch: watch } }), translate: translator(async text => {
    if (text === watch.text) throw new Error('Model failure');
    return '后续消息仍有中文译文。';
  }) });
  assert.equal(result.data.status.active_watch.text, watch.text);
  assert.equal(result.data.status.active_watch.translationZh, undefined);
  assert.equal(result.data.status.latest_reset.translationZh, '后续消息仍有中文译文。');
  assert.equal(result.translationFailures, 1);
  assert.equal(result.translated, 1);
});

test('translation budgets never truncate a long post and may process a smaller later post', async () => {
  const long = record('07', { text: 'Long message '.repeat(1000) });
  const seen = [];
  const result = await run({ request: requester({ status: response({ latest_reset: long }), records: [long, fresh, old] }), maxTranslationChars: 100,
    translate: translator(async text => { seen.push(text); return '后续短消息的中文译文。'; }) });
  assert.deepEqual(seen, [fresh.text]);
  assert.equal(result.data.status.latest_reset.text, long.text);
  assert.equal(result.data.status.latest_reset.translationZh, undefined);
  assert.equal(result.inputChars, fresh.text.length);
  assert.equal(result.pendingTranslations, 1);
});

test('empty or non-English text and zero budget never load the model', async () => {
  for (const text of ['', undefined, '中文通告']) {
    const missing = record('08', { text });
    const result = await updateResetSnapshot({ previous: base(), request: requester({ status: response({ latest_reset: missing }), records: [missing, old] }), now: NOW });
    assert.equal(result.attempted, 0);
    assert.equal(result.pendingTranslations, 0);
  }
  const result = await updateResetSnapshot({ previous: base(), request: requester(), maxTranslations: 0, now: NOW });
  assert.equal(result.attempted, 0);
  assert.equal(result.pendingTranslations, 1);
});

test('missing translator provenance preserves new status and emits one safe warning', async () => {
  let called = 0;
  const result = await run({ translate: async () => { called++; return '不应使用。'; } });
  assert.equal(called, 0);
  assert.equal(result.data.status.latest_reset.id, fresh.id);
  assert.equal(result.translated, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(!result.warnings[0].includes(fresh.text));
});

test('failed, invalid and older status responses leave the saved bytes and capture date untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reset-update-'));
  const snapshot = join(dir, 'snapshot.json');
  const bytes = `${JSON.stringify(base(), null, 2)}\n`;
  try {
    await writeFile(snapshot, bytes);
    const failures = [requester({ statusError: true }), requester({ status: { data: null } }), requester({ status: { ...response(), meta: { generated_at: '2026-10-14T08:00:00Z' } } })];
    for (const request of failures) {
      let translated = false;
      await assert.rejects(updateResetSnapshotFile({ snapshot, request, translate: translator(async () => { translated = true; return '不能翻译。'; }), now: NOW }));
      assert.equal(translated, false);
      assert.equal(await readFile(snapshot, 'utf8'), bytes);
      assert.deepEqual(await readdir(dir), ['snapshot.json']);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('file updater reads independent manual donors and uses atomic replacement only for valid data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reset-update-'));
  const snapshot = join(dir, 'snapshot.json'), manual = join(dir, 'manual.json');
  try {
    const donor = base(); donor.records.push({ ...fresh, translationZh: '单独仓库人工译文。' });
    await writeFile(snapshot, JSON.stringify(base())); await writeFile(manual, JSON.stringify(donor));
    const result = await updateResetSnapshotFile({ snapshot, translations: [manual], request: requester(), translate: translator(), now: NOW });
    assert.equal(result.data.status.latest_reset.translationZh, '单独仓库人工译文。');
    assert.deepEqual(JSON.parse(await readFile(snapshot, 'utf8')), result.data);
    assert.deepEqual((await readdir(dir)).sort(), ['manual.json', 'snapshot.json']);
    const bytes = await readFile(snapshot, 'utf8');
    await assert.rejects(writeResetSnapshot(snapshot, { ...result.data, status: null }));
    assert.equal(await readFile(snapshot, 'utf8'), bytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI rejects unknown options without touching the selected snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reset-update-'));
  const snapshot = join(dir, 'snapshot.json'), bytes = JSON.stringify(base());
  try {
    await writeFile(snapshot, bytes);
    const result = spawnSync(process.execPath, ['scripts/update-reset-snapshot.mjs', `--snapshot=${snapshot}`, '--unknown'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /未替换既有有效快照/);
    assert.equal(await readFile(snapshot, 'utf8'), bytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
