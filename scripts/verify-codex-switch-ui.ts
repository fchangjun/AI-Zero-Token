import { createHash } from "node:crypto";
import { appendFile, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

// Exercise the production UI by clicking its buttons. This harness only prepares
// disposable data, controls a separate SQLite client and reports persisted state.
// Run after npm run build: bun scripts/verify-codex-switch-ui.ts
const root = await mkdtemp(join(tmpdir(), "azt-switch-ui-"));
const home = join(root, "codex");
process.env.CODEX_HOME = home;
process.env.AI_ZERO_TOKEN_HOME = join(root, "gateway");
delete process.env.OPENAI_BASE_URL;
const state = join(process.env.AI_ZERO_TOKEN_HOME, ".state");
await mkdir(join(home, "sessions"), { recursive: true });
await mkdir(state, { recursive: true });
await writeFile(join(state, "store.json"), '{"version":1,"profiles":{}}');
await writeFile(join(state, "settings.json"), '{}');
await writeFile(join(home, "config.toml"), 'model_provider = "openai"\nmodel = "native-fixture"\nmodel_reasoning_effort = "high"\n');
await writeFile(join(home, "models_cache.json"), JSON.stringify({ models: [{ slug: "native-fixture", visibility: "list", supported_reasoning_levels: [{ effort: "high" }] }] }));
await writeFile(join(home, "auth.json"), JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: "fixture-native" } }));
const rollout = join(home, "sessions", "fixture.jsonl");
await writeFile(rollout, '{"type":"session_meta","payload":{"id":"ui-fixture","model_provider":"openai"}}\n{"timestamp":"2026-08-24T06:58:33Z","type":"event_msg","payload":{"type":"task_started"}}\n');

const { codexSqlite, readThreadSnapshot, sqlString } = await import("../dist/core/store/codex-thread-state.js");
const { startProviderFixture } = await import("../tests/fixtures/provider.ts");
const { createApp } = await import("../dist/server/app.js");
const db = join(home, "state_5.sqlite");
await codexSqlite(db, `PRAGMA journal_mode=WAL;
CREATE TABLE threads (id TEXT PRIMARY KEY, model_provider TEXT NOT NULL, model TEXT, reasoning_effort TEXT, rollout_path TEXT, title TEXT, archived INTEGER, updated_at INTEGER);
INSERT INTO threads VALUES ('ui-fixture','openai','native-fixture','high',${sqlString(rollout)},'UI test history',0,1);
INSERT INTO threads VALUES ('ui-archived','azt_external_old','old-model','high',${sqlString(rollout)},'Archived fixture',1,1);`);

const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const originalHistory = hash(await readFile(rollout));
const originalAuth = hash(await readFile(join(home, "auth.json")));
const b = await startProviderFixture(); b.state.models = [{ id: "fixture-b-model", display_name: "UI fixture B", context_window: 128000 }];
const c = await startProviderFixture(); c.state.models = [{ id: "fixture-c-model", display_name: "UI fixture C", context_window: 128000 }];
const app = createApp();
await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (!address || typeof address === "string") throw new Error("UI fixture failed to bind.");
const url = `http://127.0.0.1:${address.port}/#providers/external`;
const desktopEntry = join(root, "window.cjs");
await writeFile(desktopEntry, `const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(root, "electron-profile"))});
app.setName('AZT UI Acceptance');
app.whenReady().then(async()=>{const window=new BrowserWindow({width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}});await window.loadURL(${JSON.stringify(url)});});
app.on('window-all-closed',()=>app.quit());\n`);

let holder: ReturnType<typeof Bun.spawn> | undefined;
async function release() {
  if (holder) { holder.kill(); await holder.exited; holder = undefined; }
}
async function hold(mode: "idle" | "read" | "write") {
  await release();
  const sql = mode === "write" ? "BEGIN IMMEDIATE; UPDATE threads SET title='pending fixture edit' WHERE id='ui-fixture';"
    : mode === "read" ? "BEGIN; SELECT * FROM threads;" : "SELECT * FROM threads;";
  const child = Bun.spawn([process.execPath, "-e", 'const {Database}=require("bun:sqlite");const db=new Database(process.env.FIXTURE_DB);db.exec(process.env.FIXTURE_SQL);console.log("ready");setInterval(()=>{},1000);'], {
    env: { ...process.env, FIXTURE_DB: db, FIXTURE_SQL: sql }, stdout: "pipe", stderr: "pipe",
  });
  holder = child;
  const ready = await child.stdout.getReader().read();
  if (!new TextDecoder().decode(ready.value).includes("ready")) throw new Error("SQLite fixture failed.");
  console.log(JSON.stringify({ databaseClient: mode, pid: child.pid }));
}
async function snapshot() {
  const config = await readFile(join(home, "config.toml"), "utf8");
  const providers = JSON.parse(await readFile(join(state, "external-providers.json"), "utf8").catch(() => '{"providers":[]}'));
  const evidence = JSON.stringify({
    timestamp: new Date().toISOString(),
    threads: (await readThreadSnapshot(db)).settings,
    rootProvider: /^model_provider\s*=\s*"([^"]+)"/m.exec(config)?.[1],
    baseUrl: /^base_url\s*=\s*"([^"]+)"/m.exec(config)?.[1],
    hasThirdPartyKey: config.includes("experimental_bearer_token"),
    activeProvider: providers.activeProviderId,
    providers: providers.providers.map((item: { id: string; name: string }) => ({ id: item.id, name: item.name })),
    historyUnchanged: hash(await readFile(rollout)) === originalHistory,
    authUnchanged: hash(await readFile(join(home, "auth.json"))) === originalAuth,
  });
  await appendFile(join(root, "evidence.jsonl"), evidence + "\n");
  console.log(evidence);
}
console.log(JSON.stringify({ url, root, db, desktopEntry,
  services: { B: { baseUrl: b.baseUrl, key: "fixture-ui-b" }, C: { baseUrl: c.baseUrl, key: "fixture-ui-c" } },
  commands: ["idle", "read", "write", "release", "snapshot", "quit"],
  note: "Click the production UI to create, activate, switch and deactivate services. Desktop quit/reopen hooks are not enabled in this disposable browser test.",
}));
await hold("idle");
await snapshot();
let sequence = Promise.resolve();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  sequence = sequence.then(async () => {
    const command = line.trim();
    if (command === "idle" || command === "read" || command === "write") await hold(command);
    else if (command === "release") await release();
    else if (command === "snapshot") await snapshot();
    else if (command === "quit") await shutdown();
  }).catch((error) => console.error(error));
});
async function shutdown() {
  await release(); await app.close(); await b.close(); await c.close(); process.exit(0);
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
