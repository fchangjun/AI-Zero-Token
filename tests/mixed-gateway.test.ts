import { beforeEach, afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { gzipSync } from "node:zlib";
import { getStateDir } from "../src/core/store/state-paths";
import { getCodexConfigPath, getCodexGatewayProviderStatus } from "../src/core/store/codex-auth-store";
import { readMixedProviderConfig, getExternalProvider, resolveMixedRoute, getExternalProviderStorePath, updateExternalProvider } from "../src/core/store/external-provider-store";
import { getModelStatusCatalog } from "../src/core/services/model-status-service";
import { ExternalProviderService } from "../src/core/services/external-provider-service";
import { createApp } from "../src/server/app";
import { startMixedProviderFixture } from "./fixtures/mixed-provider";
import type { MixedActivationInput, MixedProtocol } from "../src/core/models/mixed-provider";

let fixture: Awaited<ReturnType<typeof startMixedProviderFixture>>;
let app: ReturnType<typeof createApp>;
let service: ExternalProviderService;
let a: string, b: string;
const tool = { type: "function", name: "read_file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };

beforeEach(async () => {
  if (!getStateDir().includes("azt-tests-") || !getCodexConfigPath().includes("azt-tests-")) throw new Error("Run with isolated test setup.");
  await rm(getStateDir(), { recursive: true, force: true }); await mkdir(getStateDir(), { recursive: true });
  await writeFile(`${getStateDir()}/store.json`, '{"version":1,"profiles":{}}'); await writeFile(`${getStateDir()}/settings.json`, '{}');
  await rm(process.env.CODEX_HOME!, { recursive: true, force: true }); await mkdir(process.env.CODEX_HOME!, { recursive: true });
  await writeFile(getCodexConfigPath(), 'model = "native-model"\n');
  fixture = await startMixedProviderFixture();
  service = new ExternalProviderService();
  a = (await service.create({ name: "A", baseUrl: fixture.baseUrl, apiToken: "fixture-token-A", modelSource: "manual", manualModelIds: ["shared-model"] })).id;
  b = (await service.create({ name: "B", baseUrl: fixture.baseUrl, apiToken: "fixture-token-B", modelSource: "manual", manualModelIds: ["shared-model"] })).id;
  app = createApp(); await app.ready();
});
afterEach(async () => { await app?.close(); await fixture?.close(); });

function selection(protocol: MixedProtocol = "chat_completions"): MixedActivationInput {
  return { routes: [{ providerId: a, modelId: "shared-model", protocol }, { providerId: b, modelId: "shared-model", protocol: "anthropic" }],
    defaultModel: { providerId: a, modelId: "shared-model" } };
}
async function activate(protocol: MixedProtocol = "chat_completions") {
  const reply = await app.inject({ method: "POST", url: "/_gateway/admin/mixed/activate", payload: selection(protocol) });
  expect(reply.statusCode).toBe(200);
  const config = (await readMixedProviderConfig())!;
  return { config, base: `http://127.0.0.1:${config.port}/v1`, headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` } };
}

test("old direct state remains direct on load and mixed switching preserves direct selections", async () => {
  await service.activate(a, ["shared-model"], "shared-model");
  const before = await readFile(getCodexConfigPath(), "utf8");
  await app.inject("/_gateway/admin/providers");
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
  expect(await readMixedProviderConfig()).toBeUndefined();
  const { config } = await activate();
  expect(new Set(config.routes.map((route) => route.id)).size).toBe(2);
  expect(config.routes[0].contextWindow).toBe(128_000);
  expect((await getExternalProvider(a))?.models[0].selectedForCodex).toBe(true);
  expect((await getCodexGatewayProviderStatus()).baseUrl).toBe(`http://127.0.0.1:${config.port}/v1`);
  const publicReply = await app.inject("/_gateway/admin/providers");
  expect(publicReply.json().mixed.active).toBe(true);
  expect(publicReply.body).not.toContain(config.apiKey);
  expect(publicReply.body).not.toContain("fixture-token");
  expect(publicReply.body).not.toContain("connectionVersion");
  await service.activate(a, ["shared-model"], "shared-model");
  expect((await getCodexGatewayProviderStatus()).baseUrl).toBe(fixture.baseUrl);
  expect((await readMixedProviderConfig())?.active).toBe(false);
  expect((await readMixedProviderConfig())?.routes).toHaveLength(2);
});

test("mixed request logs record timings and failures without storing prompts or credentials", async () => {
  const { config, base, headers } = await activate();
  for (const suffix of ["responses", "responses/compact"]) {
    const response = await fetch(`${base}/${suffix}`, { method: "POST", headers,
      body: JSON.stringify({ model: config.defaultModelId, input: "PRIVATE_PROMPT_FIXTURE", stream: suffix === "responses" }) });
    expect(response.status).toBe(200); await response.text();
  }
  fixture.state.status = 429;
  const rejected = await fetch(`${base}/responses`, { method: "POST", headers,
    body: JSON.stringify({ model: config.defaultModelId, input: "PRIVATE_PROMPT_FIXTURE", stream: true }) });
  expect(rejected.status).toBe(429); await rejected.text();
  const reply = await app.inject("/_gateway/admin/request-logs");
  const logs = reply.json().data.filter((log: any) => log.source === "mixed");
  expect(logs).toHaveLength(3);
  expect(logs[0]).toMatchObject({ statusCode: 429, details: { mixedTiming: { outcome: "failed", usageReported: false } } });
  expect(logs[1].details.mixedTiming).toMatchObject({ compaction: "endpoint", outcome: "completed" });
  expect(logs[2].details.mixedTiming.firstTextMs).toBeGreaterThanOrEqual(0);
  expect(logs[2].details.mixedTiming.totalMs).toBeGreaterThanOrEqual(logs[2].details.mixedTiming.firstTextMs);
  for (const secret of ["PRIVATE_PROMPT_FIXTURE", "fixture-token", config.apiKey]) expect(reply.body).not.toContain(secret);
});

test("mixed contexts prioritize manual and API values, preserving applied windows until reactivation", async () => {
  await updateExternalProvider(a, { models: [{ id: "shared-model", contextWindow: 200_000 }] });
  await service.setContextWindow(a, "shared-model", 500_000);
  await service.setContextWindow(b, "shared-model", 32_768);
  const { config } = await activate();
  expect(config.routes.map((route) => route.contextWindow)).toEqual([500_000, 32_768]);
  const before = await readFile(getCodexConfigPath(), "utf8");
  await service.setContextWindow(a, "shared-model", null);
  expect((await readMixedProviderConfig())!.routes[0].contextWindow).toBe(500_000);
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
  const { config: reapplied } = await activate();
  expect(reapplied.routes.map((route) => route.contextWindow)).toEqual([200_000, 32_768]);
});

test("static converted catalogs enable local discovery without changing direct catalog defaults", async () => {
  await service.activateMixed(selection(), 34568);
  expect((await getCodexGatewayProviderStatus()).catalogModels?.map((model) => model.supportsToolSearch)).toEqual([true, true]);
  await service.activate(a, ["shared-model"], "shared-model");
  expect((await getCodexGatewayProviderStatus()).catalogModels?.every((model) => model.supportsToolSearch !== true)).toBe(true);
});

test("loading old 32K mixed routes preserves their live catalog and files until explicit reactivation", async () => {
  const { config } = await activate();
  const storePath = getExternalProviderStorePath();
  const legacy = JSON.parse(await readFile(storePath, "utf8"));
  for (const route of legacy.mixed.routes) route.contextWindow = 32_768;
  await writeFile(storePath, JSON.stringify(legacy));
  const beforeStore = await readFile(storePath, "utf8");
  const beforeConfig = await readFile(getCodexConfigPath(), "utf8");
  const listed = (await app.inject("/_gateway/admin/providers")).json();
  expect(listed.mixed.routes.map((route: any) => route.contextWindow)).toEqual([32_768, 32_768]);
  expect(listed.mixed.needsApply).toBe(true);
  const catalog = JSON.parse(await getModelStatusCatalog("mixed", `Bearer ${config.apiKey}`));
  expect(catalog.models.map((model: any) => model.context_window)).toEqual([32_768, 32_768]);
  expect((await resolveMixedRoute(config.defaultModelId)).route.contextWindow).toBe(32_768);
  expect(await readFile(storePath, "utf8")).toBe(beforeStore);
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(beforeConfig);
  expect((await activate()).config.routes.map((route) => route.contextWindow)).toEqual([128_000, 128_000]);
});

test("mixed gateway requires its own key and rejects browser/remote management requests", async () => {
  const { base, headers } = await activate();
  expect((await fetch(`${base}/models`)).status).toBe(401);
  expect((await fetch(`${base}/models`, { headers: { ...headers, Origin: "https://example.test" } })).status).toBe(403);
  expect((await fetch(`${base}/models`, { headers })).status).toBe(200);
  const remote = await app.inject({ method: "POST", url: "/_gateway/admin/mixed/activate", payload: selection(), remoteAddress: "192.0.2.1" });
  expect(remote.statusCode).toBe(403);
  expect((await app.inject("/v1/models")).statusCode).not.toBe(401);
});

test("both conversion protocols perform a full tool round trip with distinct upstream credentials", async () => {
  const { config, base, headers } = await activate();
  for (const route of config.routes) {
    const first = await fetch(`${base}/responses`, { method: "POST", headers, body: JSON.stringify({ model: route.id, input: "read", tools: [tool], stream: false }) });
    const answer: any = await first.json();
    expect(first.status).toBe(200);
    expect(answer.status).toBe("completed");
    expect(answer.output[0].type).toBe("function_call");
    const second = await fetch(`${base}/responses`, { method: "POST", headers, body: JSON.stringify({ model: route.id,
      input: [{ role: "user", content: "read" }, ...answer.output, { type: "function_call_output", call_id: answer.output[0].call_id, output: "contents" }], tools: [tool], stream: true }) });
    const stream = await second.text();
    expect(stream).toContain("response.output_text.delta"); expect(stream).toContain("tool complete"); expect(stream).toContain("response.completed");
  }
  expect(fixture.state.requests[0].headers.authorization).toBe("Bearer fixture-token-A");
  expect(fixture.state.requests[2].headers["x-api-key"]).toBe("fixture-token-B");
  expect(fixture.state.requests.every((request) => request.body.model === "shared-model")).toBe(true);
  expect(fixture.state.requests.some((request) => JSON.stringify(request.headers).includes(config.apiKey))).toBe(false);
});

test("Responses passthrough preserves native compaction and does not use account-pool auth", async () => {
  const { config, base, headers } = await activate("responses");
  const route = config.routes[0];
  const response = await fetch(`${base}/responses`, { method: "POST", headers, body: JSON.stringify({ model: route.id, input: [{ type: "compaction", encrypted_content: "native" }], stream: true }) });
  expect(await response.text()).toContain("native reply");
  expect(fixture.state.requests[0].body.input[0].encrypted_content).toBe("native");
  const compact = await fetch(`${base}/responses/compact`, { method: "POST", headers, body: JSON.stringify({ model: route.id, input: "history" }) });
  expect((await compact.json() as any).output[0].encrypted_content).toBe("upstream-opaque");
});

test("compressed request bodies are decoded and bounded before forwarding", async () => {
  await app.close(); app = createApp({ bodyLimit: 1024 }); await app.ready();
  const { config, base, headers } = await activate();
  const valid = await fetch(`${base}/responses`, { method: "POST", headers: { ...headers, "Content-Encoding": "gzip" }, body: gzipSync(JSON.stringify({ model: config.defaultModelId, input: "hi" })) });
  expect(valid.status).toBe(200); await valid.text();
  const before = fixture.state.requests.length;
  const oversized = await fetch(`${base}/responses`, { method: "POST", headers: { ...headers, "Content-Encoding": "gzip" }, body: gzipSync(JSON.stringify({ model: config.defaultModelId, input: "x".repeat(4096) })) });
  expect(oversized.status).toBe(413);
  expect(fixture.state.requests.length).toBe(before);
});

test("converted long conversations compact within the same service and reject foreign compaction without an upstream call", async () => {
  const { config, base, headers } = await activate();
  const [route, other] = config.routes;
  const compact = await fetch(`${base}/responses/compact`, { method: "POST", headers, body: JSON.stringify({ model: route.id, input: "many earlier messages" }) });
  const answer: any = await compact.json();
  expect(compact.status).toBe(200); expect(answer.output[0].encrypted_content).toStartWith("azt1.");
  const next = await fetch(`${base}/responses`, { method: "POST", headers, body: JSON.stringify({ model: route.id, input: [...answer.output, { role: "user", content: "continue" }] }) });
  expect(next.status).toBe(200);
  expect(fixture.state.requests[1].body.messages[0].content).toContain("summary or reply");
  const before = fixture.state.requests.length;
  const incompatible = await fetch(`${base}/responses`, { method: "POST", headers, body: JSON.stringify({ model: other.id, input: answer.output }) });
  expect(incompatible.status).toBe(400); expect(await incompatible.text()).toContain("另一服务");
  expect(fixture.state.requests.length).toBe(before);
});

test("upstream failures are not retried and redirects cannot receive provider credentials", async () => {
  const { config, base, headers } = await activate();
  fixture.state.status = 429;
  const response = await fetch(`${base}/responses`, { method: "POST", headers, body: JSON.stringify({ model: config.defaultModelId, input: "hi" }) });
  expect(response.status).toBe(429); expect(fixture.state.requests).toHaveLength(1);
  fixture.state.status = 200; fixture.state.redirect = `${fixture.baseUrl}/messages`;
  const redirect = await fetch(`${base}/responses`, { method: "POST", headers, body: JSON.stringify({ model: config.defaultModelId, input: "hi" }) });
  expect(redirect.status).toBe(502); expect(fixture.state.requests).toHaveLength(2);
});

test("failed mixed switch rolls back direct config and never leaves mixed active", async () => {
  await service.activate(a, ["shared-model"], "shared-model");
  const before = await readFile(getCodexConfigPath(), "utf8");
  let checks = 0;
  const failing = new ExternalProviderService({ assertStopped: async () => { if (++checks === 3) throw new Error("fixture late failure"); } });
  await expect(failing.activateMixed(selection(), 53219)).rejects.toThrow("fixture late failure");
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
  expect((await getExternalProvider(a))?.activeForCodex).toBe(true);
  expect(await readMixedProviderConfig()).toBeUndefined();
});

test("configuration changes require reapply, active route providers cannot be deleted, and deactivation preserves selection", async () => {
  const { config } = await activate();
  await expect(service.delete(a)).rejects.toThrow("混合接管");
  await service.update(a, { name: "A", baseUrl: fixture.baseUrl, apiToken: "new-fixture-token", modelSource: "manual", manualModelIds: ["shared-model"] });
  await expect(resolveMixedRoute(config.defaultModelId)).rejects.toThrow("已变更");
  expect((await service.list()).mixed?.needsApply).toBe(true);
  const result = await app.inject({ method: "POST", url: "/_gateway/admin/mixed/deactivate" });
  expect(result.statusCode).toBe(200);
  expect((await readMixedProviderConfig())?.routes).toHaveLength(2);
  expect((await getCodexGatewayProviderStatus()).active).toBe(false);
});

test("saved mixed listener restarts on the same port", async () => {
  const { config, base, headers } = await activate();
  await app.close(); app = createApp(); await app.ready();
  expect((await readMixedProviderConfig())?.port).toBe(config.port);
  expect((await fetch(`${base}/models`, { headers })).status).toBe(200);
});

test("occupied mixed port leaves the admin UI and direct takeover available", async () => {
  const { config } = await activate();
  await app.close();
  const occupant = createServer();
  await new Promise<void>((resolve) => occupant.listen(config.port, "127.0.0.1", resolve));
  try {
    app = createApp(); await app.ready();
    const snapshot = (await app.inject("/_gateway/admin/providers")).json();
    expect(snapshot.mixed.gatewayReady).toBe(false);
    expect(snapshot.mixed.gatewayError).toContain("端口被占用");
    const result = await app.inject({ method: "POST", url: "/_gateway/admin/mixed/activate", payload: selection() });
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect((await readMixedProviderConfig())?.port).toBe(config.port);
    await service.activate(a, ["shared-model"], "shared-model");
    expect((await getCodexGatewayProviderStatus()).baseUrl).toBe(fixture.baseUrl);
  } finally { await new Promise<void>((resolve) => occupant.close(() => resolve())); }
});

test("client cancellation aborts the upstream stream", async () => {
  // Bun 1.2's HTTP shim does not emit the Node response-close event on disconnect.
  // Bundle current source and run this socket lifecycle test in the production runtime.
  const build = await Bun.build({ entrypoints: ["./tests/fixtures/mixed-cancellation.ts"], target: "node", format: "cjs", external: ["fastify"],
    define: { "import.meta.url": JSON.stringify("file:///azt-isolated-tests/src/core/store/state-paths.ts") } });
  expect(build.success).toBe(true);
  const worker = Bun.spawn(["node", "--input-type=commonjs", "-e", await build.outputs[0].text()], { env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([new Response(worker.stdout).text(), new Response(worker.stderr).text(), worker.exited]);
  expect(error).toBe(""); expect(code).toBe(0); expect(output).toContain("CANCELLATION_OK");
}, 20_000);
