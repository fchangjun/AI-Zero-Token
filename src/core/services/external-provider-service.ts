import {
  discoverExternalProviderModels,
  inspectExternalProviderModels,
  normalizeOpenAICompatibleBaseUrl,
} from "../providers/openai-compatible/inspect.js";
import {
  getCodexGatewayProviderStatus,
  getCodexAuthStatus,
  getReusableCodexProviderBearerToken,
  ACTIVE_CODEX_PROVIDER_ID,
  withCodexProviderConfigLock,
} from "../store/codex-auth-store.js";
import { CodexProviderSwitch, hasPendingCodexSwitch, type ThirdPartySwitchTarget } from "./codex-provider-switch.js";
import type { CodexSwitchRuntime } from "./codex-switch-runtime.js";
import { listExternalProviderInspectionHistory } from "../store/external-provider-inspection-history.js";
import {
  commitExternalProviderActivation,
  commitExternalProviderDeactivation,
  hasImportedLegacyExternalProvider,
  createExternalProvider,
  deleteExternalProviderWithCodex,
  getExternalProvider,
  getExternalProviderWithSecret,
  getExternalProviderVersion,
  importLegacyExternalProvider,
  listExternalProviders,
  recordExternalProviderInspection,
  saveExternalProviderModels,
  updateExternalProvider,
  type ExternalProviderModelInput,
  type ExternalProviderModelSource,
  type PublicExternalProvider,
} from "../store/external-provider-store.js";

export type ExternalProviderDraft = {
  name: string;
  baseUrl: string;
  apiToken?: string;
  modelSource?: "auto" | "manual";
  manualModelIds?: string[];
};

export type ExternalProvidersSnapshot = {
  providers: PublicExternalProvider[];
  activeProviderId?: string;
};

const MAX_PROVIDER_INSPECTION_MODELS = 20;

function toStoredModelSource(value: "auto" | "manual" | undefined): ExternalProviderModelSource {
  return value === "manual" ? "manual" : "api";
}

function manualModels(ids: string[] | undefined): ExternalProviderModelInput[] {
  return (ids ?? []).map((id) => ({ id, source: "manual" }));
}

function codexProviderId(providerId: string): string {
  const compact = providerId.replace(/-/gu, "_").replace(/[^A-Za-z0-9_]/gu, "");
  return `azt_external_${compact || "provider"}`.slice(0, 120);
}

function serviceError(message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { statusCode });
}

// Keep each service consistent while allowing other services to remain usable.
const mutationQueues = new Map<string, Promise<unknown>>();
const inspectionJobs = new Map<string, NonNullable<PublicExternalProvider["inspectionJob"]>>();
function mutate<T>(operation: () => Promise<T>, key = "create"): Promise<T> {
  const next = (mutationQueues.get(key) ?? Promise.resolve()).then(operation);
  const settled = next.catch(() => undefined);
  mutationQueues.set(key, settled);
  void settled.then(() => { if (mutationQueues.get(key) === settled) mutationQueues.delete(key); });
  return next;
}

function validateDraft(draft: ExternalProviderDraft): void {
  if (!draft.name.trim() || /[\u0000-\u001f\u007f]/u.test(draft.name)) throw serviceError("请填写有效的服务名称。");
  normalizeOpenAICompatibleBaseUrl(draft.baseUrl);
  if (draft.apiToken && /[\r\n]/u.test(draft.apiToken)) throw serviceError("API Token 不能包含换行。");
  if (draft.modelSource === "manual" && !draft.manualModelIds?.length) throw serviceError("请至少填写一个模型 ID。");
  for (const id of draft.manualModelIds ?? []) {
    if (!id.trim() || id.trim().length > 256 || /[\u0000-\u001f\u007f]/u.test(id)) throw serviceError("模型 ID 格式错误。");
  }
}

function inspectionModelIds(
  provider: { models: Array<{ id: string }> },
  requestedModelIds?: string[],
): string[] {
  const modelIds = [...new Set((requestedModelIds?.length ? requestedModelIds : provider.models.map((model) => model.id))
    .map((id) => id.trim())
    .filter(Boolean))];
  if (!modelIds.length) throw serviceError("这个 API 服务还没有可检测的模型。");
  if (modelIds.length > MAX_PROVIDER_INSPECTION_MODELS) {
    throw serviceError(`单次最多检测 ${MAX_PROVIDER_INSPECTION_MODELS} 个模型，请先搜索或筛选后分批检测。`);
  }
  const known = new Set(provider.models.map((model) => model.id));
  const unknown = modelIds.find((id) => !known.has(id));
  if (unknown) throw serviceError(`API 服务中没有模型: ${unknown}`);
  return modelIds;
}

