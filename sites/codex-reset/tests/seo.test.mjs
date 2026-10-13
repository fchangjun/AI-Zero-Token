import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildStatic, replaceAztLinks, robotsFile, sitemapFile } from '../scripts/build-static.mjs';
import { normalizeSiteUrl, parseBuildOptions, resolveSiteConfig } from '../scripts/site-config.mjs';
import { escapeHTML, replaceElement } from '../scripts/prerender.mjs';
import { rankedRegions } from '../public/market-utils.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
const market = JSON.parse(await readFile(path.join(root, 'public/data/prices.json'), 'utf8'));
const reset = JSON.parse(await readFile(path.join(root, 'public/snapshot.json'), 'utf8'));

test('deployment URL validates HTTPS and retains a normalized subdirectory', () => {
  assert.equal(normalizeSiteUrl('https://example.com/azt/intel'), 'https://example.com/azt/intel/');
  for (const url of ['http://example.com/', 'javascript:alert(1)', 'https://name:password@example.com/', 'https://example.com/?token=x', 'https://example.com/#section', '/intel/']) {
    assert.throws(() => normalizeSiteUrl(url));
  }
  const result = resolveSiteConfig(config, { env: { SITE_URL: 'https://example.com/intel', SITE_INDEXABLE: 'true' } });
  assert.equal(result.siteUrl, 'https://example.com/intel/');
  assert.equal(result.indexable, true);
  assert.equal(resolveSiteConfig(config, { env: {} }).indexable, false);
  assert.throws(() => resolveSiteConfig(config, { env: { SITE_INDEXABLE: 'yes' } }));
  assert.deepEqual(parseBuildOptions(['--site-url', 'https://example.com/intel', '--indexable']), { siteUrl: 'https://example.com/intel', indexable: true });
  assert.deepEqual(parseBuildOptions(['--site-url=https://example.com/', '--indexable=false']), { siteUrl: 'https://example.com/', indexable: false });
  assert.throws(() => parseBuildOptions(['--site-url']));
});

test('robots, sitemap and AZT links use the configured site and preserve subpaths', () => {
  const resolved = resolveSiteConfig(config, { env: {}, siteUrl: 'https://example.com/intel/' });
  assert.match(robotsFile(resolved), /Disallow: \/intel\/\n/);
  assert.match(robotsFile(resolved), /Sitemap: https:\/\/example\.com\/intel\/sitemap\.xml/);
  assert.match(robotsFile({ ...resolved, indexable: true }), /Allow: \/intel\/\n/);
  const sitemap = sitemapFile(resolved, market, reset);
  assert.match(sitemap, /<loc>https:\/\/example\.com\/intel\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/example\.com\/intel\/resets\/<\/loc>/);
  const links = replaceAztLinks('<a href="{{AZT_DOWNLOAD_URL}}">下载</a><a href="{{AZT_GUIDE_URL}}">指南</a><a href="{{AZT_REPO_URL}}">项目</a>', resolved, 'resets');
  assert.equal(links.includes('{{'), false);
  assert.match(links, /releases\/latest\?utm_source=codex-intel&amp;utm_medium=website&amp;utm_campaign=resets/);
  assert.match(links, /GETTING_STARTED\.zh-CN\.md\?utm_source=/);
});

