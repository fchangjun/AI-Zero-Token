import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(filename));
    else if (/\.(mjs|js)$/.test(entry.name)) result.push(filename);
  }
  return result;
}
for (const dir of ['public', 'scripts', 'lib']) {
  for (const filename of await files(path.join(root, dir))) {
    const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const tests = (await files(path.join(root, 'tests'))).filter(f => f.endsWith('.test.mjs'));
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
