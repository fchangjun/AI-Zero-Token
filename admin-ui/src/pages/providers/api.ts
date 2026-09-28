import { fetchJson } from "@/shared/api";
import type {
  ApiProvider,
  ProviderDraft,
  ProviderInspectionStatus,
  ProviderModel,
  ProviderModelCapabilities,
  ProviderModelSource,
  ProvidersSnapshot,
  ReasoningEffort,
} from "./types";

const PROVIDERS_ENDPOINT = "/_gateway/admin/providers";
const INSPECTION_STATUSES = new Set<ProviderInspectionStatus>([
  "ready", "busy", "unavailable", "incompatible", "auth_error",
  "transport_error", "timeout", "skipped", "pending", "unknown",
]);
const REASONING_EFFORTS = new Set<ReasoningEffort>(["minimal", "low", "medium", "high", "xhigh"]);

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dateValue(value: unknown): number | string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

function parseCapabilities(value: unknown): ProviderModelCapabilities | undefined {
  const source = record(value);
  if (!Object.keys(source).length) return undefined;
  const efforts = Array.isArray(source.reasoningEfforts)
    ? source.reasoningEfforts.filter((effort): effort is ReasoningEffort => typeof effort === "string" && REASONING_EFFORTS.has(effort as ReasoningEffort))
    : undefined;
  const inputModalities = Array.isArray(source.inputModalities)
    ? source.inputModalities.filter((modality): modality is "text" | "image" => modality === "text" || modality === "image")
    : undefined;
  return {
    ...(typeof source.responsesStreaming === "boolean" ? { responsesStreaming: source.responsesStreaming } : {}),
    ...(typeof source.functionCalling === "boolean" ? { functionCalling: source.functionCalling } : {}),
    ...(typeof source.functionCallOutput === "boolean" ? { functionCallOutput: source.functionCallOutput } : {}),
    ...(efforts?.length ? { reasoningEfforts: efforts } : {}),
    ...(typeof source.imageInput === "boolean" ? { imageInput: source.imageInput } : {}),
    ...(inputModalities?.length ? { inputModalities } : {}),
  };
}

function normalizeStatus(value: unknown): ProviderInspectionStatus {
  const normalized = value === "transport-error" ? "transport_error" : textValue(value, "unknown");
  return INSPECTION_STATUSES.has(normalized as ProviderInspectionStatus) ? normalized as ProviderInspectionStatus : "unknown";
}

export function normalizeProviderModel(value: unknown): ProviderModel {
  const source = record(value);
  const rawInspection = record(source.inspection);
  const id = textValue(source.id, textValue(source.name));
  const capabilities = parseCapabilities(source.capabilities) ?? parseCapabilities(rawInspection.capabilities);
  const latencyMs = numberValue(source.latencyMs) ?? numberValue(rawInspection.latencyMs);
  const rawStatus = normalizeStatus(rawInspection.status ?? source.status);
  const status = rawStatus === "transport_error" && /timeout|timed out|超时/i.test(textValue(rawInspection.message)) ? "timeout" : rawStatus;
  const checkedAt = dateValue(rawInspection.checkedAt ?? source.lastInspectedAt);
  return {
    id,
    ...(textValue(source.displayName, textValue(source.name)) ? { name: textValue(source.displayName, textValue(source.name)) } : {}),
    ...(textValue(source.description) ? { description: textValue(source.description) } : {}),
    selectedForCodex: booleanValue(source.selectedForCodex),
    catalogStatus: source.catalogStatus === "missing" ? "missing" : "available",
    inspection: {
      status,
      history: Array.isArray(rawInspection.history) ? rawInspection.history.map((value) => {
        const entry = record(value);
        return { checkedAt: dateValue(entry.checkedAt) ?? 0, status: normalizeStatus(entry.status), message: textValue(entry.message), latencyMs: numberValue(entry.latencyMs) };
      }) : [],
      capabilitiesSource: rawInspection.capabilitiesSource === "last_successful" ? "last_successful" : "latest",
      ...(textValue(rawInspection.message, textValue(source.message)) ? { message: textValue(rawInspection.message, textValue(source.message)) } : {}),
      ...(checkedAt !== undefined ? { checkedAt } : {}),
      ...(latencyMs !== undefined ? { latencyMs } : {}),
      ...(capabilities ? { capabilities } : {}),
    },
    ...(capabilities ? { capabilities } : {}),
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(checkedAt !== undefined ? { lastInspectedAt: checkedAt } : {}),
  };
}

