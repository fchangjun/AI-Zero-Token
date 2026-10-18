import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { getStateDir } from "../src/core/store/state-paths.ts";
import { getCodexConfigPath } from "../src/core/store/codex-auth-store.ts";
import { commitMixedActivation, getExternalProviderWithSecret, readMixedProviderConfig, recordModelCompatibility, recordModelHealth, updateExternalProvider } from "../src/core/store/external-provider-store.ts";
import { ExternalProviderService } from "../src/core/services/external-provider-service.ts";
import { inspectModelCompatibility, resolveMixedProtocols } from "../src/core/services/mixed-protocol-service.ts";
import { createApp } from "../src/server/app.ts";
import { startMixedProviderFixture } from "./fixtures/mixed-provider.ts";
import type { MixedActivationRequest, MixedProtocol } from "../src/core/models/mixed-provider.ts";
import { normalizeProviderModel } from "../admin-ui/src/pages/providers/api.ts";
import { takeoverAvailability } from "../admin-ui/src/pages/providers/takeover-availability.ts";
import { resolveModelAvailability } from "../src/core/models/model-availability.ts";

let fixture: Awaited<ReturnType<typeof startMixedProviderFixture>>;
let service: ExternalProviderService;
let providerId: string;
const token = "isolated-protocol-test-token";
const ids = ["claude-with-responses", "chat-only", "messages-only"];
let app: ReturnType<typeof createApp> | undefined;

beforeEach(async () => {
  if (!getStateDir().includes("azt-tests-") || !getCodexConfigPath().includes("azt-tests-")) throw new Error("Use isolated test setup.");
  await rm(getStateDir(), { recursive: true, force: true }); await mkdir(getStateDir(), { recursive: true });
  await writeFile(`${getStateDir()}/store.json`, '{"version":1,"profiles":{}}');
  await writeFile(`${getStateDir()}/settings.json`, "{}");
  await rm(process.env.CODEX_HOME!, { recursive: true, force: true }); await mkdir(process.env.CODEX_HOME!, { recursive: true });
  await writeFile(getCodexConfigPath(), 'model = "native-model"\n');
  fixture = await startMixedProviderFixture();
  fixture.state.supportedEndpoints = { [ids[0]]: ["responses", "responses/compact"], [ids[1]]: ["chat/completions"], [ids[2]]: ["messages"] };
  service = new ExternalProviderService({ assertStopped: async () => {} });
  providerId = (await service.create({ name: "自动识别示例", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ids })).id;
});
afterEach(async () => { await app?.close(); app = undefined; await fixture.close(); });

function selection(modelIds = ids): MixedActivationRequest {
  return { routes: modelIds.map((modelId) => ({ providerId, modelId, protocol: "auto" })), defaultModel: { providerId, modelId: modelIds[0] } };
}

test("activation identifies actual endpoints independent of brand names, persists them and routes requests correctly", async () => {
  app = createApp(); await app.ready();
  const before = await readFile(getCodexConfigPath(), "utf8");
  await app.inject("/_gateway/admin/providers");
  expect(fixture.state.requests).toHaveLength(0);
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
  const input = selection();
  const reply = await app.inject({ method: "POST", url: "/_gateway/admin/mixed/activate", payload: { ...input, routes: input.routes.map(({ protocol: _, ...route }) => route) } });
  expect(reply.statusCode).toBe(200);
  expect(reply.json().mixed.routes.map((route: any) => route.protocol)).toEqual(["responses", "chat_completions", "anthropic"]);
  expect(reply.json().mixed.routes.every((route: any) => route.autoDetected)).toBe(true);
  expect(reply.body).not.toContain(token);
  expect(reply.body).not.toContain("connectionVersion");
  const probes = fixture.state.requests;
  expect(probes).toHaveLength(6);
  expect(probes.every(({ body }) => body.stream === true && (body.max_tokens ?? body.max_output_tokens) === 32 && !body.tools)).toBe(true);
  const mixed = (await readMixedProviderConfig())!;
  expect(mixed.routes.map((route) => route.contextWindow)).toEqual([272_000, 128_000, 128_000]);
  for (const route of mixed.routes) {
    const response = await fetch(`http://127.0.0.1:${mixed.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${mixed.apiKey}` }, body: JSON.stringify({ model: route.id, input: "hello", stream: false }) });
    expect(response.status).toBe(200);
    expect((await response.json() as any).status).toBe("completed");
  }
  const count = fixture.state.requests.length;
  expect((await app.inject({ method: "POST", url: "/_gateway/admin/mixed/activate", payload: input })).statusCode).toBe(200);
  expect(fixture.state.requests).toHaveLength(count);
});

