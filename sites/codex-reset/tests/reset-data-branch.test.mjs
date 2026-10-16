import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { restoreSnapshotBranch, saveSnapshotBranch, DATA_BRANCH } from '../scripts/reset-data-branch.mjs';

const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const record = { id: '2109000000000000001', announced_at: '2026-10-15T01:00:00Z', reset_type: 'regular', status: 'completed', text: 'The reset is complete.', source: { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/2109000000000000001' }, translationZh: '额度重置已完成。' };
const snapshot = () => ({ version: 1, capturedAt: '2026-10-15T03:00:00Z', generatedAt: '2026-10-15T02:00:00Z', historyComplete: true, records: [record], status: { latest_reset: record, scheduled_reset: null, active_watch: null, stats: { total: 1, avg_interval_days: 1, days_since_last: 1 } } });
const writeSnapshot = (root, data) => writeFile(path.join(root, 'public/snapshot.json'), `${JSON.stringify(data, null, 2)}\n`);
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'intel-data-branch-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'origin.git'), root = path.join(dir, 'work');
  await mkdir(root); await mkdir(path.join(root, 'public'));
  git(dir, 'init', '--bare', '--initial-branch=master', remote);
  git(root, 'init', '--initial-branch=master');
  git(root, 'remote', 'add', 'origin', remote);
  await writeFile(path.join(root, '.gitignore'), 'outputs/\n');
  await writeFile(path.join(root, 'unrelated.txt'), 'initial\n');
  await writeSnapshot(root, snapshot());
  git(root, 'add', '.'); git(root, 'commit', '-m', 'initial'); git(root, 'push', 'origin', 'master');
  await writeFile(path.join(root, 'unrelated.txt'), 'user edit\n');
  return { root, remote, dir };
}

test('backup data uses its own one-file branch without staging unrelated user edits', async t => {
  const { root, remote } = await fixture(t);
  const head = git(root, 'rev-parse', 'HEAD');
  const baseline = await restoreSnapshotBranch({ root });
  assert.equal(baseline.base, null);
  const stored = { ...snapshot(), generatedAt: '2026-10-15T04:00:00Z', capturedAt: '2026-10-15T04:01:00Z' };
  await writeSnapshot(root, stored);
  const result = await saveSnapshotBranch({ root });
  assert.equal(result.changed, true);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
  assert.equal(await readFile(path.join(root, 'unrelated.txt'), 'utf8'), 'user edit\n');
  assert.equal(git(remote, 'ls-tree', '--name-only', DATA_BRANCH), 'snapshot.json');
  await writeSnapshot(root, snapshot());
  const restored = await restoreSnapshotBranch({ root });
  assert.equal(restored.generatedAt, stored.generatedAt);
  assert.equal((await saveSnapshotBranch({ root })).changed, false);
});

test('invalid remote data never replaces a valid source snapshot', async t => {
  const { root, remote } = await fixture(t);
  await restoreSnapshotBranch({ root }); await saveSnapshotBranch({ root });
  const previous = await readFile(path.join(root, 'public/snapshot.json'), 'utf8');
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: remote, env, encoding: 'utf8', input: '{"invalid":true}' }).trim();
  const tree = execFileSync('git', ['mktree'], { cwd: remote, env, encoding: 'utf8', input: `100644 blob ${blob}\tsnapshot.json\n` }).trim();
  const parent = git(remote, 'rev-parse', DATA_BRANCH);
  const commit = git(remote, 'commit-tree', tree, '-p', parent, '-m', 'bad snapshot fixture');
  git(remote, 'update-ref', `refs/heads/${DATA_BRANCH}`, commit);
  await assert.rejects(restoreSnapshotBranch({ root }), /快照校验失败/);
  assert.equal(await readFile(path.join(root, 'public/snapshot.json'), 'utf8'), previous);
});

test('main-branch editorial corrections survive a newer backup status even if collection then fails', async t => {
  const { root } = await fixture(t);
  await restoreSnapshotBranch({ root });
  const stored = structuredClone(snapshot());
  stored.generatedAt = '2026-10-15T05:00:00Z';
  stored.records[0].translationZh = '旧人工译文';
  stored.status.latest_reset.translationZh = '旧人工译文';
  await writeSnapshot(root, stored); await saveSnapshotBranch({ root });
  const corrected = structuredClone(snapshot());
  corrected.records[0].translationZh = '主分支核对后的译文';
  corrected.status.latest_reset.translationZh = '主分支核对后的译文';
  await writeSnapshot(root, corrected);
  await restoreSnapshotBranch({ root });
  const restored = JSON.parse(await readFile(path.join(root, 'public/snapshot.json'), 'utf8'));
  assert.equal(restored.generatedAt, stored.generatedAt);
  assert.equal(restored.status.latest_reset.translationZh, '主分支核对后的译文');
  assert.equal(restored.records[0].translationZh, '主分支核对后的译文');
});

test('a concurrent writer cannot be overwritten by an older data baseline', async t => {
  const { root, remote, dir } = await fixture(t);
  await restoreSnapshotBranch({ root }); await saveSnapshotBranch({ root });
  await restoreSnapshotBranch({ root });
  const second = path.join(dir, 'second');
  git(dir, 'clone', remote, second);
  await restoreSnapshotBranch({ root: second });
  await writeSnapshot(root, { ...snapshot(), capturedAt: '2026-10-15T06:00:00Z', generatedAt: '2026-10-15T05:00:00Z' });
  const winner = await saveSnapshotBranch({ root });
  await writeSnapshot(second, { ...snapshot(), capturedAt: '2026-10-15T07:00:00Z', generatedAt: '2026-10-15T06:00:00Z' });
  await assert.rejects(saveSnapshotBranch({ root: second }), /Git 操作失败/);
  assert.equal(git(remote, 'rev-parse', DATA_BRANCH), winner.commit);
});
