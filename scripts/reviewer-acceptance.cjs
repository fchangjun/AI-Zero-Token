// Run after npm run build: electron scripts/reviewer-acceptance.cjs
// Uses a disposable Electron profile, AZT home and synthetic Codex page.
// Never connects to the user's Codex, imports old data, or opens deep links.
const { app, BrowserWindow, protocol, clipboard } = require("electron");
const fs = require("node:fs/promises");
const { mkdtempSync, mkdirSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
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
  const projectDir = path.join(root, "project");
  await fs.mkdir(projectDir);
  const reviewFile = path.join(projectDir, "review-target.js");
  await fs.writeFile(reviewFile, "export function sum(left, right) {\n  return left + right;\n}\n");
  const debugPort = await until(async () => {
    try { return Number((await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); }
    catch { return false; }
  }, "isolated debugging port");
  protocol.handle("app", () => new Response(`<!doctype html><html><head><title>Synthetic Codex</title></head><body>
    <h1>隔离测试 · 非真实 Codex</h1>
    <div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-selected="true" data-app-action-sidebar-thread-id="local:11111111-1111-4111-8111-111111111111"></div>
    <article data-content-search-unit-key="fixture-turn-one">
      <div data-markdown-text-style="assistant-message"><h2>迁移方案</h2><p>AZT 管理服务，Codex 旁审阅具体回复。</p>
        <div data-markdown-copy="code-block" data-markdown-copy-text="const x = 1;&#10;console.log(x);"><header>JavaScript<button>Copy code</button></header><div>const x = 1;console.log(x);</div></div>
        <ul><li>条目一</li><li>条目二</li></ul><blockquote>保留引用</blockquote>
        <table><thead><tr><th>功能</th><th>状态</th></tr></thead><tbody><tr><td>审阅</td><td>可用</td></tr></tbody></table>
        <p><button data-prompt-link-href="${reviewFile}:2" data-file-reference>review-target.js</button></p>
        <span data-markdown-copy="exclude">不应采集的控件</span>
      </div>
      <div data-markdown-text-style="assistant-message"><p>第二段正文也必须保留。</p></div>
      <div><div><button aria-label="Copy">Copy</button><button aria-label="Branch">Branch</button><button aria-label="Good response">Good response</button></div></div>
    </article><div id="composer" class="ProseMirror" contenteditable="true" role="textbox" style="min-height:60px;border:1px solid">原有草稿，不得自动改动</div><button id="send">Send</button>
    <script>
      // Simulate the host's native browser routing, NOT the Reviewer overlay.
      window.electronBridge = { sendMessageFromView() {} };
      window.nativeOpenRequests = [];
      window.sendCount = 0;
      document.getElementById('send').onclick = () => window.sendCount++;
      document.getElementById('composer').addEventListener('keydown', e => { if (e.key === 'Enter') window.sendCount++; });
      window.addEventListener('message', (event) => {
        if (event.data?.type !== 'toggle-browser-panel') return;
        window.nativeOpenRequests.push(event.data);
        if (window.disableNativePanel) return;
        let panel = document.getElementById('fixture-native-browser');
        if (!panel) {
          panel = document.createElement('section'); panel.id = 'fixture-native-browser';
          panel.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:640px;background:white';
          panel.innerHTML = '<h3>模拟 Codex 原生浏览器宿主</h3><iframe title="Native browser fixture" style="width:100%;height:90%;border:0"></iframe>';
          document.body.append(panel);
        }
        panel.setAttribute('data-browser-sidebar-browser-tab-id', event.data.browserTabId);
        panel.querySelector('iframe').src = event.data.url;
      });
    </script>
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
  // Repeated clicks while saving/opening must not duplicate the native request.
  await codex.webContents.executeJavaScript("document.querySelector('a[aria-label=Review]').click()");
  await until(() => codex.webContents.executeJavaScript("Boolean(document.getElementById('fixture-native-browser'))"), "native browser request");
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('azt-reviewer-panel') === null"), true);
  assert.equal(await codex.webContents.executeJavaScript("window.nativeOpenRequests.length"), 1);
  const frame = await reviewerFrame(codex);
  await until(() => frame.executeJavaScript("document.getElementById('responseText')?.textContent.includes('AZT 管理服务')"), "selected reply renders in iframe");
  assert.equal(await frame.executeJavaScript("document.querySelector('#responseText pre code').textContent"), "const x = 1;\nconsole.log(x);");
  assert.equal(await frame.executeJavaScript("document.querySelectorAll('#responseText table th').length"), 2);
  assert.equal(await frame.executeJavaScript("document.querySelectorAll('#responseText ul li').length"), 2);
  assert.equal(await frame.executeJavaScript("document.querySelector('#responseText blockquote').textContent"), "保留引用");
  assert.equal(await frame.executeJavaScript("document.getElementById('responseText').textContent.includes('第二段正文也必须保留')"), true);
  assert.equal(await frame.executeJavaScript("document.getElementById('responseText').textContent.includes('不应采集的控件')"), false);
  assert.equal(await frame.executeJavaScript("document.querySelectorAll('#responseText [data-review-file-id]').length"), 1);
  assert.equal(await frame.executeJavaScript("document.querySelector('#fileTabs button').disabled"), true);
  const history = await api(endpoint + "/history");
  assert.equal(history.responses.length, 1);
  const responseId = history.responses[0].id;
  assert.equal(history.responses[0].threadKey, "11111111-1111-4111-8111-111111111111");
  await frame.executeJavaScript("document.getElementById('annotationComment').value = '请补充失败恢复步骤'; document.getElementById('annotationForm').requestSubmit()");
  await until(async () => (await api(endpoint + "/history")).responses[0].annotationCount === 1, "annotation saved");
  const status = await api(endpoint);
  const prompt = await reviewerRequest(status.url, `/api/responses/${responseId}/prompt`);
  assert.ok(prompt.prompt.includes("请补充失败恢复步骤"));
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('composer').innerText"), "原有草稿，不得自动改动");
  // The real /composer route now requires a verified, matching empty editor.
  await frame.executeJavaScript("document.getElementById('insertIntoCodex').click()");
  await until(() => frame.executeJavaScript("document.getElementById('toast').textContent.includes('已有草稿')"), "draft protection");
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('composer').innerText"), "原有草稿，不得自动改动");
  await codex.webContents.executeJavaScript("document.getElementById('composer').textContent = ''");
  await frame.executeJavaScript("document.getElementById('insertIntoCodex').click()");
  await until(() => frame.executeJavaScript("!document.getElementById('insertIntoCodex').disabled"), "composer request finished");
  assert.ok(await frame.executeJavaScript("document.getElementById('toast').textContent.includes('已放入对应 Codex 输入框')"),
    JSON.stringify({ toast: await frame.executeJavaScript("document.getElementById('toast').textContent"), editor: await codex.webContents.executeJavaScript("document.getElementById('composer').innerText") }));
  const editorText = await codex.webContents.executeJavaScript("document.getElementById('composer').innerText");
  assert.equal(editorText.replace(/\u00a0/g, " ").replace(/\n{2,}/g, "\n\n").trim(), prompt.prompt);
  assert.equal(await codex.webContents.executeJavaScript("window.sendCount"), 0);
  await codex.webContents.executeJavaScript("document.getElementById('composer').textContent = '原有草稿，不得自动改动'; document.querySelector('[data-app-action-sidebar-thread-row]').setAttribute('data-app-action-sidebar-thread-id', 'local:22222222-2222-4222-8222-222222222222')");
  await frame.executeJavaScript("document.getElementById('insertIntoCodex').click()");
  await until(() => frame.executeJavaScript("document.getElementById('toast').textContent.includes('切回')"), "wrong task composer blocked");
  await codex.webContents.executeJavaScript("document.querySelector('[data-app-action-sidebar-thread-row]').setAttribute('data-app-action-sidebar-thread-id', 'local:11111111-1111-4111-8111-111111111111')");
  // Select an actual reply range, save a replacement suggestion, and locate it
  // both from its highlight and from the comment card after re-rendering.
  await frame.executeJavaScript(`(() => {
    const node = document.querySelector('#responseText p').firstChild;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 8);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    document.getElementById('responseText').dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    document.querySelector('input[value="suggestion"]').click();
    document.getElementById('annotationComment').value = 'AZT 统一管理本地审阅服务';
    document.getElementById('annotationForm').requestSubmit();
  })()`);
  await until(() => frame.executeJavaScript("document.querySelectorAll('#responseText mark').length > 0"), "selection highlight saved");
  await frame.executeJavaScript("document.querySelector('#responseText mark').click()");
  assert.equal(await frame.executeJavaScript("document.querySelectorAll('.annotation-item.is-active').length"), 1);
  await frame.executeJavaScript("document.querySelectorAll('[data-focus-annotation]')[1].click()");
  assert.equal(await frame.executeJavaScript("document.querySelectorAll('#responseText mark.is-active').length > 0"), true);
  // Confirm the workspace from the actual form, then select file lines 1–2.
  await frame.executeJavaScript(`document.getElementById('changeWorkspace').click(); document.getElementById('workspacePath').value = ${JSON.stringify(projectDir)}; document.getElementById('workspaceForm').requestSubmit()`);
  await until(() => frame.executeJavaScript("!document.querySelector('#fileTabs button').disabled"), "workspace enables file review");
  await frame.executeJavaScript("document.querySelector('#responseText [data-review-file-id]').click()");
  await until(() => frame.executeJavaScript("document.querySelectorAll('#fileCode .line-number').length >= 3"), "file content loaded");
  await frame.executeJavaScript(`document.querySelector('.line-number[data-select-line="1"]').click(); document.querySelector('.line-number[data-select-line="2"]').dispatchEvent(new MouseEvent('click', {bubbles:true,shiftKey:true})); document.getElementById('annotationComment').value = '补充参数校验'; document.getElementById('annotationForm').requestSubmit()`);
  await until(async () => (await api(endpoint + "/history")).responses[0].annotationCount === 3, "file range annotation saved");
  const compiled = await reviewerRequest(status.url, `/api/responses/${responseId}/prompt`);
  assert.ok(compiled.prompt.includes("review-target.js L1–L2"));
  assert.ok(compiled.prompt.includes("建议替换"));
  assert.ok(compiled.prompt.includes("补充参数校验"));
  // Copy must really reach the isolated Electron clipboard, not only toast.
  const originalClipboard = clipboard.readText();
  try {
    await frame.executeJavaScript("document.getElementById('copyPrompt').click()", true);
    await until(() => clipboard.readText() === compiled.prompt, "compiled prompt copied");
  } finally { clipboard.writeText(originalClipboard); }
  await frame.executeJavaScript("document.querySelectorAll('[data-delete-annotation]')[2].click()");
  await until(async () => (await api(endpoint + "/history")).responses[0].annotationCount === 2, "file annotation deleted");
  await until(() => frame.executeJavaScript("document.querySelectorAll('[data-delete-annotation]').length === 2"), "list updated after delete");
  await frame.executeJavaScript("document.querySelectorAll('[data-delete-annotation]')[1].click()");
  await until(async () => (await api(endpoint + "/history")).responses[0].annotationCount === 1, "suggestion deleted");
  await frame.executeJavaScript("document.getElementById('responseTab').click()");
  await until(() => frame.executeJavaScript("document.querySelectorAll('#responseText mark').length === 0"), "deleted highlight removed");
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
  // Reopen the saved response in the same native tab, keeping annotations.
  await codex.webContents.executeJavaScript("document.querySelector('a[aria-label=Review]').click()");
  await until(() => codex.webContents.executeJavaScript("window.nativeOpenRequests.length === 2 && !document.querySelector('a[aria-label=Review]').hasAttribute('aria-busy')"), "native tab reuse");
  assert.equal(await codex.webContents.executeJavaScript("window.nativeOpenRequests[0].browserTabId === window.nativeOpenRequests[1].browserTabId"), true);
  assert.equal(await codex.webContents.executeJavaScript("window.nativeOpenRequests[1].presentationIntent"), "split");
  assert.equal((await api(endpoint + "/history")).responses.length, 1);
  assert.equal((await api(endpoint + "/history")).responses[0].annotationCount, 1);
  // Switching chat while the save is pending must not open in the wrong chat.
  await codex.webContents.executeJavaScript(`document.querySelector('a[aria-label=Review]').click(); document.querySelector('[data-app-action-sidebar-thread-row]').setAttribute('data-app-action-sidebar-thread-id', 'local:22222222-2222-4222-8222-222222222222')`);
  await until(() => codex.webContents.executeJavaScript("!document.querySelector('a[aria-label=Review]').hasAttribute('aria-busy')"), "chat switch while saving");
  assert.equal(await codex.webContents.executeJavaScript("window.nativeOpenRequests.length"), 2);
  assert.equal(await codex.webContents.executeJavaScript("document.querySelector('[role=alert]').textContent.includes('当前对话已切换')"), true);
  await codex.webContents.executeJavaScript("document.querySelector('[data-app-action-sidebar-thread-row]').setAttribute('data-app-action-sidebar-thread-id', 'local:11111111-1111-4111-8111-111111111111')");
  // A host that ignores the request reports failure; no automatic overlay/browser.
  await codex.webContents.executeJavaScript("document.getElementById('fixture-native-browser').remove(); window.disableNativePanel = true; document.querySelector('a[aria-label=Review]').click()");
  await until(() => codex.webContents.executeJavaScript("document.querySelector('[role=alert]')?.textContent.includes('未检测到 Codex 内置浏览器面板')"), "native timeout notice");
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('azt-reviewer-panel') === null"), true);
  await codex.webContents.executeJavaScript("document.querySelector('[role=alert] button').click()");
  await reviewerFrame(codex);
  assert.equal(await codex.webContents.executeJavaScript("Boolean(document.getElementById('azt-reviewer-panel'))"), true);
  // Closing only the explicit fallback leaves reply controls usable.
  await codex.webContents.executeJavaScript("document.getElementById('azt-reviewer-panel').shadowRoot.querySelector('button').click()");
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('azt-reviewer-panel') === null"), true);
  const requestCount = await codex.webContents.executeJavaScript("window.nativeOpenRequests.length");
  await codex.webContents.executeJavaScript(`window.originalReviewerRequest = window.__aztReviewerBridge.request;
    window.__aztReviewerBridge.request = () => Promise.reject(new Error('fixture save failed'));
    document.querySelector('a[aria-label=Review]').click()`);
  await until(() => codex.webContents.executeJavaScript("document.querySelector('[role=alert]')?.textContent.includes('保存失败')"), "save failure notice");
  assert.equal(await codex.webContents.executeJavaScript("window.nativeOpenRequests.length"), requestCount);
  assert.equal(await codex.webContents.executeJavaScript("document.querySelector('[role=alert] button') === null"), true);
  await codex.webContents.executeJavaScript(`window.__aztReviewerBridge.request = async () => ({reviewUrl:'https://example.invalid/reviewer'});
    document.querySelector('a[aria-label=Review]').click()`);
  await until(() => codex.webContents.executeJavaScript("document.querySelector('[role=alert]')?.textContent.includes('审阅地址无效')"), "reject nonlocal review URL");
  assert.equal(await codex.webContents.executeJavaScript("window.nativeOpenRequests.length"), requestCount);
  assert.equal(await codex.webContents.executeJavaScript("document.querySelector('[role=alert] button') === null"), true);
  await codex.webContents.executeJavaScript("window.__aztReviewerBridge.request = window.originalReviewerRequest; delete window.originalReviewerRequest");
  // Unknown chat identity must not route a review to an arbitrary active chat.
  await codex.webContents.executeJavaScript("document.querySelector('[data-app-action-sidebar-thread-row]').removeAttribute('data-app-action-sidebar-thread-id'); document.querySelector('a[aria-label=Review]').click()");
  await until(() => codex.webContents.executeJavaScript("document.querySelector('[role=alert]')?.textContent.includes('无法确认当前 Codex 对话')"), "unknown chat guard");
  assert.equal(await codex.webContents.executeJavaScript("window.nativeOpenRequests.length"), requestCount);
  // Connector replaces a surviving old script without a Codex restart.
  await codex.webContents.executeJavaScript("window.__aztReviewerModules['response-reviewer'].version = 1");
  await until(() => codex.webContents.executeJavaScript("window.__aztReviewerModules['response-reviewer'].version === 2 && window.__aztReviewerModules['response-reviewer'].revision === 3"), "injection version upgrade");
  // Serve the updated UI behind a simulated older runtime: it must explain
  // the restart requirement and never call the old deep-link composer route.
  let legacyWrites = 0;
  const legacy = http.createServer(async (req, res) => {
    if (req.url === '/api/runtime') { res.setHeader('content-type', 'application/json'); res.end('{}'); return; }
    if (req.method !== 'GET') { legacyWrites++; res.writeHead(500); res.end(); return; }
    try {
      const upstream = await fetch(new URL(req.url, status.url), { headers: { 'x-response-reviewer-token': new URL(status.url).searchParams.get('token') } });
      res.setHeader('content-type', upstream.headers.get('content-type') || 'text/plain');
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { res.writeHead(502); res.end(); }
  });
  await new Promise(resolve => legacy.listen(0, '127.0.0.1', resolve));
  try {
    const oldBackend = window();
    await oldBackend.loadURL(`http://127.0.0.1:${legacy.address().port}/?token=fixture&response=${responseId}`);
    await until(() => oldBackend.webContents.executeJavaScript("!document.getElementById('feedbackNotice').hidden && !document.getElementById('copyPrompt').disabled"), 'legacy backend restart notice');
    assert.equal(await oldBackend.webContents.executeJavaScript("document.getElementById('insertIntoCodex').disabled"), true);
    await oldBackend.webContents.executeJavaScript("document.getElementById('insertIntoCodex').dispatchEvent(new MouseEvent('click'))");
    assert.equal(legacyWrites, 0);
    oldBackend.destroy();
  } finally { await new Promise(resolve => { legacy.close(resolve); legacy.closeAllConnections(); }); }
  await api(endpoint + "/settings", "PUT", { enabled: true, codexButtonEnabled: false, cdpPort: debugPort });
  assert.equal(await codex.webContents.executeJavaScript("document.querySelectorAll('[data-codex-response-reviewer]').length"), 0);
  assert.equal(await codex.webContents.executeJavaScript("document.getElementById('composer').innerText"), "原有草稿，不得自动改动");
  await api(endpoint + "/settings", "PUT", { enabled: false, codexButtonEnabled: false, cdpPort: debugPort });
  assert.equal((await api(endpoint)).running, false);
  assert.equal((await api(endpoint + "/history")).responses[0].annotationCount, 1);
  console.log(JSON.stringify({ passed: true, screenshots: root, checks: ["AZT enable UI", "CDP reply button", "native panel routing (simulated host)", "native tab reuse", "duplicate click protection", "chat switch during save", "unknown chat guard", "native timeout and explicit fallback", "save failure", "nonlocal URL rejection", "injection version upgrade", "annotation and prompt", "stale connection recovery", "shared AZT history", "removable injection", "no auto-send", "stop preserves data", "modern code/table/list/quote capture", "multi-part reply capture", "button file references", "selection and suggestion highlights", "bidirectional annotation navigation", "workspace confirmation", "file shift range review", "annotation deletion", "actual clipboard copy", "verified composer prefill", "existing draft protection", "wrong thread protection", "legacy backend restart notice"] }));
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
