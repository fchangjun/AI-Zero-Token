import { afterEach, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile as readFileFromFs } from "node:fs/promises";
import {
  ExternalProviderInspectionError,
  inspectExternalProvider,
  normalizeOpenAICompatibleBaseUrl,
} from "../src/core/providers/openai-compatible/inspect.ts";
import {
  applyGatewayToCodexProviderConfig,
  getCodexAuthStatus,
  getCodexGatewayProviderStatus,
  getReusableCodexProviderBearerToken,
  removeGatewayFromCodexProviderConfig,
} from "../src/core/store/codex-auth-store.ts";
import {
  appendExternalProviderInspectionHistory,
  listExternalProviderInspectionHistory,
  updateExternalProviderInspectionHistory,
} from "../src/core/store/external-provider-inspection-history.ts";

type RecordedRequest = {
  method: string;
  url: string;
  authorization?: string;
  body: string;
};

type TestServer = {
  origin: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
};

type TestRoute = (
  request: IncomingMessage,
  response: ServerResponse,
  recorded: RecordedRequest,
) => Promise<void> | void;

const liveServers: TestServer[] = [];
const temporaryDirectories: string[] = [];
const originalCodexHome = process.env.CODEX_HOME;

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function startTestServer(route: TestRoute): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server: Server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    const recorded: RecordedRequest = {
      method: request.method ?? "GET",
      url: request.url ?? "/",
      authorization: request.headers.authorization,
      body,
    };
    requests.push(recorded);
    try {
      await route(request, response, recorded);
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }));
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not expose a TCP address");
  }

  const testServer: TestServer = {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
  liveServers.push(testServer);
  return testServer;
}

function sendJson(response: ServerResponse, value: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}

function sendSse(response: ServerResponse, events: unknown[]): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream; charset=utf-8");
  for (const event of events) {
    const data = typeof event === "string" ? event : JSON.stringify(event);
    response.write(`data: ${data}\n\n`);
  }
  response.end();
}

function parseJsonBody(recorded: RecordedRequest): Record<string, unknown> {
  const parsed = JSON.parse(recorded.body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object request body");
  }
  return parsed as Record<string, unknown>;
}

function sendSuccessfulProbeRound(response: ServerResponse, recorded: RecordedRequest): void {
  const body = parseJsonBody(recorded);
  if (body.reasoning) {
    sendSse(response, [
      { type: "response.output_text.delta", delta: "OK" },
      { type: "response.completed", response: { status: "completed" } },
    ]);
    return;
  }
  if (Array.isArray(body.input)) {
    sendSse(response, [
      { type: "response.output_text.delta", delta: "OK" },
      { type: "response.completed", response: { status: "completed" } },
    ]);
    return;
  }

  sendSse(response, [
    {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: `call-${String(body.model)}`,
        name: "azt_provider_probe",
        arguments: "{\"ok\":true}",
      },
    },
    { type: "response.completed", response: { status: "completed" } },
  ]);
}

async function inspect(origin: string, bearerToken = "local-test-token") {
  return inspectExternalProvider({
    baseUrl: origin,
    bearerToken,
    providerId: "external-test",
    tokenSource: "provided",
  });
}

afterEach(async () => {
  while (liveServers.length > 0) {
    await liveServers.pop()?.close();
  }
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = originalCodexHome;
  }
});

