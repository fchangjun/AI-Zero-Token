export type ExternalModelStatus =
  | "ready"
  | "busy"
  | "unavailable"
  | "incompatible"
  | "auth_error"
  | "transport_error"
  | "skipped";

export type ExternalModelInspectionResult = {
  id: string;
  name?: string;
  status: ExternalModelStatus;
  latencyMs?: number;
  message?: string;
  capabilities?: {
    responsesStreaming?: boolean;
    functionCalling?: boolean;
    functionCallOutput?: boolean;
    reasoningEfforts?: Array<"minimal" | "low" | "medium" | "high" | "xhigh">;
  };
};

export type ExternalProviderInspection = {
  inspectionId?: string;
  baseUrl: string;
  modelsUrl: string;
  modelCount: number;
  candidateCount: number;
  recommendedModel?: string;
  results: ExternalModelInspectionResult[];
};

export type ExternalInspectionHistoryEntry = {
  id: string;
  createdAt: number;
  providerId?: string;
  baseUrl: string;
  inspection: ExternalProviderInspection;
  submittedCatalogModelIds?: string[];
  writtenCatalogModelIds?: string[];
  configuredModelId?: string;
};

export type CodexCatalogModel = {
  id: string;
  displayName?: string;
  reasoningEfforts?: Array<"minimal" | "low" | "medium" | "high" | "xhigh">;
};

export type ExternalConnectIntent = "connect" | "rescan";
export type ExternalConnectAction = "apply-cached" | "inspect-and-configure";

function catalogModelFromInspection(result: ExternalModelInspectionResult): CodexCatalogModel {
  return {
    id: result.id,
    ...(result.name ? { displayName: result.name } : {}),
    ...(result.capabilities?.reasoningEfforts?.length
      ? { reasoningEfforts: result.capabilities.reasoningEfforts }
      : {}),
  };
}

export function mergeReadyExternalCatalogModels(
  current: readonly CodexCatalogModel[],
  results: readonly ExternalModelInspectionResult[],
): CodexCatalogModel[] {
  const merged = new Map(current.map((model) => [model.id, model]));
  for (const result of results) {
    if (result.status === "ready") {
      merged.set(result.id, catalogModelFromInspection(result));
    }
  }
  return [...merged.values()];
}

export function restoreExternalProviderCache(entry: ExternalInspectionHistoryEntry): {
  catalogModels: CodexCatalogModel[];
  selectedModel: string;
} {
  const readyById = new Map(
    entry.inspection.results
      .filter((result) => result.status === "ready")
      .map((result) => [result.id, result]),
  );
  const savedIds = entry.writtenCatalogModelIds?.length
    ? entry.writtenCatalogModelIds
    : entry.submittedCatalogModelIds?.length
      ? entry.submittedCatalogModelIds
      : [...readyById.keys()];
  const catalogModels = [...new Set(savedIds)]
    .map((id) => readyById.get(id))
    .filter((result): result is ExternalModelInspectionResult => Boolean(result))
    .map(catalogModelFromInspection);
  const availableIds = new Set(catalogModels.map((model) => model.id));
  const selectedModel = [entry.configuredModelId, entry.inspection.recommendedModel, catalogModels[0]?.id]
    .find((id): id is string => Boolean(id && availableIds.has(id))) ?? "";

  return { catalogModels, selectedModel };
}

export function selectCachedExternalModel(
  catalogModels: readonly CodexCatalogModel[],
  ...preferredIds: Array<string | undefined>
): string {
  const availableIds = new Set(catalogModels.map((model) => model.id));
  return [...preferredIds, catalogModels[0]?.id]
    .find((id): id is string => Boolean(id && availableIds.has(id))) ?? "";
}

export function resolveExternalConnectAction(
  intent: ExternalConnectIntent,
  catalogModels: readonly CodexCatalogModel[],
): ExternalConnectAction {
  return intent === "connect" && catalogModels.length > 0
    ? "apply-cached"
    : "inspect-and-configure";
}
