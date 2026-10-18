import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExternalProviderService } from "../src/core/services/external-provider-service.ts";
import { ModelStatusService, getModelStatusCatalog, MODEL_CATALOG_PATH } from "../src/core/services/model-status-service.ts";
import { checkModelHealth } from "../src/core/providers/openai-compatible/health.ts";
import { getStateDir } from "../src/core/store/state-paths.ts";
import { getExternalProviderWithSecret, recordModelCompatibility, recordModelHealth, removeExternalProviderModel, setModelHealthInterval, updateExternalProvider } from "../src/core/store/external-provider-store.ts";
import { buildCodexSwitchFiles, getCodexConfigPath, getCodexGatewayProviderStatus, readNativeCodexSettings } from "../src/core/store/codex-auth-store.ts";
import { availabilityDisplayName, resolveModelAvailability } from "../src/core/models/model-availability.ts";
import { ModelAvailabilityBadge } from "../admin-ui/src/pages/providers/components/ModelAvailabilityBadge.tsx";
import { createApp } from "../src/server/app.ts";

const token = "local-health-fixture-token";
let service: ExternalProviderService;
let fixture: Awaited<ReturnType<typeof startFixture>>;
async function startFixture() {
  const state = { status: 200, mode: "ok", delayMs: 0, requests: [] as Array<{ path: string; body: any; headers: any }> };
  const server = createServer(async (req, res) => {
    let body = ""; for await (const data of req) body += data;
    state.requests.push({ path: req.url!, body: JSON.parse(body || "{}"), headers: req.headers });
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    if (state.status === 302) { res.writeHead(302, { location: "/redirected" }); res.end(); return; }
    if (state.status !== 200) { res.writeHead(state.status, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: token } })); return; }
    if (state.mode === "html") { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>login</html>"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const events = state.mode === "error" ? [{ type: "error", error: { type: "overloaded_error", message: token } }]
      : req.url?.endsWith("/messages") ? [{ type: "content_block_delta", delta: { type: "text_delta", text: "OK" } }, { type: "message_stop" }]
      : req.url?.endsWith("/chat/completions") ? [{ choices: [{ delta: { content: "OK" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }]
      : state.mode === "empty" ? [{ type: "response.incomplete", response: { status: "incomplete" } }]
      : [{ type: "response.output_text.delta", delta: "OK" }, ...(state.mode === "truncated" ? [] : state.mode === "partial" ? [{ type: "response.incomplete", response: { status: "incomplete" } }] : [{ type: "response.completed", response: { status: "completed" } }])];
    for (const event of events) {
      const text = `data: ${JSON.stringify(event)}\r\n\r\n`;
      res.write(text.slice(0, 7)); res.write(text.slice(7));
    }
    res.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture failed");
  return { state, baseUrl: `http://127.0.0.1:${address.port}/v1`, close: async () => {
    const closed = new Promise<void>((resolve) => server.close(() => resolve())); server.closeAllConnections(); await closed;
  } };
}

beforeEach(async () => {
  if (!process.env.CODEX_HOME?.includes("azt-tests-")) throw new Error("Use the isolated test preload.");
  await fs.rm(getStateDir(), { recursive: true, force: true });
  await fs.rm(process.env.CODEX_HOME!, { recursive: true, force: true });
  await fs.mkdir(getStateDir(), { recursive: true }); await fs.mkdir(process.env.CODEX_HOME!, { recursive: true });
  await fs.writeFile(path.join(getStateDir(), "settings.json"), "{}");
  await fs.writeFile(path.join(getStateDir(), "store.json"), '{"version":1,"profiles":{}}');
  await fs.writeFile(getCodexConfigPath(), 'model_provider = "openai"\nmodel = "native"\n');
  service = new ExternalProviderService({ assertStopped: async () => {} });
  fixture = await startFixture();
});
afterEach(async () => { await fixture.close(); });

async function activate(ids = ["test-model"]) {
  const provider = await service.create({ name: "测试 API", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ids });
  await updateExternalProvider(provider.id, { models: ids.map((id) => ({ id, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], inputModalities: ["text", "image"], contextWindow: 128_000 })) });
  await service.activate(provider.id, ids, ids[0]!, 34567);
  return provider;
}

test("remote catalog removes static precedence, explicitly enables discovery and restores native feature/settings", async () => {
  const original = 'model_provider = "openai"\nmodel = "native"\nmodel_catalog_json = "/my/catalog.json"\n[features]\napi_key_model_discovery = false # keep this comment\nother_feature = true\n';
  await fs.writeFile(getCodexConfigPath(), original);
  const provider = await activate();
  const active = await fs.readFile(getCodexConfigPath(), "utf8");
  expect(active).toContain(`model_catalog_url = "http://127.0.0.1:34567${MODEL_CATALOG_PATH}${provider.id}"`);
  expect(active).toContain("api_key_model_discovery = true");
  expect(active).not.toMatch(/^model_catalog_json\s*=/m);
  expect(active).toContain("other_feature = true");
  await service.activate(provider.id, ["test-model"], "test-model", 34567);
  await service.deactivate(provider.id);
  const restored = await fs.readFile(getCodexConfigPath(), "utf8");
  expect(restored).toContain('model_catalog_json = "/my/catalog.json"');
  expect(restored).toContain("api_key_model_discovery = false # keep this comment");
  expect(restored).not.toContain("model_catalog_url");
  expect(restored).not.toContain(token);
});

test("discovery restoration preserves absence, existing true, dotted false, and later user edits", async () => {
  const target = { baseUrl: fixture.baseUrl, bearerToken: token, model: "model", catalogModels: [{ id: "model" }], modelCatalogUrl: `http://127.0.0.1:34567${MODEL_CATALOG_PATH}test` };
  for (const feature of ["", "[features]\napi_key_model_discovery = true\n", "features.api_key_model_discovery = false\n"]) {
    const raw = 'model_provider = "openai"\n' + feature;
    const activated = await buildCodexSwitchFiles(raw, readNativeCodexSettings(raw), target);
    const switched = await buildCodexSwitchFiles(activated.config, readNativeCodexSettings(raw), target);
    const restored = await buildCodexSwitchFiles(switched.config, readNativeCodexSettings(raw));
    if (!feature) expect(restored.config).not.toContain("api_key_model_discovery");
    else expect(restored.config).toContain(feature.trim());
  }
  const active = await buildCodexSwitchFiles("", {}, target);
  const restored = await buildCodexSwitchFiles(active.config.replace("api_key_model_discovery = true", "api_key_model_discovery = false"), {});
  expect(restored.config).toContain("api_key_model_discovery = false");
});

test("three states change display names only, preserve Max/context/images/IDs, and catalog GET never probes", async () => {
  const provider = await activate(["green", "yellow", "red"]);
  const before = await fs.readFile(getCodexConfigPath(), "utf8");
  for (const [index, status] of (["available", "blocked", "unavailable"] as const).entries()) {
    await recordModelHealth(provider.id, ["green", "yellow", "red"][index]!, "responses", { status, checkedAt: Date.now() }, { baseUrl: fixture.baseUrl, token });
  }
  const catalog = JSON.parse(await getModelStatusCatalog(provider.id, `Bearer ${token}`));
  expect(catalog.models.map((model: any) => model.slug)).toEqual(["green", "yellow", "red"]);
  expect(catalog.models.map((model: any) => model.display_name)).toEqual(["🟢 Green · 畅通", "🟡 Yellow · 拥堵", "🔴 Red · 不可用"]);
  expect(catalog.models.every((model: any) => model.supported_reasoning_levels.some((level: any) => level.effort === "max") && model.context_window === 128_000 && model.input_modalities.includes("image"))).toBe(true);
  await recordModelHealth(provider.id, "green", "responses", { status: "unavailable", checkedAt: Date.now() }, { baseUrl: fixture.baseUrl, token });
  expect(JSON.parse(await getModelStatusCatalog(provider.id, `Bearer ${token}`)).models[0].display_name).toContain("🔴");
  expect(await fs.readFile(getCodexConfigPath(), "utf8")).toBe(before);
  expect(fixture.state.requests).toHaveLength(0);
});

test("catalog endpoint requires local access and the selected provider credential", async () => {
  const provider = await activate();
  const app = createApp();
  try {
    const url = `${MODEL_CATALOG_PATH}${provider.id}?client_version=0.162.0`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: { authorization: `Bearer ${token}` }, remoteAddress: "10.0.0.2" })).statusCode).toBe(403);
    expect((await app.inject({ url, headers: { authorization: `Bearer ${token}`, origin: "https://evil.test" } })).statusCode).toBe(403);
    const ok = await app.inject({ url, headers: { authorization: `Bearer ${token}` } });
    expect(ok.statusCode).toBe(200); expect(ok.json().models).toHaveLength(1); expect(ok.body).not.toContain(token);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(fixture.state.requests).toHaveLength(0);
  } finally { await app.close(); }
});

