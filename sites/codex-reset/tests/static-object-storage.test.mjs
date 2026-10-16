import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildStatic } from '../scripts/build-static.mjs';
import { renderHomeDeals, renderHomeResets } from '../public/home-render.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const decode = value => value.replaceAll('&amp;', '&');
const anchorHrefs = html => [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map(match => decode(match[1]));

// Object storage resolves an exact key: directories never imply index.html.
function exactFileServer(folder, prefix) {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(prefix)) throw new Error('Outside deployment prefix');
      const filename = path.resolve(folder, pathname.slice(prefix.length));
      if (!filename.startsWith(`${folder}${path.sep}`) || !(await stat(filename)).isFile()) throw new Error('No exact file');
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': filename.endsWith('.html') ? 'text/html; charset=utf-8' : filename.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'NoSuchKey' }));
    }
  });
}

test('built navigation and browser-rendered cards work without directory indexes at root and nested paths', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'codex-exact-files-'));
  try {
    await Promise.all([
      cp(path.join(root, 'public'), path.join(fixture, 'public'), { recursive: true }),
      cp(path.join(root, 'pages'), path.join(fixture, 'pages'), { recursive: true }),
      cp(path.join(root, 'site.config.json'), path.join(fixture, 'site.config.json')),
      writeFile(path.join(fixture, 'package.json'), '{"type":"module"}'),
    ]);
    const market = JSON.parse(await readFile(path.join(fixture, 'public/data/prices.json'), 'utf8'));
    const reset = JSON.parse(await readFile(path.join(fixture, 'public/snapshot.json'), 'utf8'));
    for (const prefix of ['/', '/azt/intel/']) {
      await t.test(`exact keys under ${prefix}`, async () => {
        const out = await buildStatic(fixture, { env: {}, siteUrl: `https://example.com${prefix}`, indexable: true });
        const server = exactFileServer(out, prefix);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const home = new URL(`${prefix}index.html`, origin);
        const pages = ['index.html', 'prices/index.html', 'resets/index.html'];
        async function requestPage(url) {
          const response = await fetch(url, { redirect: 'manual' });
          assert.equal(response.status, 200, `exact HTML key should exist: ${url}`);
          assert.match(response.headers.get('content-type'), /^text\/html/);
          return response.text();
        }
        try {
          for (const directory of ['', 'prices', 'prices/', 'resets', 'resets/']) {
            const response = await fetch(new URL(`${prefix}${directory}`, origin), { redirect: 'manual' });
            assert.equal(response.status, 404, `test server must not supply a directory index: ${directory}`);
            assert.deepEqual(await response.json(), { code: 'NoSuchKey' });
          }

          // Follow the actual primary links: home -> prices -> resets -> home.
          let current = home;
          for (const nextPage of ['prices/index.html', 'resets/index.html', 'index.html']) {
            const html = await requestPage(current);
            const navigation = html.match(/<nav\b[^>]*aria-label="主导航"[^>]*>([\s\S]*?)<\/nav>/i)?.[1];
            assert.ok(navigation, 'each page needs its primary navigation');
            const destinations = anchorHrefs(navigation).map(href => new URL(href, current));
            assert.deepEqual(destinations.map(url => url.pathname), pages.map(page => `${prefix}${page}`));
            current = destinations.find(url => url.pathname === `${prefix}${nextPage}`);
            assert.ok(current, `primary navigation must name ${nextPage}`);
          }
          assert.equal(current.href, home.href);
          await requestPage(current);

          // Check all built internal anchors as exact keys, including footer links.
          for (const page of pages) {
            const currentPage = new URL(`${prefix}${page}`, origin);
            const html = await requestPage(currentPage);
            for (const href of anchorHrefs(html)) {
              const link = new URL(href, currentPage);
              if (link.origin !== origin) continue;
              assert.ok(link.pathname.startsWith(prefix), `navigation escaped deployment prefix: ${href}`);
              if (link.pathname.endsWith('/author-contact.png')) {
                const response = await fetch(link, { redirect: 'manual' });
                assert.equal(response.status, 200, `contact image exact key should exist: ${href}`);
                assert.match(response.headers.get('content-type'), /^image\/png/);
                continue;
              }
              assert.ok(link.pathname.endsWith('.html'), `navigation relies on a directory index: ${href}`);
              await requestPage(link);
            }

            // Crawlers and link previews also need exact keys, not only visible navigation.
            const canonical = decode(html.match(/rel="canonical" href="([^"]+)"/)[1]);
            const openGraphUrl = decode(html.match(/property="og:url" content="([^"]+)"/)[1]);
            const graph = JSON.parse(html.match(/type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
            const website = graph.find(item => item['@type'] === 'WebSite');
            const collection = graph.find(item => item['@type'] === 'CollectionPage');
            assert.equal(canonical, `https://example.com${prefix}${page}`);
            assert.equal(openGraphUrl, canonical);
            assert.equal(website.url, `https://example.com${prefix}index.html`);
            assert.equal(collection.url, canonical);
            assert.equal(website['@id'], `${website.url}#website`);
            assert.equal(collection['@id'], `${canonical}#webpage`);
            assert.equal(collection.isPartOf['@id'], website['@id']);
            for (const metadataUrl of [canonical, openGraphUrl, website.url, website['@id'], collection.url, collection['@id'], collection.isPartOf['@id']]) {
              const declared = new URL(metadataUrl);
              assert.equal(declared.origin, 'https://example.com');
              assert.ok(declared.pathname.endsWith('/index.html'), `metadata relies on a directory index: ${metadataUrl}`);
              await requestPage(new URL(declared.pathname, origin));
            }
          }

          const sitemapResponse = await fetch(new URL(`${prefix}sitemap.xml`, origin));
          assert.equal(sitemapResponse.status, 200);
          const sitemap = await sitemapResponse.text();
          const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => new URL(decode(match[1])));
          assert.deepEqual(sitemapUrls.map(url => url.href), pages.map(page => `https://example.com${prefix}${page}`));
          for (const url of sitemapUrls) await requestPage(new URL(url.pathname, origin));

          // These strings are also generated after browser data refresh, without a rebuild.
          const dealLinks = anchorHrefs(renderHomeDeals(market, 'pro500')).map(href => new URL(href, home));
          assert.equal(dealLinks.length, 2);
          assert.deepEqual(dealLinks.map(url => url.searchParams.get('plan')), ['plus', 'pro500']);
          for (const link of dealLinks) {
            assert.equal(link.pathname, `${prefix}prices/index.html`);
            assert.match(link.searchParams.get('country'), /^[A-Z]{2}$/);
            assert.ok(['web_direct', 'app_store'].includes(link.searchParams.get('channel')));
            assert.equal(link.hash, '#regional-prices');
            await requestPage(link);
          }
          const resetLinks = anchorHrefs(renderHomeResets(reset)).map(href => new URL(href, home)).filter(url => url.origin === origin);
          assert.equal(resetLinks.length, 1);
          assert.equal(resetLinks[0].pathname, `${prefix}resets/index.html`);
          await requestPage(resetLinks[0]);
        } finally {
          await new Promise(resolve => server.close(resolve));
        }
      });
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
