import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ExternalProviderInspection,
  ExternalProviderModelProbe,
  ExternalProviderModelStatus,
  InputModality,
  ReasoningEffort,
} from "../providers/openai-compatible/inspect.js";
import { normalizeOpenAICompatibleBaseUrl } from "../providers/openai-compatible/inspect.js";
import type { CodexGatewayProviderStatus } from "./codex-auth-store.js";
import type { ExternalProviderInspectionHistoryEntry } from "./external-provider-inspection-history.js";
import { ensureStateMigrated, getStateDir } from "./state-paths.js";

const STORE_VERSION = 1 as const;
const STORE_FILE_NAME = "external-providers.json";
const MAX_MODEL_INSPECTION_HISTORY = 12;
const MAX_PROVIDER_INSPECTION_HISTORY = 30;
const STORE_MUTATION_LOCK_TIMEOUT_MS = 30_000;
const STORE_MUTATION_LOCK_STALE_MS = 120_000;
const STORE_MUTATION_TRANSITION = ".transition";

export type ExternalProviderModelSource = "api" | "manual";
export type ExternalProviderModelCatalogStatus = "available" | "missing";
export type ExternalProviderModelInspectionStatus = ExternalProviderModelStatus | "untested";

export type ExternalProviderModelCapabilities = {
  responsesStreaming: boolean;
  functionCalling: boolean;
  functionCallOutput: boolean;
  reasoningEfforts: ReasoningEffort[];
  inputModalities: InputModality[];
  imageInput: boolean;
};

export type ExternalProviderModelInspectionHistory = {
  checkedAt: number;
  status: ExternalProviderModelInspectionStatus;
  latencyMs?: number;
  statusCode?: number;
  message?: string;
  inspectionId?: string;
  capabilities?: ExternalProviderModelCapabilities;
};

export type ExternalProviderModelInspectionState = {
  status: ExternalProviderModelInspectionStatus;
  checkedAt?: number;
  lastSuccessfulAt?: number;
  lastFailureAt?: number;
  statusCode?: number;
  message?: string;
  inspectionId?: string;
  latestCapabilities?: ExternalProviderModelCapabilities;
  history: ExternalProviderModelInspectionHistory[];
};

export type ExternalProviderModel = {
  id: string;
  displayName?: string;
  contextWindow?: number;
  reasoningEfforts?: ReasoningEffort[];
  inputModalities?: InputModality[];
  source: ExternalProviderModelSource;
  catalogStatus: ExternalProviderModelCatalogStatus;
  selectedForCodex: boolean;
  inspection: ExternalProviderModelInspectionState;
  /** Last capabilities confirmed by a successful probe. Transient failures do not clear these. */
  capabilities?: ExternalProviderModelCapabilities;
  latencyMs?: number;
  lastConfirmedAt?: number;
  lastSeenAt?: number;
  missingSince?: number;
  createdAt: number;
  updatedAt: number;
};

export type ExternalProviderInspectionSummary = {
  inspectionId?: string;
  checkedAt: number;
  durationMs: number;
  discoveredCount: number;
  candidateCount: number;
  recommendedModel?: string;
  summary: Record<ExternalProviderModelStatus, number>;
};

export type ExternalProviderModelCatalogSource = "api" | "manual" | "mixed";

/** Internal record. Callers must not serialize it because it contains the bearer token. */
export type ExternalProviderRecord = {
  id: string;
  codexProviderId?: string;
  codexNeedsApply?: boolean;
  name: string;
  baseUrl: string;
  token: string;
  modelSource: ExternalProviderModelCatalogSource;
  models: ExternalProviderModel[];
  activeForCodex: boolean;
  defaultModelId?: string;
  createdAt: number;
  updatedAt: number;
  lastModelSyncAt?: number;
  connectionStatus?: "connected" | "error" | "unknown";
  connectionMessage?: string;
  lastInspectionAt?: number;
  inspectionHistory: ExternalProviderInspectionSummary[];
};

export type PublicExternalProviderModel = Omit<ExternalProviderModel, "inspection" | "capabilities"> & {
  capabilities?: Partial<ExternalProviderModelCapabilities>;
  inspection: Omit<ExternalProviderModelInspectionState, "status"> & {
    status: ExternalProviderModelStatus | "unknown";
    capabilities?: Partial<ExternalProviderModelCapabilities>;
    capabilitiesSource?: "latest" | "last_successful";
  };
};

export type PublicExternalProvider = Omit<ExternalProviderRecord, "token" | "modelSource" | "models"> & {
  inspectionJob?: { status: "running" | "completed" | "failed"; total: number; completed: number; error?: string };
  modelSource: "auto" | "manual";
  models: PublicExternalProviderModel[];
  tokenConfigured: boolean;
  modelCount: number;
  lastSyncedAt?: number;
};

export type ExternalProviderCodexCatalogModel = {
  id: string;
  displayName?: string;
  contextWindow?: number;
  reasoningEfforts?: ReasoningEffort[];
  inputModalities?: InputModality[];
};

/** Internal activation payload. bearerToken must never be returned by an HTTP route. */
export type ExternalProviderCodexActivation = {
  providerId: string;
  codexProviderId?: string;
  providerName: string;
  baseUrl: string;
  bearerToken: string;
  defaultModel?: string;
  catalogModels: ExternalProviderCodexCatalogModel[];
};

export type ExternalProviderModelInput = {
  id: string;
  displayName?: string;
  contextWindow?: number;
  reasoningEfforts?: ReasoningEffort[];
  inputModalities?: InputModality[];
  source?: ExternalProviderModelSource;
  selectedForCodex?: boolean;
};

export type CreateExternalProviderInput = {
  id?: string;
  name: string;
  baseUrl: string;
  token?: string;
  modelSource?: ExternalProviderModelCatalogSource;
  models?: ExternalProviderModelInput[];
  activeForCodex?: boolean;
  defaultModelId?: string;
  codexProviderId?: string;
  syncedAt?: number;
};

export type UpdateExternalProviderInput = {
  name?: string;
  baseUrl?: string;
  /** undefined preserves the token; null or an empty string removes it. */
  token?: string | null;
  modelSource?: ExternalProviderModelCatalogSource;
  connectionStatus?: ExternalProviderRecord["connectionStatus"];
  connectionMessage?: string | null;
  models?: ExternalProviderModelInput[];
  syncedAt?: number;
  retainMissing?: boolean;
  resetInspections?: boolean;
  codexNeedsApply?: boolean;
};