test("light probes make exactly one bounded generation for each chosen protocol", async () => {
  for (const protocol of ["responses", "chat_completions", "anthropic"] as const) {
    const result = await checkModelHealth({ baseUrl: fixture.baseUrl, token, modelId: "probe", protocol });
    expect(result.status).toBe("available");
  }
  expect(fixture.state.requests).toHaveLength(3);
  expect(fixture.state.requests.map((item) => item.path)).toEqual(["/v1/responses", "/v1/chat/completions", "/v1/messages"]);
  for (const request of fixture.state.requests) {
    expect(request.body.max_output_tokens ?? request.body.max_tokens).toBe(32);
    expect(request.body.tools).toBeUndefined(); expect(request.body.reasoning).toBeUndefined();
  }
  expect(fixture.state.requests[2]!.headers["x-api-key"]).toBe(token);
});

test("rate limits and server failures are blocked, auth/model failures unavailable, and keys are redacted", async () => {
  for (const [code, status] of [[429, "blocked"], [503, "blocked"], [401, "unavailable"], [404, "unavailable"], [302, "unavailable"]] as const) {
    fixture.state.status = code;
    const result = await checkModelHealth({ baseUrl: fixture.baseUrl, token, modelId: "probe", protocol: "responses" });
    expect(result.status).toBe(status); expect(JSON.stringify(result)).not.toContain(token);
  }
  expect(fixture.state.requests).toHaveLength(5); // includes redirect refusal, no follow or retry
  fixture.state.status = 200; fixture.state.mode = "error";
  expect((await checkModelHealth({ baseUrl: fixture.baseUrl, token, modelId: "probe", protocol: "responses" })).status).toBe("blocked");
});

