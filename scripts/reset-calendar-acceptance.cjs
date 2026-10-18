// Run: node_modules/.bin/electron scripts/reset-calendar-acceptance.cjs
// Bundles the real UI into an isolated local fixture. All calendar API calls are
// in-memory; no account state, live gateway, source website, or notification API is used.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const { mkdtempSync, mkdirSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');

const repo = path.resolve(__dirname, '..');
const root = mkdtempSync(path.join(os.tmpdir(), 'azt-reset-calendar-acceptance-'));
const output = path.join(repo, 'artifacts', 'reset-calendar');
mkdirSync(path.join(root, 'profile'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const screenshots = [];
const errors = [];
const blockedRequests = [];
const layoutMetrics = {
  previousGuideCssPx: 160.39,
  previousGuideBasis: 'Actual preceding UI DOM measured in the isolated 1540px Electron fixture; see layout-before-compact.json.',
  previousScreenshot: 'before-compact-calendar.png',
};
let server;
let win;
let origin;

const announcement = (id, type, announcedAt, text, source) => ({
  id, reset_type: type, announced_at: announcedAt, text,
  source: source || { type: 'x_post', author: 'thsottiaux', url: `https://x.com/thsottiaux/status/${id}` },
});
const translated = (record, zhCN) => ({ ...record, translation: {
  zhCN, source: 'ai-resets.com', sourceUrl: 'https://ai-resets.com/', originalText: record.text,
} });
const records = [
  translated(announcement('fixture-03', 'regular', '2026-10-02T21:18:00Z', 'Synthetic public regular reset on October 3.'), '10 月 3 日公开公告确认普通重置。（验收示例）'),
  translated(announcement('fixture-07', 'regular', '2026-10-07T03:35:00Z', 'Synthetic public regular reset on October 7.'), '10 月 7 日公开公告确认普通重置。（验收示例）'),
  translated(announcement('fixture-08', 'banked', '2026-10-08T03:44:00Z', 'Synthetic banked reset. This does not establish personal quota credit.'), '公开公告提及可留待使用的储备重置，个人账号是否获得仍需自行确认。（验收示例）'),
  translated(announcement('fixture-11', 'regular', '2026-10-11T04:01:00Z', 'Synthetic public confirmation on October 11.'), '10 月 11 日公开公告确认重置，个人额度以账号内实际显示为准。（验收示例）'),
];
const initialState = {
  records,
  status: {
    latest_reset: records[3], scheduled_reset: null, active_watch: null,
    stats: { total: 4, last_reset_at: records[3].announced_at, days_since_last: 1, avg_interval_days: 2.7 },
  },
  settings: { signalNotifications: true, confirmedNotifications: true },
  sync: {
    phase: 'ready', lastSyncedAt: '2026-10-12T01:59:00Z', generatedAt: '2026-10-12T01:59:00Z',
    error: null, nextSyncAt: '2026-10-12T02:04:00Z', historyComplete: true,
  },
  notificationsSupported: true,
};

async function until(check, label) {
  for (let i = 0; i < 160; i += 1) {
    if (await check()) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}
const js = async (source) => {
  try { return await win.webContents.executeJavaScript(source, true); }
  catch (cause) { throw new Error(`Fixture renderer failed: ${source}`, { cause }); }
};
const visible = (source, label = source) => until(() => js(source), label);
const t = (key) => js(`window.__acceptance.t(${JSON.stringify(key)})`);

async function click(selector, text) {
  const found = await js(`(() => {
    const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const element = ${text === undefined ? 'candidates[0]' : `candidates.find(node => node.textContent.trim() === ${JSON.stringify(text)} || node.getAttribute('aria-label') === ${JSON.stringify(text)})`};
    if (!element || element.disabled) return false;
    element.focus(); element.click(); return true;
  })()`);
  assert.ok(found, `Enabled control: ${selector}${text === undefined ? '' : ` (${text})`}`);
}
async function clickKey(selector, key) { await click(selector, await t(key)); }
async function selectDay(day) {
  assert.ok(await js(`(() => {
    const button = [...document.querySelectorAll('.rc-day:not(.is-outside)')]
      .find(node => Number(node.querySelector('.rc-day-number')?.textContent) === ${day});
    if (!button) return false; button.focus(); button.click(); return true;
  })()`), `Calendar day ${day}`);
  await visible(`Number(document.querySelector('.rc-day.is-selected .rc-day-number')?.textContent) === ${day}`);
  await pause(30);
}
async function poll() {
  const previous = await js('window.__acceptance.mock.getCount');
  await js('window.__acceptance.poll()');
  await visible(`window.__acceptance.mock.getCount > ${previous}`, 'fixture periodic refresh');
  await pause(75);
}
async function sync() {
  await clickKey('.rc-actions button', 'resetCalendar.synchronize');
  await visible('!document.querySelector(".rc-actions button .spin")', 'sync finishes');
  await pause(30);
}
async function openSettings() {
  await clickKey('.rc-actions button', 'resetCalendar.settings.title');
  await visible('Boolean(document.querySelector(".rc-modal[role=dialog]"))', 'notification settings opens');
  assert.ok(await js('document.querySelector(".rc-modal").contains(document.activeElement)'), 'Dialog receives focus');
}
async function escape() {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await visible('!document.querySelector(".rc-modal")', 'Escape closes settings');
}
async function capture(name) {
  await js('document.getAnimations().forEach(animation => { try { animation.finish(); } catch {} })');
  await pause(180);
  await fs.writeFile(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  screenshots.push(`${name}.png`);
}
async function noHorizontalOverflow(selector) {
  const layout = await js(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const bounds = element?.getBoundingClientRect();
    return element && { scroll: element.scrollWidth, client: element.clientWidth,
      left: bounds.left, right: bounds.right, viewport: innerWidth };
  })()`);
  assert.ok(layout, `Layout element ${selector}`);
  assert.ok(layout.scroll <= layout.client + 1, `${selector} overflows horizontally: ${JSON.stringify(layout)}`);
  assert.ok(layout.left >= -1 && layout.right <= layout.viewport + 1, `${selector} exceeds viewport: ${JSON.stringify(layout)}`);
}
async function assertSourceContent(selector, record, chinese = record.translation?.zhCN) {
  const content = await js(`(() => {
    const source = document.querySelector(${JSON.stringify(selector)});
    const english = source?.querySelector('.is-english p');
    const chinese = source?.querySelector('.is-chinese p');
    const directlyShown = element => Boolean(element?.getClientRects().length)
      && !element.closest('details:not([open])');
    return source && { english: english?.textContent.trim(), chinese: chinese?.textContent.trim(),
      englishShown: directlyShown(english), chineseShown: directlyShown(chinese),
      missing: Boolean(source.querySelector('.rc-translation-empty')),
      sharedCard: source.querySelectorAll('.rc-source-texts').length === 1
        && english?.closest('.rc-source-texts') === chinese?.closest('.rc-source-texts') };
  })()`);
  assert.ok(content, `Source content ${selector}`);
  assert.equal(content.english, record.text, 'Exact source original is always shown');
  assert.equal(content.chinese, chinese || await t('resetCalendar.sourceContent.chineseUnavailable'));
  assert.equal(content.missing, !chinese, 'Only an exact matched translation is displayed');
  assert.ok(content.englishShown && content.chineseShown, 'Both language blocks are shown without expansion');
  assert.ok(content.sharedCard, 'Chinese and English share one content card');
}

async function prepareFixture() {
  await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { LocaleProvider, useLocale, useT } from './admin-ui/src/i18n';
      import { AppShell } from './admin-ui/src/layouts/AppShell';
      import { buildRoutes } from './admin-ui/src/routes/routes';
      import type { ResetCalendarState } from './src/core/reset-calendar-types';
      import './admin-ui/src/styles.css';

      localStorage.setItem('azt.admin.locale', 'zh-CN');
      const state: ResetCalendarState = ${JSON.stringify(initialState)};
      const mock = {
        state, now: Date.parse('2026-10-12T02:00:00Z'), requests: [], getCount: 0,
        networkError: false, saveError: false, testMode: 'success', unexpected: [],
        clipboardError: false, copied: [],
      };
      window.desktopApp = {
        isDesktop: true,
      };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        async writeText(value) {
          if (mock.clipboardError) throw new Error('Synthetic clipboard failure');
          mock.copied.push(value);
        },
      } });
      Date.now = () => mock.now;
      const periodic = new Map();
      const realInterval = window.setInterval.bind(window);
      const realClearInterval = window.clearInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const id = realInterval(callback, delay, ...args);
        if (delay === 30_000) periodic.set(id, () => callback(...args));
        return id;
      };
      window.clearInterval = (id) => { periodic.delete(id); realClearInterval(id); };
      window.fetch = async (input, options = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        const method = (options.method || 'GET').toUpperCase();
        mock.requests.push({ path: url.pathname, method });
        if (url.origin !== location.origin) throw new Error('External fetch is forbidden in this fixture.');
        const endpoint = '/_gateway/admin/reset-calendar';
        const respond = (body, status = 200) => new Response(JSON.stringify(body), {
          status, headers: { 'Content-Type': 'application/json' },
        });
        if (method === 'GET' && url.pathname === endpoint) {
          mock.getCount += 1;
          if (mock.networkError) throw new Error('Synthetic offline calendar');
          return respond(mock.state);
        }
        if (method === 'POST' && url.pathname === endpoint + '/sync') {
          if (mock.networkError) throw new Error('Synthetic offline calendar');
          return respond(mock.state);
        }
        if (method === 'PUT' && url.pathname === endpoint + '/settings') {
          if (mock.saveError) return respond({ error: { message: 'Synthetic save failure' } }, 503);
          mock.state.settings = JSON.parse(options.body);
          return respond(mock.state);
        }
        if (method === 'POST' && url.pathname === endpoint + '/test-notification') {
          if (mock.testMode === 'error') return respond({ error: { message: 'Synthetic test failure' } }, 503);
          return respond({ sent: mock.testMode === 'success' && mock.state.notificationsSupported });
        }
        mock.unexpected.push({ path: url.pathname, method });
        throw new Error('Unexpected fixture API request: ' + method + ' ' + url.pathname);
      };
      window.__acceptance = { mock, poll: () => periodic.forEach(callback => callback()) };
      window.addEventListener('error', event => { mock.unexpected.push({ error: event.message }); });
      function Preview() {
        const t = useT();
        const { setLocale } = useLocale();
        window.__acceptance.t = t;
        window.__acceptance.setLocale = setLocale;
        const routes = buildRoutes(t);
        const channel = { currentVersion: 'fixture', latestVersion: 'fixture', status: 'ok' };
        const workspace = {
          routes, activeRoute: 'reset-calendar', activeRouteMeta: routes.find(route => route.id === 'reset-calendar'),
          pageDescriptions: { 'reset-calendar': t('pageDescriptions.reset-calendar') },
          requestLogs: [], isLoading: false, goRoute() {}, copyBaseUrl() {}, setContactOpen() {},
          setStatus(message) { window.__acceptance.lastStatus = message; },
          config: { status: { loggedIn: true, activeProvider: 'openai-codex' }, profiles: [],
            baseUrl: 'http://127.0.0.1:8787/v1', versionStatus: { desktop: channel, npm: channel } },
        };
        return <AppShell workspace={workspace} />;
      }
      createRoot(document.getElementById('root')).render(<React.StrictMode><LocaleProvider><Preview /></LocaleProvider></React.StrictMode>);
    `, resolveDir: repo, loader: 'tsx' },
    bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', outfile: path.join(root, 'fixture.js'),
    alias: { '@': path.join(repo, 'admin-ui/src') }, loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.md': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: path.join(repo, 'admin-ui/tsconfig.json'),
    logLevel: 'silent',
  });
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>');
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!['index.html', 'fixture.js', 'fixture.css'].includes(name)) { response.writeHead(404).end(); return; }
    try {
      const body = await fs.readFile(path.join(root, name));
      response.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
}