test("manual selections never probe and remain unchanged", async () => {
  const input = selection([ids[1]]); input.routes[0].protocol = "chat_completions";
  const result = await resolveMixedProtocols(input);
  expect(result.input).toEqual(input);
  expect(fixture.state.requests).toHaveLength(0);
});

test("confirmed health is reused while invalid selections cause no requests", async () => {
  await recordModelHealth(providerId, ids[1], "chat_completions", { status: "available", checkedAt: Date.now() }, { baseUrl: fixture.baseUrl, token });
  expect((await resolveMixedProtocols(selection([ids[1]]))).input.routes[0].protocol).toBe("chat_completions");
  for (const invalid of [
    { ...selection(), defaultModel: { providerId, modelId: "missing" } },
    { ...selection(), routes: [...selection().routes, selection().routes[0]] },
    selection([ids[0], "missing"]),
  ]) await expect(resolveMixedProtocols(invalid)).rejects.toThrow();
  expect(fixture.state.requests).toHaveLength(0);
});

test("unsupported endpoints leave direct config untouched and expose an actionable model-specific error", async () => {
  await service.activate(providerId, [ids[0]], ids[0]);
  const before = await readFile(getCodexConfigPath(), "utf8");
  fixture.state.supportedEndpoints[ids[1]] = [];
  await expect(service.activateMixed(selection([ids[1]]), 34568)).rejects.toThrow("chat-only 未能自动识别接口");
  expect(fixture.state.requests).toHaveLength(3);
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
  expect(await readMixedProviderConfig()).toBeUndefined();
});

test("rate limits and timeouts do not cause another protocol to be guessed", async () => {
  fixture.state.status = 429;
  await expect(resolveMixedProtocols(selection([ids[1]]))).rejects.toThrow("429");
  expect(fixture.state.requests).toHaveLength(1);
  let calls = 0;
  await expect(resolveMixedProtocols(selection([ids[2]]), { probe: async () => { calls++; return { status: "blocked", message: "轻量检测超时。" }; } })).rejects.toThrow("超时");
  expect(calls).toBe(1);
});

test("explicit unsupported conversion returned as HTTP 500 falls through, while overload and auth do not", async () => {
  fixture.state.unsupportedStatus = 500;
  const result = await resolveMixedProtocols(selection([ids[1]]));
  expect(result.input.routes[0].protocol).toBe("chat_completions");
  expect((await getExternalProviderWithSecret(providerId))?.models[1].compatibility).toMatchObject({ status: "identified", protocol: "chat_completions" });
  expect(fixture.state.requests).toHaveLength(2);
  for (const status of [500, 503, 401, 403]) {
    fixture.state.status = status;
    const count = fixture.state.requests.length;
    await expect(resolveMixedProtocols(selection([ids[2]]))).rejects.toThrow();
    expect(fixture.state.requests.length - count).toBe(1);
  }
});

test("partial batch failure still exposes successful identification before any activation", async () => {
  fixture.state.supportedEndpoints[ids[2]] = [];
  const before = await readFile(getCodexConfigPath(), "utf8");
  await expect(resolveMixedProtocols(selection())).rejects.toThrow("未修改 Codex");
  const provider = await service.get(providerId);
  expect(provider?.models[0].compatibility?.protocol).toBe("responses");
  expect(provider?.models[1].compatibility?.protocol).toBe("chat_completions");
  expect(provider?.models[2].compatibility?.status).toBe("failed");
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
});