export type SaveExternalProviderModelsOptions = {
  syncedAt?: number;
  /** Missing models remain visible by default and are marked as missing. */
  retainMissing?: boolean;
};

export type RecordExternalProviderInspectionOptions = {
  inspectedAt?: number;
  /** Supply the complete /models result when available so every returned model is saved. */
  discoveredModels?: Array<string | ExternalProviderModelInput>;
  discoveryComplete?: boolean;
};

export type LegacyExternalProviderImportInput = {
  gatewayProvider?: CodexGatewayProviderStatus;
  inspections?: ExternalProviderInspectionHistoryEntry[];
  token?: string;
  name?: string;
  id?: string;
  importedAt?: number;
};

export type LegacyExternalProviderImportDraft = {
  provider: CreateExternalProviderInput;
  inspections: Array<{ inspection: ExternalProviderInspection; inspectedAt: number }>;
};

type ExternalProviderStore = {
  version: typeof STORE_VERSION;
  legacyImported?: boolean;
  activeProviderId?: string;
  providers: ExternalProviderRecord[];
};

export type ExternalProviderStoreOptions = {
  path?: string;
  /** Runs under the store lock, after validation and before the final atomic write. */
  commitTransaction?: (plannedContent: string, commit: () => Promise<void>) => Promise<void>;
  beforeMutation?: () => Promise<void>;
  /** Reject a delayed mutation if any part of the provider changed meanwhile. */
  expectedProviderVersion?: string;
  /** Reject delayed inspection results from an endpoint/token that is no longer current. */
  expectedConnection?: { baseUrl: string; token: string };
};

function emptyStore(): ExternalProviderStore {
  return { version: STORE_VERSION, providers: [] };
}

export function getExternalProviderStorePath(): string {
  return path.join(getStateDir(), STORE_FILE_NAME);
}

