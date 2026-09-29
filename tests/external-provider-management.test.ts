import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { ExternalProviderService } from "../src/core/services/external-provider-service.ts";
import { getStateDir } from "../src/core/store/state-paths.ts";
import { buildLegacyExternalProviderImport, getExternalProvider, getExternalProviderWithSecret, getExternalProviderStorePath, updateExternalProvider } from "../src/core/store/external-provider-store.ts";
import { applyGatewayToCodexProviderConfig, getCodexGatewayProviderStatus, getCodexConfigPath, withCodexProviderConfigTransaction } from "../src/core/store/codex-auth-store.ts";
import { createApp } from "../src/server/app.ts";
import { startProviderFixture } from "./fixtures/provider.ts";

let service: ExternalProviderService;
let fixture: Awaited<ReturnType<typeof startProviderFixture>>;
const token = "sk-fixture-local-only";
const configPath = getCodexConfigPath();
const originalConfig = 'model = "original-model"\nmodel_provider = "original-provider"\n[model_providers.original-provider]\nname = "Original"\nbase_url = "https://original.example/v1"\nwire_api = "responses"\n';

beforeEach(async () => {
  if (!getStateDir().includes("azt-tests-") || !configPath.includes("azt-tests-")) throw new Error("Run with npm test to isolate credentials and state.");
  await rm(getStateDir(), { recursive: true, force: true });
  await mkdir(getStateDir(), { recursive: true });
  await writeFile(`${getStateDir()}/store.json`, '{"version":1,"profiles":{}}');
  await writeFile(`${getStateDir()}/settings.json`, '{}');
  await rm(process.env.CODEX_HOME!, { recursive: true, force: true });
  await mkdir(process.env.CODEX_HOME!, { recursive: true });
  await writeFile(configPath, originalConfig);
  service = new ExternalProviderService();
  fixture = await startProviderFixture();
});
afterEach(async () => { await fixture?.close(); });
async function create(name = "Test API") {
  return service.create({ name, baseUrl: fixture.baseUrl, apiToken: token, modelSource: "auto" });
}
async function catalogIds() {
  const status = await getCodexGatewayProviderStatus();
  return status.catalogModels?.map((model) => model.id).sort();
}

