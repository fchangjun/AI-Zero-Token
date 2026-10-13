import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function normalizeSiteUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('siteUrl 必须是完整的 HTTPS 地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('siteUrl 必须使用 HTTPS，且不能含账号、查询参数或锚点');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

function parseBoolean(value, name) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} 只能是 true 或 false`);
}

export function resolveSiteConfig(config, { env = process.env, ...options } = {}) {
  const siteUrl = normalizeSiteUrl(options.siteUrl ?? env.SITE_URL ?? config.siteUrl);
  const indexable = parseBoolean(options.indexable ?? env.SITE_INDEXABLE ?? config.indexable, 'indexable');
  if (typeof config.siteName !== 'string' || !config.siteName.trim()) throw new Error('缺少 siteName');
  const azt = {};
  for (const key of ['repoUrl', 'downloadUrl', 'guideUrl']) {
    let url;
    try { url = new URL(config.azt?.[key]); } catch { throw new Error(`AZT ${key} 地址无效`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`AZT ${key} 必须为无账号的 HTTPS 地址`);
    azt[key] = url.href;
  }
  return { ...config, siteUrl, indexable, azt };
}

export async function readSiteConfig(root, options = {}) {
  return resolveSiteConfig(JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8')), options);
}

export function parseBuildOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--site-url') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--site-url 后需要 HTTPS 地址');
      options.siteUrl = args[++i];
    } else if (arg.startsWith('--site-url=')) options.siteUrl = arg.slice(11);
    else if (arg === '--indexable') options.indexable = true;
    else if (arg === '--no-indexable') options.indexable = false;
    else if (arg.startsWith('--indexable=')) options.indexable = parseBoolean(arg.slice(12), '--indexable');
    else throw new Error(`未知构建参数：${arg}`);
  }
  return options;
}

export function aztLink(config, key, campaign) {
  const url = new URL(config.azt[key]);
  url.searchParams.set('utm_source', 'codex-intel');
  url.searchParams.set('utm_medium', 'website');
  url.searchParams.set('utm_campaign', campaign);
  return url.href;
}
