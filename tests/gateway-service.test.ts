import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import { createApp } from "../src/server/app.ts";
import { getStateDir } from "../src/core/store/state-paths.ts";
import { getCodexConfigPath, getCodexGatewayProviderStatus, applyGatewayToCodexProviderConfig } from "../src/core/store/codex-auth-store.ts";
import { configureLocalGatewayForCodex, getGatewayAccessPath, readGatewayAccess, updateGatewayAccess } from "../src/core/services/gateway-access-service.ts";
import { ExternalProviderService } from "../src/core/services/external-provider-service.ts";
import * as httpClient from "../src/core/providers/http-client.ts";
import { VersionService } from "../src/core/services/version-service.ts";

let app: ReturnType<typeof createApp>;
let versionSpy: ReturnType<typeof spyOn>;
const profile = { provider: "openai-codex", profileId: "fixture-account", mode: "oauth_account", access: "fixture-oauth-only", refresh: "fixture-refresh", expires: Date.now() + 86400000, accountId: "fixture-account", codexAccountId: "fixture-account", email: "fixture@example.test" };
beforeEach(async () => {
  if (!getStateDir().includes("azt-tests-")) throw new Error("Run with npm test.");
  await rm(getStateDir(), { recursive: true, force: true });
  await mkdir(getStateDir(), { recursive: true });
  await writeFile(`${getStateDir()}/store.json`, JSON.stringify({ version: 1, activeProfileId: profile.profileId, profiles: { [profile.profileId]: profile } }));
  await writeFile(`${getStateDir()}/settings.json`, JSON.stringify({ runtime: { codexRequestSerializationEnabled: false }, autoSwitch: { enabled: false } }));
  await rm(process.env.CODEX_HOME!, { recursive: true, force: true });
  await mkdir(process.env.CODEX_HOME!, { recursive: true });
  await writeFile(getCodexConfigPath(), 'model = "original"\n');
  const channel = { currentVersion: "2.0.15", latestVersion: "2.0.15", checkedAt: Date.now(), needsUpdate: false, sourceUrl: "https://example.test", status: "ok" as const };
  versionSpy = spyOn(VersionService.prototype, "getVersionStatus").mockResolvedValue({ packageName: "ai-zero-token", checkedAt: Date.now(), desktop: channel, npm: channel });
  app = createApp();
});
afterEach(async () => { await app.close(); versionSpy.mockRestore(); });
async function access(action: "enable" | "rotate" | "disable") {
  const response = await app.inject({ method: "POST", url: "/_gateway/admin/api-access", payload: { action } });
  expect(response.statusCode).toBe(200);
  return response.json() as { enabled: boolean; apiKey: string | null; codexUpdated: boolean };
}