test("empty, truncated and HTML replies are not falsely green; timeout is bounded", async () => {
  const target = { baseUrl: fixture.baseUrl, token, modelId: "probe", protocol: "responses" as const };
  for (const mode of ["empty", "truncated", "partial", "html"]) {
    fixture.state.mode = mode;
    const result = await checkModelHealth(target);
    expect(result.status).toBe("unknown");
    expect(Boolean(result.protocolConfirmed)).toBe(mode === "empty" || mode === "partial");
  }
  fixture.state.mode = "ok"; fixture.state.delayMs = 200;
  expect((await checkModelHealth(target, undefined, 25)).status).toBe("blocked");
});

test("desktop curl transport also performs one probe and refuses credential redirects", async () => {
  const previous = process.env.OAUTH_DEMO_USE_CURL;
  process.env.OAUTH_DEMO_USE_CURL = "1";
  try {
    const target = { baseUrl: fixture.baseUrl, token, modelId: "probe", protocol: "responses" as const };
    expect((await checkModelHealth(target)).status).toBe("available");
    fixture.state.status = 302;
    expect((await checkModelHealth(target)).status).toBe("unavailable");
    expect(fixture.state.requests).toHaveLength(2);
  } finally {
    if (previous === undefined) delete process.env.OAUTH_DEMO_USE_CURL;
    else process.env.OAUTH_DEMO_USE_CURL = previous;
  }
});

