// Run after npm run build: electron scripts/desktop-update-acceptance.cjs
// Exercises the real preload, updater, hook and UI with a synthetic release and installer.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const { mkdtempSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { build } = require('esbuild');

const repo = path.resolve(__dirname, '..');
const root = mkdtempSync(path.join(os.tmpdir(), 'azt-update-acceptance-'));
const output = path.join(repo, 'artifacts', 'desktop-update');
mkdirSync(path.join(root, 'profile'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let win;
let updater;
let downloadStream;
let quitRequested = false;
let readyNotifications = 0;
let releaseVersion = '2.0.17';
let releaseNotes = '### 更顺手的更新体验\n- **升级内容，一目了然**：查看本次新增功能与体验改进。\n- 下载时可以继续使用，准备完成后会提醒你。\n- 由你决定何时重启，账号与设置自动保留。\n\n### 细节改进\n- 重新打开应用时检查新版本，及时收到更新提醒。\n- 优化下载失败后的重试与恢复提示。';
let missingDigest = false;
let failDownload = false;
const bytes = Buffer.alloc(2 * 1024 * 1024, 7);
const digest = createHash('sha256').update(bytes).digest('hex');
let prepareResolve;
let prepareWait;
const errors = [];

async function until(check, label) {
  for (let i = 0; i < 150; i += 1) { if (await check()) return; await pause(50); }
  throw new Error(`Timed out: ${label}`);
}
const js = (source) => win.webContents.executeJavaScript(source, true);
const visible = (source) => until(() => js(source), source);
async function click(text, selector = 'dialog[open] button') {
  const found = await js(`(() => { const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`);
  assert.ok(found, `Enabled button: ${text}`);
}
async function capture(name) {
  // Hidden test windows can pause entry animations; finish them for deterministic screenshots.
  await js('document.querySelector("dialog")?.getAnimations().forEach(animation => animation.finish())');
  await pause(250);
  const image = await win.webContents.capturePage();
  await fs.writeFile(path.join(output, name + '.png'), image.toPNG());
}
async function openWindow() {
  win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { preload: path.join(repo, 'src/desktop/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
  await win.loadFile(path.join(root, 'index.html'));
  await visible('Boolean(document.querySelector(".desktop-update-entry"))');
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('This acceptance test uses the macOS update bridge.');
  await app.whenReady();
  await fs.mkdir(output, { recursive: true });
  await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { LocaleProvider } from './admin-ui/src/i18n';
      import { useDesktopUpdater } from './admin-ui/src/hooks/useDesktopUpdater';
      import { DesktopUpdatePanel } from './admin-ui/src/shared/components/DesktopUpdatePanel';
      import { AppSidebar } from './admin-ui/src/layouts/AppSidebar';
      import './admin-ui/src/styles.css';
      localStorage.setItem('azt.admin.locale', localStorage.getItem('preview-locale') || 'zh-CN');
      const workspace = { routes: [], activeRoute: 'overview', goRoute() {}, copyBaseUrl() {}, setContactOpen() {}, config: { status: { loggedIn: true }, baseUrl: 'http://127.0.0.1:8787/v1' } };
      function Preview() {
        const updater = useDesktopUpdater(true);
        return <div className="app-shell"><AppSidebar workspace={workspace} updater={updater} /><main className="main"><DesktopUpdatePanel updater={updater} /><header className="topbar"><div className="page-title"><span className="page-kicker">AI ZERO TOKEN</span><h1>工作台</h1><p>管理你的模型与服务</p></div></header><section className="card" style={{padding:32,minHeight:420}}><h3>本地服务已就绪</h3><p style={{color:'var(--text-muted)'}}>独立更新体验预览 · 所有版本与下载均为测试数据</p></section></main></div>;
      }
      createRoot(document.getElementById('root')).render(<React.StrictMode><LocaleProvider><Preview /></LocaleProvider></React.StrictMode>);
    `, resolveDir: repo, loader: 'tsx' },
    bundle: true, platform: 'browser', jsx: 'automatic', outfile: path.join(root, 'fixture.js'),
    alias: { '@': path.join(repo, 'admin-ui/src') }, loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: path.join(repo, 'admin-ui/tsconfig.json'),
  });
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
  const { DesktopUpdater } = await import(pathToFileURL(path.join(repo, 'dist/desktop/updater.js')));
  updater = new DesktopUpdater({
    currentVersion: '2.0.16', arch: 'arm64', supported: true,
    installer: { preflight: async () => {}, createJob: () => fs.mkdtemp(path.join(root, 'job-')), prepare: () => prepareWait, cleanup: async () => {}, handOff: async () => {} },
    fetcher: async (url, init) => {
      if (url.includes('api.github.com')) {
        const name = `AI.Zero.Token-${releaseVersion}-mac-arm64.dmg`;
        return Response.json({ tag_name: `v${releaseVersion}`, draft: false, prerelease: false, published_at: '2026-09-30T08:00:00Z', body: releaseNotes, assets: [{ name, state: 'uploaded', size: bytes.length, digest: missingDigest ? undefined : `sha256:${digest}`, browser_download_url: `https://github.com/fchangjun/AI-Zero-Token/releases/download/v${releaseVersion}/${name}` }] });
      }
      if (failDownload) throw new Error('Synthetic offline download');
      return new Response(new ReadableStream({ start(controller) {
        downloadStream = controller;
        controller.enqueue(bytes.subarray(0, bytes.length / 2));
        init.signal.addEventListener('abort', () => controller.error(new Error('cancelled')), { once: true });
      } }));
    },
    onState: (state) => { if (win && !win.isDestroyed()) win.webContents.send('desktop-update:state', state); },
    onAvailable: () => {}, onReady: () => { readyNotifications += 1; }, quit: () => { quitRequested = true; },
  });
  const actions = { state: () => updater.getState(), ready: async () => {}, check: () => updater.check(), download: () => updater.download(), cancel: () => updater.cancel(), install: () => updater.install(), 'open-details': () => updater.openDetails(), 'close-details': () => updater.closeDetails(), 'dismiss-notice': () => updater.dismissNotice() };
  for (const [channel, action] of Object.entries(actions)) ipcMain.handle(`desktop-update:${channel}`, action);
  await openWindow();
  assert.equal(await js('Boolean(document.querySelector(".desktop-update-card"))'), false, 'idle updates stay in the sidebar');
  await updater.check();
  await visible('Boolean(document.querySelector(".desktop-update-card"))');
  await click('查看更新', '.desktop-update-card button');
  await visible('Boolean(document.querySelector("dialog[open]"))');
  assert.ok(await js('document.querySelector(".desktop-release-notes strong").textContent.includes("升级内容")'));
  assert.ok(await js('document.querySelector("dialog").contains(document.activeElement)'));
  await capture('available');
  await click('稍后再说');
  await visible('!document.querySelector("dialog[open]") && !document.querySelector(".desktop-update-card")');
  await updater.check();
  assert.equal(await js('Boolean(document.querySelector(".desktop-update-card"))'), false, 'same version stays dismissed');
  win.destroy();
  updater.openDetails(); // Same main-process action used by the native notification click.
  await openWindow();
  await visible('Boolean(document.querySelector("dialog[open]"))');
  missingDigest = true;
  await updater.check();
  await visible('Boolean(document.querySelector("dialog .desktop-update-buttons a.btn-primary"))');
  assert.equal(await js('[...document.querySelectorAll("dialog button")].some(el => el.textContent.trim() === "立即更新")'), false);
  missingDigest = false;
  const originalNotes = releaseNotes;
  releaseNotes = '';
  await updater.check();
  await visible('document.querySelector(".desktop-update-body").textContent.includes("暂未提供升级记录")');
  releaseNotes = originalNotes.repeat(30);
  await updater.check();
  await visible('document.querySelector(".desktop-update-body").scrollHeight > document.querySelector(".desktop-update-body").clientHeight');
  assert.ok(await js('document.querySelector(".desktop-update-footer").getBoundingClientRect().bottom <= innerHeight'));
  releaseNotes = originalNotes;
  await updater.check();
  failDownload = true;
  await click('立即更新');
  await visible('[...document.querySelectorAll("dialog button")].some(el => el.textContent.trim() === "重新下载")');
  await capture('download-error');
  failDownload = false;
  await click('重新下载');
  await visible('document.querySelector("progress")?.value === 50');
  await capture('downloading');
  await click('取消下载');
  await until(() => updater.getState().phase === 'available', 'download cancellation');
  await visible('[...document.querySelectorAll("dialog button")].some(el => el.textContent.trim() === "立即更新")');
  prepareWait = new Promise((resolve) => { prepareResolve = resolve; });
  await click('立即更新');
  await visible('document.querySelector("progress")?.value === 50');
  await click('后台继续');
  await visible('!document.querySelector("dialog[open]")');
  downloadStream.enqueue(bytes.subarray(bytes.length / 2)); downloadStream.close();
  await until(() => updater.getState().phase === 'preparing', 'verification stage');
  prepareResolve();
  await until(() => updater.getState().phase === 'ready', 'ready stage');
  assert.equal(readyNotifications, 1); assert.equal(quitRequested, false);
  await visible('Boolean(document.querySelector(".desktop-update-card"))');
  updater.openDetails();
  await visible('document.querySelector("dialog[open] h2")?.textContent === "更新已准备好"');
  await capture('ready');
  await js('localStorage.setItem("preview-locale", "en")');
  await win.reload();
  await visible('document.querySelector("dialog[open] h2")?.textContent === "Your update is ready"');
  win.setSize(440, 680);
  await pause(200);
  const layout = await js('(() => { const d = document.querySelector("dialog"); return { overflow: d.scrollWidth > d.clientWidth, right: d.getBoundingClientRect().right, width: innerWidth }; })()');
  assert.equal(layout.overflow, false); assert.ok(layout.right <= layout.width);
  await capture('ready-narrow-en');
  await click('Restart to finish updating');
  await until(() => quitRequested, 'explicit install request');
  assert.equal(await js('[...document.querySelectorAll("dialog button")].every(el => el.disabled)'), true);
  await updater.stop();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks: ['quiet idle state', 'notice to release notes', 'defer without repeat', 'notification with recreated window', 'manual fallback', 'empty and long notes', 'download failure and retry', 'download and cancel', 'background preparation', 'ready notification', 'explicit restart', 'keyboard focus', 'English narrow layout'], screenshots: output }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (win && !win.isDestroyed()) win.destroy();
  await updater?.stop();
  await fs.rm(root, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
