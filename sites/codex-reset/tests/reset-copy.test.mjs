import test from 'node:test';
import assert from 'node:assert/strict';
import { getResetCopy } from '../public/reset-copy.js';

test('existing translations take priority over summaries and preserve their label', () => {
  const record = { text: 'All propagated. https://t.co/abc123', translationZh: '  现已全部生效。 ', summaryZh: '本次重置已完成。' };
  const before = structuredClone(record);
  assert.deepEqual(getResetCopy(record, { mode: 'confirmed' }), { english: 'All propagated.', chinese: '现已全部生效。', label: '中文译文', type: 'translation' });
  assert.deepEqual(record, before);
  const summary = getResetCopy({ ...record, translationZh: '  ' });
  assert.equal(summary.chinese, '本次重置已完成。');
  assert.equal(summary.label, '中文速读'); assert.equal(summary.type, 'summary');
});

test('known complete landing sentences get precise local Chinese without a backend', () => {
  for (const [text, chinese] of [
    ['Landing within the next 2 hours', '预计在接下来的 2 小时内到账。'],
    ['Landing within the next 1 hour.', '预计在接下来的 1 小时内到账。'],
    ['Landing within the next 30 minutes.', '预计在接下来的 30 分钟内到账。'],
    ['Landing within the next 1 minute.', '预计在接下来的 1 分钟内到账。'],
    ['LANDING within the next 0.5 hours. https://t.co/ABC123', '预计在接下来的 0.5 小时内到账。'],
  ]) {
    const copy = getResetCopy({ text }, { mode: 'forecast' });
    assert.equal(copy.chinese, chinese);
    assert.equal(copy.label, '中文释义'); assert.equal(copy.type, 'translation');
    assert.doesNotMatch(copy.english, /t\.co/);
  }
});

test('a matching fragment in a complex sentence never passes as a full translation', () => {
  for (const text of [
    'Landing within the next 2 hours. This is only for test accounts.',
    'Not landing within the next 2 hours.',
    'Landing within the next 2 hours, unless delayed.',
    'We hope: Landing within the next 2 hours.',
    'Landing within the next 0 hours.',
    'Landing within the next -2 hours.',
    'Landing within the next two hours.',
  ]) {
    const copy = getResetCopy({ text }, { mode: 'forecast' });
    assert.equal(copy.english, text);
    assert.equal(copy.type, 'summary'); assert.equal(copy.label, '中文速读');
    assert.equal(copy.chinese, '已发布新的重置预告，具体安排请查看英文原文。');
    assert.doesNotMatch(copy.chinese, /小时|分钟|已完成|已到账/);
  }
});

test('unknown posts have conservative mode-specific Chinese without impersonating the author', () => {
  const record = { text: 'New activity detected.', source: { author: 'another-person' } };
  for (const mode of ['forecast', 'confirmed', 'observed', '']) {
    const copy = getResetCopy(record, { mode });
    assert.equal(copy.english, record.text);
    assert.equal(copy.type, 'summary'); assert.equal(copy.label, '中文速读');
    assert.doesNotMatch(copy.chinese, /Tibo|thsottiaux|已完成|已到账|小时|分钟/);
  }
  assert.match(getResetCopy(record, { mode: 'observed' }).chinese, /观测记录.*尚需.*确认/);
  assert.match(getResetCopy(record, { mode: 'confirmed' }).chinese, /核对账户额度/);
});

test('shortlink cleanup preserves other English and missing source fields stay readable', () => {
  const copy = getResetCopy({ text: ' Update\nhttps://t.co/AbC1\nhttps://example.com/details https://t.co/Df2?x=3 ', translationZh: '原文已有中文' });
  assert.equal(copy.english, 'Update https://example.com/details');
  assert.equal(getResetCopy({ text: 'https://t.co.example.org/details' }).english, 'https://t.co.example.org/details');
  for (const record of [null, undefined, {}, { text: 123, translationZh: {}, summaryZh: [] }]) {
    const empty = getResetCopy(record, { mode: 'forecast' });
    assert.equal(empty.english, ''); assert.equal(empty.type, 'summary');
    assert.match(empty.chinese, /暂无可核验/);
    assert.doesNotMatch(empty.chinese, /已发布|已完成|\[object/);
  }
});

test('the complete current watch reply receives a precise explanation without announcing a reset', () => {
  for (const text of ['@maria_rcks Can’t argue with that, Let’s break the cycle.', "@maria_rcks Can't argue with that, Let's break the cycle. https://t.co/abc123"]) {
    const copy = getResetCopy({ text }, { mode: 'watch' });
    assert.equal(copy.chinese, '@maria_rcks 无法反驳，那就让我们打破这个循环吧。');
    assert.equal(copy.label, '中文释义'); assert.equal(copy.type, 'translation');
    assert.doesNotMatch(copy.chinese, /重置已完成|到账|预计|小时/);
  }
  const complex = '@maria_rcks Can’t argue with that, Let’s break the cycle. Maybe tomorrow.';
  const copy = getResetCopy({ text: complex }, { mode: 'watch' });
  assert.equal(copy.english, complex);
  assert.equal(copy.chinese, '出现新的重置相关信号，尚无正式预告，请查看原文。');
  assert.equal(copy.label, '中文速读'); assert.equal(copy.type, 'summary');
});

test('Done and dusted translates only as a complete sentence, preserving unknown watch semantics', () => {
  for (const text of ['Done and dusted', 'Done and dusted. https://t.co/abc123']) {
    assert.deepEqual(getResetCopy({ text }, { mode: 'confirmed' }), { english: text.replace(/ https:\/\/t\.co\/abc123$/, ''), chinese: '已经全部完成。', label: '中文释义', type: 'translation' });
  }
  for (const text of ['Not done and dusted.', 'Done and dusted, maybe.', 'Will be done and dusted.']) {
    const copy = getResetCopy({ text }, { mode: 'watch' });
    assert.equal(copy.type, 'summary');
    assert.equal(copy.chinese, '出现新的重置相关信号，尚无正式预告，请查看原文。');
    assert.doesNotMatch(copy.chinese, /已经全部完成|小时|分钟/);
  }
});
