import { anthropicReasoningCatalog } from "../providers/mixed/anthropic-options.js";
import { availabilityDisplayName, modelHealthProtocol, resolveModelAvailability, type ModelHealthInterval } from "../models/model-availability.js";
import { checkModelHealth, type ModelHealthTarget } from "../providers/openai-compatible/health.js";
import { buildCodexModelCatalog, formatCodexModelDisplayName, serializeRemoteModelCatalog, type CodexCatalogModelInput } from "../store/codex-auth-store.js";
import { buildExternalProviderActivation, readModelStatusState, recordModelHealth, resolveMixedRoute, setModelHealthInterval, type ExternalProviderModel, type ExternalProviderRecord } from "../store/external-provider-store.js";
import { gatewayKeyMatches } from "./gateway-access-service.js";
import { hasPendingCodexSwitch } from "./codex-provider-switch.js";

export const MODEL_CATALOG_PATH = "/_gateway/codex/model-catalog/";
export const modelCatalogUrl = (port: number, source: string) => `http://127.0.0.1:${port}${MODEL_CATALOG_PATH}${encodeURIComponent(source)}`;

type Target = ModelHealthTarget & { providerId: string; model: ExternalProviderModel };
type HealthJob = { running: boolean; total: number; completed: number; finishedAt?: number; error?: string };

function healthTargets({ providers, mixed }: Awaited<ReturnType<typeof readModelStatusState>>): Target[] {
  return providers.flatMap((provider) => provider.models.map((model) => ({
    providerId: provider.id, modelId: model.id, baseUrl: provider.baseUrl, token: provider.token, model,
    protocol: modelHealthProtocol(model, {
      directActive: provider.activeForCodex, mixedActive: mixed?.active,
      route: mixed?.routes.find((route) => route.providerId === provider.id && route.modelId === model.id),
    }),
  })));
}

function catalogModel(provider: ExternalProviderRecord, model: ExternalProviderModel): CodexCatalogModelInput {
  return buildExternalProviderActivation({ ...provider, defaultModelId: model.id, models: [{ ...model, selectedForCodex: true }] }).catalogModels[0]!;
}

/** Reads only saved state. Fetching the catalog must never create billable requests. */
export async function getModelStatusCatalog(source: string, authorization: string | undefined): Promise<string> {
  if (await hasPendingCodexSwitch()) throw Object.assign(new Error("Codex 接入切换尚未完成。"), { statusCode: 503 });
  const state = await readModelStatusState();
  const provider = state.providers.find((item) => item.id === source && item.activeForCodex);
  const mixed = source === "mixed" && state.mixed?.active ? state.mixed : undefined;
  if ((!provider && !mixed) || !gatewayKeyMatches(provider?.token ?? mixed!.apiKey, authorization)) {
    throw Object.assign(new Error("模型目录访问密钥无效或服务未接入。"), { statusCode: 401 });
  }
  if (provider?.codexNeedsApply) throw Object.assign(new Error("服务资料已修改，请重新保存 Codex 接入。"), { statusCode: 409 });
  let models: CodexCatalogModelInput[];
  if (provider) {
    models = buildExternalProviderActivation(provider).catalogModels.map((entry) => {
      const model = provider.models.find((item) => item.id === entry.id)!;
      return { ...entry, displayName: availabilityDisplayName(entry.displayName ?? formatCodexModelDisplayName(entry.id), resolveModelAvailability(model, "responses", state.intervalMinutes)) };
    });
  } else {
    models = [];
    for (const route of mixed!.routes) {
      const owner = state.providers.find((item) => item.id === route.providerId);
      const model = owner?.models.find((item) => item.id === route.modelId);
      let availability = model ? resolveModelAvailability(model, route.protocol, state.intervalMinutes) : { status: "unavailable" as const };
      try { await resolveMixedRoute(route.id); } catch { availability = { status: "unavailable", message: "服务资料已变化，请重新保存混合接管。" }; }
      const metadata = model && owner ? catalogModel(owner, model) : {};
      models.push({ ...metadata, id: route.id, contextWindow: route.contextWindow,
        supportsToolSearch: route.protocol !== "responses",
        // Project converter-supported levels without changing saved preferences.
        ...(route.protocol === "anthropic" ? anthropicReasoningCatalog(route.modelId) : {}),
        displayName: availabilityDisplayName(route.displayName, availability) });
    }
  }
  return serializeRemoteModelCatalog(await buildCodexModelCatalog(models, provider?.defaultModelId ?? mixed?.defaultModelId));
}

