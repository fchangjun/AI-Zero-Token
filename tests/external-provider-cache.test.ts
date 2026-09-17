import { describe, expect, test } from "bun:test";
import {
  mergeReadyExternalCatalogModels,
  resolveExternalConnectAction,
  restoreExternalProviderCache,
  selectCachedExternalModel,
  type ExternalInspectionHistoryEntry,
} from "../admin-ui/src/pages/settings/external-provider-cache.ts";

function historyEntry(overrides?: Partial<ExternalInspectionHistoryEntry>): ExternalInspectionHistoryEntry {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: 1,
    providerId: "ai-zero-token",
    baseUrl: "https://gateway.example.test/v1",
    inspection: {
      baseUrl: "https://gateway.example.test/v1",
      modelsUrl: "https://gateway.example.test/v1/models",
      modelCount: 3,
      candidateCount: 3,
      recommendedModel: "model-b",
      results: [
        { id: "model-a", name: "Model A", status: "ready", capabilities: { reasoningEfforts: ["low"] } },
        { id: "model-b", name: "Model B", status: "ready", capabilities: { reasoningEfforts: ["high"] } },
        { id: "model-c", name: "Model C", status: "auth_error" },
      ],
    },
    ...overrides,
  };
}

describe("external provider cache", () => {
  test("restores only written ready models and the previously configured model", () => {
    const restored = restoreExternalProviderCache(historyEntry({
      writtenCatalogModelIds: ["model-b", "model-c"],
      configuredModelId: "model-b",
    }));

    expect(restored.catalogModels).toEqual([
      { id: "model-b", displayName: "Model B", reasoningEfforts: ["high"] },
    ]);
    expect(restored.selectedModel).toBe("model-b");
  });

  test("falls back to the recommended ready model for legacy history", () => {
    const restored = restoreExternalProviderCache(historyEntry());
    expect(restored.catalogModels.map((model) => model.id)).toEqual(["model-a", "model-b"]);
    expect(restored.selectedModel).toBe("model-b");
  });

  test("recovers submitted models from older history with an empty written catalog", () => {
    const restored = restoreExternalProviderCache(historyEntry({
      submittedCatalogModelIds: ["model-a", "model-b"],
      writtenCatalogModelIds: [],
    }));
    expect(restored.catalogModels.map((model) => model.id)).toEqual(["model-a", "model-b"]);
    expect(restored.selectedModel).toBe("model-b");
  });

  test("never selects a restored OpenAI model outside the external cache", () => {
    const restored = restoreExternalProviderCache(historyEntry());
    expect(selectCachedExternalModel(restored.catalogModels, "gpt-5.6-sol", "model-a")).toBe("model-a");
    expect(selectCachedExternalModel(restored.catalogModels, "gpt-5.6-sol")).toBe("model-a");
  });

  test("merges only ready probe results", () => {
    expect(mergeReadyExternalCatalogModels(
      [{ id: "previous-model" }],
      historyEntry().inspection.results,
    ).map((model) => model.id)).toEqual(["previous-model", "model-a", "model-b"]);
  });

  test("ordinary connect reuses matching cached models without another inspection", () => {
    expect(resolveExternalConnectAction("connect", [{ id: "model-b" }])).toBe("apply-cached");
  });

  test("ordinary connect inspects only when no cached model is available", () => {
    expect(resolveExternalConnectAction("connect", [])).toBe("inspect-and-configure");
  });

  test("explicit rescan always inspects even when cached models are available", () => {
    expect(resolveExternalConnectAction("rescan", [{ id: "model-b" }])).toBe("inspect-and-configure");
  });
});