function cleanText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} 不能为空。`);
  }
  const result = value.trim();
  if (!result || result.length > maxLength || /[\u0000-\u001f\u007f]/u.test(result)) {
    throw new Error(`${field} 格式错误。`);
  }
  return result;
}

function cleanProviderId(value: string | undefined): string {
  const id = value?.trim() || randomUUID();
  if (id.length > 128 || !/^[A-Za-z0-9_-]+$/u.test(id)) {
    throw new Error("Provider ID 只能包含字母、数字、下划线和短横线。");
  }
  return id;
}

function cleanModelId(value: unknown): string {
  return cleanText(value, "模型 ID", 256);
}

function normalizeToken(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStringValues<T extends string>(value: readonly T[] | undefined): T[] | undefined {
  if (!value) return undefined;
  return [...new Set(value)];
}

function cloneCapabilities(
  value: ExternalProviderModelCapabilities | ExternalProviderModelProbe["capabilities"] | undefined,
): ExternalProviderModelCapabilities | undefined {
  if (!value) return undefined;
  return {
    responsesStreaming: value.responsesStreaming === true,
    functionCalling: value.functionCalling === true,
    functionCallOutput: value.functionCallOutput === true,
    reasoningEfforts: [...new Set(Array.isArray(value.reasoningEfforts) ? value.reasoningEfforts : [])],
    inputModalities: [...new Set<InputModality>(Array.isArray(value.inputModalities) ? value.inputModalities : ["text"])],
    imageInput: value.imageInput === true,
  };
}

function createModel(input: ExternalProviderModelInput, now: number): ExternalProviderModel {
  const id = cleanModelId(input.id);
  return {
    id,
    ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
    ...(typeof input.contextWindow === "number" && input.contextWindow > 0
      ? { contextWindow: Math.trunc(input.contextWindow) }
      : {}),
    ...(input.reasoningEfforts ? { reasoningEfforts: uniqueStringValues(input.reasoningEfforts) } : {}),
    ...(input.inputModalities ? { inputModalities: uniqueStringValues(input.inputModalities) } : {}),
    source: input.source ?? "api",
    catalogStatus: "available",
    selectedForCodex: input.selectedForCodex === true,
    inspection: { status: "untested", history: [] },
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeModelInput(
  existing: ExternalProviderModel | undefined,
  input: ExternalProviderModelInput,
  now: number,
): ExternalProviderModel {
  if (!existing) return createModel(input, now);
  return {
    ...existing,
    ...(input.displayName !== undefined
      ? input.displayName.trim()
        ? { displayName: input.displayName.trim() }
        : { displayName: undefined }
      : {}),
    ...(input.contextWindow !== undefined
      ? input.contextWindow > 0
        ? { contextWindow: Math.trunc(input.contextWindow) }
        : { contextWindow: undefined }
      : {}),
    ...(input.reasoningEfforts !== undefined
      ? { reasoningEfforts: uniqueStringValues(input.reasoningEfforts) }
      : {}),
    ...(input.inputModalities !== undefined
      ? { inputModalities: uniqueStringValues(input.inputModalities) }
      : {}),
    source: input.source ?? existing.source,
    catalogStatus: "available",
    selectedForCodex: input.selectedForCodex ?? existing.selectedForCodex,
    lastSeenAt: now,
    missingSince: undefined,
    updatedAt: now,
  };
}

function deriveModelSource(models: ExternalProviderModel[]): ExternalProviderModelCatalogSource {
  const sources = new Set(models.map((model) => model.source));
  if (sources.size > 1) return "mixed";
  return sources.has("manual") ? "manual" : "api";
}

function sanitizeProviderForPublic(provider: ExternalProviderRecord): PublicExternalProvider {
  const { token, ...safe } = provider;
  return {
    ...safe,
    modelSource: safe.modelSource === "api" || safe.modelSource === "mixed" ? "auto" : "manual",
    models: safe.models.map((model) => {
      const transient = ["busy", "unavailable", "transport_error", "auth_error"].includes(model.inspection.status);
      const previous = transient && Boolean(model.capabilities);
      const latest = model.inspection.latestCapabilities;
      const partial = latest && (latest.responsesStreaming || latest.functionCalling || latest.functionCallOutput || latest.imageInput);
      const capabilities = previous ? model.capabilities : transient ? partial && latest ? {
        ...(latest.responsesStreaming ? { responsesStreaming: true } : {}),
        ...(latest.functionCalling ? { functionCalling: true } : {}),
        ...(latest.functionCallOutput ? { functionCallOutput: true } : {}),
        ...(latest.imageInput ? { imageInput: true } : {}),
        reasoningEfforts: latest.reasoningEfforts,
        inputModalities: latest.inputModalities,
      } : undefined : latest ?? model.capabilities;
      return {
        ...model,
        capabilities,
        inspection: {
          ...model.inspection,
          status: model.inspection.status === "untested" ? "unknown" : model.inspection.status,
          capabilities,
          capabilitiesSource: previous ? "last_successful" as const : "latest" as const,
        },
      };
    }),
    tokenConfigured: Boolean(token),
    modelCount: safe.models.length,
    ...(safe.lastModelSyncAt !== undefined ? { lastSyncedAt: safe.lastModelSyncAt } : {}),
  };
}

export function toPublicExternalProvider(provider: ExternalProviderRecord): PublicExternalProvider {
  return sanitizeProviderForPublic(structuredClone(provider));
}

/** Opaque in-memory version used for optimistic checks around network work. */
export function getExternalProviderVersion(provider: ExternalProviderRecord): string {
  return createHash("sha256").update(JSON.stringify(provider)).digest("hex");
}

function assertProviderPrecondition(provider: ExternalProviderRecord, options?: ExternalProviderStoreOptions): void {
  const versionChanged = options?.expectedProviderVersion !== undefined
    && getExternalProviderVersion(provider) !== options.expectedProviderVersion;
  const connectionChanged = options?.expectedConnection !== undefined
    && (provider.baseUrl !== options.expectedConnection.baseUrl || provider.token !== options.expectedConnection.token);
  if (versionChanged || connectionChanged) {
    throw Object.assign(new Error("操作期间 API 服务已被另一个进程修改，请重试。"), {
      statusCode: 409,
      code: "external_provider_conflict",
    });
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT";
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function reclaimStaleStoreLock(lockPath: string): Promise<boolean> {
  let info: { token?: unknown; pid?: unknown; host?: unknown } | undefined;
  let ownerRaw = "";
  let age = 0;
  try {
    const [raw, stats] = await Promise.all([
      fs.readFile(path.join(lockPath, "owner.json"), "utf8").catch(() => ""),
      fs.stat(lockPath),
    ]);
    ownerRaw = raw;
    age = Date.now() - stats.mtimeMs;
    if (raw) {
      try { info = JSON.parse(raw) as typeof info; } catch { info = undefined; }
    }
  } catch (error) {
    if (isMissingFileError(error)) return true;
    return false;
  }

  const sameHost = info?.host === os.hostname();
  const pid = typeof info?.pid === "number" && Number.isSafeInteger(info.pid) && info.pid > 0 ? info.pid : undefined;
  const ownerAlive = sameHost && pid !== undefined && processIsAlive(pid);
  const ownerDead = sameHost && pid !== undefined && !ownerAlive;
  if (ownerAlive) return false;
  if (!ownerDead && age < STORE_MUTATION_LOCK_STALE_MS) return false;

  // Reclaim and release serialize through a claim stored inside the lock.
  // This prevents a second reclaimer from renaming a fresh replacement lock.
  const transitionPath = path.join(lockPath, STORE_MUTATION_TRANSITION);
  const transitionToken = randomUUID();
  try {
    await fs.writeFile(transitionPath, JSON.stringify({ token: transitionToken, ownerToken: info?.token }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (isMissingFileError(error)) return true;
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }

  const stalePath = `${lockPath}.stale-${randomUUID()}`;
  try {
    const currentOwnerRaw = await fs.readFile(path.join(lockPath, "owner.json"), "utf8").catch((error) => {
      if (isMissingFileError(error)) return "";
      throw error;
    });
    if (currentOwnerRaw !== ownerRaw) {
      const transition = JSON.parse(await fs.readFile(transitionPath, "utf8")) as { token?: unknown };
      if (transition.token === transitionToken) await fs.rm(transitionPath, { force: true });
      return false;
    }
    await fs.rename(lockPath, stalePath);
    await fs.rm(stalePath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return true;
    try {
      const transition = JSON.parse(await fs.readFile(transitionPath, "utf8")) as { token?: unknown };
      if (transition.token === transitionToken) await fs.rm(transitionPath, { force: true });
    } catch { /* The lock may already have been removed. */ }
    return false;
  }
}

async function acquireStoreMutationLock(storePath: string): Promise<() => Promise<void>> {
  const lockPath = `${storePath}.lock`;
  const token = randomUUID();
  const startedAt = Date.now();
  await fs.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });

  while (true) {
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      try {
        await fs.writeFile(path.join(lockPath, "owner.json"), JSON.stringify({
          token,
          pid: process.pid,
          host: os.hostname(),
          createdAt: Date.now(),
        }), { mode: 0o600 });
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      return async () => {
        const transitionPath = path.join(lockPath, STORE_MUTATION_TRANSITION);
        const transitionToken = randomUUID();
        const releaseStartedAt = Date.now();
        while (true) {
          try {
            await fs.writeFile(transitionPath, JSON.stringify({ token: transitionToken, ownerToken: token }), { flag: "wx", mode: 0o600 });
            const owner = JSON.parse(await fs.readFile(path.join(lockPath, "owner.json"), "utf8")) as { token?: unknown };
            if (owner.token === token) await fs.rm(lockPath, { recursive: true, force: true });
            else {
              const transition = JSON.parse(await fs.readFile(transitionPath, "utf8")) as { token?: unknown };
              if (transition.token === transitionToken) await fs.rm(transitionPath, { force: true });
            }
            return;
          } catch (error) {
            if (isMissingFileError(error)) return;
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            if (Date.now() - releaseStartedAt >= STORE_MUTATION_LOCK_TIMEOUT_MS) {
              throw new Error("外部 API 服务配置锁正在由另一个进程回收，请稍后重试。");
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await reclaimStaleStoreLock(lockPath)) continue;
      if (Date.now() - startedAt >= STORE_MUTATION_LOCK_TIMEOUT_MS) {
        throw new Error("外部 API 服务配置正在被另一个 AI Zero Token 进程修改，请稍后重试。");
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
}

function normalizeLoadedStore(parsed: unknown): ExternalProviderStore {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("外部 Provider 存储格式错误。");
  }
  const candidate = parsed as Partial<ExternalProviderStore>;
  if (candidate.version !== STORE_VERSION || !Array.isArray(candidate.providers)) {
    throw new Error("不支持的外部 Provider 存储版本。");
  }

  const providers = candidate.providers.map((provider) => ({
    ...provider,
    token: typeof provider.token === "string" ? provider.token : "",
    models: Array.isArray(provider.models) ? provider.models : [],
    inspectionHistory: Array.isArray(provider.inspectionHistory) ? provider.inspectionHistory : [],
  }));
  const activeProviderId = candidate.activeProviderId
    ?? providers.find((provider) => provider.activeForCodex)?.id;
  for (const provider of providers) {
    provider.activeForCodex = provider.id === activeProviderId;
  }
  return {
    version: STORE_VERSION,
    legacyImported: candidate.legacyImported === true,
    ...(activeProviderId && providers.some((provider) => provider.id === activeProviderId)
      ? { activeProviderId }
      : {}),
    providers,
  };
}

async function readStore(options?: ExternalProviderStoreOptions): Promise<ExternalProviderStore> {
  await ensureStateMigrated();
  const storePath = options?.path ?? getExternalProviderStorePath();
  try {
    return normalizeLoadedStore(JSON.parse(await fs.readFile(storePath, "utf8")) as unknown);
  } catch (error) {
    if (isMissingFileError(error)) return emptyStore();
    throw error;
  }
}

async function writeStore(store: ExternalProviderStore, options?: ExternalProviderStoreOptions): Promise<void> {
  await ensureStateMigrated();
  const storePath = options?.path ?? getExternalProviderStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.chmod(tempPath, 0o600);
    await fs.rename(tempPath, storePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

let mutationQueue = Promise.resolve();

async function mutateStore<T>(
  mutation: (store: ExternalProviderStore) => T | Promise<T>,
  options?: ExternalProviderStoreOptions,
): Promise<T> {
  let result!: T;
  const run = async () => {
    await ensureStateMigrated();
    const storePath = options?.path ?? getExternalProviderStorePath();
    const releaseLock = await acquireStoreMutationLock(storePath);
    try {
      if (options?.beforeMutation) await options.beforeMutation();
      else if (await fs.stat(path.join(getStateDir(), "codex-switch-state.json.pending")).then(() => true, (error) => {
        if (isMissingFileError(error)) return false;
        throw error;
      })) throw new Error("上次 Codex 切换尚未完成，请先重试接管或解除接管以恢复，再修改服务资料。");
      const store = await readStore(options);
      result = await mutation(store);
      const commit = () => writeStore(store, options);
      if (options?.commitTransaction) await options.commitTransaction(`${JSON.stringify(store, null, 2)}\n`, commit);
      else await commit();
    } finally {
      await releaseLock();
    }
  };
  const next = mutationQueue.then(run, run);
  mutationQueue = next.catch(() => undefined);
  await next;
  return result;
}

function requireProvider(store: ExternalProviderStore, providerId: string): ExternalProviderRecord {
  const provider = store.providers.find((item) => item.id === providerId);
  if (!provider) throw new Error(`没有找到 API 服务: ${providerId}`);
  return provider;
}

function requireModel(provider: ExternalProviderRecord, modelId: string): ExternalProviderModel {
  const model = provider.models.find((item) => item.id === modelId);
  if (!model) throw new Error(`API 服务 ${provider.name} 中没有模型: ${modelId}`);
  return model;
}

export async function listExternalProviders(options?: ExternalProviderStoreOptions): Promise<PublicExternalProvider[]> {
  return (await readStore(options)).providers.map(toPublicExternalProvider);
}

export async function hasImportedLegacyExternalProvider(): Promise<boolean> {
  return (await readStore()).legacyImported === true;
}

export async function listExternalProvidersWithSecrets(options?: ExternalProviderStoreOptions): Promise<ExternalProviderRecord[]> {
  return structuredClone((await readStore(options)).providers);
}

export async function getExternalProvider(
  providerId: string,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider | undefined> {
  const provider = (await readStore(options)).providers.find((item) => item.id === providerId);
  return provider ? toPublicExternalProvider(provider) : undefined;
}

export async function getExternalProviderWithSecret(
  providerId: string,
  options?: ExternalProviderStoreOptions,
): Promise<ExternalProviderRecord | undefined> {
  const provider = (await readStore(options)).providers.find((item) => item.id === providerId);
  return provider ? structuredClone(provider) : undefined;
}

export async function getActiveExternalProvider(
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider | undefined> {
  const store = await readStore(options);
  const provider = store.activeProviderId
    ? store.providers.find((item) => item.id === store.activeProviderId)
    : undefined;
  return provider ? toPublicExternalProvider(provider) : undefined;
}

export async function createExternalProvider(
  input: CreateExternalProviderInput,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore((store) => {
    const now = Date.now();
    const id = cleanProviderId(input.id);
    const name = cleanText(input.name, "API 服务名称", 120);
    const baseUrl = normalizeOpenAICompatibleBaseUrl(input.baseUrl);
    if (store.providers.some((provider) => provider.id === id)) {
      throw new Error(`API 服务 ID 已存在: ${id}`);
    }
    const modelInputs = input.models ?? [];
    const models = Array.from(
      new Map(modelInputs.map((model) => [cleanModelId(model.id), model])).values(),
      (model) => createModel(model, now),
    );
    const defaultModelId = input.defaultModelId?.trim();
    if (defaultModelId && !models.some((model) => model.id === defaultModelId)) {
      throw new Error(`默认模型不在模型目录中: ${defaultModelId}`);
    }
    if (defaultModelId) {
      const model = models.find((item) => item.id === defaultModelId);
      if (model) model.selectedForCodex = true;
    }
    const provider: ExternalProviderRecord = {
      id,
      codexProviderId: input.codexProviderId,
      name,
      baseUrl,
      token: normalizeToken(input.token),
      modelSource: input.modelSource ?? deriveModelSource(models),
      models,
      activeForCodex: input.activeForCodex === true,
      ...(defaultModelId ? { defaultModelId } : {}),
      createdAt: now,
      updatedAt: now,
      inspectionHistory: [],
      ...(input.syncedAt ? { lastModelSyncAt: input.syncedAt, connectionStatus: "connected" as const } : {}),
    };
    if (provider.activeForCodex) {
      for (const current of store.providers) current.activeForCodex = false;
      store.activeProviderId = provider.id;
    }
    store.providers.push(provider);
    return toPublicExternalProvider(provider);
  }, options);
}

export async function updateExternalProvider(
  providerId: string,
  patch: UpdateExternalProviderInput,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore((store) => {
    const provider = requireProvider(store, providerId);
    assertProviderPrecondition(provider, options);
    if (patch.name !== undefined) provider.name = cleanText(patch.name, "API 服务名称", 120);
    if (patch.baseUrl !== undefined) {
      const baseUrl = normalizeOpenAICompatibleBaseUrl(patch.baseUrl);
      provider.baseUrl = baseUrl;
    }
    if (patch.token !== undefined) provider.token = normalizeToken(patch.token);
    if (patch.modelSource !== undefined) provider.modelSource = patch.modelSource;
    if (patch.resetInspections) {
      for (const model of provider.models) {
        model.inspection = { status: "untested", history: [] };
        delete model.capabilities;
        delete model.reasoningEfforts;
        delete model.inputModalities;
        delete model.latencyMs;
        delete model.lastConfirmedAt;
      }
      provider.inspectionHistory = [];
      delete provider.lastInspectionAt;
      delete provider.connectionMessage;
      provider.connectionStatus = "unknown";
    }
    if (patch.models) applyModelCatalog(provider, patch.models, { syncedAt: patch.syncedAt, retainMissing: patch.retainMissing });
    if (patch.codexNeedsApply !== undefined) provider.codexNeedsApply = patch.codexNeedsApply;
    if (patch.connectionStatus !== undefined) provider.connectionStatus = patch.connectionStatus;
    if (patch.connectionMessage !== undefined) {
      provider.connectionMessage = patch.connectionMessage?.trim() || undefined;
    }
    provider.updatedAt = Date.now();
    return toPublicExternalProvider(provider);
  }, options);
}

export async function deleteExternalProvider(providerId: string, options?: ExternalProviderStoreOptions): Promise<boolean> {
  return mutateStore((store) => {
    const index = store.providers.findIndex((provider) => provider.id === providerId);
    if (index < 0) return false;
    store.providers.splice(index, 1);
    if (store.activeProviderId === providerId) delete store.activeProviderId;
    return true;
  }, options);
}

export async function activateExternalProviderForCodex(
  providerId: string | null,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider | null> {
  return mutateStore((store) => {
    const target = providerId === null ? undefined : requireProvider(store, providerId);
    for (const provider of store.providers) provider.activeForCodex = provider.id === target?.id;
    if (target) {
      store.activeProviderId = target.id;
      target.updatedAt = Date.now();
      return toPublicExternalProvider(target);
    }
    delete store.activeProviderId;
    return null;
  }, options);
}

/**
 * Apply and commit one activation from the same locked provider snapshot.
 * The callback normally writes Codex config while its outer transaction is
 * still open, so a failed store commit can roll that config change back.
 */
export async function commitExternalProviderActivation(
  providerId: string,
  modelIds: string[],
  defaultModelId: string,
  applyActivation?: (activation: ExternalProviderCodexActivation) => Promise<void>,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore(async (store) => {
    const provider = requireProvider(store, providerId);
    const ids = new Set(modelIds.map(cleanModelId));
    for (const id of ids) requireModel(provider, id);
    const normalizedDefaultModelId = cleanModelId(defaultModelId);
    if (!ids.has(normalizedDefaultModelId)) throw new Error("默认模型必须包含在 Codex 显示模型中。");
    if (!provider.token) throw new Error(`API 服务 ${provider.name} 尚未配置 Token。`);
    for (const model of provider.models) model.selectedForCodex = ids.has(model.id);
    provider.defaultModelId = normalizedDefaultModelId;
    const activation = buildExternalProviderActivation(provider);
    await applyActivation?.(activation);
    if (options?.commitTransaction) provider.codexProviderId = "azt_active";
    for (const item of store.providers) item.activeForCodex = item.id === providerId;
    provider.codexNeedsApply = false;
    provider.updatedAt = Date.now();
    store.activeProviderId = providerId;
    return toPublicExternalProvider(provider);
  }, options);
}

/** Remove one active provider from Codex while preserving its saved service and model selection. */
export async function commitExternalProviderDeactivation(
  providerId: string,
  removeFromCodex: (provider: ExternalProviderRecord) => Promise<void>,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore(async (store) => {
    const provider = requireProvider(store, providerId);
    if (store.activeProviderId !== providerId || !provider.activeForCodex) {
      throw new Error(`API 服务 ${provider.name} 当前未接入 Codex。`);
    }
    await removeFromCodex(structuredClone(provider));
    provider.activeForCodex = false;
    provider.codexNeedsApply = false;
    provider.updatedAt = Date.now();
    delete store.activeProviderId;
    return toPublicExternalProvider(provider);
  }, options);
}

/** Delete from Codex and the provider store from one current locked snapshot. */
export async function deleteExternalProviderWithCodex(
  providerId: string,
  removeFromCodex: (provider: ExternalProviderRecord) => Promise<void>,
  options?: ExternalProviderStoreOptions,
): Promise<boolean> {
  return mutateStore(async (store) => {
    const index = store.providers.findIndex((provider) => provider.id === providerId);
    if (index < 0) return false;
    const provider = store.providers[index]!;
    await removeFromCodex(structuredClone(provider));
    store.providers.splice(index, 1);
    if (store.activeProviderId === providerId) delete store.activeProviderId;
    return true;
  }, options);
}

export async function saveExternalProviderModels(
  providerId: string,
  inputs: ExternalProviderModelInput[],
  saveOptions?: SaveExternalProviderModelsOptions,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore((store) => {
    const provider = requireProvider(store, providerId);
    assertProviderPrecondition(provider, options);
    applyModelCatalog(provider, inputs, saveOptions);
    return toPublicExternalProvider(provider);
  }, options);
}

function applyModelCatalog(
  provider: ExternalProviderRecord,
  inputs: ExternalProviderModelInput[],
  saveOptions?: SaveExternalProviderModelsOptions,
): void {
  const syncedAt = saveOptions?.syncedAt ?? Date.now();
  const retainMissing = saveOptions?.retainMissing ?? true;
  const existingById = new Map(provider.models.map((model) => [model.id, model]));
  const uniqueInputs = Array.from(
    new Map(inputs.map((input) => [cleanModelId(input.id), input])).values(),
  );
  const seenIds = new Set(uniqueInputs.map((input) => cleanModelId(input.id)));
  const models = uniqueInputs.map((input) => mergeModelInput(
    existingById.get(input.id.trim()),
    { ...input, source: input.source ?? "api" },
    syncedAt,
  ));
  if (retainMissing) {
    for (const existing of provider.models) {
      if (seenIds.has(existing.id)) continue;
      if (existing.source === "manual") {
        models.push(existing);
        continue;
      }
      models.push({
        ...existing,
        catalogStatus: "missing",
        missingSince: existing.missingSince ?? syncedAt,
        updatedAt: syncedAt,
      });
    }
  }
  provider.models = models;
  if (provider.defaultModelId && !models.some((model) => model.id === provider.defaultModelId)) {
    delete provider.defaultModelId;
  }
  provider.modelSource = deriveModelSource(models);
  provider.lastModelSyncAt = syncedAt;
  provider.connectionStatus = "connected";
  provider.connectionMessage = undefined;
  provider.updatedAt = syncedAt;
}

export async function addManualExternalProviderModel(
  providerId: string,
  input: Omit<ExternalProviderModelInput, "source">,
  options?: ExternalProviderStoreOptions,
): Promise<ExternalProviderModel> {
  return mutateStore((store) => {
    const provider = requireProvider(store, providerId);
    const now = Date.now();
    const id = cleanModelId(input.id);
    const index = provider.models.findIndex((model) => model.id === id);
    const model = mergeModelInput(index >= 0 ? provider.models[index] : undefined, { ...input, source: "manual" }, now);
    if (index >= 0) provider.models[index] = model;
    else provider.models.push(model);
    provider.modelSource = deriveModelSource(provider.models);
    provider.updatedAt = now;
    return structuredClone(model);
  }, options);
}

export async function removeExternalProviderModel(
  providerId: string,
  modelId: string,
  options?: ExternalProviderStoreOptions,
): Promise<boolean> {
  return mutateStore((store) => {
    const provider = requireProvider(store, providerId);
    const index = provider.models.findIndex((model) => model.id === modelId);
    if (index < 0) return false;
    provider.models.splice(index, 1);
    if (provider.defaultModelId === modelId) delete provider.defaultModelId;
    provider.modelSource = deriveModelSource(provider.models);
    provider.updatedAt = Date.now();
    return true;
  }, options);
}

export async function setExternalProviderModelSelection(
  providerId: string,
  selectedModelIds: string[],
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore((store) => {
    const provider = requireProvider(store, providerId);
    const selected = new Set(selectedModelIds.map(cleanModelId));
    for (const modelId of selected) requireModel(provider, modelId);
    const now = Date.now();
    for (const model of provider.models) {
      const nextSelected = selected.has(model.id);
      if (model.selectedForCodex !== nextSelected) {
        model.selectedForCodex = nextSelected;
        model.updatedAt = now;
      }
    }
    if (provider.defaultModelId && !selected.has(provider.defaultModelId)) {
      delete provider.defaultModelId;
    }
    provider.updatedAt = now;
    return toPublicExternalProvider(provider);
  }, options);
}

export async function setExternalProviderDefaultModel(
  providerId: string,
  modelId: string | null,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore((store) => {
    const provider = requireProvider(store, providerId);
    const now = Date.now();
    if (modelId === null) {
      delete provider.defaultModelId;
    } else {
      const model = requireModel(provider, cleanModelId(modelId));
      model.selectedForCodex = true;
      model.updatedAt = now;
      provider.defaultModelId = model.id;
    }
    provider.updatedAt = now;
    return toPublicExternalProvider(provider);
  }, options);
}

function updateModelFromProbe(
  model: ExternalProviderModel,
  probe: ExternalProviderModelProbe,
  checkedAt: number,
  inspectionId?: string,
): void {
  const capabilities = cloneCapabilities(probe.capabilities);
  const historyEntry: ExternalProviderModelInspectionHistory = {
    checkedAt,
    status: probe.status,
    latencyMs: probe.latencyMs,
    ...(probe.statusCode !== undefined ? { statusCode: probe.statusCode } : {}),
    ...(probe.error || probe.message ? { message: probe.error ?? probe.message } : {}),
    ...(inspectionId ? { inspectionId } : {}),
    ...(capabilities ? { capabilities } : {}),
  };
  model.inspection = {
    status: probe.status,
    checkedAt,
    ...(probe.status === "ready"
      ? { lastSuccessfulAt: checkedAt }
      : { lastFailureAt: checkedAt }),
    ...(model.inspection.lastSuccessfulAt && probe.status !== "ready"
      ? { lastSuccessfulAt: model.inspection.lastSuccessfulAt }
      : {}),
    ...(model.inspection.lastFailureAt && probe.status === "ready"
      ? { lastFailureAt: model.inspection.lastFailureAt }
      : {}),
    ...(probe.statusCode !== undefined ? { statusCode: probe.statusCode } : {}),
    ...(probe.error || probe.message ? { message: probe.error ?? probe.message } : {}),
    ...(inspectionId ? { inspectionId } : {}),
    ...(capabilities ? { latestCapabilities: capabilities } : {}),
    history: [historyEntry, ...model.inspection.history].slice(0, MAX_MODEL_INSPECTION_HISTORY),
  };
  model.latencyMs = probe.latencyMs;
  if (probe.status === "ready" && capabilities) {
    model.capabilities = capabilities;
    model.lastConfirmedAt = checkedAt;
  } else if (probe.status === "incompatible") {
    delete model.capabilities;
    delete model.lastConfirmedAt;
    delete model.reasoningEfforts;
    delete model.inputModalities;
  }
  model.updatedAt = checkedAt;
}

function inspectionDiscoveredModels(inspection: ExternalProviderInspection): ExternalProviderModelInput[] {
  const dynamic = inspection as ExternalProviderInspection & {
    discoveredModels?: Array<string | { id?: unknown; displayName?: unknown }>;
    modelIds?: string[];
  };
  const values = dynamic.discoveredModels ?? dynamic.modelIds;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value): ExternalProviderModelInput[] => {
    if (typeof value === "string") return [{ id: value, source: "api" }];
    if (!value || typeof value !== "object" || typeof value.id !== "string") return [];
    return [{
      id: value.id,
      ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}),
      source: "api",
    }];
  });
}

function applyInspectionToProvider(
  provider: ExternalProviderRecord,
  inspection: ExternalProviderInspection,
  checkedAt: number,
  discoveredModels?: Array<string | ExternalProviderModelInput>,
  discoveryComplete = false,
): void {
  const explicitDiscovered = discoveredModels?.map((value) =>
    typeof value === "string" ? { id: value, source: "api" as const } : value);
  const discovered = explicitDiscovered?.length
    ? explicitDiscovered
    : inspectionDiscoveredModels(inspection);
  const probes = inspection.models?.length ? inspection.models : inspection.results;
  const catalogInputs = [
    ...discovered,
    ...probes.map((probe) => ({ id: probe.id, source: "api" as const })),
    ...inspection.filteredModels.map((model) => ({ id: model.id, source: "api" as const })),
  ];
  const existingById = new Map(provider.models.map((model) => [model.id, model]));
  for (const input of catalogInputs) {
    const id = cleanModelId(input.id);
    const existing = existingById.get(id);
    // A capability probe does not prove that a model is still in /models,
    // and must not change manually entered models into API-discovered models.
    const next = existing ?? createModel(input, checkedAt);
    if (discoveryComplete && existing) Object.assign(next, mergeModelInput(existing, input, checkedAt));
    if (!existingById.has(id)) provider.models.push(next);
    else provider.models[provider.models.findIndex((model) => model.id === id)] = next;
    existingById.set(id, next);
  }
  if (discovered.length > 0 && discoveryComplete) {
    const discoveredIds = new Set(discovered.map((model) => cleanModelId(model.id)));
    for (const model of provider.models) {
      if (model.source !== "api" || discoveredIds.has(model.id)) continue;
      model.catalogStatus = "missing";
      model.missingSince ??= checkedAt;
      model.updatedAt = checkedAt;
    }
  }
  for (const probe of probes) {
    const model = requireModel(provider, probe.id);
    updateModelFromProbe(model, probe, checkedAt, inspection.inspectionId);
    if (probe.status === "ready" && probe.capabilities) {
      model.reasoningEfforts = Array.isArray(probe.capabilities.reasoningEfforts)
        ? [...probe.capabilities.reasoningEfforts]
        : [];
      model.inputModalities = Array.isArray(probe.capabilities.inputModalities)
        ? [...probe.capabilities.inputModalities]
        : ["text"];
    }
  }
  for (const filtered of inspection.filteredModels) {
    const model = requireModel(provider, filtered.id);
    const probe: ExternalProviderModelProbe = {
      id: model.id,
      status: "incompatible",
      latencyMs: 0,
      message: "该模型不是文本模型，未执行 Codex 能力检测。",
      capabilities: {
        responsesStreaming: false,
        functionCalling: false,
        functionCallOutput: false,
        reasoningEfforts: [],
        inputModalities: [],
        imageInput: false,
      },
    };
    updateModelFromProbe(model, probe, checkedAt, inspection.inspectionId);
  }
  provider.modelSource = deriveModelSource(provider.models);
  provider.lastInspectionAt = checkedAt;
  provider.updatedAt = checkedAt;
  provider.inspectionHistory = [{
    ...(inspection.inspectionId ? { inspectionId: inspection.inspectionId } : {}),
    checkedAt,
    durationMs: inspection.durationMs,
    discoveredCount: inspection.discoveredCount,
    candidateCount: inspection.candidateCount,
    ...(inspection.recommendedModel ? { recommendedModel: inspection.recommendedModel } : {}),
    summary: { ...inspection.summary },
  }, ...provider.inspectionHistory].slice(0, MAX_PROVIDER_INSPECTION_HISTORY);
  const reachable = probes.some((probe) => !["transport_error", "auth_error"].includes(probe.status));
  provider.connectionStatus = reachable ? "connected" : "error";
  provider.connectionMessage = reachable
    ? undefined
    : probes[0]?.error ?? probes[0]?.message;
}

export async function recordExternalProviderInspection(
  providerId: string,
  inspection: ExternalProviderInspection,
  recordOptions?: RecordExternalProviderInspectionOptions,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider> {
  return mutateStore((store) => {
    const provider = requireProvider(store, providerId);
    assertProviderPrecondition(provider, options);
    applyInspectionToProvider(
      provider,
      inspection,
      recordOptions?.inspectedAt ?? Date.now(),
      recordOptions?.discoveredModels,
      recordOptions?.discoveryComplete,
    );
    return toPublicExternalProvider(provider);
  }, options);
}

function normalizedBaseUrlOrUndefined(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return normalizeOpenAICompatibleBaseUrl(value);
  } catch {
    return undefined;
  }
}

export function buildLegacyExternalProviderImport(
  input: LegacyExternalProviderImportInput,
): LegacyExternalProviderImportDraft | undefined {
  const importedAt = input.importedAt ?? Date.now();
  const inspections = [...(input.inspections ?? [])].sort((left, right) => left.createdAt - right.createdAt);
  const gatewayBaseUrl = normalizedBaseUrlOrUndefined(input.gatewayProvider?.baseUrl);
  const latestInspection = [...inspections].reverse().find((entry) =>
    !gatewayBaseUrl || normalizedBaseUrlOrUndefined(entry.baseUrl) === gatewayBaseUrl);
  const baseUrl = gatewayBaseUrl ?? normalizedBaseUrlOrUndefined(latestInspection?.baseUrl);
  if (!baseUrl) return undefined;
  const relevantInspections = inspections.filter((entry) =>
    normalizedBaseUrlOrUndefined(entry.baseUrl) === baseUrl);
  // Root model/catalog belong to the currently active provider. An inactive
  // saved provider must recover its own selection from inspection history.
  const catalogModels = input.gatewayProvider?.active ? input.gatewayProvider.catalogModels ?? [] : [];
  const defaultModelId = input.gatewayProvider?.active ? input.gatewayProvider.model : latestInspection?.configuredModelId;
  const selectedIds = new Set([
    ...catalogModels.map((model) => model.id),
    ...(latestInspection?.writtenCatalogModelIds ?? latestInspection?.submittedCatalogModelIds ?? []),
    ...(latestInspection?.configuredModelId ? [latestInspection.configuredModelId] : []),
    ...(defaultModelId ? [defaultModelId] : []),
  ]);
  const discoveredIds = relevantInspections.flatMap((entry) => [
    ...entry.inspection.models.map((model) => model.id),
    ...entry.inspection.filteredModels.map((model) => model.id),
  ]);
  const models = Array.from(new Set([...selectedIds, ...discoveredIds])).map((id) => {
    const catalog = catalogModels.find((model) => model.id === id);
    return {
      id,
      ...(catalog?.displayName ? { displayName: catalog.displayName } : {}),
      ...(catalog?.contextWindow ? { contextWindow: catalog.contextWindow } : {}),
      ...(catalog?.reasoningEfforts ? { reasoningEfforts: catalog.reasoningEfforts } : {}),
      ...(catalog?.inputModalities ? { inputModalities: catalog.inputModalities } : {}),
      source: "api" as const,
      selectedForCodex: selectedIds.has(id),
    };
  });
  return {
    provider: {
      id: input.id ?? input.gatewayProvider?.providerId,
      codexProviderId: input.gatewayProvider?.providerId,
      name: input.name?.trim() || "已导入的外部 API",
      baseUrl,
      token: input.token,
      modelSource: "api",
      models,
      activeForCodex: input.gatewayProvider?.active === true,
      defaultModelId,
    },
    inspections: relevantInspections.map((entry) => ({
      inspection: entry.inspection,
      inspectedAt: entry.createdAt || importedAt,
    })),
  };
}

export async function importLegacyExternalProvider(
  input: LegacyExternalProviderImportInput,
  options?: ExternalProviderStoreOptions,
): Promise<PublicExternalProvider | undefined> {
  const draft = buildLegacyExternalProviderImport(input);
  return mutateStore((store) => {
    if (store.legacyImported) return undefined;
    store.legacyImported = true;
    if (!draft) return undefined;
    const now = input.importedAt ?? Date.now();
    const baseUrl = normalizeOpenAICompatibleBaseUrl(draft.provider.baseUrl);
    let provider = store.providers.find((item) => item.baseUrl === baseUrl);
    if (!provider) {
      const models = (draft.provider.models ?? []).map((model) => createModel(model, now));
      provider = {
        id: cleanProviderId(draft.provider.id),
        codexProviderId: draft.provider.codexProviderId,
        name: cleanText(draft.provider.name, "API 服务名称", 120),
        baseUrl,
        token: normalizeToken(draft.provider.token),
        modelSource: draft.provider.modelSource ?? deriveModelSource(models),
        models,
        activeForCodex: draft.provider.activeForCodex === true,
        ...(draft.provider.defaultModelId ? { defaultModelId: draft.provider.defaultModelId } : {}),
        createdAt: now,
        updatedAt: now,
        inspectionHistory: [],
      };
      store.providers.push(provider);
    } else {
      if (draft.provider.token) provider.token = normalizeToken(draft.provider.token);
      const existingById = new Map(provider.models.map((model) => [model.id, model]));
      for (const modelInput of draft.provider.models ?? []) {
        const model = mergeModelInput(existingById.get(modelInput.id), modelInput, now);
        if (existingById.has(model.id)) {
          provider.models[provider.models.findIndex((item) => item.id === model.id)] = model;
        } else {
          provider.models.push(model);
        }
        existingById.set(model.id, model);
      }
      provider.updatedAt = now;
    }
    for (const entry of draft.inspections) {
      applyInspectionToProvider(provider, entry.inspection, entry.inspectedAt, undefined, false);
    }
    if (draft.provider.defaultModelId && provider.models.some((model) => model.id === draft.provider.defaultModelId)) {
      provider.defaultModelId = draft.provider.defaultModelId;
      requireModel(provider, draft.provider.defaultModelId).selectedForCodex = true;
    }
    if (draft.provider.activeForCodex) {
      for (const current of store.providers) current.activeForCodex = current.id === provider.id;
      store.activeProviderId = provider.id;
    }
    return toPublicExternalProvider(provider);
  }, options);
}

/** Build the exact config input needed to activate one service in Codex. */
export async function getExternalProviderCodexActivation(
  providerId: string,
  options?: ExternalProviderStoreOptions,
): Promise<ExternalProviderCodexActivation> {
  const provider = await getExternalProviderWithSecret(providerId, options);
  if (!provider) throw new Error(`没有找到 API 服务: ${providerId}`);
  return buildExternalProviderActivation(provider);
}

export function buildExternalProviderActivation(provider: ExternalProviderRecord): ExternalProviderCodexActivation {
  if (!provider.token) throw new Error(`API 服务 ${provider.name} 尚未配置 Token。`);
  const selectedModels = provider.models.filter((model) => model.selectedForCodex);
  if (selectedModels.length === 0) throw new Error(`API 服务 ${provider.name} 尚未选择 Codex 模型。`);
  const defaultModel = provider.defaultModelId && selectedModels.some((model) => model.id === provider.defaultModelId)
    ? provider.defaultModelId
    : selectedModels[0]?.id;
  return {
    providerId: provider.id,
    ...(provider.codexProviderId ? { codexProviderId: provider.codexProviderId } : {}),
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    bearerToken: provider.token,
    ...(defaultModel ? { defaultModel } : {}),
    catalogModels: selectedModels.map((model) => ({
      id: model.id,
      ...(model.displayName ? { displayName: model.displayName } : {}),
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
      ...(model.capabilities?.reasoningEfforts.length
        ? { reasoningEfforts: [...model.capabilities.reasoningEfforts] }
        : model.reasoningEfforts?.length
          ? { reasoningEfforts: [...model.reasoningEfforts] }
          : {}),
      ...(model.capabilities?.inputModalities.length
        ? { inputModalities: [...model.capabilities.inputModalities] }
        : model.inputModalities?.length
          ? { inputModalities: [...model.inputModalities] }
          : {}),
    })),
  };
}
