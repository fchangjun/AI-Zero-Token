import assert from 'node:assert/strict';
import { test } from 'node:test';
import { embedSnapshot, rewriteRootLinks, serializeSnapshot } from '../scripts/build-static.mjs';

test('navigation and assets stay under a deployment subdirectory', () => {
  const page = `<a href="/">首页</a><a href='/prices?plan=plus#regional-prices'>明细</a><a href="/resets?share=latest#preview">分享</a><script type="module" src="/app.js"></script><img src="//cdn.example/avatar.jpg"><a href="https://example.com/">来源</a>`;
  for (const [depth, current] of [[0, 'https://example.com/intel/'], [1, 'https://example.com/intel/resets/']]) {
    const rewritten = rewriteRootLinks(page, depth);
    const values = [...rewritten.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map((match) => new URL(match[1], current).href);
    assert.deepEqual(values, [
      'https://example.com/intel/',
      'https://example.com/intel/prices/?plan=plus#regional-prices',
      'https://example.com/intel/resets/?share=latest#preview',
      'https://example.com/intel/app.js',
      'https://cdn.example/avatar.jpg',
      'https://example.com/',
    ]);
  }
});

test('snapshot text cannot escape its inert script element and round-trips', () => {
  const data = { text: '</script><img src=x onerror=alert(1)> & \u2028 \u2029', title: "中英文 / English $& $` $'" };
  const serialized = serializeSnapshot(data);
  assert.equal(/[<>&\u2028\u2029]/.test(serialized), false);
  assert.deepEqual(JSON.parse(serialized), data);
  const html = embedSnapshot('<html><head></head><body></body></html>', 'market-snapshot', data);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  const payload = html.match(/type="application\/json">(.*?)<\/script>/s)[1];
  assert.deepEqual(JSON.parse(payload), data);
});
