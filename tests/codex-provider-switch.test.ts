import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { ExternalProviderService } from "../src/core/services/external-provider-service.ts";
import { CodexProviderSwitch, getCodexSwitchStatePath } from "../src/core/services/codex-provider-switch.ts";
import { assertCodexStopped, assertNoActiveCodexTurns } from "../src/core/services/codex-switch-runtime.ts";
import { codexSqlite, readThreadSnapshot, updateThreadSettings } from "../src/core/store/codex-thread-state.ts";
import { getExternalProviderStorePath } from "../src/core/store/external-provider-store.ts";
import { getStateDir } from "../src/core/store/state-paths.ts";
import { createApp } from "../src/server/app.ts";

const home = process.env.CODEX_HOME!;
const db = path.join(home, "state_5.sqlite");
const config = path.join(home, "config.toml");
const rollout = path.join(home, "sessions", "fixture.jsonl");
const nativeConfig = 'model_provider = "openai"\nmodel = "gpt-native"\nmodel_reasoning_effort = "high"\n';
const auth = '{"auth_mode":"chatgpt","tokens":{"access_token":"native-fixture"}}';
let service: ExternalProviderService;

beforeEach(async () => {
  if (!home.includes("azt-tests-")) throw new Error("Use the isolated test preload.");
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(getStateDir(), { recursive: true, force: true });
  await fs.mkdir(path.dirname(rollout), { recursive: true });
  await fs.mkdir(getStateDir(), { recursive: true });
  await fs.writeFile(config, nativeConfig);
  await fs.writeFile(path.join(home, "auth.json"), auth);
  await fs.writeFile(path.join(home, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-native", visibility: "list", supported_reasoning_levels: [{ effort: "medium" }, { effort: "high" }] },
    { slug: "gpt-native-other", visibility: "list", supported_reasoning_levels: [{ effort: "high" }] },
  ] }));
  await fs.writeFile(rollout, '{"type":"session_meta","payload":{"id":"t1","model_provider":"openai"}}\n{"type":"event_msg","payload":{"type":"thread_settings_applied","thread_settings":{"model_provider_id":"openai","model":"gpt-native-other"}}}\n');
  await codexSqlite(db, `CREATE TABLE threads (id TEXT PRIMARY KEY, model_provider TEXT NOT NULL, model TEXT, reasoning_effort TEXT, rollout_path TEXT, cwd TEXT, title TEXT, archived INTEGER, tokens_used INTEGER, updated_at INTEGER);
    INSERT INTO threads VALUES ('t1','openai','gpt-native-other','high','${rollout}',NULL,'original title',0,10,1);
    INSERT INTO threads VALUES ('archived','azt_external_legacy','old-third-model','high','${rollout}',NULL,'archived title',1,5,1);`);
  service = new ExternalProviderService();
});

async function create(name = "B", ids = ["b-model"]) {
  return service.create({ name, baseUrl: `https://${name.toLowerCase()}.example.test/v1`, apiToken: `fixture-key-${name}`, modelSource: "manual", manualModelIds: ids });
}
async function data() { return (await readThreadSnapshot(db)).settings; }
async function files() {
  const read = (file: string) => fs.readFile(file, "utf8").catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  return Promise.all([config, path.join(home, "model-catalogs/ai-zero-token-models.json"), getExternalProviderStorePath(), getCodexSwitchStatePath(), rollout, path.join(home, "auth.json")].map(read));
}

async function databaseClient(sql = "SELECT * FROM threads;") {
  const child = Bun.spawn([process.execPath, "-e", 'const {Database}=require("bun:sqlite"); const db=new Database(process.env.FIXTURE_FILE); db.exec(process.env.FIXTURE_SQL); console.log("ready"); setInterval(()=>{},1000);'], {
    env: { ...process.env, FIXTURE_FILE: db, FIXTURE_SQL: sql }, stdout: "pipe", stderr: "pipe",
  });
  try {
    const ready = await child.stdout.getReader().read();
    if (!new TextDecoder().decode(ready.value).includes("ready")) throw new Error("Database fixture failed to open.");
    return child;
  } catch (error) { child.kill(); await child.exited; throw error; }
}

