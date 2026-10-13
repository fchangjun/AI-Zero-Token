import { readdir, readFile, mkdir, cp, unlink, lstat, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const source = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(source, '../../.state/sites/codex-reset-source');
const allowed = ['.gitignore', '.openai/hosting.json', 'AGENTS.md', 'README.md', 'package.json', 'package-lock.json', 'site.config.json', 'netlify.toml', 'vercel.json', 'pages', 'public', 'lib', 'scripts', 'tests'];
const git = args => {
  const result = spawnSync('git', args, { cwd: destination, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('请先通过 Sites 流程打开独立发布目录');
  return result.stdout.trim();
};
async function list(directory, prefix = '') {
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) names.push(...await list(path.join(directory, entry.name), `${name}/`));
    else if (entry.isFile()) names.push(name);
    else throw new Error(`拒绝同步符号链接：${name}`);
  }
  return names;
}
try {
  const metadata = await lstat(path.join(destination, '.git'));
  if (!metadata.isDirectory() || path.resolve(git(['rev-parse', '--show-toplevel'])) !== await realpath(destination)) throw new Error('发布目录必须拥有独立的 Git 历史');
  if (git(['status', '--porcelain'])) throw new Error('发布目录有未提交改动，请先核对并保留这些改动');
  const original = JSON.parse(await readFile(path.join(source, '.openai/hosting.json'), 'utf8'));
  const target = JSON.parse(await readFile(path.join(destination, '.openai/hosting.json'), 'utf8'));
  if (!original.project_id || original.project_id !== target.project_id) throw new Error('站点项目 ID 不一致');
  const files = [];
  for (const name of allowed) {
    const entry = await lstat(path.join(source, name));
    if (entry.isDirectory()) files.push(...(await list(path.join(source, name), `${name}/`)));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`拒绝同步符号链接：${name}`);
  }
  const retained = new Set(files);
  // Only remove obsolete tracked Site source; preserve Git history and ignored local artifacts.
  for (const name of git(['ls-files', '-z']).split('\0').filter(Boolean)) {
    if (path.isAbsolute(name) || name.split('/').includes('..')) throw new Error('Invalid tracked path');
    if (!retained.has(name)) await unlink(path.join(destination, name));
  }
  for (const name of files) {
    const targetPath = path.join(destination, name);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(path.join(source, name), targetPath);
  }
  console.log(`已同步 ${files.length} 个源文件到 ${destination}。请在该目录重新构建并发布。`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
