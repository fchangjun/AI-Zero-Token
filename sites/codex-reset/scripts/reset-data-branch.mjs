import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isResetDataset, pickResetDataset } from '../public/reset-cache.js';
import { enrichResetTranslations } from '../public/reset-translations.js';

const execute = promisify(execFile);
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
export const DATA_BRANCH = 'codex/intel-data';
const dataRef = `refs/heads/${DATA_BRANCH}`;
const remoteRef = `refs/remotes/origin/${DATA_BRANCH}`;
const validSha = value => /^[a-f0-9]{40,64}$/u.test(value);
async function git(root, args, input) {
  try {
    const child = execute('git', args, { cwd: root, timeout: 60000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_AUTHOR_NAME: 'github-actions[bot]', GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com', GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com' } });
    if (input !== undefined) child.child.stdin.end(input);
    return (await child).stdout.trimEnd();
  } catch { throw new Error(`数据分支 Git 操作失败（${args[0]}），保留上一份已部署数据`); }
}
async function atomicJson(filename, data) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporary, filename);
}
function assertSnapshot(data) {
  if (!isResetDataset(data) || !Number.isFinite(Date.parse(data.capturedAt))) throw new Error('数据分支快照校验失败，保留现有快照');
  return data;
}

/** Keep data history separate from the product branch and never touch the Git index. */
export async function restoreSnapshotBranch({ root = defaultRoot } = {}) {
  const snapshotPath = path.join(root, 'public/snapshot.json');
  const original = assertSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')));
  const statePath = path.join(root, 'outputs/automation-data-state.json');
  const translationPath = path.join(root, 'outputs/automation-source-snapshot.json');
  const advertised = await git(root, ['ls-remote', '--refs', 'origin', dataRef]);
  let base = null, selected = original;
  if (advertised) {
    await git(root, ['fetch', '--no-tags', 'origin', `${dataRef}:${remoteRef}`]);
    base = await git(root, ['rev-parse', remoteRef]);
    if (!validSha(base)) throw new Error('数据分支提交标识无效');
    const stored = assertSnapshot(JSON.parse(await git(root, ['show', `${base}:snapshot.json`])));
    selected = enrichResetTranslations(pickResetDataset(original, [stored]).data, [original, stored], { preferDonors: true });
  }
  // Preserve main-branch editorial translations as independent donors for the updater.
  await atomicJson(translationPath, original);
  await atomicJson(snapshotPath, selected);
  await atomicJson(statePath, { branch: DATA_BRANCH, base });
  return { base, generatedAt: selected.generatedAt, translationPath };
}

/** Create a one-file data commit; a lease only permits advancing the exact restored parent. */
export async function saveSnapshotBranch({ root = defaultRoot } = {}) {
  const state = JSON.parse(await readFile(path.join(root, 'outputs/automation-data-state.json'), 'utf8'));
  if (state.branch !== DATA_BRANCH || (state.base !== null && !validSha(state.base))) throw new Error('缺少有效的数据分支基线');
  const snapshot = assertSnapshot(JSON.parse(await readFile(path.join(root, 'public/snapshot.json'), 'utf8')));
  const blob = await git(root, ['hash-object', '-w', '--stdin'], `${JSON.stringify(snapshot, null, 2)}\n`);
  const tree = await git(root, ['mktree'], `100644 blob ${blob}\tsnapshot.json\n`);
  if (!validSha(blob) || !validSha(tree)) throw new Error('快照对象写入失败');
  if (state.base && tree === await git(root, ['rev-parse', `${state.base}^{tree}`])) return { changed: false, commit: state.base };
  const args = ['commit-tree', tree, ...(state.base ? ['-p', state.base] : []), '-m', 'Update Codex intelligence snapshot'];
  const commit = await git(root, args);
  if (!validSha(commit)) throw new Error('快照提交创建失败');
  // A concurrent writer must be resolved on the next run, never overwritten.
  await git(root, ['push', `--force-with-lease=${dataRef}:${state.base || ''}`, 'origin', `${commit}:${dataRef}`]);
  return { changed: true, commit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2];
    const result = action === 'restore' ? await restoreSnapshotBranch() : action === 'save' ? await saveSnapshotBranch() : null;
    if (!result) throw new Error('用法：node scripts/reset-data-branch.mjs restore|save');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