export class ExternalProviderService {
  private migrationPromise: Promise<void> | undefined;
  private switcher: CodexProviderSwitch;

  constructor(runtime?: CodexSwitchRuntime) { this.switcher = new CodexProviderSwitch(runtime); }

  private async migrateLegacyProviderOnce(): Promise<void> {
    if (!this.migrationPromise) {
      this.migrationPromise = (async () => {
        if (await hasImportedLegacyExternalProvider()) return;
        const [codex, inspections] = await Promise.all([
          getCodexAuthStatus(),
          listExternalProviderInspectionHistory(30),
        ]);
        const gatewayProvider = codex.gatewayProvider.active && codex.gatewayProvider.authType === "bearer_token" && codex.gatewayProvider.providerId !== "azt_gateway"
          ? codex.gatewayProvider
          : codex.savedExternalProvider?.authType === "bearer_token"
            ? codex.savedExternalProvider
            : undefined;
        const relevantInspections = gatewayProvider?.baseUrl
          ? inspections.filter((entry) => entry.baseUrl === gatewayProvider.baseUrl)
          : inspections;
        const token = gatewayProvider?.baseUrl
          ? await getReusableCodexProviderBearerToken({
              baseUrl: gatewayProvider.baseUrl,
              providerId: gatewayProvider.providerId,
            })
          : undefined;
        await importLegacyExternalProvider({
          gatewayProvider,
          inspections: relevantInspections,
          token,
          id: gatewayProvider?.providerId,
          name: "已保存的外部 API",
        });
      })().catch((error) => {
        this.migrationPromise = undefined;
        throw error;
      });
    }
    await this.migrationPromise;
  }

  async list(): Promise<ExternalProvidersSnapshot> {
    await this.migrateLegacyProviderOnce();
    const providers = await this.withActualCodexStatus(await listExternalProviders());
    return {
      providers,
      ...(providers.find((provider) => provider.activeForCodex)?.id
        ? { activeProviderId: providers.find((provider) => provider.activeForCodex)?.id }
        : {}),
    };
  }

  async get(providerId: string): Promise<PublicExternalProvider | undefined> {
    await this.migrateLegacyProviderOnce();
    const provider = await getExternalProvider(providerId);
    return provider ? (await this.withActualCodexStatus([provider]))[0] : undefined;
  }

  async create(draft: ExternalProviderDraft): Promise<PublicExternalProvider> {
    return mutate(async () => {
      await this.migrateLegacyProviderOnce();
      validateDraft(draft);
      if (!draft.apiToken?.trim()) throw serviceError("请填写 API Token。");
      const source = toStoredModelSource(draft.modelSource);
      const discovered = source === "api" ? await discoverExternalProviderModels({
        baseUrl: draft.baseUrl, bearerToken: draft.apiToken,
      }) : undefined;
      return createExternalProvider({
        name: draft.name,
        baseUrl: draft.baseUrl,
        token: draft.apiToken,
        modelSource: source,
        models: discovered?.models ?? manualModels(draft.manualModelIds),
        syncedAt: discovered ? Date.now() : undefined,
      });
    });
  }

