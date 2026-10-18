import { expect, test } from "bun:test";
import { initialTakeoverSelection, mixedActivationForProvider, mixedActivationWithoutProvider } from "../admin-ui/src/pages/providers/takeover-selection";
import type { ApiProvider } from "../admin-ui/src/pages/providers/types";
import type { PublicMixedConfig } from "../src/core/models/mixed-provider";

function provider(overrides: Partial<ApiProvider> = {}): ApiProvider {
  return {
    id: "a", name: "渠道 A", baseUrl: "https://a.example/v1", connectionStatus: "connected",
    modelSource: "manual", tokenConfigured: true, activeForCodex: false, modelCount: 3, defaultModelId: "direct",
    models: ["direct", "shared", "new"].map((id) => ({ id, selectedForCodex: id === "direct", inspection: { status: "unknown" } })),
    ...overrides,
  };
}

function mixed(active = true): PublicMixedConfig {
  return { active, port: 12345, defaultModelId: "a-shared", routes: [
    { id: "a-shared", providerId: "a", modelId: "shared", protocol: "chat_completions", displayName: "共享模型 · A", contextWindow: 32768 },
    { id: "b-shared", providerId: "b", modelId: "shared", protocol: "anthropic", displayName: "共享模型 · B", contextWindow: 32768 },
  ] };
}

test("existing direct users keep their saved selection and default despite inactive mixed history", () => {
  const selection = initialTakeoverSelection(provider({ activeForCodex: true }), mixed(false));
  expect(selection.modelIds).toEqual(["direct"]);
  expect(selection.defaultModelId).toBe("direct");
  expect(selection.protocols.shared).toBe("chat_completions");
});

test("editing an active mixed channel restores its models, protocol and default instead of old direct selections", () => {
  const selection = initialTakeoverSelection(provider(), mixed());
  expect(selection.modelIds).toEqual(["shared"]);
  expect(selection.defaultModelId).toBe("shared");
  expect(selection.protocols.shared).toBe("chat_completions");
  const otherDefault = mixed(); otherDefault.defaultModelId = "b-shared";
  expect(initialTakeoverSelection(provider(), otherDefault).defaultModelId).toBe("shared");
});

test("a channel update replaces only that channel and preserves another channel with the same model ID", () => {
  const config = mixed();
  const selection = { modelIds: ["new"], defaultModelId: "new", protocols: { new: "responses" as const } };
  const input = mixedActivationForProvider("a", selection, config);
  expect(input).toEqual({ routes: [
    { providerId: "b", modelId: "shared", protocol: "anthropic" },
    { providerId: "a", modelId: "new", protocol: "responses" },
  ], defaultModel: { providerId: "a", modelId: "new" } });
  expect(config).toEqual(mixed());
  expect(selection.modelIds).toEqual(["new"]);
});

test("starting mixed mode does not silently re-enable inactive channels", () => {
  const selection = initialTakeoverSelection(provider({ activeForCodex: true }), mixed(false));
  const input = mixedActivationForProvider("a", selection, mixed(false));
  expect(input.routes).toEqual([{ providerId: "a", modelId: "direct", protocol: "auto" }]);
  expect(input.defaultModel).toEqual({ providerId: "a", modelId: "direct" });
});

test("removing a mixed channel keeps the remaining default or chooses a valid replacement; the last channel deactivates", () => {
  const config = mixed();
  expect(mixedActivationWithoutProvider("b", config)?.defaultModel).toEqual({ providerId: "a", modelId: "shared" });
  expect(mixedActivationWithoutProvider("a", config)).toEqual({
    routes: [{ providerId: "b", modelId: "shared", protocol: "anthropic" }],
    defaultModel: { providerId: "b", modelId: "shared" },
  });
  expect(mixedActivationWithoutProvider("a", { ...config, routes: config.routes.slice(0, 1) })).toBeUndefined();
  expect(config).toEqual(mixed());
});

test("initial selections exclude unavailable catalog IDs and single-model channels remain easy to connect", () => {
  expect(initialTakeoverSelection(provider({ models: [] }), mixed())).toMatchObject({ modelIds: [], defaultModelId: "" });
  const single = provider({ models: [{ id: "only", selectedForCodex: false, inspection: { status: "unknown" } }], modelCount: 1 });
  expect(initialTakeoverSelection(single)).toEqual({ modelIds: ["only"], defaultModelId: "only", protocols: { only: "auto" } });
});

test("automatically detected routes remain automatic when editing and keep their metadata across channel changes", () => {
  const config = mixed();
  config.routes.forEach((route) => { route.autoDetected = true; });
  const selection = initialTakeoverSelection(provider(), config);
  expect(selection.protocols.shared).toBe("auto");
  expect(mixedActivationForProvider("a", selection, config).routes).toEqual([
    { providerId: "b", modelId: "shared", protocol: "anthropic", autoDetected: true },
    { providerId: "a", modelId: "shared", protocol: "auto" },
  ]);
  expect(mixedActivationWithoutProvider("a", config)?.routes[0].autoDetected).toBe(true);
});
