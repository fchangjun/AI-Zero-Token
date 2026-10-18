import { MIXED_PROTOCOL_CHOICES, MIXED_PROTOCOLS, type MixedActivationInput, type MixedActivationRequest, type MixedModelSelection, type MixedProtocol } from "../models/mixed-provider.js";
import { checkModelHealth } from "../providers/openai-compatible/health.js";
import { hasCoreCapabilities, MIXED_PROTOCOL_LABELS, resolveDirectCompatibility, type ModelCompatibility } from "../models/model-compatibility.js";
import { getExternalProvider, getExternalProviderWithSecret, readModelStatusState, recordExternalProviderInspection, recordModelCompatibility, recordModelHealth, type ExternalProviderModel, type ExternalProviderRecord } from "../store/external-provider-store.js";
import { inspectMixedCompatibility } from "../providers/mixed/inspect.js";
import { inspectExternalProviderModels, type ExternalProviderModelProbe } from "../providers/openai-compatible/inspect.js";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function confirmedProtocol(model: ExternalProviderModel): MixedProtocol | undefined {
  if (resolveDirectCompatibility(model)?.status === "compatible") return "responses";
  return MIXED_PROTOCOLS.find((protocol) => model.health?.[protocol]?.protocolConfirmed || model.health?.[protocol]?.status === "available"
    || (protocol === "responses" && model.capabilities?.responsesStreaming === true && Boolean(model.lastConfirmedAt)));
}

/** One engine and persisted result for model details and automatic takeover. */
export async function detectMixedProtocol(provider: ExternalProviderRecord, model: ExternalProviderModel, options: {
  signal?: AbortSignal; force?: boolean; probe?: typeof checkModelHealth;
  protocols?: readonly MixedProtocol[];
} = {}): Promise<ModelCompatibility> {
  options.signal?.throwIfAborted();
  if (!options.force && model.compatibility?.status === "identified" && model.compatibility.protocol) return model.compatibility;
  const checkedAt = Date.now();
  const confirmed = !options.force && (!model.compatibility || !model.compatibility.protocol && resolveDirectCompatibility(model)?.status === "compatible")
    ? confirmedProtocol(model) : undefined;
  if (confirmed) {
    const result: ModelCompatibility = { status: "identified", protocol: confirmed, checkedAt,
      message: "复用已确认的模型接口；对话和工具兼容性可在模型详情中进一步检测。" };
    await recordModelCompatibility(provider.id, model.id, result, provider);
    return result;
  }
  const results: string[] = [];
  let allUnsupported = true;
  for (const protocol of options.protocols ?? MIXED_PROTOCOLS) {
    options.signal?.throwIfAborted();
    const result = await (options.probe ?? checkModelHealth)({ baseUrl: provider.baseUrl, token: provider.token, modelId: model.id, protocol }, options.signal);
    options.signal?.throwIfAborted();
    await recordModelHealth(provider.id, model.id, protocol, result, provider);
    if (result.protocolConfirmed || result.status === "available") {
      const detection: ModelCompatibility = { status: "identified", protocol, checkedAt,
        message: "已通过轻量请求识别接口，混合接管会使用此接口。" };
      await recordModelCompatibility(provider.id, model.id, detection, provider);
      return detection;
    }
    results.push(`${MIXED_PROTOCOL_LABELS[protocol]}：${result.message ?? "未确认支持"}`);
    allUnsupported &&= result.protocolUnsupported === true;
    // Auth, rate limits and transport failures are not evidence of another protocol.
    if (result.status === "blocked" || result.statusCode === undefined || [401, 403].includes(result.statusCode)) break;
  }
  const result: ModelCompatibility = { status: "failed", checkedAt, inconclusive: !allUnsupported,
    ...(allUnsupported ? { assessment: { status: "incompatible" as const, checkedAt, message: "已检测的兼容接口均明确返回不支持。" } } : {}),
    message: `未能自动识别接口（${results.join("；")}）。请稍后重新检测，或在模型行点击“调整”指定接口。` };
  await recordModelCompatibility(provider.id, model.id, result, provider);
  return result;
}