test("saved channels can be monitored without takeover or discovery, while catalog access still requires activation", async () => {
  let calls = 0;
  const monitor = new ModelStatusService(async () => { calls++; return { status: "available", checkedAt: Date.now() }; });
  try {
    expect((await monitor.settings()).enabled).toBe(false);
    await expect(monitor.startManual()).rejects.toMatchObject({ statusCode: 409 });
    const provider = await service.create({ name: "未接入", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ["saved"] });
    expect((await monitor.settings()).enabled).toBe(true);
    const native = await fs.readFile(getCodexConfigPath(), "utf8");
    const configs = [native, native + '[features]\napi_key_model_discovery = false\n',
      native + 'model_catalog_json = "/my/catalog.json"\n', native + `model_catalog_url = "http://127.0.0.1:45678${MODEL_CATALOG_PATH}another"\n`];
    for (const [index, raw] of configs.entries()) {
      await fs.writeFile(getCodexConfigPath(), raw);
      await monitor.run(true); expect(calls).toBe(index + 1);
      expect(await fs.readFile(getCodexConfigPath(), "utf8")).toBe(raw);
    }
    const saved = await getExternalProviderWithSecret(provider.id);
    expect(saved?.activeForCodex).toBe(false);
    expect(saved?.models[0]?.selectedForCodex).toBe(false);
    expect(saved?.models[0]?.health?.responses?.status).toBe("available");
    await expect(getModelStatusCatalog(provider.id, `Bearer ${token}`)).rejects.toMatchObject({ statusCode: 401 });
  } finally { await monitor.close(); }
});

test("startup checks due models across inactive channels, preserves intervals and reuses fresh results after restart", async () => {
  const first = await service.create({ name: "第一渠道", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ["first-due", "fresh"] });
  const second = await service.create({ name: "第二渠道", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ["second-due"] });
  await recordModelHealth(first.id, "fresh", "responses", { status: "available", checkedAt: Date.now() - 20 * 60_000 }, { baseUrl: fixture.baseUrl, token });
  await recordModelHealth(second.id, "second-due", "responses", { status: "blocked", checkedAt: Date.now() - 61 * 60_000 }, { baseUrl: fixture.baseUrl, token });
  await setModelHealthInterval(60);
  const config = await fs.readFile(getCodexConfigPath(), "utf8");
  const calls: string[] = [];
  const probe: typeof checkModelHealth = async (target) => { calls.push(target.modelId); return { status: "available", checkedAt: Date.now() }; };
  const monitor = new ModelStatusService(probe);
  try {
    monitor.start(); monitor.start(); await monitor.run();
    expect(calls.sort()).toEqual(["first-due", "second-due"]);
    expect((await monitor.settings()).intervalMinutes).toBe(60);
  } finally { await monitor.close(); }
  const restarted = new ModelStatusService(probe);
  try {
    restarted.start(); await restarted.run();
    expect(calls).toHaveLength(2);
    expect(await fs.readFile(getCodexConfigPath(), "utf8")).toBe(config);
    await setModelHealthInterval(15); await restarted.run();
    expect(calls).toEqual(["first-due", "second-due", "fresh"]);
  } finally { await restarted.close(); }
});