describe("Codex provider switch", () => {
  test("native → B → C → native changes all local threads and preserves history and native auth", async () => {
    const originalRollout = await fs.readFile(rollout, "utf8");
    const b = await create(); const c = await create("C", ["c-model"]);
    await service.activate(b.id, ["b-model"], "b-model");
    expect((await data()).every((row) => row.model_provider === "azt_active" && row.model === "b-model" && row.reasoning_effort === null)).toBe(true);
    expect(await fs.readFile(config, "utf8")).toContain("requires_openai_auth = false");
    expect(await fs.readFile(config, "utf8")).toContain("supports_websockets = false");
    await codexSqlite(db, `INSERT INTO threads VALUES ('new','azt_active','b-model',NULL,'${rollout}',NULL,'new title',0,1,2)`);
    await service.activate(c.id, ["c-model"], "c-model");
    expect((await data()).every((row) => row.model_provider === "azt_active" && row.model === "c-model")).toBe(true);
    expect((await service.list()).activeProviderId).toBe(c.id);
    expect((await service.list()).providers.filter((provider) => provider.activeForCodex)).toHaveLength(1);
    const cConfig = await fs.readFile(config, "utf8");
    expect(cConfig).toContain("fixture-key-C"); expect(cConfig).not.toContain("fixture-key-B");
    await service.delete(b.id);
    expect(await fs.readFile(config, "utf8")).toBe(cConfig);
    await service.deactivate(c.id);
    expect(await data()).toEqual([
      { id: "archived", model_provider: "openai", model: "gpt-native", reasoning_effort: "high" },
      { id: "new", model_provider: "openai", model: "gpt-native", reasoning_effort: "high" },
      { id: "t1", model_provider: "openai", model: "gpt-native-other", reasoning_effort: "high" },
    ]);
    const restored = await fs.readFile(config, "utf8");
    expect(restored).toContain('model_provider = "openai"');
    expect(restored).toContain("[model_providers.azt_active]");
    expect(restored).not.toContain("experimental_bearer_token");
    expect(restored).not.toContain("model_catalog_json");
    expect(await fs.readFile(rollout, "utf8")).toBe(originalRollout);
    expect(await fs.readFile(path.join(home, "auth.json"), "utf8")).toBe(auth);
    expect(await fs.readFile(getExternalProviderStorePath(), "utf8")).toContain("fixture-key-C");
    expect(await codexSqlite(db, "SELECT title,archived,tokens_used FROM threads WHERE id='archived'", true)).toEqual([{ title: "archived title", archived: 1, tokens_used: 5 }]);
  });

  test("keeps a model supported by the next service, restores native even if the original global provider was third party", async () => {
    await fs.writeFile(config, 'model_provider = "legacy"\nmodel = "third-default"\nopenai_base_url = "https://old.example/v1"\n[model_providers.legacy]\nbase_url = "https://legacy.example/v1"\n');
    const b = await create("B", ["b-model", "gpt-native-other"]);
    await service.activate(b.id, ["b-model", "gpt-native-other"], "b-model");
    expect((await data()).find((row) => row.id === "t1")?.model).toBe("gpt-native-other");
    await service.deactivate(b.id);
    const restored = await fs.readFile(config, "utf8");
    expect(restored).toContain('model_provider = "openai"');
    expect(restored).toContain('model = "gpt-native"');
    expect(restored).not.toContain("openai_base_url");
    expect(restored).toContain("[model_providers.legacy]");
  });

  test("restores a known native thread model when no global model or cache was configured", async () => {
    await fs.writeFile(config, 'model_provider = "openai"\n');
    await fs.rm(path.join(home, "models_cache.json"));
    const b = await create();
    await service.activate(b.id, ["b-model"], "b-model");
    await service.deactivate(b.id);
    expect((await data()).find((row) => row.id === "t1")?.model).toBe("gpt-native-other");
    expect(await fs.readFile(config, "utf8")).toContain('model = "gpt-native-other"');
  });

  test("rolls back config, model catalog, preferences, DB and selection after a failure following the DB commit", async () => {
    const b = await create(); const before = await files(); const rows = await data();
    let checks = 0;
    service = new ExternalProviderService({ assertStopped: async () => { if (++checks === 3) throw new Error("fixture final check failed"); } });
    await expect(service.activate(b.id, ["b-model"], "b-model")).rejects.toThrow("fixture final check failed");
    expect(await files()).toEqual(before); expect(await data()).toEqual(rows);
    expect(await fs.stat(`${getCodexSwitchStatePath()}.pending`).then(() => true, () => false)).toBe(false);
    const dirs = await fs.readdir(path.join(getStateDir(), "codex-switch-backups"));
    const backup = path.join(getStateDir(), "codex-switch-backups", dirs[0], "state.sqlite");
    expect((await readThreadSnapshot(backup)).settings).toEqual(rows);
    expect((await fs.stat(backup)).mode & 0o777).toBe(0o600);
  });

  test("recovers an interrupted switch before reading and planning the next provider mutation", async () => {
    const b = await create(); let checks = 0;
    service = new ExternalProviderService({ assertStopped: async () => { if (++checks >= 3) throw new Error("fixture busy"); } });
    await expect(service.activate(b.id, ["b-model"], "b-model")).rejects.toThrow("自动恢复尚未完成");
    const journal = await fs.readFile(`${getCodexSwitchStatePath()}.pending`, "utf8");
    expect(journal).not.toContain("fixture-key-B");
    expect((await data())[0].model_provider).toBe("azt_active");
    expect((await service.list()).activeProviderId).toBeUndefined();
    expect((await service.list()).providers[0].codexNeedsApply).toBe(true);
    service = new ExternalProviderService();
    await service.activate(b.id, ["b-model"], "b-model");
    expect((await service.list()).activeProviderId).toBe(b.id);
    await service.deactivate(b.id);
    expect((await data()).find((row) => row.id === "t1")?.model).toBe("gpt-native-other");
  });

  test("a final service-store write failure restores the thread settings as well as config", async () => {
    await create(); const before = await files(); const rows = await data();
    await expect(new CodexProviderSwitch().commit({
      baseUrl: "https://b.example.test/v1", bearerToken: "fixture-key-B", model: "b-model",
      catalogModels: [{ id: "b-model" }], displayName: "B",
    }, '{"version":1,"providers":[]}', async () => { throw new Error("fixture store write failed"); })).rejects.toThrow("fixture store write failed");
    expect(await files()).toEqual(before); expect(await data()).toEqual(rows);
  });

  test("desktop hooks run around a committed switch; reopening failure reports a warning without undoing it", async () => {
    const b = await create(); const order: string[] = [];
    const app = createApp({
      onPrepareCodexSwitch: async () => { expect(await fs.readFile(config, "utf8")).toBe(nativeConfig); order.push("prepare"); },
      onCompleteCodexSwitch: async () => { expect((await data())[0].model_provider).toBe("azt_active"); order.push("complete"); throw new Error("fixture open failed"); },
    });
    try {
      const response = await app.inject({ method: "POST", url: `/_gateway/admin/providers/${b.id}/activate`, payload: { modelIds: ["b-model"], defaultModelId: "b-model" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().provider.codexSwitchWarning).toContain("手动打开");
      expect(response.body).not.toContain("fixture-key-B");
      expect(order).toEqual(["prepare", "complete"]);
      expect((await service.list()).activeProviderId).toBe(b.id);
    } finally { await app.close(); }
  });

  test("refuses recovery over new conversation data", async () => {
    const b = await create(); let checks = 0;
    service = new ExternalProviderService({ assertStopped: async () => { if (++checks >= 3) throw new Error("fixture busy"); } });
    await expect(service.activate(b.id, ["b-model"], "b-model")).rejects.toThrow();
    await fs.appendFile(rollout, '{"type":"event_msg","payload":{"type":"user_message","message":"new message"}}\n');
    const before = await files();
    service = new ExternalProviderService();
    await expect(service.activate(b.id, ["b-model"], "b-model")).rejects.toThrow("会话数据已更新");
    expect(await files()).toEqual(before);
  });

  test("refuses running writers, unsupported schemas and profile overrides before changing config", async () => {
    const b = await create(); const before = await files();
    service = new ExternalProviderService({ assertStopped: async () => { throw new Error("fixture running writer"); } });
    await expect(service.activate(b.id, ["b-model"], "b-model")).rejects.toThrow("fixture running writer");
    expect(await files()).toEqual(before);
    service = new ExternalProviderService();
    await fs.writeFile(config, 'profile = "other"\n' + nativeConfig);
    await expect(service.activate(b.id, ["b-model"], "b-model")).rejects.toThrow("profile");
    await fs.writeFile(config, nativeConfig);
    await codexSqlite(db, "ALTER TABLE threads RENAME COLUMN reasoning_effort TO unknown_effort");
    await expect(service.activate(b.id, ["b-model"], "b-model")).rejects.toThrow("reasoning_effort");
    expect(await fs.readFile(config, "utf8")).toBe(nativeConfig);
  });

  for (const mode of ["idle", "wal-reader"] as const) test(`allows switching with an ${mode} database viewer in another process`, async () => {
    if (mode === "wal-reader") await codexSqlite(db, "PRAGMA journal_mode=WAL;");
    const child = await databaseClient(mode === "wal-reader" ? "BEGIN; SELECT * FROM threads;" : undefined);
    try {
      const b = await create();
      await service.activate(b.id, ["b-model"], "b-model");
      expect((await data()).every((row) => row.model_provider === "azt_active")).toBe(true);
      await service.deactivate(b.id);
      expect((await data()).every((row) => row.model_provider === "openai")).toBe(true);
    } finally { child.kill(); await child.exited; }
  });

  test("a real SQLite write lock fails cleanly and reports candidate processes without treating every reader as a lock holder", async () => {
    await codexSqlite(db, "PRAGMA journal_mode=WAL;");
    const b = await create(); const before = await files(); const rows = await data();
    const child = await databaseClient("BEGIN IMMEDIATE; UPDATE threads SET title='uncommitted fixture edit' WHERE id='t1';");
    try {
      let failure: unknown;
      try { await service.activate(b.id, ["b-model"], "b-model"); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain("锁冲突");
      expect((failure as Error).message).toContain(`PID ${child.pid}`);
      expect((failure as Error).message).toContain("并不代表持有冲突锁");
      expect(await files()).toEqual(before);
      expect(await data()).toEqual(rows);
      expect(await fs.stat(`${getCodexSwitchStatePath()}.pending`).then(() => true, () => false)).toBe(false);
    } finally { child.kill(); await child.exited; }
    await service.activate(b.id, ["b-model"], "b-model");
    expect((await data()).every((row) => row.model_provider === "azt_active")).toBe(true);
  }, 20_000);

  test("a conflict partway through the SQL statements rolls back earlier thread updates", async () => {
    const before = await data();
    const stale = before.map((row, index) => index === 1 ? { ...row, model: "stale-model" } : row);
    const after = before.map((row) => ({ ...row, model_provider: "azt_active", model: "b-model" }));
    await expect(updateThreadSettings(db, stale, after)).rejects.toThrow();
    expect(await data()).toEqual(before);
  });

  test("allows another process reading history and protects an unfinished Codex turn", async () => {
    const child = Bun.spawn([process.execPath, "-e", 'const fs=require("fs");const fd=fs.openSync(process.env.FIXTURE_FILE,"r");console.log("ready");setInterval(()=>{},1000)'], {
      env: { ...process.env, FIXTURE_FILE: rollout }, stdout: "pipe", stderr: "pipe",
    });
    try {
      await child.stdout.getReader().read();
      await assertCodexStopped(home);
    } finally { child.kill(); await child.exited; }
    await assertCodexStopped(home);
    const openFiles = [{ pid: 123, command: "codex", file: rollout, relativePath: "sessions/fixture.jsonl" }];
    await fs.appendFile(rollout, '{"type":"event_msg","payload":{"type":"task_started"}}\n');
    await expect(assertNoActiveCodexTurns(home, openFiles)).rejects.toThrow("正在回复");
    await fs.appendFile(rollout, '{"type":"event_msg","payload":{"type":"task_complete"}}\n');
    await assertNoActiveCodexTurns(home, openFiles);
  });
});