describe("account-pool API service", () => {
  test("existing installations keep unauthenticated API access and account data", async () => {
    const before = await readFile(`${getStateDir()}/store.json`, "utf8");
    expect((await app.inject("/v1/models")).statusCode).toBe(200);
    expect((await app.inject("/_gateway/admin/api-access")).json()).toEqual({ enabled: false, apiKey: null });
    await access("enable");
    await access("rotate");
    await access("disable");
    expect(await readFile(`${getStateDir()}/store.json`, "utf8")).toBe(before);
    expect((await app.inject("/v1/models")).statusCode).toBe(200);
  });

  test("all model endpoints enforce the key before parsing or contacting an upstream", async () => {
    const { apiKey } = await access("enable");
    for (const url of ["/v1/models", "/codex/v1/models", "/v1/responses", "/codex/v1/responses", "/codex/v1/responses/compact", "/v1/chat/completions", "/v1/images/generations", "/v1/images/edits"]) {
      const method = url.endsWith("models") ? "GET" : "POST";
      for (const authorization of [undefined, "Bearer wrong-key"]) {
        const response = await app.inject({ method, url, headers: authorization ? { authorization } : {}, ...(method === "POST" ? { payload: {} } : {}) });
        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("invalid_api_key");
        expect(response.body).not.toContain(apiKey!);
      }
      const accepted = await app.inject({ method, url, headers: { authorization: `Bearer ${apiKey}` }, ...(method === "POST" ? { payload: { model: 42 } } : {}) });
      expect(accepted.statusCode).toBe(method === "GET" ? 200 : 400);
    }
    expect((await app.inject({ method: "OPTIONS", url: "/v1/models", headers: { origin: "https://client.example", "access-control-request-method": "GET" } })).statusCode).toBe(204);
  });

  test("rotation invalidates the old key, persists across restart, and never exposes it in general config", async () => {
    const first = await access("enable");
    expect((await access("enable")).apiKey).toBe(first.apiKey);
    const second = await access("rotate");
    expect(first.apiKey).not.toBe(second.apiKey);
    expect((await stat(getGatewayAccessPath())).mode & 0o777).toBe(0o600);
    await app.close(); app = createApp();
    expect((await app.inject({ url: "/v1/models", headers: { authorization: `Bearer ${first.apiKey}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/models", headers: { authorization: `Bearer ${second.apiKey}` } })).statusCode).toBe(200);
    const config = await app.inject("/_gateway/admin/config");
    expect(config.json().gatewayAccess.enabled).toBe(true);
    expect(config.body).not.toContain(second.apiKey!);
    expect((await app.inject("/_gateway/admin/api-access")).headers["cache-control"]).toBe("no-store");
  });

  test("only local management can read or change keys; API credentials do not grant management access", async () => {
    for (const headers of [{ host: "gateway.example" }, { host: "localhost", origin: "https://evil.example" }]) {
      expect((await app.inject({ url: "/_gateway/admin/api-access", headers })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: "/_gateway/admin/api-access", headers, payload: { action: "enable" } })).statusCode).toBe(403);
    }
    const { apiKey } = await access("enable");
    const remote = { host: "localhost", authorization: `Bearer ${apiKey}` };
    expect((await app.inject({ url: "/v1/models", headers: remote, remoteAddress: "192.168.1.5" })).statusCode).toBe(200);
    for (const url of ["/_gateway/admin/api-access", "/_gateway/admin/config", "/_gateway/admin/providers"]) {
      expect((await app.inject({ url, headers: remote, remoteAddress: "192.168.1.5" })).statusCode).toBe(403);
    }
    const encodedManagement = await app.inject({ url: "/%5fgateway/admin/api-access", headers: remote, remoteAddress: "192.168.1.5" });
    expect(encodedManagement.statusCode).toBe(403);
    expect(encodedManagement.body).not.toContain(apiKey!);
    for (const url of ["/%76%31/models", "/%63odex/%76%31/models"]) {
      const encodedApi = await app.inject({ url, headers: { host: "localhost" }, remoteAddress: "192.168.1.5" });
      expect(encodedApi.statusCode).toBe(401);
      expect(encodedApi.json().error.code).toBe("invalid_api_key");
    }
  });

  test("disabling API authentication never exposes account export or management to remote callers", async () => {
    const remote = { remoteAddress: "192.168.1.5", headers: { host: "192.168.1.10:8787" } };
    const exported = await app.inject({ ...remote, method: "POST", url: "/_gateway/admin/profiles/export", payload: { all: true } });
    expect(exported.statusCode).toBe(403);
    expect(exported.body).not.toContain(profile.access);
    for (const url of ["/_gateway/admin/config", "/_gateway/admin/providers", "/_gateway/image-bed/config"]) {
      expect((await app.inject({ ...remote, url })).statusCode).toBe(403);
    }
    expect((await app.inject({ ...remote, url: "/v1/models" })).statusCode).toBe(200);
  });

  test("enabling and rotating update a local Codex connection without creating an external provider", async () => {
    await applyGatewayToCodexProviderConfig({ baseUrl: "http://localhost:8787/codex/v1", providerId: "openai", model: "gpt-6-luna" });
    const enabled = await access("enable");
    expect(enabled.codexUpdated).toBe(true);
    expect((await getCodexGatewayProviderStatus()).providerId).toBe("azt_gateway");
    expect((await getCodexGatewayProviderStatus()).modelCatalogPath).toBeUndefined();
    expect(await readFile(getCodexConfigPath(), "utf8")).toContain(enabled.apiKey!);
    const rotated = await access("rotate");
    const raw = await readFile(getCodexConfigPath(), "utf8");
    expect(raw).toContain(rotated.apiKey!);
    expect(raw).not.toContain(enabled.apiKey!);
    expect((await new ExternalProviderService().list()).providers).toHaveLength(0);
    await access("disable");
    expect((await getCodexGatewayProviderStatus()).authType).toBe("none");
    expect(await readFile(getCodexConfigPath(), "utf8")).not.toContain(rotated.apiKey!);
  });

  test("a new local Codex connection automatically uses the current gateway key", async () => {
    const { apiKey } = await access("enable");
    const response = await app.inject({ method: "POST", url: "/_gateway/admin/codex/configure-provider", payload: { kind: "codex_gateway", baseUrl: "http://127.0.0.1:8787/codex/v1", providerId: "openai", model: "gpt-6-luna" } });
    expect(response.statusCode).toBe(200);
    expect((await getCodexGatewayProviderStatus()).providerId).toBe("azt_gateway");
    expect(await readFile(getCodexConfigPath(), "utf8")).toContain(apiKey!);
  });

  test("external and remote Codex connections remain independent of the served API", async () => {
    const service = new ExternalProviderService();
    const provider = await service.create({ name: "External", baseUrl: "https://example.test/v1", apiToken: "external-fixture", modelSource: "manual", manualModelIds: ["fixture-model"] });
    await service.activate(provider.id, ["fixture-model"], "fixture-model");
    const before = await readFile(getCodexConfigPath(), "utf8");
    const { apiKey, codexUpdated } = await access("enable");
    expect(codexUpdated).toBe(false);
    expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
    expect((await service.list()).activeProviderId).toBe(provider.id);
    expect((await app.inject({ url: "/v1/models", headers: { authorization: `Bearer ${apiKey}` } })).statusCode).toBe(200);
    await service.deactivate(provider.id);
    await applyGatewayToCodexProviderConfig({ baseUrl: "http://192.168.1.20:8787/codex/v1", providerId: "azt_gateway", kind: "codex_gateway", bearerToken: "remote-key" });
    const remote = await readFile(getCodexConfigPath(), "utf8");
    expect((await access("rotate")).codexUpdated).toBe(false);
    expect(await readFile(getCodexConfigPath(), "utf8")).toBe(remote);
    expect((await app.inject({ method: "POST", url: "/_gateway/admin/codex/configure-provider", payload: { kind: "codex_gateway", providerId: "azt_gateway", baseUrl: "http://192.168.1.20:8787/codex/v1" } })).statusCode).toBe(200);
    expect(await readFile(getCodexConfigPath(), "utf8")).toContain("remote-key");
  });

  test("failed key persistence restores Codex config and corrupt key files fail closed", async () => {
    await applyGatewayToCodexProviderConfig({ baseUrl: "http://127.0.0.1:8787/codex/v1", providerId: "openai" });
    const before = await readFile(getCodexConfigPath(), "utf8");
    const rename = fs.rename.bind(fs);
    let configChangedBeforeFailure = false;
    const persist = spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (String(target) === getGatewayAccessPath()) {
        configChangedBeforeFailure = (await readFile(getCodexConfigPath(), "utf8")).includes("azt_gateway");
        throw new Error("Fixture key persistence failure");
      }
      return rename(source, target);
    });
    try { await expect(updateGatewayAccess("enable", 8787)).rejects.toThrow("Fixture key persistence failure"); }
    finally { persist.mockRestore(); }
    expect(configChangedBeforeFailure).toBe(true);
    expect(await readFile(getCodexConfigPath(), "utf8")).toBe(before);
    expect((await readGatewayAccess()).apiKey).toBeNull();
    await writeFile(getGatewayAccessPath(), '{"version":1,"apiKey":"broken"}');
    await expect(readGatewayAccess()).rejects.toThrow();
    expect((await app.inject("/v1/models")).statusCode).toBe(500);
    await writeFile(getGatewayAccessPath(), 'sensitive-invalid-fixture');
    expect((await app.inject("/v1/models")).body).not.toContain("sensitive-invalid-fixture");
    const adminConfig = await app.inject("/_gateway/admin/config");
    expect(adminConfig.statusCode).toBe(200);
    expect(adminConfig.json().gatewayAccess).toEqual({ enabled: true, invalid: true });
    expect((await app.inject("/_gateway/admin/api-access")).json()).toEqual({ enabled: false, apiKey: null, invalid: true });
    const repaired = await app.inject({ method: "POST", url: "/_gateway/admin/api-access", payload: { action: "disable" } });
    expect(repaired.statusCode).toBe(200);
    expect((await readGatewayAccess()).apiKey).toBeNull();
    expect((await app.inject("/v1/models")).statusCode).toBe(200);
  });

  test("simultaneous key changes keep the final key and local Codex connection consistent", async () => {
    await applyGatewayToCodexProviderConfig({ baseUrl: "http://127.0.0.1:8787/codex/v1", providerId: "openai" });
    const changes = await Promise.all([updateGatewayAccess("rotate", 8787), updateGatewayAccess("rotate", 8787)]);
    const final = await readGatewayAccess();
    expect(changes[0].apiKey).not.toBe(changes[1].apiKey);
    expect(changes.map(change => change.apiKey)).toContain(final.apiKey);
    const config = await readFile(getCodexConfigPath(), "utf8");
    expect(config).toContain(final.apiKey!);
    const stale = changes.find(change => change.apiKey !== final.apiKey)!.apiKey;
    expect(config).not.toContain(stale!);
    expect((await app.inject({ url: "/v1/models", headers: { authorization: `Bearer ${stale}` } })).statusCode).toBe(401);
  });

  test("shared key rotation updates an active loopback Codex gateway across ports and custom provider ids", async () => {
    await applyGatewayToCodexProviderConfig({
      baseUrl: "http://127.0.0.1:8787/codex/v1",
      providerId: "custom_gateway",
      kind: "codex_gateway",
      bearerToken: "old-local-key",
    });
    const rotated = await updateGatewayAccess("rotate", 8788);
    expect(rotated.codexUpdated).toBe(true);
    expect(rotated.apiKey).toBe((await readGatewayAccess()).apiKey);
    const config = await readFile(getCodexConfigPath(), "utf8");
    expect(config).toContain(rotated.apiKey!);
    expect(config).not.toContain("old-local-key");
    expect((await getCodexGatewayProviderStatus({ providerId: "custom_gateway" })).active).toBe(true);
  });

  test("shared key rotation never takes over an unmanaged loopback Codex provider", async () => {
    await writeFile(getCodexConfigPath(), [
      'model_provider = "other_local"',
      '[model_providers.other_local]',
      'name = "Other local service"',
      'base_url = "http://127.0.0.1:9999/codex/v1"',
      'wire_api = "responses"',
      'experimental_bearer_token = "other-secret"',
      "",
    ].join("\n"));
    const rotated = await updateGatewayAccess("rotate", 8787);
    expect(rotated.codexUpdated).toBe(false);
    const config = await readFile(getCodexConfigPath(), "utf8");
    expect(config).toContain('experimental_bearer_token = "other-secret"');
    expect(config).not.toContain(rotated.apiKey!);
  });

  test("share addresses reflect the actual listener rather than saved wildcard settings", async () => {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const share = (await app.inject("/_gateway/admin/share")).json();
    expect(share.lanReachable).toBe(false);
    expect(share.primary).toBeNull();
  });

  test("a connection queued during key rotation uses the final key, including after disabling it", async () => {
    const params = { baseUrl: "http://127.0.0.1:8787/codex/v1", providerId: "openai", model: "gpt-6-luna" };
    await configureLocalGatewayForCodex(params);
    const old = await updateGatewayAccess("enable", 8787);
    await Promise.all([updateGatewayAccess("rotate", 8787), configureLocalGatewayForCodex(params)]);
    const current = await readGatewayAccess();
    expect(current.apiKey).not.toBe(old.apiKey);
    expect(await readFile(getCodexConfigPath(), "utf8")).toContain(current.apiKey!);
    expect(await readFile(getCodexConfigPath(), "utf8")).not.toContain(old.apiKey!);
    await Promise.all([updateGatewayAccess("disable", 8787), configureLocalGatewayForCodex(params)]);
    expect((await getCodexGatewayProviderStatus()).authType).toBe("none");
    expect(await readFile(getCodexConfigPath(), "utf8")).not.toContain(current.apiKey!);
  });

  test("saving moved rotation and model settings preserves unrelated configuration and accounts", async () => {
    const before = await readFile(`${getStateDir()}/store.json`, "utf8");
    const [rotation, general] = await Promise.all([
      app.inject({ method: "PUT", url: "/_gateway/admin/settings", payload: { autoSwitch: { enabled: true, excludedProfileIds: [profile.profileId] }, runtime: { quotaSyncConcurrency: 5, codexRequestMinDelayMs: 123 } } }),
      app.inject({ method: "PUT", url: "/_gateway/admin/settings", payload: { runtime: { captureRequestContentEnabled: true } } }),
    ]);
    expect(rotation.statusCode).toBe(200);
    expect(general.statusCode).toBe(200);
    const merged = (await app.inject("/_gateway/admin/config")).json().settings;
    expect(merged.autoSwitch).toEqual({ enabled: true, excludedProfileIds: [profile.profileId] });
    expect(merged.runtime.quotaSyncConcurrency).toBe(5);
    expect(merged.runtime.captureRequestContentEnabled).toBe(true);
    await app.close(); app = createApp();
    expect((await app.inject("/_gateway/admin/config")).json().settings.runtime.codexRequestMinDelayMs).toBe(123);
    expect(await readFile(`${getStateDir()}/store.json`, "utf8")).toBe(before);
  });

  test("keyed Responses and Chat Completions retain stream behavior and upstream account credentials", async () => {
    const { apiKey } = await access("enable");
    const events = [
      { type: "response.output_text.delta", delta: "fixture-stream" },
      { type: "response.completed", response: { id: "resp_fixture", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "fixture-stream" }] }], usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } } },
    ];
    const upstream = spyOn(httpClient, "requestStream").mockImplementation(async init => {
      expect(init.headers?.Authorization).toBe(`Bearer ${profile.access}`);
      expect(JSON.stringify(init.headers)).not.toContain(apiKey!);
      return { status: 200, transport: "fetch", requestId: "fixture", headers: { "content-type": "text/event-stream" }, body: new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")).body! };
    });
    const nonStreaming = spyOn(httpClient, "requestText").mockImplementation(async init => {
      expect(init.headers?.Authorization).toBe(`Bearer ${profile.access}`);
      return { status: 200, transport: "fetch", requestId: "fixture", headers: { "content-type": "text/event-stream" }, body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") };
    });
    try {
      for (const url of ["/codex/v1/responses", "/v1/chat/completions"]) {
        const response = await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${apiKey}` }, payload: url.endsWith("completions") ? { model: "gpt-6-luna", messages: [{ role: "user", content: "hello" }], stream: true } : { model: "gpt-6-luna", input: "hello", stream: true } });
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/event-stream");
        expect(response.body).toContain("fixture-stream");
      }
      const response = await app.inject({ method: "POST", url: "/v1/responses", headers: { authorization: `Bearer ${apiKey}` }, payload: { model: "gpt-6-luna", input: "hello" } });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("fixture-stream");
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(nonStreaming).toHaveBeenCalledTimes(2);
    } finally { upstream.mockRestore(); nonStreaming.mockRestore(); }
  });

  test("Chat Completions preserves none and max reasoning efforts for streaming and JSON requests", async () => {
    const forwardedEfforts: string[] = [];
    const upstream = spyOn(httpClient, "requestText").mockImplementation(async init => {
      forwardedEfforts.push(JSON.parse(init.body!).reasoning.effort);
      const events = [
        { type: "response.output_text.delta", delta: "OK" },
        { type: "response.completed", response: { id: "resp_effort", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "OK" }] }] } },
      ];
      return { status: 200, transport: "fetch", requestId: "effort-fixture", headers: { "content-type": "text/event-stream" }, body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") };
    });
    try {
      for (const reasoning_effort of ["none", "max"]) {
        for (const stream of [false, true]) {
          const response = await app.inject({ method: "POST", url: "/v1/chat/completions", payload: { model: "gpt-6-astra", messages: [{ role: "user", content: "hello" }], reasoning_effort, stream } });
          expect(response.statusCode).toBe(200);
          expect(response.body).toContain("OK");
          expect(response.headers["content-type"]).toContain(stream ? "text/event-stream" : "application/json");
        }
      }
      const invalid = await app.inject({ method: "POST", url: "/v1/chat/completions", payload: { model: "gpt-6-astra", messages: [{ role: "user", content: "hello" }], reasoning_effort: "unknown" } });
      expect(invalid.statusCode).toBe(400);
      expect(forwardedEfforts).toEqual(["none", "none", "max", "max"]);
    } finally { upstream.mockRestore(); }
  });

  test("Codex provider configuration retains every declared reasoning level", async () => {
    const reasoningEfforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
    const response = await app.inject({ method: "POST", url: "/_gateway/admin/codex/configure-provider", payload: {
      baseUrl: "https://gateway.example.test/v1", providerId: "effort-test", kind: "openai_compatible", bearerToken: "fixture-token", model: "gpt-6-astra",
      catalogModels: [{ id: "gpt-6-astra", reasoningEfforts }],
    } });
    expect(response.statusCode).toBe(200);
    const status = await getCodexGatewayProviderStatus();
    expect(status.catalogModels).toEqual([expect.objectContaining({ id: "gpt-6-astra", reasoningEfforts })]);
    const catalog = JSON.parse(await readFile(status.modelCatalogPath!, "utf8"));
    expect(catalog.models[0].supported_reasoning_levels).toEqual(reasoningEfforts.map(effort => ({ effort, description: expect.any(String) })));
  });

  test("legacy compact uses the current Codex trigger and returns opaque JSON output with usage", async () => {
    const { apiKey } = await access("enable");
    const user = { role: "user", content: [{ type: "input_text", text: "保留这个偏好：蓝色。" }] };
    const input = [user, { role: "assistant", content: [{ type: "output_text", text: "好的。" }] }];
    const compaction = { type: "compaction", id: "cmp_fixture", encrypted_content: "opaque-encrypted-value", extra: { preserved: true } };
    const usage = { input_tokens: 12, output_tokens: 3, total_tokens: 15 };
    let finalOutputOnly = false;
    const upstream = spyOn(httpClient, "requestStream").mockImplementation(async init => {
      expect(init.url).toBe("https://chatgpt.com/backend-api/codex/responses");
      expect(init.headers?.Authorization).toBe(`Bearer ${profile.access}`);
      expect(JSON.stringify(init.headers)).not.toContain(apiKey!);
      const body = JSON.parse(init.body!);
      expect(body.input).toEqual([...input, { type: "compaction_trigger" }]);
      expect(body.stream).toBe(true);
      expect(body.store).toBe(false);
      const events = [
        ...(!finalOutputOnly ? [{ type: "response.output_item.done", item: compaction }] : []),
        { type: "response.completed", response: { id: "resp_compact", created_at: 123, output: finalOutputOnly ? [compaction] : [], usage } },
      ];
      return { status: 200, transport: "fetch", requestId: "compact-fixture", headers: { "content-type": "text/event-stream" }, body: new Response(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join("")).body! };
    });
    try {
      for (const onlyFinal of [false, true]) {
        finalOutputOnly = onlyFinal;
        const response = await app.inject({ method: "POST", url: "/codex/v1/responses/compact", headers: { authorization: `Bearer ${apiKey}` }, payload: { model: "gpt-6-luna", input, instructions: "Keep context." } });
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("application/json");
        expect(response.json()).toEqual({ id: "resp_compact", object: "response.compaction", created_at: 123, output: [user, compaction], usage });
        const logs = (await app.inject("/_gateway/admin/request-logs")).json().data;
        expect(logs[0].details.response).toMatchObject({ stream: false, completed: true, tokenUsageStatus: "captured", parseErrorCount: 0 });
        expect(JSON.stringify(logs)).not.toContain(compaction.encrypted_content);
      }
    } finally { upstream.mockRestore(); }
  });

  test("compact bounds retained user history and drops oversized image payloads", async () => {
    const oldMessages = Array.from({ length: 90 }, (_, index) => ({
      role: "user",
      content: [{ type: "input_text", text: `${index === 0 ? "oldest-marker " : ""}${"x".repeat(4_000)}` }],
    }));
    const newest = {
      role: "user",
      content: [
        { type: "input_text", text: "newest-marker" },
        { type: "input_image", image_url: `data:image/png;base64,${"A".repeat(400_000)}` },
      ],
    };
    const compaction = { type: "compaction", encrypted_content: "opaque-bounded-history" };
    const events = [
      { type: "response.output_item.done", item: compaction },
      { type: "response.completed", response: { id: "resp_bounded", output: [], usage: { input_tokens: 100_000, output_tokens: 10 } } },
    ];
    const upstream = spyOn(httpClient, "requestStream").mockResolvedValue({
      status: 200,
      transport: "fetch",
      requestId: "bounded-fixture",
      headers: { "content-type": "text/event-stream" },
      body: new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")).body!,
    });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/codex/v1/responses/compact",
        payload: { model: "gpt-6-luna", input: [...oldMessages, newest] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body.length).toBeLessThan(270_000);
      expect(response.body).toContain("newest-marker");
      expect(response.body).not.toContain("oldest-marker");
      expect(response.body).not.toContain("data:image/png");
      expect(response.json().output.at(-1)).toEqual(compaction);
    } finally { upstream.mockRestore(); }
  });

  test("compact rejects failed, truncated, or invalid upstream results instead of returning false success", async () => {
    const compaction = { type: "compaction", encrypted_content: "opaque" };
    const completed = { type: "response.completed", response: { id: "resp_compact", output: [] } };
    for (const events of [
      [{ type: "response.output_item.done", item: compaction }],
      [{ type: "response.failed", response: { error: { message: "fixture failure" } } }],
      [completed],
      [{ type: "response.output_item.done", item: { type: "compaction" } }, completed],
      [{ type: "response.output_item.done", item: compaction }, { type: "response.output_item.done", item: compaction }, completed],
    ]) {
      const upstream = spyOn(httpClient, "requestStream").mockResolvedValue({ status: 200, transport: "fetch", requestId: "fixture", headers: { "content-type": "text/event-stream" }, body: new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")).body! });
      try {
        const response = await app.inject({ method: "POST", url: "/codex/v1/responses/compact", payload: { model: "gpt-6-luna", input: "hello" } });
        expect(response.statusCode).toBe(502);
        expect(response.json().error).toBeDefined();
      } finally { upstream.mockRestore(); }
    }
  });
});