async function main() {
  await app.whenReady();
  await fs.mkdir(output, { recursive: true });
  await prepareFixture();
  win = new BrowserWindow({ show: false, width: 1540, height: 1050, webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
  } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (new URL(details.url).origin !== origin) { blockedRequests.push(details.url); callback({ cancel: true }); }
    else callback({});
  });
  win.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_event, details) => errors.push(`Renderer exited: ${details.reason}`));
  // Deliberately use a non-Beijing browser zone to catch accidental local bucketing.
  // Navigate first so the renderer exists before asking DevTools to override it.
  await win.loadURL(origin);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
  await win.loadURL(origin);
  await visible('Boolean(document.querySelector(".rc-month-table"))', 'real calendar page renders');
  assert.equal(await js('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'America/Los_Angeles');
  assert.equal(await js('document.querySelector(".nav-item.is-active span")?.textContent'), await t('routes.reset-calendar'));

  assert.deepEqual(await js('[...document.querySelectorAll(".rc-month-table th")].map(node => node.textContent)'),
    await js('Array.from({length:7}, (_, i) => window.__acceptance.t("resetCalendar.weekdays." + i))'), 'Monday-first weekday headings');
  assert.deepEqual(await js('[...document.querySelectorAll(".rc-month-table tbody tr:first-child .rc-day-number")].map(node => Number(node.textContent))'),
    [28, 29, 30, 1, 2, 3, 4], 'October 2026 starts on Thursday in Monday-first grid');
  assert.equal(await js('Number(document.querySelector(".rc-day[aria-current=date] .rc-day-number")?.textContent)'), 12, 'Beijing today');
  assert.equal(await js('document.querySelectorAll(".rc-calendar-event").length'), 4);
  await selectDay(11);
  assert.equal(await js('document.querySelectorAll(".rc-record-detail").length'), 1);
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-badge")?.textContent'), await t('resetCalendar.compactStage.confirmed'));
  assert.equal(await js('document.querySelector(".rc-account-note")?.textContent'), await t('resetCalendar.accountDisclaimer'));
  await assertSourceContent('.rc-record-detail .rc-source-content', records[3]);
  assert.ok(await js('document.querySelector(".rc-record-detail .rc-source-meta-line").textContent.includes("12:01")'), 'Compact source line retains Beijing announcement time');
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-source-meta-line time").dateTime'), records[3].announced_at);
  assert.equal(await js('Boolean(document.querySelector(".rc-source-url, .rc-source-meta, .rc-record-summary, .rc-source-content > h4"))'), false, 'Repeated source headings, summaries and metadata grid removed');
  assert.equal(await js('document.querySelector(".rc-record-detail").textContent.includes("https://")'), false, 'Raw source URL is hidden in normal reading');
  assert.equal(await js('document.querySelectorAll(".rc-record-detail .rc-source-footer button").length'), 1, 'Source footer contains only the copy control');
  assert.equal(await js('document.querySelector(".rc-types-explanation").open'), false, 'Type explanation is collapsed by default');
  win.setContentSize(1540, 1050);
  await pause(100);
  layoutMetrics.guideCollapsedCssPx = await js('Math.round(document.querySelector(".rc-types-explanation").getBoundingClientRect().height * 100) / 100');
  layoutMetrics.guideSavedCssPx = Number((layoutMetrics.previousGuideCssPx - layoutMetrics.guideCollapsedCssPx).toFixed(2));
  await click('.rc-types-explanation > summary');
  await visible('document.querySelector(".rc-types-explanation").open');
  assert.equal(await js('document.querySelectorAll(".rc-type-guide-details .rc-types-columns h3").length'), 2, 'Expanded guide explains both reset types');
  layoutMetrics.guideExpandedCssPx = await js('Math.round(document.querySelector(".rc-types-explanation").getBoundingClientRect().height * 100) / 100');
  assert.ok(layoutMetrics.guideExpandedCssPx > layoutMetrics.guideCollapsedCssPx, 'Guide expands for detailed reading');
  await click('.rc-types-explanation > summary');
  await visible('!document.querySelector(".rc-types-explanation").open');
  assert.ok(Math.abs(await js('document.querySelector(".rc-types-explanation").getBoundingClientRect().height')
    - layoutMetrics.guideCollapsedCssPx) <= 1, 'Collapsed guide returns to its compact height');
  await js('window.scrollTo(0, 0)');
  await capture('01-calendar');
  await js('document.querySelector(".rc-record-detail .rc-source-content").scrollIntoView({block:"start"})');
  await capture('09-desktop-bilingual-source');
  checks.push('real routed page, Monday-first October grid, Beijing today, default-collapsed type guide expands; one bilingual card; compact details with copy-only source footer');

  const boundary = announcement('fixture-boundary', 'regular', '2026-09-30T16:30:00Z', 'BEIJING_OCTOBER_BOUNDARY');
  const september = announcement('fixture-september', 'banked', '2026-09-30T15:45:00Z', 'BEIJING_SEPTEMBER_BOUNDARY');
  const unsafe = announcement('fixture-unsafe', 'banked', '2026-10-08T04:20:00Z', 'UNSAFE_SOURCE_FIXTURE', { type: 'observed', url: 'javascript:window.__unsafeExecuted=true' });
  await js(`window.__acceptance.mock.state.records.push(${JSON.stringify(boundary)}, ${JSON.stringify(september)}, ${JSON.stringify(unsafe)})`);
  await poll();
  await selectDay(1);
  assert.ok(await js('document.querySelector(".rc-record-detail")?.textContent.includes("BEIJING_OCTOBER_BOUNDARY")'), 'UTC September event buckets into Beijing October');
  assert.ok(await js('document.querySelector(".rc-record-detail .rc-source-meta-line")?.textContent.includes("00:30")'), 'Cross-day event displays Beijing time');
  await assertSourceContent('.rc-record-detail .rc-source-content', boundary, null);
  await clickKey('.rc-month-buttons button', 'resetCalendar.previousMonth');
  await selectDay(30);
  assert.equal(await js('document.querySelectorAll(".rc-record-detail").length'), 1, 'September retains only its Beijing event');
  assert.ok(await js('document.querySelector(".rc-record-detail")?.textContent.includes("BEIJING_SEPTEMBER_BOUNDARY")'));
  await clickKey('.rc-month-buttons button', 'resetCalendar.nextMonth');
  await js('window.__acceptance.mock.state.records.find(record => record.id === "fixture-07").translation = { zhCN: "STALE_TRANSLATION_SENTINEL", source: "ai-resets.com", sourceUrl: "https://ai-resets.com/", originalText: "Different original text" }');
  await poll();
  await selectDay(7);
  await assertSourceContent('.rc-record-detail .rc-source-content', records[1], null);
  assert.equal(await js('document.querySelector(".rc-detail-panel").textContent.includes("STALE_TRANSLATION_SENTINEL")'), false, 'Stale translation never appears');
  const localRevision = { ...records[1], translation: { ...records[1].translation, source: 'ai-zero-token' } };
  await js(`window.__acceptance.mock.state.records[1] = ${JSON.stringify(localRevision)}`);
  await poll();
  await assertSourceContent('.rc-record-detail .rc-source-content', localRevision);
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-translation-note")?.title'), await t('resetCalendar.sourceContent.localTranslationNote'), 'Local revision retains full provenance in its title');
  await js('document.querySelector(".rc-record-detail .rc-source-content").scrollIntoView({block:"center"})');
  await capture('10-desktop-bilingual-local-revision');
  await clickKey('.rc-filters button', 'resetCalendar.types.banked');
  assert.equal(await js('document.querySelectorAll(".rc-calendar-event.is-regular").length'), 0);
  await selectDay(8);
  assert.equal(await js('document.querySelectorAll(".rc-record-detail").length'), 2);
  await assertSourceContent('.rc-record-detail:has(.rc-source-footer button) .rc-source-content', records[2]);
  const safety = await js(`(() => {
    const articles = [...document.querySelectorAll('.rc-record-detail')];
    const unsafe = articles.find(node => node.textContent.includes('UNSAFE_SOURCE_FIXTURE'));
    return { unsafeHasLink: Boolean(unsafe?.querySelector('a, .rc-source-footer button, .rc-source-copy-fallback')),
      executed: Boolean(window.__unsafeExecuted) };
  })()`);
  assert.equal(safety.unsafeHasLink, false, 'javascript source rejected');
  assert.equal(safety.executed, false);
  await click('.rc-record-detail .rc-source-footer button');
  await visible('document.querySelector(".rc-record-detail .rc-source-feedback")?.textContent === window.__acceptance.t("resetCalendar.sourceContent.copied")');
  assert.deepEqual(await js('window.__acceptance.mock.copied'), [records[2].source.url], 'Copy writes full original URL');
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-source-feedback").getAttribute("role")'), 'status');
  await js('window.__acceptance.mock.clipboardError = true');
  await click('.rc-record-detail .rc-source-footer button');
  await visible('document.querySelector(".rc-record-detail .rc-source-feedback")?.textContent === window.__acceptance.t("resetCalendar.sourceContent.copyFailed")');
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-source-feedback").getAttribute("role")'), 'alert');
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-source-copy-fallback")?.value'), records[2].source.url, 'Failed copy exposes a manual-copy fallback');
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-source-copy-fallback")?.readOnly'), true);
  await js('window.__acceptance.mock.clipboardError = false');
  await click('.rc-record-detail .rc-source-footer button');
  await visible('!document.querySelector(".rc-record-detail .rc-source-copy-fallback")', 'Successful copy removes manual fallback');
  await clickKey('.rc-filters button', 'resetCalendar.types.regular');
  assert.equal(await js('document.querySelectorAll(".rc-calendar-event.is-banked").length'), 0);
  await clickKey('.rc-filters button', 'resetCalendar.types.all');
  await selectDay(11);
  checks.push('Beijing cross-day/month grouping and filters; missing/stale translations rejected; local revision provenance; unsafe source cannot be copied; clipboard success/failure and manual-copy fallback');

  const settingsWrites = () => js('window.__acceptance.mock.requests.filter(request => request.method === "PUT").length');
  await click('.rc-notification-status button');
  await visible('Boolean(document.querySelector(".rc-modal"))', 'Compact notification control opens settings');
  await escape();
  assert.ok(await js('document.activeElement === document.querySelector(".rc-notification-status button")'), 'Compact notification control receives focus back');
  await openSettings();
  const writesBefore = await settingsWrites();
  await click('.rc-switch');
  assert.equal(await js('document.querySelector(".rc-switch").checked'), false);
  await clickKey('.rc-modal-footer button', 'resetCalendar.settings.cancel');
  await visible('!document.querySelector(".rc-modal")');
  assert.equal(await settingsWrites(), writesBefore, 'Cancel does not persist settings');
  await openSettings();
  assert.equal(await js('document.querySelector(".rc-switch").checked'), true, 'Reopen discards cancelled draft');
  await click('.rc-switch');
  await js('window.__acceptance.mock.state.sync.lastSyncedAt = "2026-10-12T02:00:30Z"');
  await poll();
  assert.equal(await js('document.querySelector(".rc-switch").checked'), false, 'Page refresh does not overwrite open draft');
  await clickKey('.rc-modal-footer button', 'resetCalendar.settings.save');
  await visible('!document.querySelector(".rc-modal")');
  assert.deepEqual(await js('window.__acceptance.mock.state.settings'), { signalNotifications: false, confirmedNotifications: true });
  assert.equal(await settingsWrites(), writesBefore + 1);
  await poll();
  await openSettings();
  assert.deepEqual(await js('[...document.querySelectorAll(".rc-switch")].map(node => node.checked)'), [false, true], 'Saved settings survive mock refresh and reopen');
  await capture('02-notification-settings');
  assert.ok(await js('document.querySelector(".rc-card-guide").textContent.includes(window.__acceptance.t("resetCalendar.settings.cardDescription"))'), 'Desktop card guidance replaces OS permissions');
  assert.equal(await js('document.querySelectorAll("iframe.rc-notification-preview[sandbox]").length'), 2, 'Both examples use the actual sandboxed card renderer');
  assert.equal(await js('document.querySelectorAll(".rc-notification-actions button").length'), 1, 'Only the test action remains');
  checks.push('cancelled draft discarded, periodic page refresh preserves draft, explicit save persists and survives refresh');

  for (const [mode, key] of [
    ['success', 'resetCalendar.settings.testSent'],
    ['not-sent', 'resetCalendar.settings.testNotSent'],
    ['error', 'resetCalendar.settings.testFailed'],
  ]) {
    await js(`window.__acceptance.mock.testMode = ${JSON.stringify(mode)}`);
    await clickKey('.rc-notification-support button', 'resetCalendar.settings.sendTest');
    await visible(`document.querySelector('.rc-modal-feedback')?.textContent === window.__acceptance.t(${JSON.stringify(key)})`, `Test notification ${mode}`);
    assert.equal(await js('document.querySelector(".rc-modal-feedback")?.getAttribute("role")'), mode === 'success' ? 'status' : 'alert');
  }
  await escape();
  assert.equal(await js('document.activeElement?.textContent.trim()'), await t('resetCalendar.settings.title'), 'Escape restores opening control focus');
  await js('window.__acceptance.mock.state.notificationsSupported = false');
  await sync();
  await openSettings();
  assert.equal(await js('document.querySelector(".rc-notification-support button").disabled'), true, 'Unsupported notifications disable test control');
  assert.ok(await js('document.querySelector(".rc-notification-support").textContent.includes(window.__acceptance.t("resetCalendar.settings.unsupported"))'));
  const testsBefore = await js('window.__acceptance.mock.requests.filter(request => request.path.endsWith("/test-notification")).length');
  await js('document.querySelector(".rc-notification-support button").click()');
  assert.equal(await js('window.__acceptance.mock.requests.filter(request => request.path.endsWith("/test-notification")).length'), testsBefore);
  await js("window.dispatchEvent(new Event('azt:open-reset-calendar'))");
  await visible('!document.querySelector(".rc-modal")', 'Card click reveals the calendar beneath settings');
  checks.push('notification success, rejected delivery, network failure, unsupported desktop state, Escape focus return');

  const scheduled = { ...translated(announcement('fixture-scheduled', 'banked', '2026-10-12T01:00:00Z', 'A public scheduled reset is awaiting confirmation. Synthetic acceptance fixture.'), '公开信号预告储备重置，预计时间已过，仍待公开确认。（验收示例）'),
    status: 'scheduled', scheduled_for: '2026-10-12T01:30:00Z' };
  await js(`window.__acceptance.mock.state.status.scheduled_reset = ${JSON.stringify(scheduled)}`);
  await sync();
  assert.ok(await js('document.querySelector(".rc-signal-detail").textContent.includes(window.__acceptance.t("resetCalendar.signal.overdueHint"))'), 'Expired scheduled time remains awaiting confirmation');
  assert.ok(await js('document.querySelector(".rc-signal-detail").compareDocumentPosition(document.querySelector(".rc-intel-confirmation-grid")) & Node.DOCUMENT_POSITION_FOLLOWING'), 'Signal precedes the latest confirmation');
  assert.equal(await js('document.querySelector(".rc-signal-timing time").dateTime'), scheduled.scheduled_for);
  assert.equal(await js('document.querySelector(".rc-signal-timing time strong").textContent'), '09:30', 'Expected time prominent in Beijing time');
  await selectDay(12);
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-badge").textContent'), await t('resetCalendar.compactStage.scheduled'));
  assert.equal(await js('document.querySelectorAll(".rc-record-detail .is-confirmed").length'), 0, 'Scheduled reset never promoted by time alone');
  await assertSourceContent('.rc-signal-detail .rc-source-content', scheduled);
  await assertSourceContent('.rc-record-detail .rc-source-content', scheduled);
  assert.equal(await js('document.querySelector(".rc-calendar-event.is-scheduled .rc-event-stage").textContent'), await t('resetCalendar.signal.previewShort'));
  await clickKey('.rc-filters button', 'resetCalendar.types.regular');
  await clickKey('.rc-month-buttons button', 'resetCalendar.previousMonth');
  await click('.rc-signal-view');
  await visible('document.activeElement === document.querySelector(".rc-detail-panel h2")');
  assert.equal(await js('Number(document.querySelector(".rc-day.is-selected .rc-day-number").textContent)'), 12, 'Preview action restores announcement month and day');
  assert.equal(await js('document.querySelector(".rc-filters [aria-pressed=true]").textContent'), await t('resetCalendar.types.all'), 'Preview action clears incompatible filter');
  assert.equal(await js('document.querySelectorAll(".rc-record-detail .is-scheduled").length'), 1);
  await js('document.querySelector(".rc-page").scrollIntoView({block:"start"})');
  await capture('03-scheduled-awaiting-confirmation');
  const upcoming = { ...translated({ ...scheduled, text: 'A banked reset is planned for October 13 at 10:30 UTC. Awaiting public confirmation. Synthetic acceptance fixture.' }, '公开公告预告 10 月 13 日北京时间 18:30 发放储备重置，仍待公开确认。（验收示例）'), scheduled_for: '2026-10-13T10:30:00Z' };
  await js(`window.__acceptance.mock.state.status.scheduled_reset = ${JSON.stringify(upcoming)}`);
  await sync();
  assert.ok(await js('document.querySelector(".rc-signal-description").textContent === window.__acceptance.t("resetCalendar.signal.scheduledHint")'), 'Future time remains a pending announcement');
  assert.equal(await js('document.querySelector(".rc-signal-timing time strong").textContent'), '18:30');
  await capture('10-upcoming-reset');
  await js('window.__acceptance.mock.state.status.scheduled_reset.scheduled_for = null');
  await sync();
  assert.equal(await js('document.querySelector(".rc-signal-time-unknown").textContent'), await t('resetCalendar.signal.timeUnknown'), 'No invented deadline when source omits time');
  assert.equal(await js('document.querySelectorAll(".rc-signal-timing time").length'), 0);
  // The scheduled item must stay visible even when newer same-day records would fill both slots.
  await js(`window.__acceptance.mock.state.records.push(${JSON.stringify(announcement('preview-crowded-1', 'regular', '2026-10-12T01:50:00Z', 'Another record'))}, ${JSON.stringify(announcement('preview-crowded-2', 'regular', '2026-10-12T01:55:00Z', 'Another record'))})`);
  await sync();
  assert.equal(await js('document.querySelectorAll(".rc-day.is-selected .rc-calendar-event.is-scheduled").length'), 1, 'Preview stays visible on crowded dates');
  await js(`window.__acceptance.mock.state.records = window.__acceptance.mock.state.records.filter(record => !record.id.startsWith('preview-crowded-'));
    window.__acceptance.mock.state.status.scheduled_reset = ${JSON.stringify(scheduled)}`);
  await sync();
  checks.push('top-priority preview, prominent Beijing deadline, calendar preview badge, date/filter navigation with focus, unknown/future/past times, crowded-day visibility');
  const watch = translated({ level: 'strong', reset_chance_percent: 90, forecast_window: 'The coming hours',
    observed_at: '2026-10-12T01:45:00Z', expires_at: '2026-10-12T03:00:00Z',
    text: 'A public reset signal remains unconfirmed. Synthetic acceptance fixture.', source: { type: 'observed', url: 'https://codex-resets.com/' } },
    '公开观察发现较强重置信号，仍未确认已经重置。（验收示例）');
  const sameTextWatch = translated({ ...watch, text: scheduled.text }, 'WATCH_TRANSLATION_MUST_NOT_LEAK');
  await js(`delete window.__acceptance.mock.state.status.scheduled_reset.translation;
    window.__acceptance.mock.state.status.active_watch = ${JSON.stringify(sameTextWatch)}`);
  await sync();
  await assertSourceContent('.rc-signal-detail .rc-source-content', scheduled, null);
  assert.equal(await js('document.querySelector(".rc-signal-detail").textContent.includes("WATCH_TRANSLATION_MUST_NOT_LEAK")'), false, 'Scheduled source never borrows watch translation');
  await js(`window.__acceptance.mock.state.status.scheduled_reset = null;
    window.__acceptance.mock.state.status.active_watch = ${JSON.stringify(watch)}`);
  await sync();
  await assertSourceContent('.rc-signal-detail .rc-source-content', watch);
  assert.ok(await js('document.querySelector(".rc-signal-detail .rc-source-meta-line").textContent.includes("09:45")'), 'Watch observation time is Beijing time');
  assert.equal(await js('document.querySelectorAll(".rc-day:not(.is-outside) .rc-calendar-event").length'), 6, 'Unconfirmed watch never becomes a calendar reset');
  await js('document.querySelector(".rc-signal-detail").scrollIntoView({block:"start"})');
  await capture('07-watch-bilingual-source');
  const expiredWatch = { level: 'strong', reset_chance_percent: 90, forecast_window: 'Synthetic window',
    observed_at: '2026-10-12T00:00:00Z', expires_at: '2026-10-12T01:00:00Z', text: 'EXPIRED_WATCH_FIXTURE', source: { type: 'observed' } };
  await js(`window.__acceptance.mock.state.status.scheduled_reset = null;
    window.__acceptance.mock.state.status.active_watch = ${JSON.stringify(expiredWatch)};
    window.__acceptance.mock.state.notificationsSupported = true`);
  await sync();
  assert.equal(await js('Boolean(document.querySelector(".rc-signal-detail"))'), false, 'Expired watch hidden');
  assert.ok(await js('document.querySelector(".rc-intel-no-preview").textContent.includes(window.__acceptance.t("intelStation.noPreview"))'));
  checks.push('scheduled and watch show direct bilingual sources without cross-object translation; scheduled stays unconfirmed after expected time; expired watch disappears');

  await selectDay(11);
  const cachedEvents = await js('document.querySelectorAll(".rc-calendar-event").length');
  await js('window.__acceptance.mock.state.sync.manualRetryAt = null');
  await poll();
  await js('window.__acceptance.mock.networkError = true');
  await sync();
  assert.equal(await js('document.querySelectorAll(".rc-calendar-event").length'), cachedEvents, 'Network error retains cached events');
  assert.ok(await js('document.querySelector(".rc-sync-error").textContent.includes(window.__acceptance.t("resetCalendar.cachedError"))'));
  assert.equal(await js('document.querySelectorAll(".rc-record-detail").length'), 1, 'Cached day details retained');
  assert.equal(await js('document.querySelector(".rc-actions button").disabled'), false, 'Local API failure does not invent an upstream cooldown');
  await js(`window.__acceptance.mock.networkError = false;
    window.__acceptance.mock.state.sync.phase = 'error';
    window.__acceptance.mock.state.sync.error = '同步超时，已保留本地记录，将自动重试。';
    window.__acceptance.mock.state.sync.nextSyncAt = new Date(window.__acceptance.mock.now + 40 * 60_000).toISOString();
    window.__acceptance.mock.state.sync.manualRetryAt = new Date(window.__acceptance.mock.now + 10_000).toISOString()`);
  await poll();
  assert.equal(await js('document.querySelector(".rc-actions button").disabled'), true, 'Short cooldown prevents repeated clicks');
  assert.equal(await js('document.querySelector(".rc-sync-error button").disabled'), true, 'Retry also honors short cooldown');
  assert.equal(await js('document.querySelectorAll(".rc-retry-time").length'), 2, 'Automatic and manual retry deadlines are distinct');
  await capture('04-cached-network-error');
  await js('window.__acceptance.mock.now += 10_001');
  await visible('document.querySelector(".rc-actions button").disabled === false');
  assert.ok(await js('Date.parse(window.__acceptance.mock.state.sync.nextSyncAt) > Date.now()'), 'Manual retry unlocks before automatic backoff');
  await capture('04-manual-retry-available');
  await js('window.__acceptance.mock.state.sync.manualRetryAt = new Date(Date.now() + 600_000).toISOString()');
  await poll();
  await js('window.__acceptance.mock.now += 30_000');
  await poll();
  assert.equal(await js('document.querySelector(".rc-sync-error button").disabled'), true, 'Server rate limit remains binding');
  await js('window.__acceptance.mock.now += 600_000');
  await poll();
  await js('window.__acceptance.mock.state.sync.phase = "ready"; window.__acceptance.mock.state.sync.error = null; window.__acceptance.mock.state.sync.manualRetryAt = null');
  await sync();
  assert.equal(await js('Boolean(document.querySelector(".rc-sync-error"))'), false, 'Successful retry clears error');
  checks.push('network failure keeps cached calendar/details; short manual cooldown expires before automatic backoff; upstream rate limits remain binding; retry recovers');

  await js('window.__acceptance.setLocale("en")');
  await visible('document.documentElement.lang === "en"');
  win.setContentSize(440, 900);
  await pause(150);
  await js('window.scrollTo(0, 0)');
  await noHorizontalOverflow('html');
  await noHorizontalOverflow('.rc-page');
  await noHorizontalOverflow('.rc-calendar');
  assert.equal(await js('[...document.querySelectorAll(".rc-event-label")].some(node => node.scrollWidth > node.clientWidth + 1)'), false, 'Narrow English event labels wrap without clipping');
  await js('document.querySelector(".rc-calendar").scrollIntoView({block:"start"})');
  await capture('05-narrow-english-calendar');
  await openSettings();
  await noHorizontalOverflow('.rc-modal');
  await capture('06-narrow-english-settings');
  await js(`(() => {
    const focusable = [...document.querySelectorAll('.rc-modal button:not(:disabled), .rc-modal input:not(:disabled), .rc-modal a[href]')];
    focusable[focusable.length - 1].focus();
  })()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await visible('document.activeElement === document.querySelector(".rc-modal button:not(:disabled)")', 'Tab wraps within dialog');
  await escape();
  assert.equal(await js('document.activeElement?.textContent.trim()'), await t('resetCalendar.settings.title'));
  await noHorizontalOverflow('.rc-source-content');
  await noHorizontalOverflow('.rc-source-texts');
  assert.equal(await js('Boolean(document.querySelector(".rc-source-url, .rc-source-copy-fallback"))'), false, 'Normal narrow layout keeps the raw URL hidden');
  await assertSourceContent('.rc-record-detail .rc-source-content', records[3]);
  await js('document.querySelector(".rc-record-detail .rc-source-content").scrollIntoView({block:"start"})');
  await capture('08-narrow-english-source');
  checks.push('English 440px page, modal and compact bilingual source without horizontal overflow, keyboard focus trap and Escape return');

  await js(`window.__acceptance.mock.state.status.scheduled_reset = ${JSON.stringify(scheduled)}`);
  await sync();
  await js('document.querySelector(".rc-page").scrollIntoView({block:"start"})');
  await noHorizontalOverflow('.rc-signal-detail');
  await noHorizontalOverflow('.rc-signal-heading');
  await noHorizontalOverflow('.rc-signal-timing');
  await assertSourceContent('.rc-signal-detail .rc-source-content', scheduled);
  await capture('11-narrow-english-preview');
  await click('.rc-signal-view');
  await visible('document.activeElement === document.querySelector(".rc-detail-panel h2")');
  await noHorizontalOverflow('.rc-calendar-event.is-scheduled');
  await js('document.querySelector(".rc-calendar").scrollIntoView({block:"start"})');
  await capture('12-narrow-english-preview-calendar');
  await js('window.__acceptance.setLocale("zh-CN")');
  await visible('document.documentElement.lang === "zh-CN"');
  await js('document.querySelector(".rc-page").scrollIntoView({block:"start"})');
  await noHorizontalOverflow('.rc-signal-detail');
  await capture('13-narrow-chinese-preview');
  win.setContentSize(1000, 850);
  await pause(100);
  await noHorizontalOverflow('.rc-page');
  await noHorizontalOverflow('.rc-signal-detail');
  await noHorizontalOverflow('.rc-signal-detail .rc-source-content');
  await capture('14-medium-chinese-preview');
  await js(`window.__acceptance.mock.state.status.scheduled_reset = null;
    window.__acceptance.mock.state.status.latest_reset = ${JSON.stringify(scheduled)}`);
  await sync();
  assert.equal(await js('document.querySelectorAll(".rc-signal-detail, .rc-calendar-event.is-scheduled").length'), 0, 'Public confirmation clears the pending preview and calendar styling');
  assert.equal(await js('document.querySelector(".rc-record-detail .rc-badge").textContent'), await t('resetCalendar.compactStage.confirmed'), 'Actual confirmation updates the record stage');
  checks.push('440px English and Chinese previews, bilingual source stays visible, narrow calendar preview badge and keyboard navigation');

  await click('#intel-tab-prices');
  await visible('document.querySelectorAll(".intel-price-table tbody tr").length > 0', 'Bundled subscription prices remain available offline');
  assert.equal(await js('document.querySelector("#intel-tab-prices").getAttribute("aria-selected")'), 'true');
  assert.ok(await js('document.querySelector(".intel-price-warning").textContent.includes("报价更新暂不可用")'), 'Offline pricing keeps the saved snapshot with an explicit notice');
  await capture('15-subscription-prices');
  await clickKey('.rc-actions button', 'intelStation.share');
  await visible('Boolean(document.querySelector(".intel-share-preview canvas:not([hidden])"))', 'Share image renders');
  const canvasSize = await js('(() => { const canvas = document.querySelector(".intel-share-preview canvas"); return { width: canvas.width, height: canvas.height }; })()');
  assert.ok(canvasSize.width >= 600 && canvasSize.height >= 600);
  await click('.intel-share-actions button', '复制摘要');
  await visible('document.querySelector(".intel-share-feedback").textContent.includes(window.__acceptance.t("common.copySuccess"))');
  assert.ok(await js('window.__acceptance.mock.copied.at(-1).includes("Plus")'), 'Copied summary includes the recorded subscription prices');
  await capture('16-intelligence-share');
  await escape();
  await visible('!document.querySelector(".intel-share-shell")');
  await click('#intel-tab-resets');
  await visible('Boolean(document.querySelector(".rc-month-table"))');
  checks.push('offline subscription price snapshot and notice, independent tabs, share image generation, copy summary, Escape close');

  assert.deepEqual(await js('window.__acceptance.mock.unexpected'), [], 'Only expected local mock APIs used');
  assert.deepEqual(blockedRequests, [], 'No outbound website or account requests');
  assert.deepEqual(errors, [], 'No renderer errors');
  await fs.rm(path.join(output, 'failure.png'), { force: true });
  const report = { result: 'PASS', fixture: 'Synthetic October 2026 records; no real account or upstream traffic', checks, layoutMetrics, screenshots, output };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await fs.mkdir(output, { recursive: true });
  if (win && !win.isDestroyed()) await capture('failure').catch(() => {});
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ result: 'FAIL', error: error.stack || String(error), checks, screenshots }, null, 2) + '\n').catch(() => {});
}).finally(async () => {
  if (win && !win.isDestroyed()) win.destroy();
  if (server) { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  app.exit(process.exitCode || 0);
});
