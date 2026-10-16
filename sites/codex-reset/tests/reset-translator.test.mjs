import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTranslationText, createResetTranslator, TRANSLATION_REVISION } from '../scripts/translate-reset.mjs';

test('long multilingual source text is partitioned without losing characters or its final sentence', () => {
  const source = 'A public reset message.\n\n🙂 Account @thsottiaux: https://example.com/path?q=1\n'.repeat(30) + 'The final update arrives tomorrow.';
  const count = text => [...text].length;
  const chunks = splitTranslationText(source, count, 90);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(''), source);
  assert.ok(chunks.every(chunk => count(chunk) <= 90));
  assert.ok(chunks.at(-1).endsWith('The final update arrives tomorrow.'));
  assert.ok(chunks.every(chunk => !/[\uD800-\uDBFF]$/u.test(chunk)));
});

test('creating an unused automation translator neither downloads a model nor prevents disposal', async () => {
  const translate = await createResetTranslator();
  assert.equal(translate.info.provider, 'opus-mt-en-zh');
  assert.equal(translate.info.modelRevision, TRANSLATION_REVISION);
  await translate.dispose();
  await assert.rejects(translate('A new public announcement.'), /disposed/);
});