test("legacy compatibility action shares native inspection and only validates converted interfaces", async () => {
  fixture.state.compatibilityProbe = true;
  fixture.state.unsupportedStatus = 500;
  app = createApp(); await app.ready();
  const before = await readFile(getCodexConfigPath(), "utf8");
  for (const modelId of ids) {
    const reply = await app.inject({ method: "POST", url: `/_gateway/admin/providers/${providerId}/compatibility`, payload: { modelId } });
    expect(reply.statusCode).toBe(200);
    const model = reply.json().provider.models.find((item: any) => item.id === modelId);
    if (modelId === ids[0]) {
      expect(model.compatibility).toMatchObject({ source: "responses", status: "identified", protocol: "responses", checkedAt: model.inspection.checkedAt });
      expect(model.inspection.status).toBe("ready");
      expect(model.compatibility.validation).toBeUndefined();
    } else expect(model.compatibility.validation).toMatchObject({ conversation: true, toolCalling: true, toolResult: true });
    expect(model.health[model.compatibility.protocol]).toMatchObject({ status: "available", protocolConfirmed: true,
      checkedAt: model.compatibility.validation?.checkedAt ?? model.inspection.checkedAt });
    expect(reply.body).not.toContain(token);
  }
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
  const count = fixture.state.requests.length;
  expect(fixture.state.requests.filter(({ body }) => body.model === ids[0]).every(({ body }) => body.max_output_tokens !== 512)).toBe(true);
  expect(fixture.state.requests.filter(({ body }) => body.max_output_tokens === 512 || body.max_tokens === 512)).toHaveLength(6);
  const snapshot = (await app.inject("/_gateway/admin/providers")).json();
  expect(snapshot.providers[0].models.every((model: any) => model.compatibility.source === "responses" || model.compatibility.validation.toolResult)).toBe(true);
  await service.activateMixed(selection(), 34568);
  expect(fixture.state.requests).toHaveLength(count);
  await service.update(providerId, { name: "updated", baseUrl: fixture.baseUrl, apiToken: "changed-token", modelSource: "manual", manualModelIds: ids });
  expect((await service.get(providerId))?.models.every((model) => !model.compatibility)).toBe(true);
});

test("an ignored tool result or malformed arguments cannot pass compatibility validation", async () => {
  fixture.state.compatibilityProbe = true;
  fixture.state.ignoreToolOutput = true;
  let provider = await inspectModelCompatibility(providerId, ids[1]);
  expect(provider?.models[1].compatibility?.validation).toMatchObject({ conversation: true, toolCalling: true, toolResult: false });
  fixture.state.ignoreToolOutput = false; fixture.state.invalidToolArguments = true;
  provider = await inspectModelCompatibility(providerId, ids[1]);
  expect(provider?.models[1].compatibility?.validation).toMatchObject({ conversation: true, toolCalling: false, toolResult: false });
  expect(await readMixedProviderConfig()).toBeUndefined();
});