  async update(providerId: string, draft: ExternalProviderDraft): Promise<PublicExternalProvider> {
    return mutate(async () => {
      await this.migrateLegacyProviderOnce();
      validateDraft(draft);
      const current = await this.requireSecret(providerId);
      const expectedProviderVersion = getExternalProviderVersion(current);
      const source = toStoredModelSource(draft.modelSource);
      const baseUrl = normalizeOpenAICompatibleBaseUrl(draft.baseUrl);
      const token = draft.apiToken?.trim() || current.token;
      const connectionChanged = current.baseUrl !== baseUrl || token !== current.token;
      const discovered = source === "api" && (connectionChanged || current.modelSource === "manual")
        ? await discoverExternalProviderModels({ baseUrl, bearerToken: token }) : undefined;
      // Validate/discover before committing, so a failed edit keeps the working connection.
      const provider = await updateExternalProvider(providerId, {
        name: draft.name, baseUrl, token, modelSource: source,
        models: source === "manual" ? manualModels(draft.manualModelIds) : discovered?.models,
        syncedAt: discovered ? Date.now() : undefined,
        retainMissing: source !== "manual" && current.baseUrl === baseUrl,
        resetInspections: connectionChanged,
        codexNeedsApply: current.codexNeedsApply || connectionChanged || source === "manual" || current.name !== draft.name.trim(),
        ...(source === "manual" ? { connectionStatus: "unknown" as const } : {}),
      }, { expectedProviderVersion });
      return (await this.withActualCodexStatus([provider]))[0];
    }, providerId);
  }

  async delete(providerId: string): Promise<boolean> {
    return mutate(async () => {
      await this.migrateLegacyProviderOnce();
      let wasActive = false;
      const deleted = await withCodexProviderConfigLock(async () => {
        return deleteExternalProviderWithCodex(providerId, async (provider) => {
          const actual = await getCodexGatewayProviderStatus();
          wasActive = provider.activeForCodex && actual.active
            && actual.providerId === (provider.codexProviderId ?? codexProviderId(provider.id));
          // Historical definitions remain resolvable. An inactive service never owns azt_active.
        }, {
          beforeMutation: () => this.switcher.recover(),
          commitTransaction: (content, commit) => wasActive ? this.switcher.commit(undefined, content, commit) : commit(),
        });
      }, true);
      if (deleted) {
        inspectionJobs.delete(providerId);
      }
      return deleted;
    }, providerId);
  }

  async sync(providerId: string): Promise<PublicExternalProvider> {
    return mutate(async () => {
      await this.migrateLegacyProviderOnce();
      const provider = await this.requireSecret(providerId);
      const expectedProviderVersion = getExternalProviderVersion(provider);
      try {
        const discovered = await discoverExternalProviderModels({
          baseUrl: provider.baseUrl,
          bearerToken: provider.token || undefined,
        });
        return saveExternalProviderModels(
          providerId,
          discovered.models.map((model) => ({ ...model, source: "api" })),
          { syncedAt: Date.now(), retainMissing: true },
          { expectedProviderVersion },
        );
      } catch (error) {
        await updateExternalProvider(providerId, {
          connectionStatus: "error",
          connectionMessage: error instanceof Error ? error.message : String(error),
        }, { expectedProviderVersion });
        throw error;
      }
    }, providerId);
  }

  async inspect(providerId: string, requestedModelIds?: string[]): Promise<PublicExternalProvider> {
    const plan = await mutate(async () => {
      await this.migrateLegacyProviderOnce();
      const provider = await this.requireSecret(providerId);
      return { provider, modelIds: inspectionModelIds(provider, requestedModelIds) };
    }, providerId);

    let result = await this.requirePublic(providerId);
    for (let offset = 0; offset < plan.modelIds.length; offset += 4) {
      const inspection = await inspectExternalProviderModels({
        baseUrl: plan.provider.baseUrl,
        bearerToken: plan.provider.token || undefined,
        providerId: plan.provider.id,
        tokenSource: plan.provider.token ? "stored" : "none",
        modelIds: plan.modelIds.slice(offset, offset + 4),
      });
      result = await mutate(async () => {
        const current = await this.requireSecret(providerId);
        if (current.baseUrl !== plan.provider.baseUrl || current.token !== plan.provider.token) {
          throw serviceError("检测期间服务地址或凭据已变更，请重新开始检测。", 409);
        }
        return recordExternalProviderInspection(
          providerId,
          inspection,
          { inspectedAt: Date.now() },
          { expectedConnection: { baseUrl: plan.provider.baseUrl, token: plan.provider.token } },
        );
      }, providerId);
      {
        const job = inspectionJobs.get(providerId);
        if (job?.status === "running") job.completed = Math.min(offset + 4, plan.modelIds.length);
      }
    }
    return result;
  }