export function normalizeProvider(value: unknown, activeProviderId?: string): ApiProvider {
  const source = record(value);
  const rawModels = Array.isArray(source.models) ? source.models : [];
  const models = rawModels.map(normalizeProviderModel).filter((model) => model.id);
  const id = textValue(source.id);
  const job = record(source.inspectionJob);
  const modelSource: ProviderModelSource = source.modelSource === "manual" ? "manual" : "auto";
  return {
    id,
    name: textValue(source.name, id),
    baseUrl: textValue(source.baseUrl),
    connectionStatus: textValue(source.connectionStatus, textValue(source.status, "unknown")),
    ...(textValue(source.connectionMessage) ? { connectionMessage: textValue(source.connectionMessage) } : {}),
    modelSource,
    models,
    modelCount: numberValue(source.modelCount) ?? models.length,
    ...(dateValue(source.lastSyncedAt) !== undefined ? { lastSyncedAt: dateValue(source.lastSyncedAt) } : {}),
    activeForCodex: booleanValue(source.activeForCodex, Boolean(id && id === activeProviderId)),
    ...(textValue(source.defaultModelId) ? { defaultModelId: textValue(source.defaultModelId) } : {}),
    tokenConfigured: booleanValue(source.tokenConfigured),
    codexNeedsApply: booleanValue(source.codexNeedsApply),
    ...(["running", "completed", "failed"].includes(textValue(job.status)) ? { inspectionJob: {
      status: job.status as "running" | "completed" | "failed", total: numberValue(job.total) ?? 0,
      completed: numberValue(job.completed) ?? 0, error: textValue(job.error),
    } } : {}),
    ...(dateValue(source.createdAt) !== undefined ? { createdAt: dateValue(source.createdAt) } : {}),
    ...(dateValue(source.updatedAt) !== undefined ? { updatedAt: dateValue(source.updatedAt) } : {}),
  };
}

function unwrapPayload(value: unknown): UnknownRecord {
  const root = record(value);
  return Object.keys(record(root.data)).length ? record(root.data) : root;
}

function normalizeSnapshot(value: unknown): ProvidersSnapshot {
  const payload = unwrapPayload(value);
  const activeProviderId = textValue(payload.activeProviderId) || undefined;
  const rawProviders = Array.isArray(payload.providers)
    ? payload.providers
    : Array.isArray(value) ? value : [];
  const providers = rawProviders.map((provider) => normalizeProvider(provider, activeProviderId)).filter((provider) => provider.id);
  return { providers, activeProviderId: activeProviderId ?? providers.find((provider) => provider.activeForCodex)?.id };
}

function providerFromMutation(value: unknown): ApiProvider | null {
  const payload = unwrapPayload(value);
  const candidate = payload.provider ?? payload;
  const normalized = normalizeProvider(candidate);
  return normalized.id ? normalized : null;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

export async function listProviders(): Promise<ProvidersSnapshot> {
  return normalizeSnapshot(await fetchJson<unknown>(PROVIDERS_ENDPOINT));
}

export async function createProvider(draft: ProviderDraft): Promise<ApiProvider | null> {
  return providerFromMutation(await fetchJson<unknown>(PROVIDERS_ENDPOINT, jsonRequest("POST", draft)));
}

export async function updateProvider(providerId: string, draft: ProviderDraft): Promise<ApiProvider | null> {
  return providerFromMutation(await fetchJson<unknown>(`${PROVIDERS_ENDPOINT}/${encodeURIComponent(providerId)}`, jsonRequest("PUT", draft)));
}

export async function deleteProvider(providerId: string): Promise<void> {
  await fetchJson<unknown>(`${PROVIDERS_ENDPOINT}/${encodeURIComponent(providerId)}`, jsonRequest("DELETE"));
}

export async function syncProvider(providerId: string): Promise<ApiProvider | null> {
  return providerFromMutation(await fetchJson<unknown>(`${PROVIDERS_ENDPOINT}/${encodeURIComponent(providerId)}/sync`, jsonRequest("POST")));
}

export async function inspectProvider(providerId: string, modelIds?: string[]): Promise<ApiProvider | null> {
  return providerFromMutation(await fetchJson<unknown>(`${PROVIDERS_ENDPOINT}/${encodeURIComponent(providerId)}/inspect`, jsonRequest("POST", modelIds?.length ? { modelIds } : {})));
}

export async function activateProvider(providerId: string, modelIds: string[], defaultModelId: string): Promise<ApiProvider | null> {
  return providerFromMutation(await fetchJson<unknown>(`${PROVIDERS_ENDPOINT}/${encodeURIComponent(providerId)}/activate`, jsonRequest("POST", { modelIds, defaultModelId })));
}
