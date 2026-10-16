import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { aztLink, parseBuildOptions, readSiteConfig } from './site-config.mjs';
import { escapeHTML, renderMarket, renderResets } from './prerender.mjs';
import { renderHome } from './prerender-home.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

// Keep imported text inside its inert JSON script element.
export function serializeSnapshot(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function rewriteRootLinks(html, depth = 0) {
  const prefix = depth ? '../'.repeat(depth) : './';
  return html.replace(/\b(href|src)(\s*=\s*)(["'])(\/(?!\/)[^"']*)\3/gi,
    (_match, attribute, equals, quote, value) => {
      const [, pathname, suffix] = value.match(/^([^?#]*)(.*)$/);
      // Object storage serves exact file keys and may not resolve directory indexes.
      const target = pathname === '/' ? '/index.html'
        : /^\/(?:resets|prices)\/?$/.test(pathname) ? `${pathname.replace(/\/$/, '')}/index.html` : pathname;
      return `${attribute}${equals}${quote}${prefix}${target.slice(1)}${suffix}${quote}`;
    });
}

export function embedSnapshot(html, id, data) {
  if (!/<\/head\s*>/i.test(html)) throw new Error('页面缺少 </head>，无法内嵌快照');
  const serialized = `<script id="${id}" type="application/json">${serializeSnapshot(data)}</script>`;
  return html.replace(/<\/head\s*>/i, () => `${serialized}\n</head>`);
}

export function replaceAztLinks(html, config, campaign) {
  const placeholders = { AZT_DOWNLOAD_URL: 'downloadUrl', AZT_GUIDE_URL: 'guideUrl', AZT_REPO_URL: 'repoUrl' };
  return html.replace(/\{\{(AZT_DOWNLOAD_URL|AZT_GUIDE_URL|AZT_REPO_URL)\}\}/g,
    (_match, key) => escapeHTML(aztLink(config, placeholders[key], campaign)));
}

export function addMetadata(html, config, page, modifiedAt) {
  const isResets = page === 'resets';
  const isHome = page === 'home';
  const homeUrl = new URL('index.html', config.siteUrl).href;
  const url = isHome ? homeUrl : new URL(`${page}/index.html`, config.siteUrl).href;
  const image = new URL('social-card.png', config.siteUrl).href;
  const title = isHome ? `Plus / Pro 订阅好价与重置消息 · ${config.siteName}` : isResets ? `Codex 重置动态与中英文通告分享 · ${config.siteName}` : `ChatGPT 全球地区比价与人民币估算 · ${config.siteName}`;
  const description = isResets
    ? '追踪 Codex 公开额度重置公告与历史记录，阅读 Tibo 中英文消息，分享包含头像和 X 原帖来源的通告图片。'
    : isHome ? '对比 ChatGPT Plus 与 Pro 美区常规价和已收录地区最低价，查看人民币估算、节省金额与 Codex 重置动态，分享你的订阅情报。'
    : '比较 ChatGPT Go、Plus、Pro 100、Pro 200、Pro 500 各地区官方渠道报价，查看每档 Top 3、人民币估算、标准美元月价及数据更新时间。';
  html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']*|twitter:[^"']*)["'][^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${homeUrl}#website`, name: config.siteName, url: homeUrl, inLanguage: 'zh-CN' },
      { '@type': 'CollectionPage', '@id': `${url}#webpage`, name: title, description, url, inLanguage: 'zh-CN', dateModified: new Date(modifiedAt).toISOString(), isPartOf: { '@id': `${homeUrl}#website` } },
    ],
  };
  const metadata = `<title>${escapeHTML(title)}</title>
  <meta name="description" content="${escapeHTML(description)}">
  <meta name="robots" content="${config.indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'}">
  <link rel="canonical" href="${escapeHTML(url)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="${escapeHTML(config.siteName)}">
  <meta property="og:title" content="${escapeHTML(title)}">
  <meta property="og:description" content="${escapeHTML(description)}">
  <meta property="og:url" content="${escapeHTML(url)}">
  <meta property="og:image" content="${escapeHTML(image)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Codex 情报站：全球地区比价、额度重置动态、中英文通告分享">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHTML(title)}">
  <meta name="twitter:description" content="${escapeHTML(description)}">
  <meta name="twitter:image" content="${escapeHTML(image)}">
  <script type="application/ld+json">${serializeSnapshot(schema)}</script>`;
  return html.replace(/<\/head\s*>/i, () => `${metadata}\n</head>`);
}

export function robotsFile(config) {
  const prefix = new URL(config.siteUrl).pathname;
  return `User-agent: *\n${config.indexable ? 'Allow' : 'Disallow'}: ${prefix}\n\nSitemap: ${new URL('sitemap.xml', config.siteUrl).href}\n`;
}

export function sitemapFile(config, market, reset) {
  const entries = [
    [new URL('index.html', config.siteUrl).href, new Date(Math.max(Date.parse(market.datasetUpdatedAt), Date.parse(reset.generatedAt || reset.capturedAt))).toISOString()],
    [new URL('prices/index.html', config.siteUrl).href, market.datasetUpdatedAt],
    [new URL('resets/index.html', config.siteUrl).href, reset.generatedAt || reset.capturedAt],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(([url, stamp]) => `  <url><loc>${escapeHTML(url)}</loc><lastmod>${new Date(stamp).toISOString()}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

function notFoundPage(config) {
  const prefix = new URL(config.siteUrl).pathname;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,follow"><title>页面未找到 · ${escapeHTML(config.siteName)}</title><link rel="stylesheet" href="${escapeHTML(prefix)}style.css"></head><body><main class="wrap" style="padding-block:100px"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1>这个页面暂时找不到。</h1><p>回到情报站，查看地区比价与公开通告。</p><p><a class="button dark" href="${escapeHTML(prefix)}index.html">返回情报总览 ↗</a> <a class="button secondary" href="${escapeHTML(prefix)}resets/index.html">查看重置动态</a></p></main></body></html>`;
}

export async function buildStatic(root = projectRoot, options = {}) {
  const config = await readSiteConfig(root, options);
  const { assertMarket } = await import(pathToFileURL(path.join(root, 'public/market-data.js')).href);
  const { isResetDataset } = await import(pathToFileURL(path.join(root, 'public/reset-cache.js')).href);
  const [marketText, resetText, pricePage, resetPage, homePage] = await Promise.all([
    readFile(path.join(root, 'public/data/prices.json'), 'utf8'),
    readFile(path.join(root, 'public/snapshot.json'), 'utf8'),
    readFile(path.join(root, 'pages/prices.html'), 'utf8'),
    readFile(path.join(root, 'pages/resets.html'), 'utf8'),
    readFile(path.join(root, 'pages/home.html'), 'utf8'),
  ]);
  const market = JSON.parse(marketText);
  assertMarket(market);
  const reset = JSON.parse(resetText);
  if (!isResetDataset(reset) || !Number.isFinite(Date.parse(reset.capturedAt))) {
    throw new Error('通告快照不完整：需要 records、status 和有效的 capturedAt');
  }

  // Complete validation before replacing an existing deployment artifact.
  const temporary = await mkdtemp(path.join(root, '.static-build-'));
  const output = path.join(root, 'out');
  try {
    await cp(path.join(root, 'public'), temporary, { recursive: true });
    await mkdir(path.join(temporary, 'resets'), { recursive: true });
    await mkdir(path.join(temporary, 'prices'), { recursive: true });
    const withData = (html, page, modifiedAt, depth) => embedSnapshot(embedSnapshot(addMetadata(rewriteRootLinks(replaceAztLinks(html, config, page), depth), config, page, modifiedAt), 'market-snapshot', market), 'reset-snapshot', reset);
    await Promise.all([
      writeFile(path.join(temporary, 'index.html'), withData(renderHome(homePage, market, reset), 'home', new Date(Math.max(Date.parse(market.datasetUpdatedAt), Date.parse(reset.generatedAt || reset.capturedAt))).toISOString(), 0)),
      writeFile(path.join(temporary, 'prices/index.html'), withData(renderMarket(pricePage, market), 'prices', market.datasetUpdatedAt, 1)),
      writeFile(path.join(temporary, 'resets/index.html'), withData(renderResets(resetPage, reset), 'resets', reset.generatedAt || reset.capturedAt, 1)),
      writeFile(path.join(temporary, 'robots.txt'), robotsFile(config)),
      writeFile(path.join(temporary, 'sitemap.xml'), sitemapFile(config, market, reset)),
      writeFile(path.join(temporary, '404.html'), notFoundPage(config)),
      writeFile(path.join(temporary, '.nojekyll'), ''),
    ]);
    // Swap only a complete artifact; restore the previous build if publication fails.
    const previous = `${temporary}-previous`;
    let hadPrevious = false;
    try {
      await rename(output, previous);
      hadPrevious = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(temporary, output);
    } catch (error) {
      if (hadPrevious) await rename(previous, output);
      throw error;
    }
    if (hadPrevious) await rm(previous, { recursive: true, force: true });
    return output;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = await buildStatic(projectRoot, parseBuildOptions(process.argv.slice(2)));
    console.log(`静态网站已生成：${output}`);
    console.log('部署 out/ 即可，无需服务端；地区价格与通告快照已内嵌。');
  } catch (error) {
    console.error(`静态构建失败：${error.message}`);
    process.exitCode = 1;
  }
}