export class ModelStatusService {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private controller?: AbortController;
  private closed = false;
  private job: HealthJob = { running: false, total: 0, completed: 0 };
  constructor(private probe: typeof checkModelHealth = checkModelHealth) {}

  start(): void {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => { void this.run().catch(() => undefined); }, 60_000);
    this.timer.unref?.();
    // Reuse fresh snapshots across restarts; only check models whose interval is due.
    void this.run();
  }

  async close(): Promise<void> {
    this.closed = true; clearInterval(this.timer); this.controller?.abort();
    await this.pending;
  }

  async settings() {
    const state = await readModelStatusState();
    const enabled = state.providers.some((provider) => provider.models.length > 0);
    return { intervalMinutes: state.intervalMinutes, enabled, job: { ...this.job } };
  }

  async setInterval(intervalMinutes: ModelHealthInterval) { await setModelHealthInterval(intervalMinutes); return this.settings(); }

  async startManual() {
    const settings = await this.settings();
    if (!settings.enabled) throw Object.assign(new Error("请先添加渠道并同步或保存模型。"), { statusCode: 409 });
    if (!this.pending && this.job.finishedAt && Date.now() - this.job.finishedAt < 60_000) {
      throw Object.assign(new Error("刚完成一轮检测，请稍后再试，避免重复消耗 token。"), { statusCode: 429 });
    }
    void this.run(true);
    return this.settings();
  }

  run(force = false): Promise<void> {
    if (this.pending) return this.pending;
    if (this.closed) return Promise.resolve();
    this.controller = new AbortController();
    this.job = { running: true, total: 0, completed: 0, finishedAt: this.job.finishedAt };
    this.pending = this.check(force, this.controller.signal).catch((error) => {
      if (!this.closed) this.job.error = error instanceof Error ? error.message : "状态检测失败。";
    }).finally(() => {
      if (this.job.total || this.job.error) this.job.finishedAt = Date.now();
      this.job.running = false; this.pending = undefined;
    });
    return this.pending;
  }

  private async check(force: boolean, signal: AbortSignal): Promise<void> {
    const state = await readModelStatusState();
    if ((!force && !state.intervalMinutes) || await hasPendingCodexSwitch()) return;
    const targets = healthTargets(state);
    const checkedAt = (target: Target) => Math.max(target.model.health?.[target.protocol]?.checkedAt ?? 0,
      target.protocol === "responses" ? target.model.inspection.checkedAt ?? 0 : 0);
    const now = Date.now();
    const candidates = targets.filter((target) => force || now - checkedAt(target) >= state.intervalMinutes * 60_000)
      .sort((a, b) => checkedAt(a) - checkedAt(b));
    // Manual checks cover all saved models; only unattended checks rotate in small batches.
    const due = force ? candidates : candidates.slice(0, 20);
    this.job.total = due.length;
    // Bound concurrency and rotate oldest snapshots first, including large selections.
    let index = 0;
    const workers = await Promise.allSettled(Array.from({ length: Math.min(2, due.length) }, async () => {
      while (!signal.aborted) {
        const target = due[index++]; if (!target) return;
        // Recheck existence, saved interface and credentials before each billable request.
        const current = await readModelStatusState();
        const saved = healthTargets(current).find((item) => item.providerId === target.providerId && item.modelId === target.modelId);
        if (!saved || signal.aborted || (!force && !current.intervalMinutes) || saved.protocol !== target.protocol
          || saved.baseUrl !== target.baseUrl || saved.token !== target.token || await hasPendingCodexSwitch()) continue;
        const result = await this.probe(target, signal);
        if (signal.aborted) return;
        try { await recordModelHealth(target.providerId, target.modelId, target.protocol, result, target); }
        catch (error) {
          if ((error as { statusCode?: number }).statusCode !== 409 && !String(error).includes("没有模型") && !String(error).includes("没有找到")) this.job.error = "检测结果未能保存，请检查本机存储后重试。";
        }
        this.job.completed++;
      }
    }));
    const failure = workers.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
