import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStaticPreview } from '../scripts/preview.mjs';

test('preview serves only static files, handles directory routes, and has no market API', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'codex-static-test-'));
  await mkdir(path.join(folder, 'resets'));
  await writeFile(path.join(folder, 'index.html'), 'home');
  await writeFile(path.join(folder, 'resets/index.html'), 'resets');
  const server = createStaticPreview(folder);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await (await fetch(`${base}/`)).text(), 'home');
    const redirect = await fetch(`${base}/resets?share=latest`, { redirect: 'manual' });
    assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/resets/?share=latest');
    assert.equal(await (await fetch(`${base}/resets/`)).text(), 'resets');
    assert.equal((await fetch(`${base}/api/market`)).status, 404);
    assert.equal((await fetch(`${base}/.git/config`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve)); await rm(folder, { recursive: true, force: true });
  }
});
