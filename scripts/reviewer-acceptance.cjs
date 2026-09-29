// Run after npm run build: electron scripts/reviewer-acceptance.cjs
// Uses a disposable Electron profile, AZT home and synthetic Codex page.
// Never connects to the user's Codex, imports old data, or opens deep links.
const { app, BrowserWindow, protocol } = require("electron");
const fs = require("node:fs/promises");
const { mkdtempSync, mkdirSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = mkdtempSync(path.join(os.tmpdir(), "azt-reviewer-acceptance-"));
const profile = path.join(root, "electron");
mkdirSync(profile);
process.env.AI_ZERO_TOKEN_HOME = path.join(root, "azt");
process.env.CODEX_HOME = path.join(root, "codex");
delete process.env.AZT_ADMIN_UI_DEV_URL;
app.setPath("userData", profile);
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
app.commandLine.appendSwitch("remote-debugging-port", "0");
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.on("window-all-closed", () => {});
let gateway;
let base;
const windows = [];
const endpoint = "/_gateway/tools/reviewer";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await pause(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function api(route, method = "GET", body) {
  const response = await fetch(base + route, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  assert.ok(response.ok, JSON.stringify(payload));
  return payload;
}
function window() {
  const result = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  windows.push(result);
  result.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return result;
}
async function reviewerFrame(win) {
  return until(() => win.webContents.mainFrame.framesInSubtree.find((frame) => /^http:\/\/127\.0\.0\.1:\d+\/\?token=/.test(frame.url)), "Reviewer iframe");
}
async function reviewerRequest(url, route) {
  const address = new URL(url);
  const response = await fetch(new URL(route, address), { headers: { "x-response-reviewer-token": address.searchParams.get("token") } });
  assert.ok(response.ok); return response.json();
}

async function main() {
  await app.whenReady();
  const debugPort = await until(async () => {
    try { return Number((await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); }
    catch { return false; }
  }, "isolated debugging port");
  protocol.handle("app", () => new Response(`<!doctype html><html><head><title>Synthetic Codex</title></head><body>
    <h1>隔离测试 · 非真实 Codex</h1>
    <article data-content-search-unit-key="fixture-turn-one">
      <div data-markdown-text-style="assistant-message"><h2>迁移方案</h2><p>AZT 管理服务，Codex 旁审阅具体回复。</p></div>
      <div><div><button aria-label="Copy">Copy</button><button aria-label="Branch">Branch</button><button aria-label="Good response">Good response</button></div></div>
    </article><textarea id="composer">原有草稿，不得自动改动</textarea>
    </body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } }));
  const codex = window();
  await codex.loadURL("app://-/index.html");
  const { createApp } = await import("../dist/server/app.js");
  gateway = createApp();
  await gateway.listen({ host: "127.0.0.1", port: 0 });
  base = `http://127.0.0.1:${gateway.server.address().port}`;
  const admin = window();
  await admin.loadURL(base + "/#tools");
  await until(() => admin.webContents.executeJavaScript("document.querySelectorAll('.azt-tool-toggle input').length === 2"), "AZT tools settings");
  assert.equal((await api(endpoint)).running, false);
  // Enable the service using the actual React controls.
  await admin.webContents.executeJavaScript("document.querySelector('.azt-tool-toggle input').click(); document.querySelector('.azt-tool-columns form').requestSubmit()");
  await until(async () => (await api(endpoint)).running, "service enabled via UI");
  await until(() => admin.webContents.executeJavaScript("Boolean(document.querySelector('.azt-tool-status.is-running'))"), "UI reflects service state");
  await api(endpoint + "/settings", "PUT", { enabled: true, codexButtonEnabled: true, cdpPort: debugPort });
  await until(() => codex.webContents.executeJavaScript("Boolean(document.querySelector('a[aria-label=Review]'))"), "reply Review button");
  await codex.webContents.executeJavaScript("document.querySelector('a[aria-label=Review]').click()");
  await until(() => codex.webContents.executeJavaScript("Boolean(document.getElementById('azt-reviewer-panel'))"), "right overlay");
  const frame = await reviewerFrame(codex);
  await until(() => frame.executeJavaScript("document.getElementById('responseText')?.textContent.includes('AZT 管理服务')"), "selected reply renders in iframe");
  const history = await api(endpoint + "/history");
  assert.equal(history.responses.length, 1);
  const responseId = history.responses[0].id;
  await frame.executeJavaScript("document.getElementById('annotationComment').value = '请补充失败恢复步骤'; document.getElementById('annotationForm').requestSubmit()");
  await until(async () => (await api(endpoint + "/history")).responses[0].annotationCount === 1, "annotation saved");
  const status = await api(endpoint);
  const prompt = await reviewerRequest(status.url, `/api/responses/${responseId}/prompt`);
  assert.ok(prompt.prompt.includes("请补充失败恢复步骤"));
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('composer').value"), "原有草稿，不得自动改动");
  // Simulate a surviving stale module after an abrupt AZT restart.
  await codex.webContents.executeJavaScript("window.__aztReviewerModules['response-reviewer'].config.url = 'http://127.0.0.1:1/?token=stale'");
  await until(() => codex.webContents.executeJavaScript(`window.__aztReviewerModules['response-reviewer'].config.url === ${JSON.stringify(status.url)}`), "stale runtime repaired");
  assert.equal(await codex.webContents.executeJavaScript("document.querySelector('a[aria-label=Review]').getAttribute('data-codex-response-reviewer-response-id')"), responseId);
  admin.reload();
  await until(() => admin.webContents.executeJavaScript("Boolean(document.querySelector('.azt-tool-history button'))"), "shared history appears in AZT");
  // Use an example import path in documentation screenshots; never submit it.
  await admin.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.azt-tool-columns input[spellcheck="false"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '/Users/example/.response-reviewer/store.json');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await until(() => admin.webContents.executeJavaScript("document.querySelector('.azt-tool-columns input[spellcheck=\"false\"]').value === '/Users/example/.response-reviewer/store.json'"), "example import path");
  await pause(150);
  await fs.writeFile(path.join(root, "tools.png"), (await admin.webContents.capturePage()).toPNG());
  await admin.webContents.executeJavaScript("document.querySelector('.azt-tool-history button').click()");
  const adminFrame = await reviewerFrame(admin);
  await until(() => adminFrame.executeJavaScript("document.getElementById('annotationList')?.textContent.includes('请补充失败恢复步骤')"), "same annotation in AZT iframe");
  await until(() => admin.webContents.executeJavaScript("document.querySelector('.azt-tool-workbench').getBoundingClientRect().top < 200"), "workbench scrolled into view");
  await fs.writeFile(path.join(root, "workbench.png"), (await admin.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(root, "reply-panel.png"), (await codex.webContents.capturePage()).toPNG());
  // Closing just the overlay leaves the reply controls usable.
  await codex.webContents.executeJavaScript("document.getElementById('azt-reviewer-panel').shadowRoot.querySelector('button').click()");
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('azt-reviewer-panel') === null"), true);
  await api(endpoint + "/settings", "PUT", { enabled: true, codexButtonEnabled: false, cdpPort: debugPort });
  assert.equal(await codex.webContents.executeJavaScript("document.querySelectorAll('[data-codex-response-reviewer]').length"), 0);
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('composer').value"), "原有草稿，不得自动改动");
  await api(endpoint + "/settings", "PUT", { enabled: false, codexButtonEnabled: false, cdpPort: debugPort });
  assert.equal((await api(endpoint)).running, false);
  assert.equal((await api(endpoint + "/history")).responses[0].annotationCount, 1);
  console.log(JSON.stringify({ passed: true, screenshots: root, checks: ["AZT enable UI", "CDP reply button", "right iframe", "annotation and prompt", "stale connection recovery", "shared AZT history", "removable injection", "no auto-send", "stop preserves data"] }));
}
main().then(async () => {
  for (const win of windows) if (!win.isDestroyed()) win.destroy();
  await gateway?.close(); app.exit(0);
}).catch(async (error) => {
  console.error(error);
  console.error(`Isolated acceptance data: ${root}`);
  for (const win of windows) if (!win.isDestroyed()) win.destroy();
  await gateway?.close().catch(() => {}); app.exit(1);
});