test("one capability job shares Responses and waits only for converted interface validation", async () => {
  fixture.state.compatibilityProbe = true;
  fixture.state.unsupportedStatus = 500;
  let release!: () => void;
  fixture.state.compatibilityGate = new Promise<void>((resolve) => { release = resolve; });
  app = createApp(); await app.ready();
  const before = await readFile(getCodexConfigPath(), "utf8");
  try {
    const reply = await app.inject({ method: "POST", url: `/_gateway/admin/providers/${providerId}/inspect`, payload: { modelIds: ids } });
    expect(reply.statusCode).toBe(202);
    expect(reply.json().provider.inspectionJob).toMatchObject({ status: "running", total: 3, completed: 0 });
    for (let i = 0; i < 200 && fixture.state.requests.filter(({ body }) => body.max_output_tokens === 512 || body.max_tokens === 512).length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const checking = await service.get(providerId);
    expect(checking?.models[0].inspection.status).toBe("ready");
    expect(checking?.inspectionJob).toMatchObject({ status: "running", completed: 1 });
    await expect(service.startInspection(providerId, ids)).rejects.toMatchObject({ statusCode: 409 });
    release();
    let current = await service.get(providerId);
    for (let i = 0; i < 300 && current?.inspectionJob?.status === "running"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      current = await service.get(providerId);
    }
    expect(current?.inspectionJob).toMatchObject({ status: "completed", total: 3, completed: 3 });
    expect(current?.models.map((model) => model.inspection.status)).toEqual(["ready", "incompatible", "incompatible"]);
    expect(current?.models.map((model) => model.compatibility?.protocol)).toEqual(["responses", "chat_completions", "anthropic"]);
    expect(current?.models[0].compatibility).toMatchObject({ source: "responses", checkedAt: current?.models[0].inspection.checkedAt });
    expect(current?.models[0].compatibility?.validation).toBeUndefined();
    expect(current?.models.slice(1).every((model) => model.compatibility?.validation?.conversation && model.compatibility.validation.toolCalling && model.compatibility.validation.toolResult)).toBe(true);
    // Neither native compatibility requests nor repeated Responses identification are sent.
    expect(fixture.state.requests.filter(({ body }) => body.model === ids[0] && body.max_output_tokens === 32 && !body.reasoning && !Array.isArray(body.input))).toHaveLength(0);
    expect(fixture.state.requests.filter(({ body }) => body.model === ids[0] && body.max_output_tokens === 512)).toHaveLength(0);
    for (const id of ids.slice(1)) expect(fixture.state.requests.filter(({ path, body }) => path === "/v1/responses" && body.model === id)).toHaveLength(1);
    expect(fixture.state.requests.filter(({ body }) => body.max_output_tokens === 512 || body.max_tokens === 512)).toHaveLength(6);
    expect(current?.models.every((model) => !model.selectedForCodex)).toBe(true);
    expect(JSON.stringify(current)).not.toContain(token);
    expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
    expect(await readMixedProviderConfig()).toBeUndefined();
  } finally { release(); }
});

test("a conclusive mixed failure supersedes success, while a later outage preserves incompatibility", async () => {
  fixture.state.compatibilityProbe = true;
  let provider = await service.inspect(providerId, [ids[1]]);
  expect(provider.models[1].compatibility?.validation?.toolResult).toBe(true);
  fixture.state.ignoreToolOutput = true;
  provider = await service.inspect(providerId, [ids[1]]);
  expect(provider.models[1].compatibility?.validation).toMatchObject({ conversation: true, toolCalling: true, toolResult: false });
  const incompatible = provider.models[1].compatibility?.assessment;
  expect(incompatible?.status).toBe("incompatible");
  fixture.state.status = 503;
  provider = await service.inspect(providerId, [ids[1]]);
  expect(provider.models[1].compatibility?.status).toBe("identified");
  expect(provider.models[1].compatibility?.validation).toBeUndefined();
  expect(provider.models[1].compatibility?.assessment).toEqual(incompatible);
  expect(takeoverAvailability(normalizeProviderModel(provider.models[1])).mixedStatus).toBe("incompatible");
});

test("Responses outages update connectivity while preserving shared compatibility without extra probes", async () => {
  fixture.state.compatibilityProbe = true;
  const initial = await service.inspect(providerId, [ids[0]]);
  const assessment = initial.models[0].inspection.compatibility;
  for (const [status, expected] of [[429, "busy"], [503, "busy"], [401, "auth_error"], [403, "auth_error"], [404, "unavailable"], [500, "busy"]] as const) {
    fixture.state.status = status;
    const before = fixture.state.requests.length;
    const provider = await service.inspect(providerId, [ids[0]]);
    const model = provider.models[0];
    expect(model.inspection.status).toBe(expected);
    expect(model.compatibility).toMatchObject({ source: "responses", protocol: "responses", status: "identified", checkedAt: model.inspection.checkedAt, assessment, inconclusive: true });
    expect(model.inspection.compatibility).toEqual(assessment);
    expect(takeoverAvailability(normalizeProviderModel(model)).mode).toBe("both");
    expect(resolveModelAvailability(model).status).not.toBe("available");
    expect(model.compatibility?.validation).toBeUndefined();
    expect(model.inspection.capabilitiesSource).toBe("last_successful");
    expect(fixture.state.requests.slice(before)).toHaveLength(1);
  }
});

test("optional reasoning outages do not invalidate already confirmed core compatibility or trigger extra probes", async () => {
  fixture.state.compatibilityProbe = true;
  fixture.state.reasoningStatus = 503;
  const provider = await service.inspect(providerId, [ids[0]]);
  const model = provider.models[0];
  expect(model.inspection.status).toBe("busy");
  expect(model.inspection.latestCapabilities).toMatchObject({ responsesStreaming: true, functionCalling: true, functionCallOutput: true });
  expect(model.compatibility).toMatchObject({ status: "identified", protocol: "responses", source: "responses", checkedAt: model.inspection.checkedAt });
  expect(model.compatibility?.validation).toBeUndefined();
  expect(takeoverAvailability(normalizeProviderModel(model)).mode).toBe("both");
  expect(fixture.state.requests.every(({ path, body }) => path === "/v1/responses" && body.max_output_tokens !== 512)).toBe(true);
});

test("first-time network, rate and credential failures remain unconfirmed for both modes", async () => {
  for (const status of [429, 503, 401, 403, 404]) {
    fixture.state.status = status;
    const provider = await service.inspect(providerId, [ids[0]]);
    const model = provider.models[0];
    expect(model.inspection.compatibility).toBeUndefined();
    expect(model.compatibility?.assessment).toBeUndefined();
    expect(takeoverAvailability(normalizeProviderModel(model))).toMatchObject({ directStatus: "unknown", mixedStatus: "unknown" });
  }
});

test("legacy failed interface detection still reuses independently confirmed Responses compatibility", async () => {
  fixture.state.compatibilityProbe = true;
  await service.inspect(providerId, [ids[0]]);
  await recordModelCompatibility(providerId, ids[0], { status: "failed", checkedAt: Date.now(), message: "HTTP 429" }, { baseUrl: fixture.baseUrl, token });
  const before = fixture.state.requests.length;
  const resolved = await resolveMixedProtocols(selection([ids[0]]));
  expect(resolved.input.routes[0].protocol).toBe("responses");
  expect(fixture.state.requests).toHaveLength(before);
});

test("mixed compatibility and protocol survive failed native checks and converted validation outages", async () => {
  fixture.state.compatibilityProbe = true;
  const initial = await service.inspect(providerId, [ids[1]]);
  const assessment = initial.models[1].compatibility?.assessment;
  expect(assessment?.status).toBe("compatible");
  for (const status of [429, 503, 401]) {
    fixture.state.status = status;
    const before = fixture.state.requests.length;
    const current = await service.inspect(providerId, [ids[1]]);
    expect(current.models[1].compatibility).toMatchObject({ protocol: "chat_completions", assessment, inconclusive: true });
    expect(takeoverAvailability(normalizeProviderModel(current.models[1])).mode).toBe("mixed");
    expect(fixture.state.requests.slice(before)).toHaveLength(1);
  }
  fixture.state.status = 200;
  fixture.state.compatibilityStatus = 503;
  const current = await service.inspect(providerId, [ids[1]]);
  expect(current.models[1].compatibility).toMatchObject({ assessment, validation: { outcome: "inconclusive" } });
  expect(takeoverAvailability(normalizeProviderModel(current.models[1])).mixedReady).toBe(true);
  expect(resolveModelAvailability(current.models[1], "chat_completions").status).toBe("blocked");
  const before = fixture.state.requests.length;
  const resolved = await resolveMixedProtocols(selection([ids[1]]));
  expect(resolved.input.routes[0].protocol).toBe("chat_completions");
  expect(fixture.state.requests).toHaveLength(before);
});

test("explicit direct incompatibility survives more outages than the retained inspection history", async () => {
  const initial = await service.inspect(providerId, [ids[0]]);
  const assessment = initial.models[0].inspection.compatibility;
  expect(assessment?.status).toBe("incompatible");
  fixture.state.status = 503;
  for (let index = 0; index < 13; index++) await service.inspect(providerId, [ids[0]]);
  const model = (await service.get(providerId))!.models[0];
  expect(model.inspection.history.every((entry) => entry.status === "busy")).toBe(true);
  expect(model.inspection.compatibility).toEqual(assessment);
  expect(takeoverAvailability(normalizeProviderModel(model))).toMatchObject({ directStatus: "incompatible", mixedStatus: "incompatible" });
  await service.update(providerId, { name: "changed token", baseUrl: fixture.baseUrl, apiToken: "changed-token", modelSource: "manual", manualModelIds: ids });
  const reset = (await service.get(providerId))!.models[0];
  expect(reset.inspection.compatibility).toBeUndefined();
  expect(reset.compatibility).toBeUndefined();
});

test("a native stream without tool support shares incompatibility instead of rerunning mixed probes", async () => {
  const provider = await service.inspect(providerId, [ids[0]]);
  expect(provider.models[0].inspection.status).toBe("incompatible");
  expect(provider.models[0].compatibility).toMatchObject({ source: "responses", status: "identified", protocol: "responses" });
  expect(provider.models[0].compatibility?.validation).toBeUndefined();
  expect(fixture.state.requests).toHaveLength(1);
});

test("shared inspection preserves direct and mixed selections, manual protocols and context settings", async () => {
  fixture.state.compatibilityProbe = true;
  await service.setContextWindow(providerId, ids[0], 32_768);
  await service.setContextWindow(providerId, ids[1], 64_000);
  await service.activate(providerId, [ids[0]], ids[0]);
  const settings = async () => {
    const provider = (await getExternalProviderWithSecret(providerId))!;
    return { name: provider.name, baseUrl: provider.baseUrl, token: provider.token, activeForCodex: provider.activeForCodex, defaultModelId: provider.defaultModelId,
      models: provider.models.map((model) => ({ id: model.id, selectedForCodex: model.selectedForCodex, contextWindow: model.contextWindow, contextWindowOverride: model.contextWindowOverride })) };
  };
  const directSettings = await settings();
  const directConfig = await readFile(getCodexConfigPath(), "utf8");
  await service.inspect(providerId, ids);
  expect(await settings()).toEqual(directSettings);
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(directConfig);
  await service.activateMixed({ routes: [{ providerId, modelId: ids[0], protocol: "responses" }, { providerId, modelId: ids[1], protocol: "chat_completions" }],
    defaultModel: { providerId, modelId: ids[1] } }, 34568);
  const mixed = await readMixedProviderConfig();
  const mixedSettings = await settings();
  const mixedConfig = await readFile(getCodexConfigPath(), "utf8");
  expect(mixed?.routes.map((route) => route.contextWindow)).toEqual([32_768, 64_000]);
  await service.inspect(providerId, ids);
  expect(await readMixedProviderConfig()).toEqual(mixed);
  expect(await settings()).toEqual(mixedSettings);
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(mixedConfig);
});

test("mixed inspection rejects a changed connection before reusing direct evidence or making requests", async () => {
  await expect(inspectModelCompatibility(providerId, ids[0], undefined, {
    expectedConnection: { baseUrl: fixture.baseUrl, token: "old-token" },
  })).rejects.toMatchObject({ statusCode: 409 });
  expect(fixture.state.requests).toHaveLength(0);
  expect((await service.get(providerId))?.models[0].compatibility).toBeUndefined();
});

test("detail inspection validates local origin and model before any billable requests", async () => {
  app = createApp(); await app.ready();
  const request = { method: "POST" as const, url: `/_gateway/admin/providers/${providerId}/compatibility`, payload: { modelId: ids[0] } };
  expect((await app.inject({ ...request, remoteAddress: "10.0.0.2" })).statusCode).toBe(403);
  expect((await app.inject({ ...request, headers: { origin: "https://example.invalid" } })).statusCode).toBe(403);
  expect((await app.inject({ ...request, payload: {} })).statusCode).toBe(400);
  expect((await app.inject({ ...request, payload: { modelId: "missing" } })).statusCode).toBe(404);
  expect(fixture.state.requests).toHaveLength(0);
});

test("a cancelled probe never commits configuration or false health failures", async () => {
  fixture.state.holdOpen = true;
  const before = await readFile(getCodexConfigPath(), "utf8");
  await expect(resolveMixedProtocols(selection([ids[0]]), { timeoutMs: 80 })).rejects.toThrow("接口识别超时");
  expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
  expect((await getExternalProviderWithSecret(providerId))?.models[0].health).toBeUndefined();
});

test("connection changes invalidate detection and are checked again during atomic activation", async () => {
  const resolved = await resolveMixedProtocols(selection([ids[0]]));
  await service.update(providerId, { name: "自动识别示例", baseUrl: fixture.baseUrl, apiToken: "replacement-token", modelSource: "manual", manualModelIds: ids });
  let prepared = false;
  await expect(commitMixedActivation(resolved.input, 34568, async () => { prepared = true; }, { expectedConnections: resolved.connections })).rejects.toThrow("修改");
  expect(prepared).toBe(false);
  expect(await readMixedProviderConfig()).toBeUndefined();
  const count = fixture.state.requests.length;
  await resolveMixedProtocols(selection([ids[0]]));
  expect(fixture.state.requests.length).toBe(count + 1);
});

test("parallel detection is bounded and a valid incomplete result confirms protocol without marking health available", async () => {
  const many = [...ids, "four", "five", "six"];
  await updateExternalProvider(providerId, { models: many.map((id) => ({ id, source: "manual" })) });
  let running = 0, peak = 0;
  const protocols: MixedProtocol[] = [];
  const result = await resolveMixedProtocols(selection(many), { probe: async (target) => {
    protocols.push(target.protocol); peak = Math.max(peak, ++running);
    await new Promise((resolve) => setTimeout(resolve, 10)); running--;
    return { status: "unknown", checkedAt: Date.now(), statusCode: 200, protocolConfirmed: true };
  } });
  expect(peak).toBeLessThanOrEqual(3);
  expect(protocols).toEqual(many.map(() => "responses"));
  expect(result.input.routes.every((route) => route.protocol === "responses")).toBe(true);
  expect((await getExternalProviderWithSecret(providerId))?.models[0].health?.responses?.status).toBe("unknown");
});