test("startup honors disabled automatic checks, and manual checks remain available before takeover", async () => {
  await service.create({ name: "未接入", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ["saved"] });
  await setModelHealthInterval(0);
  const monitor = new ModelStatusService();
  try {
    monitor.start(); await monitor.run();
    expect(fixture.state.requests).toHaveLength(0);
    expect((await monitor.settings()).intervalMinutes).toBe(0);
    await monitor.startManual(); await monitor.run();
    expect(fixture.state.requests).toHaveLength(1);
    await expect(monitor.startManual()).rejects.toMatchObject({ statusCode: 429 });
  } finally { await monitor.close(); }
});

test("closing the monitor cancels in-flight probes without saving false failures", async () => {
  const provider = await activate();
  let start!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const monitor = new ModelStatusService(async (_target, signal) => {
    start();
    await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    return { status: "available", checkedAt: Date.now() };
  });
  const pending = monitor.run(); await started; await monitor.close(); await pending;
  expect((await getExternalProviderWithSecret(provider.id))?.models[0]?.health).toBeUndefined();
});

test("unknown and stale remain neutral; Responses evidence is not reused for another protocol", () => {
  const now = Date.now();
  const model = { inspection: { status: "ready", checkedAt: now }, health: { responses: { status: "blocked" as const, checkedAt: now + 1 } } };
  expect(resolveModelAvailability({}).status).toBe("unknown");
  expect(resolveModelAvailability(model).status).toBe("blocked");
  expect(resolveModelAvailability(model, "anthropic").status).toBe("unknown");
  expect(resolveModelAvailability(model, "responses", 30, now + 61 * 60_000)).toMatchObject({ status: "unknown", stale: true });
  const html = renderToStaticMarkup(createElement(ModelAvailabilityBadge, { model: { id: "m", selectedForCodex: true, inspection: { status: "unknown" }, health: { responses: { status: "blocked", checkedAt: now } } } }));
  expect(html).toContain("拥堵"); expect(html).toContain("is-blocked"); expect(html).toContain("检测");
  const checkedAt = now - 61 * 60_000;
  const old = { id: "m", selectedForCodex: true, inspection: { status: "ready" as const },
    health: { responses: { status: "blocked" as const, checkedAt, message: "轻量检测返回 HTTP 429。" } } };
  const before = JSON.stringify(old);
  const stale = resolveModelAvailability(old, "responses", 30, now);
  expect(stale).toMatchObject({ status: "unknown", stale: true, checkedAt });
  expect(stale.message).toContain("超过 60 分钟");
  expect(stale.message).toContain("上次结果：拥堵");
  expect(stale.message).toContain("HTTP 429");
  expect(availabilityDisplayName("m", stale)).toBe("⚪ m · 待刷新");
  const staleHtml = renderToStaticMarkup(createElement(ModelAvailabilityBadge, { model: old, compact: true,
    refreshHint: "自动检测已关闭，可手动检测模型状态。" }));
  expect(staleHtml).toContain("待刷新");
  expect(staleHtml).not.toContain("已过期");
  expect(staleHtml).toContain(`上次检测：${new Date(checkedAt).toLocaleString()}`);
  expect(staleHtml).toContain("待刷新原因：超过 60 分钟");
  expect(staleHtml).toContain("自动检测已关闭");
  // The wording change keeps the original freshness boundary and saved snapshot.
  expect(resolveModelAvailability(old, "responses", 60, now).status).toBe("blocked");
  expect(JSON.stringify(old)).toBe(before);
});

test("scheduler observes off/due times, covers unselected models without overlap, and retains saved capabilities and selection", async () => {
  const provider = await activate(["one", "two"]);
  await service.activate(provider.id, ["one"], "one", 34567);
  const monitor = new ModelStatusService();
  try {
    await setModelHealthInterval(0); await monitor.run(); expect(fixture.state.requests).toHaveLength(0);
    await setModelHealthInterval(30);
    await Promise.all([monitor.run(), monitor.run()]);
    expect(fixture.state.requests).toHaveLength(2);
    expect(fixture.state.requests.map((request) => request.body.model).sort()).toEqual(["one", "two"]);
    await monitor.run(); expect(fixture.state.requests).toHaveLength(2);
    fixture.state.status = 429; await monitor.run(true);
    const updated = await getExternalProviderWithSecret(provider.id);
    expect(updated?.models[0]?.health?.responses?.status).toBe("blocked");
    expect(updated?.models[0]?.reasoningEfforts).toContain("max");
    expect(updated?.models[0]?.inspection.status).toBe("untested");
    expect(updated?.models.map((model) => model.selectedForCodex)).toEqual([true, false]);
    expect(updated?.defaultModelId).toBe("one");
    expect(updated?.models.map((model) => model.contextWindow)).toEqual([128_000, 128_000]);
  } finally { await monitor.close(); }
});