describe("OpenAI-compatible provider inspection", () => {
  test("normalizes a root Base URL to /v1 and strips endpoint suffixes", () => {
    expect(normalizeOpenAICompatibleBaseUrl("https://gateway.example.test"))
      .toBe("https://gateway.example.test/v1");
    expect(normalizeOpenAICompatibleBaseUrl("gateway.example.test/"))
      .toBe("https://gateway.example.test/v1");
    expect(normalizeOpenAICompatibleBaseUrl("https://gateway.example.test/custom/v1/models"))
      .toBe("https://gateway.example.test/custom/v1");
    expect(normalizeOpenAICompatibleBaseUrl("https://gateway.example.test/custom/v1/responses?ignored=yes#ignored"))
      .toBe("https://gateway.example.test/custom/v1");
  });

  test("accepts common GET /models payload shapes and de-duplicates model IDs", async () => {
    const payloads: unknown[] = [
      ["model-a", { id: "model-b" }, { id: "model-a" }],
      { data: [{ id: "model-a" }, { model: "model-b" }, { id: "model-a" }] },
      { models: [{ name: "model-a" }, "model-b", "model-a"] },
      { items: [{ id: "model-a" }, { id: "model-b" }, { id: "model-a" }] },
      { result: [{ id: "model-a" }, { id: "model-b" }, { id: "model-a" }] },
    ];

    for (const payload of payloads) {
      const server = await startTestServer((_request, response, recorded) => {
        if (recorded.url === "/v1/models") {
          sendJson(response, payload);
          return;
        }
        if (recorded.url === "/v1/responses") {
          sendSuccessfulProbeRound(response, recorded);
          return;
        }
        sendJson(response, { error: { message: "not found" } }, 404);
      });

      const result = await inspect(server.origin);
      expect(result.baseUrl).toBe(`${server.origin}/v1`);
      expect(result.discoveredCount).toBe(2);
      expect(result.results.map((model) => model.id)).toEqual(["model-a", "model-b"]);
      expect(result.results.every((model) => model.status === "ready")).toBe(true);
      expect(server.requests.filter((request) => request.url === "/v1/responses")).toHaveLength(14);

      await liveServers.pop()?.close();
    }
  });

  test("requires a function_call and a successful function_call_output continuation before ready", async () => {
    const server = await startTestServer((_request, response, recorded) => {
      if (recorded.url === "/v1/models") {
        sendJson(response, { data: [{ id: "two-round-ok" }, { id: "first-round-only" }] });
        return;
      }
      if (recorded.url !== "/v1/responses") {
        sendJson(response, { error: { message: "not found" } }, 404);
        return;
      }

      const body = parseJsonBody(recorded);
      const isContinuation = Array.isArray(body.input);
      if (body.model === "first-round-only" && isContinuation) {
        sendSse(response, ["[DONE]"]);
        return;
      }
      sendSuccessfulProbeRound(response, recorded);
    });

    const result = await inspect(server.origin);
    expect(result.results.find((model) => model.id === "two-round-ok")).toMatchObject({
      status: "ready",
      capabilities: {
        responsesStreaming: true,
        functionCalling: true,
        functionCallOutput: true,
        reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
      },
    });
    expect(result.results.find((model) => model.id === "first-round-only")).toMatchObject({
      status: "incompatible",
      capabilities: {
        functionCalling: true,
        functionCallOutput: false,
      },
    });

    const continuation = server.requests
      .filter((request) => request.url === "/v1/responses")
      .map(parseJsonBody)
      .find((body) => body.model === "two-round-ok" && Array.isArray(body.input));
    expect(continuation).toBeDefined();
    expect(continuation?.input).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "function_call_output", output: "{\"ok\":true}" }),
    ]));
  });

  test("does not accept Chat Completions JSON, [DONE]-only, or response.incomplete as ready", async () => {
    const server = await startTestServer((_request, response, recorded) => {
      if (recorded.url === "/v1/models") {
        sendJson(response, {
          data: [
            { id: "chat-completions-json" },
            { id: "done-only" },
            { id: "incomplete-response" },
          ],
        });
        return;
      }

      const body = parseJsonBody(recorded);
      if (body.model === "chat-completions-json") {
        sendJson(response, { choices: [{ delta: { content: "hello" } }] });
      } else if (body.model === "done-only") {
        sendSse(response, ["[DONE]"]);
      } else {
        sendSse(response, [{ type: "response.incomplete", response: { status: "incomplete" } }]);
      }
    });

    const result = await inspect(server.origin);
    expect(result.summary.ready).toBe(0);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((model) => model.status === "incompatible")).toBe(true);
  });

  test("classifies transient overload as busy, unsupported protocols as incompatible, and prefers an explicit model", async () => {
    const server = await startTestServer((_request, response, recorded) => {
      if (recorded.url === "/v1/models") {
        sendJson(response, { data: [{ id: "auto" }, { id: "gpt-5.6-sol" }, { id: "at-capacity" }, { id: "not-implemented" }] });
        return;
      }

      const body = parseJsonBody(recorded);
      if (body.model === "at-capacity") {
        sendJson(response, { error: { code: "rate_limit_exceeded", message: "try again later" } }, 429);
        return;
      }
      if (body.model === "not-implemented") {
        sendJson(response, { error: { message: "Responses tools are not implemented" } }, 500);
        return;
      }
      sendSuccessfulProbeRound(response, recorded);
    });

    const result = await inspect(server.origin);
    expect(result.results.find((model) => model.id === "at-capacity")).toMatchObject({
      status: "busy",
      statusCode: 429,
    });
    expect(result.results.find((model) => model.id === "not-implemented")).toMatchObject({
      status: "incompatible",
      statusCode: 500,
    });
    expect(result.results.find((model) => model.id === "auto")?.status).toBe("ready");
    expect(result.results.find((model) => model.id === "gpt-5.6-sol")?.status).toBe("ready");
    expect(result.recommendedModel).toBe("gpt-5.6-sol");
  });

  test("uses declared reasoning levels and probes undeclared levels independently", async () => {
    const server = await startTestServer((_request, response, recorded) => {
      if (recorded.url === "/v1/models") {
        sendJson(response, {
          data: [
            { id: "declared", supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }] },
            { id: "probed" },
          ],
        });
        return;
      }
      const body = parseJsonBody(recorded);
      if (body.reasoning) {
        const reasoning = body.reasoning as { effort?: string };
        if (body.model === "probed" && (reasoning.effort === "low" || reasoning.effort === "high")) {
          sendSse(response, [
            { type: "response.output_text.delta", delta: "OK" },
            { type: "response.completed", response: { status: "completed" } },
          ]);
        } else {
          sendJson(response, { error: { message: `reasoning effort ${reasoning.effort} is not supported` } }, 400);
        }
        return;
      }
      sendSuccessfulProbeRound(response, recorded);
    });

    const result = await inspect(server.origin);
    expect(result.results.find((model) => model.id === "declared")?.capabilities.reasoningEfforts).toEqual(["low", "high"]);
    expect(result.results.find((model) => model.id === "probed")?.capabilities.reasoningEfforts).toEqual(["low", "high"]);
    const declaredReasoningRequests = server.requests
      .filter((request) => request.url === "/v1/responses")
      .map(parseJsonBody)
      .filter((body) => body.model === "declared" && body.reasoning);
    expect(declaredReasoningRequests).toHaveLength(0);
  });

  test("blocks a cross-origin redirect before forwarding Authorization", async () => {
    const redirectTarget = await startTestServer((_request, response) => {
      sendJson(response, { data: [{ id: "credential-should-not-arrive" }] });
    });
    const source = await startTestServer((_request, response, recorded) => {
      if (recorded.url === "/v1/models") {
        response.statusCode = 307;
        response.setHeader("location", `${redirectTarget.origin}/stolen`);
        response.end();
        return;
      }
      sendJson(response, { error: { message: "not found" } }, 404);
    });

    await expect(inspect(source.origin, "redirect-test-secret")).rejects.toMatchObject({
      name: "ExternalProviderInspectionError",
      code: "cross_origin_redirect",
    } satisfies Partial<ExternalProviderInspectionError>);
    expect(source.requests[0]?.authorization).toBe("Bearer redirect-test-secret");
    expect(redirectTarget.requests).toHaveLength(0);
  });
});