async function waitFor(check: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

async function childResult(child: ReturnType<typeof Bun.spawn>): Promise<{ code: number; stderr: string }> {
  const [code, stderr] = await Promise.all([
    child.exited,
    child.stderr ? new Response(child.stderr).text() : Promise.resolve(""),
  ]);
  return { code, stderr };
}

describe("managed external providers", () => {
  test("discovers every model without probing, redacts credentials, and restricts store permissions", async () => {
    const provider = await create();
    expect(provider.models.map((model) => model.id)).toEqual(fixture.state.models.map((model) => model.id));
    expect(provider.models.every((model) => model.inspection.status === "unknown")).toBe(true);
    expect(provider.models[0].displayName).toBe("示例推理模型");
    expect(fixture.state.requests.map((request) => request.url)).toEqual(["/v1/models"]);
    expect(JSON.stringify(await service.list())).not.toContain(token);
    expect((await stat(getExternalProviderStorePath())).mode & 0o777).toBe(0o600);
  });

  test("manual models need no discovery; probes preserve their source and are independent of selection", async () => {
    const provider = await service.create({ name: "Manual", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ["model-ready", "model-busy"] });
    expect(fixture.state.requests.length).toBe(0);
    await service.activate(provider.id, ["model-ready"], "model-ready");
    const checked = await service.inspect(provider.id);
    expect(checked.models.map((model) => model.inspection.status)).toEqual(["ready", "busy"]);
    expect(checked.models[1].capabilities).toBeUndefined();
    expect(checked.models.every((model) => model.source === "manual")).toBe(true);
    expect(checked.modelSource).toBe("manual");
  });

  test("unchecked, busy, and incompatible models remain selectable; saving replaces the old selection", async () => {
    const provider = await create();
    await service.inspect(provider.id, ["model-busy", "text-embedding-3-small"]);
    await service.activate(provider.id, ["model-ready", "model-busy", "text-embedding-3-small"], "model-busy");
    expect(await catalogIds()).toEqual(["model-busy", "model-ready", "text-embedding-3-small"]);
    await service.activate(provider.id, ["text-embedding-3-small"], "text-embedding-3-small");
    expect(await catalogIds()).toEqual(["text-embedding-3-small"]);
    expect((await getCodexGatewayProviderStatus()).model).toBe("text-embedding-3-small");
  });

  test("deactivates Codex without deleting the external service or its saved model selection", async () => {
    const provider = await create();
    await service.activate(provider.id, ["model-ready", "model-busy"], "model-ready");
    const active = await getCodexGatewayProviderStatus();

    const deactivated = await service.deactivate(provider.id);

    expect(deactivated.activeForCodex).toBe(false);
    expect(deactivated.defaultModelId).toBe("model-ready");
    expect(deactivated.models.filter((model) => model.selectedForCodex).map((model) => model.id).sort())
      .toEqual(["model-busy", "model-ready"]);
    expect((await service.list()).activeProviderId).toBeUndefined();
    expect(await service.get(provider.id)).toBeDefined();
    expect((await getCodexGatewayProviderStatus()).active).toBe(false);
    expect(await readFile(configPath, "utf8")).toContain('model_provider = "openai"');
    expect(await getCodexGatewayProviderStatus({ providerId: active.providerId })).toMatchObject({
      exists: true, active: false, baseUrl: fixture.baseUrl, authType: "none",
    });
    await expect(service.deactivate(provider.id)).rejects.toMatchObject({ statusCode: 409 });

    await service.activate(provider.id, ["model-ready", "model-busy"], "model-ready");
    expect(await getCodexGatewayProviderStatus()).toMatchObject({ providerId: active.providerId, active: true });
    await service.deactivate(provider.id);
    await service.delete(provider.id);
    expect(await getCodexGatewayProviderStatus({ providerId: active.providerId })).toMatchObject({ exists: true, active: false, authType: "none" });
  });

  test("deactivation endpoint keeps the external service and rejects non-local writes", async () => {
    const provider = await create();
    await service.activate(provider.id, ["model-ready"], "model-ready");
    const active = await getCodexGatewayProviderStatus();
    const app = createApp();
    try {
      const remote = await app.inject({
        method: "POST",
        url: `/_gateway/admin/providers/${provider.id}/deactivate`,
        remoteAddress: "192.168.1.2",
      });
      expect(remote.statusCode).toBe(403);

      const response = await app.inject({ method: "POST", url: `/_gateway/admin/providers/${provider.id}/deactivate` });
      expect(response.statusCode).toBe(200);
      expect(response.json().provider).toMatchObject({ id: provider.id, activeForCodex: false });
      expect((await service.list()).providers.some((item) => item.id === provider.id)).toBe(true);
      expect((await getCodexGatewayProviderStatus()).active).toBe(false);
      expect(await getCodexGatewayProviderStatus({ providerId: active.providerId })).toMatchObject({
        exists: true, active: false, authType: "none",
      });
      expect(response.body).not.toContain(token);
    } finally {
      await app.close();
    }
  });

  test("writes more than 200 selected models without silently truncating the catalog", async () => {
    const modelIds = Array.from({ length: 240 }, (_, index) => `model-${index}`);
    const provider = await service.create({ name: "Large catalog", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: modelIds });
    await service.activate(provider.id, modelIds, modelIds[239]);
    expect((await catalogIds())?.length).toBe(240);
    expect((await getCodexGatewayProviderStatus()).model).toBe("model-239");
  });

  test("caps each capability-inspection batch before making billable requests", async () => {
    const modelIds = Array.from({ length: 21 }, (_, index) => `model-${index}`);
    const provider = await service.create({ name: "Inspection cap", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: modelIds });
    await expect(service.inspect(provider.id)).rejects.toThrow("单次最多检测 20 个模型");
    await expect(service.startInspection(provider.id, modelIds)).rejects.toThrow("单次最多检测 20 个模型");
    expect(fixture.state.requests).toHaveLength(0);
  });

  test("small-context API models can still be selected", async () => {
    fixture.state.models = [{ id: "small-model", context_window: 4096 }];
    const provider = await create();
    await service.activate(provider.id, ["small-model"], "small-model");
    expect((await getCodexGatewayProviderStatus()).catalogModels?.[0].contextWindow).toBe(4096);
  });

  test("transient failures keep previous capabilities, while incompatibility shows the latest probe", async () => {
    const provider = await create();
    const ready = await service.inspect(provider.id, ["model-ready"]);
    expect(ready.models[0].inspection.status).toBe("ready");
    fixture.state.probeStatus = 429;
    const busy = await service.inspect(provider.id, ["model-ready"]);
    expect(busy.models[0].inspection.capabilitiesSource).toBe("last_successful");
    expect(busy.models[0].capabilities?.functionCalling).toBe(true);
    expect(busy.models[0].inspection.history.length).toBe(2);
    fixture.state.probeStatus = 400;
    const incompatible = await service.inspect(provider.id, ["model-ready"]);
    expect(incompatible.models[0].inspection.capabilitiesSource).toBe("latest");
    expect(incompatible.models[0].capabilities?.functionCalling).toBe(false);
  });

  test("failed sync retains models and capabilities; a shorter list marks missing models without clearing selection", async () => {
    const provider = await create();
    await service.inspect(provider.id, ["model-ready"]);
    await service.activate(provider.id, ["model-ready"], "model-ready");
    fixture.state.listStatus = 503;
    await expect(service.sync(provider.id)).rejects.toThrow();
    expect((await service.get(provider.id))?.models.length).toBe(3);
    fixture.state.listStatus = 200;
    fixture.state.models = [{ id: "model-busy" }];
    const synced = await service.sync(provider.id);
    const missing = synced.models.find((model) => model.id === "model-ready")!;
    expect(missing.catalogStatus).toBe("missing");
    expect(missing.selectedForCodex).toBe(true);
    const inspected = await service.inspect(provider.id, ["model-ready"]);
    expect(inspected.models.find((model) => model.id === "model-ready")?.catalogStatus).toBe("missing");
  });

  test("rejects delayed sync results after another process changes the provider", async () => {
    const provider = await create();
    fixture.state.listDelayMs = 150;
    const syncing = service.sync(provider.id);
    await waitFor(
      async () => fixture.state.requests.filter((request) => request.url === "/v1/models").length >= 2,
      "同步请求未开始。",
    );
    await updateExternalProvider(provider.id, { name: "Changed concurrently" });
    await expect(syncing).rejects.toThrow("另一个进程修改");
    expect((await getExternalProvider(provider.id))?.name).toBe("Changed concurrently");
  });

  test("an interrupted first probe shows confirmed capabilities without false unsupported labels", async () => {
    const provider = await create();
    fixture.state.continuationStatus = 429;
    const checked = await service.inspect(provider.id, ["model-ready"]);
    const model = checked.models[0];
    expect(model.inspection.status).toBe("busy");
    expect(model.capabilities?.functionCalling).toBe(true);
    expect(model.capabilities?.functionCallOutput).toBeUndefined();
    expect(model.capabilities?.imageInput).toBeUndefined();
  });

  test("failed edits leave working credentials untouched; changed credentials reset detection and require reapplication", async () => {
    const provider = await create();
    await service.inspect(provider.id, ["model-ready"]);
    await service.activate(provider.id, ["model-ready"], "model-ready");
    fixture.state.listStatus = 401;
    await expect(service.update(provider.id, { name: "Changed", baseUrl: fixture.baseUrl, apiToken: "replacement" })).rejects.toThrow();
    expect((await getExternalProviderWithSecret(provider.id))?.token).toBe(token);
    fixture.state.listStatus = 200;
    const updated = await service.update(provider.id, { name: "Changed", baseUrl: fixture.baseUrl, apiToken: "replacement" });
    expect(updated.models[0].capabilities).toBeUndefined();
    expect(updated.codexNeedsApply).toBe(true);
    expect(updated.activeForCodex).toBe(true);
    expect(await readFile(configPath, "utf8")).toContain(token);
    await service.activate(provider.id, ["model-ready"], "model-ready");
    expect(await readFile(configPath, "utf8")).toContain("replacement");
    expect((await service.get(provider.id))?.codexNeedsApply).toBe(false);
  });

  test("switches manual to automatic model discovery even when connection settings stay the same", async () => {
    const provider = await service.create({ name: "Manual", baseUrl: fixture.baseUrl, apiToken: token, modelSource: "manual", manualModelIds: ["custom"] });
    const updated = await service.update(provider.id, { name: "Auto", baseUrl: fixture.baseUrl, modelSource: "auto" });
    expect(updated.models.some((model) => model.id === "text-embedding-3-small")).toBe(true);
  });

  test("concurrent activation has exactly one winner and observes settings-page gateway changes", async () => {
    const first = await create("First");
    const second = await create("Second");
    await Promise.all([service.activate(first.id, ["model-ready"], "model-ready"), service.activate(second.id, ["model-busy"], "model-busy")]);
    const snapshot = await service.list();
    expect(snapshot.providers.filter((provider) => provider.activeForCodex).length).toBe(1);
    expect([first.id, second.id]).toContain(snapshot.activeProviderId);
    expect(await catalogIds()).toEqual([snapshot.activeProviderId === first.id ? "model-ready" : "model-busy"]);
    await expect(applyGatewayToCodexProviderConfig({ baseUrl: "http://localhost:8787/codex/v1", providerId: "openai" })).rejects.toThrow("先解除第三方接管");
    await service.deactivate(snapshot.activeProviderId!);
    await applyGatewayToCodexProviderConfig({ baseUrl: "http://localhost:8787/codex/v1", providerId: "openai" });
    expect((await service.list()).activeProviderId).toBeUndefined();
  });

  test("serializes provider-store mutations across independent processes", async () => {
    const workerCount = 16;
    const storePath = `${getStateDir()}/multiprocess-external-providers.json`;
    const readyDir = `${getStateDir()}/multiprocess-ready`;
    const startPath = `${getStateDir()}/multiprocess-start`;
    await mkdir(readyDir, { recursive: true });
    const worker = `
      import fs from "node:fs/promises";
      import path from "node:path";
      const store = await import("./src/core/store/external-provider-store.ts");
      await fs.writeFile(path.join(process.env.READY_DIR, process.env.PROVIDER_ID), "ready");
      while (!(await fs.stat(process.env.START_PATH).then(() => true).catch(() => false))) await Bun.sleep(5);
      await store.createExternalProvider({
        id: process.env.PROVIDER_ID,
        name: process.env.PROVIDER_ID,
        baseUrl: "https://example.test/v1",
        token: "fixture-token",
        modelSource: "manual",
        models: [{ id: "model-ready", source: "manual" }],
      }, { path: process.env.STORE_PATH });
    `;
    const children = Array.from({ length: workerCount }, (_, index) => Bun.spawn([process.execPath, "-e", worker], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PROVIDER_ID: `provider_${index}`,
        READY_DIR: readyDir,
        START_PATH: startPath,
        STORE_PATH: storePath,
      },
      stdout: "ignore",
      stderr: "pipe",
    }));
    await waitFor(async () => (await readdir(readyDir)).length === workerCount, "并发写入进程未全部就绪。");
    await writeFile(startPath, "start");
    const results = await Promise.all(children.map(childResult));
    expect(results.filter((result) => result.code !== 0).map((result) => result.stderr)).toEqual([]);
    const stored = JSON.parse(await readFile(storePath, "utf8")) as { providers: Array<{ id: string }> };
    expect(stored.providers.map((provider) => provider.id).sort()).toEqual(
      Array.from({ length: workerCount }, (_, index) => `provider_${index}`).sort(),
    );
    expect((await stat(storePath)).mode & 0o777).toBe(0o600);
    expect(await stat(`${storePath}.lock`).then(() => true).catch(() => false)).toBe(false);
  });

  test("activation reads and commits one current provider snapshot across processes", async () => {
    const provider = await service.create({
      name: "Old endpoint",
      baseUrl: "https://old.example/v1",
      apiToken: "old-cross-process-token",
      modelSource: "manual",
      manualModelIds: ["model-ready"],
    });
    const readyPath = `${getStateDir()}/activate-ready`;
    const activateWorker = `
      import fs from "node:fs/promises";
      const { ExternalProviderService } = await import("./src/core/services/external-provider-service.ts");
      await fs.writeFile(process.env.READY_PATH, "ready");
      await new ExternalProviderService().activate(process.env.PROVIDER_ID, ["model-ready"], "model-ready");
    `;
    const updateWorker = `
      const store = await import("./src/core/store/external-provider-store.ts");
      await store.updateExternalProvider(process.env.PROVIDER_ID, {
        name: "New endpoint",
        baseUrl: "https://new.example/v1",
        token: "new-cross-process-token",
        codexNeedsApply: true,
      });
    `;
    let activation: ReturnType<typeof Bun.spawn> | undefined;
    await withCodexProviderConfigTransaction(async () => {
      activation = Bun.spawn([process.execPath, "-e", activateWorker], {
        cwd: process.cwd(),
        env: { ...process.env, PROVIDER_ID: provider.id, READY_PATH: readyPath },
        stdout: "ignore",
        stderr: "pipe",
      });
      await waitFor(() => stat(readyPath).then(() => true).catch(() => false), "激活进程未就绪。");
      // The old implementation read its provider snapshot before blocking on
      // the held Codex lock. Give it time to reach that deterministic barrier.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const update = Bun.spawn([process.execPath, "-e", updateWorker], {
        cwd: process.cwd(),
        env: { ...process.env, PROVIDER_ID: provider.id },
        stdout: "ignore",
        stderr: "pipe",
      });
      const updated = await childResult(update);
      expect(updated.code, updated.stderr).toBe(0);
    });
    const activated = await childResult(activation!);
    expect(activated.code, activated.stderr).toBe(0);
    const config = await readFile(configPath, "utf8");
    expect(config).toContain("https://new.example/v1");
    expect(config).toContain("new-cross-process-token");
    expect(config).not.toContain("old-cross-process-token");
    const stored = await getExternalProviderWithSecret(provider.id);
    expect(stored).toMatchObject({
      name: "New endpoint",
      baseUrl: "https://new.example/v1",
      token: "new-cross-process-token",
      codexNeedsApply: false,
      activeForCodex: true,
    });
  });

  test("switches between the account-pool gateway and external services without modifying accounts", async () => {
    const provider = await create();
    await service.activate(provider.id, ["model-ready"], "model-ready");
    const accountsBefore = await readFile(`${getStateDir()}/store.json`, "utf8");
    await service.deactivate(provider.id);
    const app = createApp();
    try {
      const connected = await app.inject({ method: "POST", url: "/_gateway/admin/codex/configure-provider", payload: {
        providerId: "openai", kind: "codex_gateway", baseUrl: "http://127.0.0.1:8787/codex/v1", model: "gpt-5.5",
      } });
      expect(connected.statusCode).toBe(200);
      expect((await getCodexGatewayProviderStatus()).providerId).toBe("openai");
      expect((await getCodexGatewayProviderStatus()).model).toBe("gpt-5.5");
      expect((await service.list()).activeProviderId).toBeUndefined();
      expect((await service.get(provider.id))?.models[0].selectedForCodex).toBe(true);
      expect((await getCodexGatewayProviderStatus()).modelCatalogPath).toBeUndefined();
      const removed = await app.inject({ method: "POST", url: "/_gateway/admin/codex/remove-provider", payload: { providerId: "openai" } });
      expect(removed.statusCode).toBe(200);
      expect((await getCodexGatewayProviderStatus()).active).toBe(false);
      await service.activate(provider.id, ["model-ready"], "model-ready");
      expect((await service.list()).activeProviderId).toBe(provider.id);
      expect(await readFile(`${getStateDir()}/store.json`, "utf8")).toBe(accountsBefore);
    } finally { await app.close(); }
  });

  test("failed config writes restore catalog and selection; the next attempt still works", async () => {
    const provider = await create();
    await service.activate(provider.id, ["model-ready"], "model-ready");
    const before = await readFile(configPath, "utf8");
    const temporary = `${configPath}.tmp-${process.pid}`;
    await mkdir(temporary);
    await expect(service.activate(provider.id, ["model-busy"], "model-busy")).rejects.toThrow();
    expect(await readFile(configPath, "utf8")).toBe(before);
    expect(await catalogIds()).toEqual(["model-ready"]);
    expect((await getExternalProvider(provider.id))?.defaultModelId).toBe("model-ready");
    await rm(temporary, { recursive: true });
    await service.activate(provider.id, ["model-busy"], "model-busy");
    expect(await catalogIds()).toEqual(["model-busy"]);
  });

  test("a failed final store commit restores both Codex files", async () => {
    await applyGatewayToCodexProviderConfig({ baseUrl: fixture.baseUrl, providerId: "legacy-control", kind: "openai_compatible", bearerToken: token, model: "model-ready" });
    const before = await readFile(configPath, "utf8");
    await expect(withCodexProviderConfigTransaction(async ({ apply }) => {
      await apply({ baseUrl: fixture.baseUrl, providerId: "other", kind: "openai_compatible", bearerToken: token, model: "model-busy" });
      throw new Error("simulated store write failure");
    })).rejects.toThrow("simulated store write failure");
    expect(await readFile(configPath, "utf8")).toBe(before);
    expect(await catalogIds()).toEqual(["model-ready"]);
  });

  test("deletion restores native service; failed deletion preserves the active service", async () => {
    const provider = await create();
    await service.activate(provider.id, ["model-ready"], "model-ready");
    const temporary = `${configPath}.tmp-${process.pid}`;
    await mkdir(temporary);
    await expect(service.delete(provider.id)).rejects.toThrow();
    expect((await service.get(provider.id))?.activeForCodex).toBe(true);
    await rm(temporary, { recursive: true });
    expect(await service.delete(provider.id)).toBe(true);
    expect(await readFile(configPath, "utf8")).toContain('model_provider = "openai"');
    expect(await readFile(configPath, "utf8")).toContain('[model_providers.original-provider]');
    expect(await readFile(configPath, "utf8")).not.toContain(token);
    expect(await service.delete(provider.id)).toBe(false);
  });

  test("imports legacy credentials before adding a service and does not resurrect deleted imports after restart", async () => {
    await applyGatewayToCodexProviderConfig({ baseUrl: fixture.baseUrl, providerId: "ai-zero-token", kind: "openai_compatible", bearerToken: token, model: "legacy-model" });
    const other = await create("Second");
    const legacy = (await service.list()).providers.find((provider) => provider.id !== other.id)!;
    expect(legacy.codexProviderId).toBe("ai-zero-token");
    expect(legacy.activeForCodex).toBe(true);
    expect(legacy.defaultModelId).toBe("legacy-model");
    await service.delete(legacy.id);
    await service.delete(other.id);
    // Retained old configuration/history must not trigger a second import.
    await applyGatewayToCodexProviderConfig({ baseUrl: fixture.baseUrl, providerId: "ai-zero-token", kind: "openai_compatible", bearerToken: token, model: "legacy-model" });
    expect((await new ExternalProviderService().list()).providers.length).toBe(0);
  });

  test("background inspection reports progress, prevents duplicate jobs and survives page reloads", async () => {
    const provider = await create();
    fixture.state.delayMs = 10;
    const started = await service.startInspection(provider.id);
    expect(started.inspectionJob?.status).toBe("running");
    await expect(service.startInspection(provider.id)).rejects.toThrow("正在检测");
    expect((await new ExternalProviderService().get(provider.id))?.inspectionJob?.status).toBe("running");
    let current = await service.get(provider.id);
    for (let i = 0; i < 100 && current?.inspectionJob?.status === "running"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      current = await service.get(provider.id);
    }
    expect(current?.inspectionJob?.status).toBe("completed");
    expect(current?.inspectionJob?.completed).toBe(3);
    expect(current?.models[0].inspection.status).toBe("ready");
  });

  test("inactive legacy imports do not inherit another provider's root model or catalog", async () => {
    const current = await getCodexGatewayProviderStatus();
    const imported = buildLegacyExternalProviderImport({
      gatewayProvider: {
        ...current, active: false, providerId: "ai-zero-token", baseUrl: fixture.baseUrl,
        model: "unrelated-model", catalogModels: [{ id: "unrelated-model" }],
      },
      token,
    });
    expect(imported?.provider.defaultModelId).toBeUndefined();
    expect(imported?.provider.models).toEqual([]);
  });

  test("existing gateway endpoints retain request validation", async () => {
    const app = createApp();
    try {
      for (const url of ["/codex/v1/responses", "/codex/v1/responses/compact", "/v1/chat/completions"]) {
        const response = await app.inject({ method: "POST", url, payload: { model: 123 } });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe("validation_error");
      }
      expect(fixture.state.requests).toEqual([]);
    } finally { await app.close(); }
  });

  test("HTTP endpoints enforce local writes and return usable validation/not-found errors", async () => {
    const app = createApp();
    try {
      const remote = await app.inject({ method: "POST", url: "/_gateway/admin/providers", remoteAddress: "192.168.1.2", payload: {} });
      expect(remote.statusCode).toBe(403);
      const invalid = await app.inject({ method: "POST", url: "/_gateway/admin/providers", payload: { name: "Empty", baseUrl: fixture.baseUrl, modelSource: "manual", apiToken: token, manualModelIds: [] } });
      expect(invalid.statusCode).toBe(400);
      const missing = await app.inject({ method: "POST", url: "/_gateway/admin/providers/missing/activate", payload: { modelIds: ["x"], defaultModelId: "x" } });
      expect(missing.statusCode).toBe(404);
      const created = await app.inject({ method: "POST", url: "/_gateway/admin/providers", payload: { name: "HTTP", baseUrl: fixture.baseUrl, apiToken: token } });
      expect(created.statusCode).toBe(200);
      expect(created.body).not.toContain(token);
      const id = created.json().provider.id;
      const unknownModel = await app.inject({ method: "POST", url: `/_gateway/admin/providers/${id}/activate`, payload: { modelIds: ["missing-model"], defaultModelId: "missing-model" } });
      expect(unknownModel.statusCode).toBe(400);
      const applied = await app.inject({ method: "POST", url: `/_gateway/admin/providers/${id}/activate`, payload: { modelIds: ["text-embedding-3-small"], defaultModelId: "text-embedding-3-small" } });
      expect(applied.statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/_gateway/admin/providers" })).json().activeProviderId).toBe(id);
      expect((await app.inject({ method: "DELETE", url: `/_gateway/admin/providers/${id}` })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
});