test("automatic scheduler caps batches at 20 and checks remaining models first on the next tick", async () => {
  const provider = await activate(Array.from({ length: 22 }, (_, i) => `m${i}`));
  const calls: string[] = [];
  const monitor = new ModelStatusService(async (target) => { calls.push(target.modelId); return { status: "available", checkedAt: Date.now() }; });
  try {
    await monitor.run(); expect(calls).toHaveLength(20);
    await monitor.run(); expect(calls).toHaveLength(22);
    await monitor.run(); expect(calls).toHaveLength(22);
    await service.deactivate(provider.id); await monitor.run(true); expect(calls).toHaveLength(44);
  } finally { await monitor.close(); }
});

test("manual health checks cover all saved models with bounded concurrency and full progress before takeover", async () => {
  const ids = Array.from({ length: 29 }, (_, i) => `m${i}`);
  await service.create({ name: "未接入", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ids });
  const calls: string[] = [];
  let inFlight = 0, peak = 0;
  const monitor = new ModelStatusService(async (target) => {
    calls.push(target.modelId); peak = Math.max(peak, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return { status: "available", checkedAt: Date.now() };
  });
  try {
    await setModelHealthInterval(0);
    await monitor.run(true);
    expect(calls.sort()).toEqual([...ids].sort());
    expect(peak).toBe(2);
    expect((await monitor.settings()).job).toMatchObject({ running: false, total: 29, completed: 29 });
  } finally { await monitor.close(); }
});

test("credential changes discard in-flight results and reset old health snapshots", async () => {
  const provider = await activate();
  const monitor = new ModelStatusService(async () => {
    await updateExternalProvider(provider.id, { token: "new-key", resetInspections: true, codexNeedsApply: true });
    return { status: "available", checkedAt: Date.now() };
  });
  try {
    await monitor.run();
    expect((await getExternalProviderWithSecret(provider.id))?.models[0]?.health).toBeUndefined();
    await expect(getModelStatusCatalog(provider.id, `Bearer ${token}`)).rejects.toMatchObject({ statusCode: 401 });
  } finally { await monitor.close(); }
});

test("monitoring reuses applied, saved and identified interfaces once per model, including models outside the active selection", async () => {
  const provider = await activate(["native", "chat", "claude"]);
  await service.activate(provider.id, ["native"], "native", 34567);
  for (const [id, protocol] of [["native", "anthropic"], ["chat", "chat_completions"], ["claude", "anthropic"]] as const) {
    await recordModelCompatibility(provider.id, id, { status: "identified", protocol, checkedAt: Date.now(), message: "已识别" }, { baseUrl: fixture.baseUrl, token });
  }
  const monitor = new ModelStatusService();
  try {
    const before = await getExternalProviderWithSecret(provider.id);
    await monitor.run(true);
    expect(fixture.state.requests).toHaveLength(3);
    expect(Object.fromEntries(fixture.state.requests.map((request) => [request.body.model, request.path])))
      .toEqual({ native: "/v1/responses", chat: "/v1/chat/completions", claude: "/v1/messages" });
    expect((await getExternalProviderWithSecret(provider.id))?.models.map((model) => model.compatibility))
      .toEqual(before?.models.map((model) => model.compatibility));
    await service.activateMixed({ routes: [{ providerId: provider.id, modelId: "chat", protocol: "anthropic" }],
      defaultModel: { providerId: provider.id, modelId: "chat" } }, 34568, 34567);
    fixture.state.requests.length = 0;
    await monitor.run(true);
    expect(fixture.state.requests).toHaveLength(3);
    expect(fixture.state.requests.every((request) => request.path === "/v1/messages")).toBe(true);
    await service.deactivateMixed();
    fixture.state.requests.length = 0;
    await monitor.run(true);
    expect(fixture.state.requests).toHaveLength(3);
    expect(fixture.state.requests.find((request) => request.body.model === "chat")?.path).toBe("/v1/messages");
  } finally { await monitor.close(); }
});

test.each(["disabled", "removed"] as const)("queued probes stop when monitoring is %s before the request starts", async (change) => {
  const ids = ["one", "two", "three", "four"];
  const provider = await service.create({ name: "未接入", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ids });
  let notifyStarted!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const calls: string[] = [];
  const monitor = new ModelStatusService(async (target) => {
    calls.push(target.modelId);
    if (calls.length === 2) notifyStarted();
    await hold;
    return { status: "available", checkedAt: Date.now() };
  });
  try {
    const running = monitor.run(); await started;
    if (change === "disabled") await setModelHealthInterval(0);
    else for (const id of ids.slice(2)) await removeExternalProviderModel(provider.id, id);
    release(); await running;
    expect(calls.sort()).toEqual(["one", "two"]);
  } finally { release(); await monitor.close(); }
});

test("mixed catalog uses protocol-specific health with stable route IDs and supported reasoning", async () => {
  const provider = await activate(["one", "two"]);
  const config = await service.activateMixed({ routes: [{ providerId: provider.id, modelId: "one", protocol: "responses" }, { providerId: provider.id, modelId: "two", protocol: "anthropic" }], defaultModel: { providerId: provider.id, modelId: "one" } }, 34568, 34567);
  const { readMixedProviderConfig } = await import("../src/core/store/external-provider-store.ts");
  const secret = await readMixedProviderConfig();
  await recordModelHealth(provider.id, "one", "responses", { status: "available", checkedAt: Date.now() }, { baseUrl: fixture.baseUrl, token });
  await recordModelHealth(provider.id, "two", "responses", { status: "available", checkedAt: Date.now() }, { baseUrl: fixture.baseUrl, token });
  const catalog = JSON.parse(await getModelStatusCatalog("mixed", `Bearer ${secret!.apiKey}`));
  expect(catalog.models.map((model: any) => model.slug)).toEqual(config.routes.map((route) => route.id));
  expect(catalog.models[0].display_name).toContain("🟢"); expect(catalog.models[1].display_name).toContain("未检测");
  expect(catalog.models[0].supported_reasoning_levels.map((level: any) => level.effort)).toContain("max");
  expect(catalog.models[1].supported_reasoning_levels).toEqual([]);
  expect(catalog.models[0].supports_search_tool).toBe(false);
  expect(catalog.models[1].supports_search_tool).toBe(true);
  expect((await getCodexGatewayProviderStatus()).modelCatalogUrl).toContain("/mixed");
});

test("oversized remote catalogs fail before changing config or activating a provider", async () => {
  await fs.writeFile(path.join(process.env.CODEX_HOME!, "models_cache.json"), JSON.stringify({ models: [{ slug: "native", base_instructions: "x".repeat(600_000) }] }));
  const original = await fs.readFile(getCodexConfigPath(), "utf8");
  const provider = await service.create({ name: "Large", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ["one", "two"] });
  await expect(service.activate(provider.id, ["one", "two"], "one", 34567)).rejects.toThrow("1 MiB");
  expect(await fs.readFile(getCodexConfigPath(), "utf8")).toBe(original);
  expect((await getExternalProviderWithSecret(provider.id))?.activeForCodex).toBe(false);
});