describe("Codex provider configuration lifecycle", () => {
  test("apply/remove restores the previous root model and model_provider", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-config-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;
    const configPath = join(codexHome, "config.toml");
    await writeFile(configPath, [
      'model = "previous-model"',
      'model_provider = "previous-provider"',
      "",
      "[model_providers.previous-provider]",
      'name = "Previous provider"',
      'base_url = "https://previous.example.test/v1"',
      'wire_api = "responses"',
      "",
    ].join("\n"));

    await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/team-a/v1",
      providerId: "external-test",
      kind: "openai_compatible",
      bearerToken: "stored-test-token",
      model: "chosen-model",
    });

    const applied = await readFile(configPath, "utf8");
    expect(applied).toContain('model = "chosen-model"');
    expect(applied).toContain('model_provider = "external-test"');
    expect(applied).toContain("[model_providers.external-test]");
    expect(applied).toContain('experimental_bearer_token = "stored-test-token"');

    const removed = await removeGatewayFromCodexProviderConfig({ providerId: "external-test" });
    expect(removed.removed).toBe(true);
    const restored = await readFile(configPath, "utf8");
    expect(restored).toContain('model = "previous-model"');
    expect(restored).toContain('model_provider = "previous-provider"');
    expect(restored).toContain("[model_providers.previous-provider]");
    expect(restored).not.toContain("[model_providers.external-test]");
    expect(restored).not.toContain("AI Zero Token managed Codex model");
    expect(restored).not.toContain("AI Zero Token managed Codex provider state");
  });

  test("writes every verified model to a native Codex catalog and restores the previous catalog", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-catalog-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;
    const configPath = join(codexHome, "config.toml");
    await writeFile(configPath, [
      'model = "previous-model"',
      'model_provider = "previous-provider"',
      'model_catalog_json = "/tmp/original-codex-models.json"',
      "",
    ].join("\n"));

    const appliedResult = await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/v1",
      providerId: "external-test",
      kind: "openai_compatible",
      bearerToken: "stored-test-token",
      model: "DeepSeek-V4-Flash",
      catalogModels: [
        { id: "Grok-4.6", reasoningEfforts: ["low", "high"] },
        { id: "DeepSeek-V4-Flash", reasoningEfforts: ["medium"] },
        { id: "MiniMax-M3", displayName: "MiniMax M3" },
      ],
    });

    expect(appliedResult.modelCatalogCount).toBe(3);
    expect(appliedResult.modelCatalogPath).toBe(join(codexHome, "model-catalogs", "ai-zero-token-models.json"));
    const appliedConfig = await readFile(configPath, "utf8");
    expect(appliedConfig).toContain(`model_catalog_json = ${JSON.stringify(appliedResult.modelCatalogPath)}`);

    const catalog = JSON.parse(await readFile(appliedResult.modelCatalogPath!, "utf8")) as {
      models: Array<Record<string, unknown>>;
    };
    expect(catalog.models.map((item) => item.slug)).toEqual([
      "Grok-4.6",
      "DeepSeek-V4-Flash",
      "MiniMax-M3",
    ]);
    expect(catalog.models.map((item) => item.display_name)).toEqual([
      "Grok 4.6",
      "DeepSeek V4 Flash",
      "MiniMax M3",
    ]);
    expect(catalog.models.every((item) => item.visibility === "list")).toBe(true);
    expect(catalog.models.every((item) => typeof item.base_instructions === "string")).toBe(true);
    expect(catalog.models.map((item) => item.supported_reasoning_levels)).toEqual([
      [
        { effort: "low", description: "Fast responses with lighter reasoning" },
        { effort: "high", description: "Deeper reasoning" },
      ],
      [{ effort: "medium", description: "Balanced speed and reasoning" }],
      [],
    ]);

    await removeGatewayFromCodexProviderConfig({ providerId: "external-test" });
    const restored = await readFile(configPath, "utf8");
    expect(restored).toContain('model_catalog_json = "/tmp/original-codex-models.json"');
    expect(restored).not.toContain("AI Zero Token managed Codex model catalog");
  });

  test("preserves previously verified catalog models when applying a later subset", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-catalog-merge-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;

    await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/v1",
      providerId: "external-test",
      kind: "openai_compatible",
      bearerToken: "stored-test-token",
      model: "model-a",
      catalogModels: [{ id: "model-a" }, { id: "model-b", reasoningEfforts: ["high"] }],
    });
    const result = await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/v1",
      providerId: "external-test",
      kind: "openai_compatible",
      model: "model-a",
      catalogModels: [{ id: "model-a", reasoningEfforts: ["medium"] }],
    });
    const catalog = JSON.parse(await readFile(result.modelCatalogPath!, "utf8")) as { models: Array<Record<string, unknown>> };
    expect(catalog.models.map((item) => item.slug)).toEqual(["model-a", "model-b"]);
    expect(catalog.models[0]?.supported_reasoning_levels).toEqual([{ effort: "medium", description: "Balanced speed and reasoning" }]);
    expect(catalog.models[1]?.supported_reasoning_levels).toEqual([{ effort: "high", description: "Deeper reasoning" }]);
  });

  test("persists inspection reports with submitted and written catalog IDs", async () => {
    const stateHome = await mkdtemp(join(tmpdir(), "azt-inspection-history-test-"));
    temporaryDirectories.push(stateHome);
    const historyPath = join(stateHome, "external-provider-inspections.json");
    await appendExternalProviderInspectionHistory({
      id: "00000000-0000-4000-8000-000000000001",
      createdAt: 1,
      providerId: "external-test",
      baseUrl: "https://gateway.example.test/v1",
      inspection: { providerId: "external-test", baseUrl: "https://gateway.example.test/v1", modelsEndpoint: "x", modelsUrl: "x", responsesEndpoint: "y", tokenSource: "provided", discoveredCount: 2, modelCount: 2, candidateCount: 2, truncatedCount: 0, filteredModels: [], models: [], results: [], summary: { ready: 0, busy: 0, unavailable: 0, incompatible: 0, auth_error: 0, transport_error: 0 }, durationMs: 1 },
    }, { path: historyPath });
    await updateExternalProviderInspectionHistory("00000000-0000-4000-8000-000000000001", {
      submittedCatalogModelIds: ["model-a", "model-b"],
      writtenCatalogModelIds: ["model-a"],
      configuredModelId: "model-a",
    }, { path: historyPath });
    const entries = await listExternalProviderInspectionHistory(10, { path: historyPath });
    expect(entries[0]?.submittedCatalogModelIds).toEqual(["model-a", "model-b"]);
    expect(entries[0]?.writtenCatalogModelIds).toEqual(["model-a"]);
    expect(entries[0]?.configuredModelId).toBe("model-a");
  });

  test("reuses a stored bearer token only for the exact provider Base URL path", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-token-scope-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;

    await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/team-a/v1",
      providerId: "external-test",
      kind: "openai_compatible",
      bearerToken: "path-scoped-test-token",
      model: "chosen-model",
    });

    expect(await getReusableCodexProviderBearerToken({
      baseUrl: "https://gateway.example.test/team-a/v1",
      providerId: "external-test",
    })).toBe("path-scoped-test-token");
    expect(await getReusableCodexProviderBearerToken({
      baseUrl: "https://gateway.example.test/team-b/v1",
      providerId: "external-test",
    })).toBeUndefined();
    await expect(applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/team-b/v1",
      providerId: "external-test",
      kind: "openai_compatible",
      model: "chosen-model",
    })).rejects.toThrow("请填写外部 API Token");
  });

  test("deactivating ai-zero-token restores OpenAI while retaining the provider for existing threads", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-openai-restore-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;
    const configPath = join(codexHome, "config.toml");
    await writeFile(configPath, [
      'model = "previous-openai-model"',
      'model_provider = "openai"',
      'openai_base_url = "https://existing-openai.example.test/v1"',
      "",
    ].join("\n"));

    await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/v1",
      providerId: "ai-zero-token",
      kind: "openai_compatible",
      bearerToken: "stored-test-token",
      model: "chosen-model",
    });

    const applied = await readFile(configPath, "utf8");
    expect(applied).toContain('openai_base_url = "https://existing-openai.example.test/v1"');
    expect(applied).toContain('model_provider = "ai-zero-token"');
    expect(applied).toContain('model = "chosen-model"');
    expect((await getCodexAuthStatus()).gatewayProvider.catalogModels?.map((item) => item.id)).toEqual(["chosen-model"]);

    const removed = await removeGatewayFromCodexProviderConfig({ providerId: "ai-zero-token" });
    expect(removed.providerDefinitionRetained).toBe(true);
    expect(removed.credentialsRetained).toBe(true);
    const restored = await readFile(configPath, "utf8");
    expect(restored).toContain('openai_base_url = "https://existing-openai.example.test/v1"');
    expect(restored).toContain('model_provider = "openai"');
    expect(restored).toContain('model = "previous-openai-model"');
    expect(restored).toContain("[model_providers.ai-zero-token]");
    expect(await getCodexGatewayProviderStatus({ providerId: "ai-zero-token" })).toMatchObject({
      providerId: "ai-zero-token",
      exists: true,
      active: false,
      baseUrl: "https://gateway.example.test/v1",
    });
    expect(await getReusableCodexProviderBearerToken({
      baseUrl: "https://gateway.example.test/v1",
      providerId: "ai-zero-token",
    })).toBe("stored-test-token");

    const status = await getCodexAuthStatus();
    expect(status.gatewayProvider).toMatchObject({
      providerId: "openai",
      active: true,
      baseUrl: "https://existing-openai.example.test/v1",
    });
    expect(status.savedExternalProvider).toMatchObject({
      providerId: "ai-zero-token",
      exists: true,
      active: false,
      baseUrl: "https://gateway.example.test/v1",
      authType: "bearer_token",
    });
    expect(status.savedExternalProvider).not.toHaveProperty("bearerToken");

    const reapplied = await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/v1",
      providerId: "ai-zero-token",
      kind: "openai_compatible",
      model: "chosen-model",
      catalogModels: [{ id: "chosen-model" }],
    });
    expect(reapplied.authType).toBe("bearer_token");
    expect(await getCodexGatewayProviderStatus({ providerId: "ai-zero-token" })).toMatchObject({
      active: true,
      model: "chosen-model",
    });

    await removeGatewayFromCodexProviderConfig({ providerId: "ai-zero-token" });

    const repeated = await removeGatewayFromCodexProviderConfig({ providerId: "ai-zero-token" });
    expect(repeated).toMatchObject({
      removed: false,
      providerDefinitionRetained: true,
      credentialsRetained: true,
    });

    const purged = await removeGatewayFromCodexProviderConfig({
      providerId: "ai-zero-token",
      purgeProviderDefinition: true,
    });
    expect(purged.removed).toBe(true);
    expect(purged.providerDefinitionRetained).toBe(false);
    expect(await readFile(configPath, "utf8")).not.toContain("[model_providers.ai-zero-token]");
  });

  test("does not reuse a token or catalog across external provider Base URLs", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-provider-scope-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;

    await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/team-a/v1",
      providerId: "ai-zero-token",
      kind: "openai_compatible",
      bearerToken: "team-a-token",
      model: "model-a",
      catalogModels: [{ id: "model-a" }],
    });

    await expect(applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/team-b/v1",
      providerId: "ai-zero-token",
      kind: "openai_compatible",
      model: "model-b",
      catalogModels: [{ id: "model-b" }],
    })).rejects.toThrow("请填写外部 API Token");

    const applied = await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/team-b/v1",
      providerId: "ai-zero-token",
      kind: "openai_compatible",
      bearerToken: "team-b-token",
      model: "model-b",
      catalogModels: [{ id: "model-b" }],
    });
    const catalog = JSON.parse(await readFile(applied.modelCatalogPath!, "utf8")) as { models: Array<{ slug: string }> };
    expect(catalog.models.map((item) => item.slug)).toEqual(["model-b"]);
  });

  test("switching through openai gateway mode keeps the legacy provider definition loadable", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-provider-compat-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;

    await applyGatewayToCodexProviderConfig({
      baseUrl: "https://external.example.test/v1",
      providerId: "ai-zero-token",
      kind: "openai_compatible",
      bearerToken: "stored-test-token",
      model: "external-model",
    });
    const switched = await applyGatewayToCodexProviderConfig({
      baseUrl: "http://127.0.0.1:8787/codex/v1",
      providerId: "openai",
      kind: "codex_gateway",
      model: "gpt-5.6-sol",
    });
    expect(switched.historyMigration).toBeUndefined();
    expect(await readFile(join(codexHome, "config.toml"), "utf8")).toContain("[model_providers.ai-zero-token]");

    await removeGatewayFromCodexProviderConfig({ providerId: "openai" });
    const restored = await readFile(join(codexHome, "config.toml"), "utf8");
    expect(restored).toContain("[model_providers.ai-zero-token]");
    expect(await getCodexGatewayProviderStatus({ providerId: "ai-zero-token" })).toMatchObject({
      exists: true,
      active: false,
    });
  });

  test("remove does not overwrite root model or provider changed by the user after takeover", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "azt-codex-user-edit-test-"));
    temporaryDirectories.push(codexHome);
    process.env.CODEX_HOME = codexHome;
    const configPath = join(codexHome, "config.toml");
    await writeFile(configPath, 'model = "before"\nmodel_provider = "openai"\n');

    await applyGatewayToCodexProviderConfig({
      baseUrl: "https://gateway.example.test/v1",
      providerId: "ai-zero-token",
      kind: "openai_compatible",
      bearerToken: "stored-test-token",
      model: "chosen-model",
    });

    const managed = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      managed
        .replace('model = "chosen-model"', 'model = "user-edited-model"')
        .replace('model_provider = "ai-zero-token"', 'model_provider = "user-edited-provider"'),
    );

    await removeGatewayFromCodexProviderConfig({ providerId: "ai-zero-token" });
    const afterRemove = await readFile(configPath, "utf8");
    expect(afterRemove).toContain('model = "user-edited-model"');
    expect(afterRemove).toContain('model_provider = "user-edited-provider"');
    expect(afterRemove).toContain("[model_providers.ai-zero-token]");
    expect(afterRemove).not.toContain("AI Zero Token managed Codex model");
    expect(afterRemove).not.toContain("AI Zero Token managed Codex provider state");
  });
});