test('template replacement preserves nested siblings and escapes imported text', () => {
  assert.equal(replaceElement('<div id="a"><div>old</div></div><div id="b">keep</div>', 'a', '<p>new</p>'), '<div id="a"><p>new</p></div><div id="b">keep</div>');
  assert.throws(() => replaceElement('<main></main>', 'missing', 'x'));
  assert.equal(escapeHTML('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
});

test('static build contains useful HTML, metadata and portable links without a server', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'codex-intel-seo-'));
  try {
    await Promise.all([
      cp(path.join(root, 'public'), path.join(fixture, 'public'), { recursive: true }),
      cp(path.join(root, 'pages'), path.join(fixture, 'pages'), { recursive: true }),
      cp(path.join(root, 'site.config.json'), path.join(fixture, 'site.config.json')),
      writeFile(path.join(fixture, 'package.json'), '{"type":"module"}'),
    ]);
    const out = await buildStatic(fixture, { env: {}, siteUrl: 'https://example.com/intel/', indexable: true });
    const homeHtml = await readFile(path.join(out, 'index.html'), 'utf8');
    const html = await readFile(path.join(out, 'prices/index.html'), 'utf8');
    const resetHtml = await readFile(path.join(out, 'resets/index.html'), 'utf8');
    for (const [page, markup] of [['',homeHtml],['prices/',html],['resets/',resetHtml]]) {
      const visiblePage = markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      assert.equal((visiblePage.match(/data-share-intel/g) || []).length, 1, 'each page has one unified sharing entry');
      assert.doesNotMatch(visiblePage, /data-share-price|data-share-id|data-open-share|id="share-dialog"/);
      assert.match(markup, /id="reset-snapshot"/, 'every page can build the same brief without external APIs');
      for (const match of markup.matchAll(/(?:src|href)="([^"#]+)"/g)) {
        const link = new URL(match[1].replaceAll('&amp;','&'), `https://example.com/intel/${page}`);
        if (link.origin !== 'https://example.com') continue;
        assert.ok(link.pathname.startsWith('/intel/'), 'local link must stay under the deployment subdirectory');
        const target = path.join(out, link.pathname.slice('/intel/'.length), link.pathname.endsWith('/') ? 'index.html' : '');
        assert.ok((await stat(target)).isFile(), `static asset/route missing: ${target}`);
      }
    }
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    assert.equal((visible.match(/class="ranking-row"/g) || []).length, 5);
    assert.equal((visible.match(/class="rank-cell /g) || []).length, 15);
    assert.equal((visible.match(/<tr>/g) || []).length, 16);
    for (const plan of market.plans) {
      assert.ok(visible.includes(`<h3>${escapeHTML(plan.name)}</h3>`));
      const top = rankedRegions(plan, market.fx).slice(0, 3);
      for (const quote of top) assert.ok(visible.includes(escapeHTML(quote.region)));
    }
    const date = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
    assert.ok(visible.includes(`行情时间 ${date(market.fx.updatedAt)}`));
    assert.ok(visible.includes(`本地报价 · ${date(market.plans[0].updatedAt)}`));
    assert.match(html, /content="index,follow,max-image-preview:large"/);
    assert.match(homeHtml, /rel="canonical" href="https:\/\/example\.com\/intel\/"/);
    assert.match(html, /rel="canonical" href="https:\/\/example\.com\/intel\/prices\/"/);
    assert.match(resetHtml, /rel="canonical" href="https:\/\/example\.com\/intel\/resets\/"/);
    assert.match(html, /property="og:image" content="https:\/\/example\.com\/intel\/social-card\.png"/);
    const schema = JSON.parse(html.match(/type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.deepEqual(schema['@graph'].map(item => item['@type']), ['WebSite', 'CollectionPage']);
    assert.match(resetHtml, /src="\.\.\/app\.js"/);
    assert.match(resetHtml, /href="\.\.\/prices\/"/);
    assert.match(homeHtml, /id="market-snapshot"/);
    assert.match(homeHtml, /id="reset-snapshot"/);
    assert.match(resetHtml, /id="market-snapshot"/);
    const homeVisible = homeHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    assert.ok(homeVisible.includes('Plus'));
    assert.ok(homeVisible.includes('Pro'));
    assert.ok(homeVisible.includes('菲律宾'));
    assert.match(homeVisible, /data-share-intel/);
    const resetVisible = resetHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    assert.equal((resetVisible.match(/class="announcement"/g) || []).length, 6);
    assert.ok(resetVisible.includes(escapeHTML(reset.status.latest_reset.summaryZh)));
    assert.ok(resetVisible.includes(escapeHTML(reset.records[0].source.url)));
    assert.match(await readFile(path.join(out, '404.html'), 'utf8'), /href="\/intel\/resets\/"/);
    assert.equal(await readFile(path.join(out, '.nojekyll'), 'utf8'), '');
    assert.ok((await readFile(path.join(out, 'social-card.png'))).length > 1000);
    assert.equal(html.includes('/api/market'), false);

    await buildStatic(fixture, { env: {} });
    const privateHtml = await readFile(path.join(out, 'index.html'), 'utf8');
    assert.match(privateHtml, /content="noindex,nofollow"/);
    assert.match(await readFile(path.join(out, 'robots.txt'), 'utf8'), /Disallow: \/\n/);
    await writeFile(path.join(fixture, 'pages/prices.html'), '<html><head></head><body>broken template</body></html>');
    await assert.rejects(buildStatic(fixture, { env: {} }), /预渲染模板缺少/);
    assert.equal(await readFile(path.join(out, 'index.html'), 'utf8'), privateHtml);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