  async startInspection(providerId: string, requestedModelIds?: string[]): Promise<PublicExternalProvider> {
    await this.migrateLegacyProviderOnce();
    const provider = await this.requirePublic(providerId);
    if (inspectionJobs.get(providerId)?.status === "running") throw serviceError("这个服务正在检测中。", 409);
    const modelIds = inspectionModelIds(provider, requestedModelIds);
    const job: NonNullable<PublicExternalProvider["inspectionJob"]> = { status: "running", total: modelIds.length, completed: 0 };
    inspectionJobs.set(providerId, job);
    void this.inspect(providerId, modelIds).then(() => { job.status = "completed"; }).catch((error) => {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    });
    return { ...provider, inspectionJob: { ...job } };
  }

  async activate(providerId: string, modelIds: string[], defaultModelId: string): Promise<PublicExternalProvider> {
    return mutate(async () => {
      await this.migrateLegacyProviderOnce();
      const ids = [...new Set(modelIds.map((id) => id.trim()))];
      if (!ids.includes(defaultModelId)) throw serviceError("默认模型必须包含在 Codex 显示模型中。");
      try {
        let target: ThirdPartySwitchTarget;
        return await withCodexProviderConfigLock(async () => {
          return commitExternalProviderActivation(providerId, ids, defaultModelId, async (activation) => {
            if (!activation.defaultModel) throw serviceError("请先选择第三方默认模型。");
            target = {
              baseUrl: activation.baseUrl,
              bearerToken: activation.bearerToken,
              model: activation.defaultModel, catalogModels: activation.catalogModels,
              displayName: activation.providerName,
            };
          }, {
            beforeMutation: () => this.switcher.recover(),
            commitTransaction: (content, commit) => this.switcher.commit(target, content, commit),
          });
        }, true);
      } catch (error) {
        if (error instanceof Error && error.message === `没有找到 API 服务: ${providerId}`) {
          throw serviceError(error.message, 404);
        }
        if (error instanceof Error && (
          error.message.startsWith("模型 ID ")
          || error.message.includes("中没有模型:")
          || error.message.includes("尚未配置 Token")
        )) {
          throw serviceError(error.message);
        }
        throw error;
      }
    }, providerId);
  }

  async deactivate(providerId: string): Promise<PublicExternalProvider> {
    return mutate(async () => {
      await this.migrateLegacyProviderOnce();
      try {
        return await withCodexProviderConfigLock(async () => {
          return commitExternalProviderDeactivation(providerId, async (provider) => {
            const actual = await getCodexGatewayProviderStatus();
            if (!actual.active || actual.providerId !== (provider.codexProviderId ?? codexProviderId(provider.id))) {
              throw serviceError(`API 服务 ${provider.name} 当前未接入 Codex。`, 409);
            }
          }, {
            beforeMutation: () => this.switcher.recover(),
            commitTransaction: (content, commit) => this.switcher.commit(undefined, content, commit),
          });
        }, true);
      } catch (error) {
        if (error instanceof Error && error.message === `没有找到 API 服务: ${providerId}`) {
          throw serviceError(error.message, 404);
        }
        if (error instanceof Error && error.message.endsWith("当前未接入 Codex。")) {
          throw serviceError(error.message, 409);
        }
        throw error;
      }
    }, providerId);
  }

  private async withActualCodexStatus(providers: PublicExternalProvider[]): Promise<PublicExternalProvider[]> {
    const actual = await getCodexGatewayProviderStatus();
    const pending = await hasPendingCodexSwitch();
    return providers.map((provider) => ({
      ...provider,
      inspectionJob: inspectionJobs.get(provider.id),
      codexNeedsApply: pending || provider.codexNeedsApply,
      activeForCodex: !pending && actual.active && actual.providerId === (provider.codexProviderId ?? codexProviderId(provider.id))
        && (actual.providerId !== ACTIVE_CODEX_PROVIDER_ID || provider.activeForCodex),
    }));
  }

  private async requirePublic(providerId: string): Promise<PublicExternalProvider> {
    const provider = await getExternalProvider(providerId);
    if (!provider) throw serviceError(`没有找到 API 服务: ${providerId}`, 404);
    return provider;
  }

  private async requireSecret(providerId: string) {
    const provider = await getExternalProviderWithSecret(providerId);
    if (!provider) throw serviceError(`没有找到 API 服务: ${providerId}`, 404);
    return provider;
  }
}
