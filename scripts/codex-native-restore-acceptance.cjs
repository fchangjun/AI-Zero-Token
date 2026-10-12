// Run after npm run build: node_modules/.bin/electron scripts/codex-native-restore-acceptance.cjs
// Production UI and API; only disposable Codex/AZT data. No account or model cache.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const root = mkdtempSync(path.join(os.tmpdir(), 'azt-native-restore-ui-'));
const home = path.join(root, 'codex');
const state = path.join(root, 'gateway', '.state');
process.env.CODEX_HOME = home;
process.env.AI_ZERO_TOKEN_HOME = path.dirname(state);
process.env.AZT_FORCE_DESKTOP_LATEST_VERSION = require('../package.json').version;
process.env.AZT_FORCE_NPM_LATEST_VERSION = require('../package.json').version;
delete process.env.OPENAI_BASE_URL;
app.setPath('userData', path.join(root, 'electron-profile'));
app.on('window-all-closed', () => {});
const load = (relative) => import(pathToFileURL(path.join(__dirname, '..', relative)).href);
let server;
let win;
const js = (source) => win.webContents.executeJavaScript(source, true);
async function until(source) {
  for (let i = 0; i < 200; i++) {
    if (await js(source)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${source}`);
}
async function click(selector, text) {
  assert.ok(await js(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(node => node.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) return false;
    button.click(); return true;
  })()`), `Enabled button: ${text}`);
}
async function main() {
  await fs.mkdir(path.join(home, 'sessions'), { recursive: true });
  await fs.mkdir(state, { recursive: true });
  await fs.writeFile(path.join(state, 'store.json'), '{"version":1,"profiles":{}}');
  await fs.writeFile(path.join(state, 'settings.json'), '{}');
  await fs.writeFile(path.join(home, 'config.toml'), '# Native defaults, no explicit model\n');
  const rollout = path.join(home, 'sessions', 'history.jsonl');
  const history = '{"type":"event_msg","payload":{"type":"user_message","message":"Isolated UI history fixture"}}\n';
  await fs.writeFile(rollout, history);
  const { codexSqlite, readThreadSnapshot, sqlString } = await load('dist/core/store/codex-thread-state.js');
  const { ExternalProviderService } = await load('dist/core/services/external-provider-service.js');
  const { createApp } = await load('dist/server/app.js');
  const db = path.join(home, 'state_5.sqlite');
  await codexSqlite(db, `CREATE TABLE threads (id TEXT PRIMARY KEY, model_provider TEXT NOT NULL, model TEXT, reasoning_effort TEXT, rollout_path TEXT, title TEXT, archived INTEGER, updated_at INTEGER);
    INSERT INTO threads VALUES ('original','openai',NULL,NULL,${sqlString(rollout)},'Original history',0,1);`);
  const service = new ExternalProviderService();
  const provider = await service.create({ name: '离线恢复验收', baseUrl: 'http://127.0.0.1:1/v1', apiToken: 'synthetic-fixture-key', modelSource: 'manual', manualModelIds: ['third-fixture'] });
  await service.activate(provider.id, ['third-fixture'], 'third-fixture');
  const switchPath = path.join(state, 'codex-switch-state.json');
  // Reproduce a 2.0.19 takeover with no discoverable native default model.
  await fs.writeFile(switchPath, JSON.stringify({ version: 1, home, native: {}, nativeThreads: { original: { model: null, reasoning_effort: null } } }));
  await codexSqlite(db, `INSERT INTO threads VALUES ('new','azt_active','third-fixture',NULL,${sqlString(rollout)},'Created during takeover',0,2);`);
  let preparations = 0;
  server = createApp({
    onPrepareCodexSwitch: async () => { preparations++; },
    resetCalendarService: { start() {}, stop() {} },
  });
  await server.listen({ host: '127.0.0.1', port: 0 });
  await app.whenReady();
  win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(?:http:\/\/127\.0\.0\.1:|data:|about:)/.test(details.url) });
  });
  await win.loadURL(`http://127.0.0.1:${server.server.address().port}/#providers/external`);
  await until('Boolean(document.querySelector(".provider-active-card"))');
  await fs.writeFile(path.join(root, 'before.png'), (await win.webContents.capturePage()).toPNG());
  const beforeConfig = await fs.readFile(path.join(home, 'config.toml'), 'utf8');
  const beforeRows = (await readThreadSnapshot(db)).settings;
  await click('.provider-active-actions button', '解除接入');
  await until('Boolean(document.querySelector("dialog.codex-switch-dialog[open]"))');
  await click('dialog footer button', '取消');
  await until('!document.querySelector("dialog.codex-switch-dialog")');
  assert.equal(preparations, 0);
  assert.equal(await fs.readFile(path.join(home, 'config.toml'), 'utf8'), beforeConfig);
  assert.deepEqual((await readThreadSnapshot(db)).settings, beforeRows);
  await click('.provider-active-actions button', '解除接入');
  await until('Boolean(document.querySelector("dialog.codex-switch-dialog[open]"))');
  await click('dialog footer button', '已关闭，继续');
  await until('!document.querySelector(".provider-active-card") && !document.querySelector("dialog.codex-switch-dialog")');
  assert.equal(preparations, 1);
  const rows = (await readThreadSnapshot(db)).settings;
  assert.equal(rows.length, 2);
  for (const row of rows) assert.deepEqual({ ...row, id: undefined }, { id: undefined, model_provider: 'openai', model: null, reasoning_effort: null });
  const config = await fs.readFile(path.join(home, 'config.toml'), 'utf8');
  assert.match(config, /^model_provider = "openai"$/m);
  assert.doesNotMatch(config, /^(?:model|model_reasoning_effort|model_catalog_json)\s*=/m);
  assert.doesNotMatch(config, /synthetic-fixture-key/);
  assert.equal(await fs.readFile(rollout, 'utf8'), history);
  for (const filename of ['auth.json', 'models_cache.json']) await assert.rejects(fs.stat(path.join(home, filename)), { code: 'ENOENT' });
  assert.equal(JSON.parse(await fs.readFile(switchPath, 'utf8')).version, 2);
  const providers = await service.list();
  assert.equal(providers.activeProviderId, undefined);
  assert.equal(providers.providers.length, 1);
  assert.equal(providers.providers[0].name, provider.name);
  const stored = await fs.readFile(path.join(state, 'external-providers.json'), 'utf8');
  assert.ok(stored.includes('synthetic-fixture-key'));
  await fs.writeFile(path.join(root, 'after.png'), (await win.webContents.capturePage()).toPNG());
  const report = { passed: true, root, version: require('../package.json').version, checks: ['cancel leaves settings intact', 'legacy v1 offline deactivation through production UI/API', 'old and new threads restore native defaults', 'history preserved', 'saved provider retained', 'no login or model cache required'] };
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().then(async () => { await server.close(); win.destroy(); app.exit(0); }).catch(async error => {
  console.error(error);
  console.error('Evidence:', root);
  if (win) { await fs.writeFile(path.join(root, 'failure.png'), (await win.webContents.capturePage()).toPNG()); win.destroy(); }
  if (server) await server.close();
  app.exit(1);
});