const inspecting = new Set<string>();
export async function inspectModelCompatibility(providerId: string, modelId: string, signal?: AbortSignal, options: {
  /** The already-saved direct probe from this same job, never last-successful capabilities. */
  directInspection?: ExternalProviderModelProbe & { checkedAt: number };
  expectedConnection?: { baseUrl: string; token: string };
} = {}) {
  const key = JSON.stringify([providerId, modelId]);
  if (inspecting.has(key)) throw fail("这个模型正在检测兼容性，请等待完成。", 409);
  inspecting.add(key);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(fail("兼容性检测超时，已完成的接口识别结果已保留。", 408)), 120_000);
  try {
    const provider = await getExternalProviderWithSecret(providerId);
    const model = provider?.models.find((item) => item.id === modelId);
    if (!provider || !model) throw fail("没有找到这个模型。", 404);
    if (options.expectedConnection && (provider.baseUrl !== options.expectedConnection.baseUrl || provider.token !== options.expectedConnection.token)) {
      throw fail("检测期间服务地址或凭据已变更，请重新开始检测。", 409);
    }
    if (!provider.token) throw fail("请先为该渠道配置 Token。");
    controller.signal.throwIfAborted();
    let direct = options.directInspection;
    if (direct && (direct.id !== modelId || direct.checkedAt !== model.inspection.checkedAt)) {
      throw fail("模型检测结果已更新，请重新开始检测。", 409);
    }
    // The legacy compatibility endpoint uses the same direct probe too. It must not
    // run a second native conversation/tool suite or trust a cached success.
    if (!direct) {
      const inspection = await inspectExternalProviderModels({ baseUrl: provider.baseUrl, bearerToken: provider.token,
        providerId, tokenSource: "stored", modelIds: [modelId] });
      controller.signal.throwIfAborted();
      const checkedAt = Date.now();
      await recordExternalProviderInspection(providerId, inspection, { inspectedAt: checkedAt }, { expectedConnection: provider });
      const probe = inspection.models[0];
      if (!probe) throw fail("该模型不是文本模型，未执行接管能力检测。");
      direct = { ...probe, checkedAt };
    }
    const confirmed = direct.capabilities.responsesStreaming || direct.status === "ready";
    // A transient failure is not evidence that another interface is required.
    // Only an incompatible native probe proceeds to conversion detection.
    if (confirmed || direct.status !== "incompatible") {
      const result: ModelCompatibility = { source: "responses", status: confirmed ? "identified" : "failed",
        ...(confirmed || model.compatibility?.protocol === "responses" ? { protocol: "responses" as const } : {}),
        checkedAt: direct.checkedAt, inconclusive: direct.status !== "ready" && direct.status !== "incompatible" && !hasCoreCapabilities(direct.capabilities),
        message: direct.status === "ready" || direct.status === "incompatible"
          ? "直接与混合接管共用本次 Responses 能力检测结果，不重复发送测试请求。"
          : direct.error ?? direct.message ?? "本次检测未完成，保留此前确认的接口与兼容结果。" };
      controller.signal.throwIfAborted();
      await recordModelCompatibility(providerId, modelId, result, provider);
      if (direct.status === "ready") await recordModelHealth(providerId, modelId, "responses", {
        status: "available", protocolConfirmed: true, checkedAt: direct.checkedAt,
        message: "Responses 能力检测已通过，直接与混合接管共用此结果。",
      }, provider);
      return getExternalProvider(providerId);
    }
    const result = await detectMixedProtocol(provider, model, { force: true, signal: controller.signal,
      protocols: ["chat_completions", "anthropic"] });
    if (result.protocol) {
      const validation = await inspectMixedCompatibility({ baseUrl: provider.baseUrl, token: provider.token, modelId, protocol: result.protocol }, controller.signal);
      controller.signal.throwIfAborted();
      if (validation.conversation || validation.connectionStatus) await recordModelHealth(providerId, modelId, result.protocol, {
        status: validation.connectionStatus ?? "available", protocolConfirmed: true, checkedAt: validation.checkedAt,
        message: validation.connectionStatus ? validation.message : "兼容性检测中的普通对话已完成；工具调用与结果回传请查看模型详情。",
      }, provider);
      await recordModelCompatibility(providerId, modelId, { ...result, validation, inconclusive: validation.outcome === "inconclusive" }, provider);
    }
    return getExternalProvider(providerId);
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", cancel); inspecting.delete(key);
  }
}

/** Runs only after the user confirms mixed takeover, never on page load or model selection. */
export async function resolveMixedProtocols(input: MixedActivationRequest, options: {
  signal?: AbortSignal;
  probe?: typeof checkModelHealth;
  timeoutMs?: number;
} = {}): Promise<{ input: MixedActivationInput; connections: Record<string, { baseUrl: string; token: string }> }> {
  const state = await readModelStatusState();
  if (!input.routes.length || input.routes.length > 1000) throw fail("请选择 1–1000 个混合模型。");
  const providers = new Map(state.providers.map((provider) => [provider.id, provider]));
  const connections: Record<string, { baseUrl: string; token: string }> = Object.create(null);
  const seen = new Set<string>();
  // Validate the whole request before any potentially billable probe.
  const targets = input.routes.map((route) => {
    if (!MIXED_PROTOCOL_CHOICES.includes(route.protocol)) throw fail("不支持的模型接口。");
    const key = JSON.stringify([route.providerId, route.modelId]);
    if (seen.has(key)) throw fail("混合模型不能重复选择。");
    seen.add(key);
    const provider = providers.get(route.providerId);
    const model = provider?.models.find((item) => item.id === route.modelId);
    if (!provider || !model) throw fail("混合模型已发生变化，请重新选择。");
    if (!provider.token) throw fail(`API 服务 ${provider.name} 尚未配置 Token。`);
    connections[provider.id] = { baseUrl: provider.baseUrl, token: provider.token };
    return { route, provider, model };
  });
  if (!seen.has(JSON.stringify([input.defaultModel.providerId, input.defaultModel.modelId]))) throw fail("默认模型必须包含在所选混合模型中。");

  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason ?? fail("接口识别已取消。"));
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(fail("接口识别超时，已确认的结果已保留，请重试或在对应模型行调整接口。", 408)), options.timeoutMs ?? 90_000);
  const probe = options.probe ?? checkModelHealth;
  const routes: MixedModelSelection[] = new Array(targets.length);
  const failures: string[] = [];
  let next = 0;

  try {
    await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
      while (!controller.signal.aborted) {
        const index = next++;
        const target = targets[index];
        if (!target) return;
        try {
          const { route, provider, model } = target;
          const detection = route.protocol === "auto" ? await detectMixedProtocol(provider, model, { signal: controller.signal, probe }) : undefined;
          if (detection && !detection.protocol) throw fail(`${provider.name} / ${model.displayName || model.id} ${detection.message}`);
          routes[index] = route.protocol === "auto"
            ? { providerId: route.providerId, modelId: route.modelId, protocol: detection!.protocol!, autoDetected: true }
            : { ...route, protocol: route.protocol };
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "接口识别失败，请重试。");
        }
      }
    }));
    controller.signal.throwIfAborted();
    if (failures.length) throw fail(`${failures.slice(0, 3).join("\n")}${failures.length > 3 ? `\n另有 ${failures.length - 3} 个模型未确认接口。` : ""}\n本次未修改 Codex 接入配置。`);
    return { input: { ...input, routes }, connections };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
