import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CodexActivation } from "../admin-ui/src/pages/providers/components/CodexActivation";
import type { ApiProvider, ProviderInspectionStatus, ProviderModel } from "../admin-ui/src/pages/providers/types";
import { CompatibilityResult } from "../admin-ui/src/pages/providers/components/CompatibilityResult";
import { normalizeProvider, normalizeProviderModel } from "../admin-ui/src/pages/providers/api";
import { CodexSwitchDialog } from "../admin-ui/src/pages/providers/components/CodexSwitchDialog";
import { matchesTakeoverFilter, takeoverAvailability } from "../admin-ui/src/pages/providers/takeover-availability";
import { ModelInspectionResult, TakeoverModeInspection } from "../admin-ui/src/pages/providers/components/ModelInspectionResult";
import { ModelInspectionDrawer } from "../admin-ui/src/pages/providers/components/ModelInspectionDrawer";
import { ProviderDetail } from "../admin-ui/src/pages/providers/components/ProviderDetail";
import { TakeoverContextWindow } from "../admin-ui/src/pages/providers/components/TakeoverContextWindow";

function model(id: string, status: ProviderInspectionStatus, window?: Partial<ProviderModel>): ProviderModel {
  return { id, selectedForCodex: false, inspection: { status }, ...window };
}

test("direct confirmation offers two exclusive catalog choices with prerequisites and preserves the saved mode", () => {
  const render = (mode: "direct" | "mixed", catalogMode: "dynamic" | "local", busy = false) => renderToStaticMarkup(createElement(CodexSwitchDialog, {
    title: "确认接入", detail: "示例", mode, catalogMode, busy, onConfirm: () => {}, onClose: () => {}, onCatalogModeChange: () => {},
  }));
  for (const mode of ["dynamic", "local"] as const) {
    const html = render("direct", mode);
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html.match(/<input\b[^>]*\bchecked=""[^>]*>/)?.[0]).toContain(`value="${mode}"`);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain("显示模型状态");
    expect(html).toContain("独立使用 · 本地模型列表");
    expect(html).toContain("每次使用前先启动 AZT");
    expect(html).toContain("无需打开 AZT");
    expect(html).toContain("仅在确认接入后应用所选方式");
    expect(normalizeProvider({ codexCatalogMode: mode }).codexCatalogMode).toBe(mode);
  }
  expect(render("direct", "local", true)).toContain('fieldset class="codex-catalog-options" disabled=""');
  expect(render("mixed", "local")).not.toContain('type="radio"');
  expect(normalizeProvider({}).codexCatalogMode).toBe("dynamic");
});

test("Codex model list sorts by availability while keeping peer order and labels configured context windows", () => {
  const provider: ApiProvider = {
    id: "test", name: "测试服务", baseUrl: "https://example.test/v1", connectionStatus: "connected",
    modelSource: "auto", activeForCodex: false, tokenConfigured: true, modelCount: 6,
    models: [
      model("unavailable", "unavailable"),
      model("unknown-first", "unknown", { effectiveContextWindow: 128_000, contextWindowSource: "api" }),
      model("ready-first", "ready", { effectiveContextWindow: 1_050_000, contextWindowSource: "manual" }),
      model("skipped", "skipped"),
      model("ready-second", "ready"),
      model("unknown-second", "unknown"),
    ],
  };
  const html = renderToStaticMarkup(createElement(CodexActivation, {
    provider, activeProvider: null, saving: false, disconnecting: false,
    onBack: () => {}, onActivate: () => {}, onActivateMixed: () => {}, onDeactivate: () => {},
  }));
  const rows = [...html.matchAll(/<strong>(ready-first|ready-second|unknown-first|unknown-second|unavailable|skipped)<\/strong>/g)]
    .map((match) => match[1]);
  expect(rows).toEqual(["ready-first", "ready-second", "unknown-first", "unknown-second", "unavailable", "skipped"]);
  expect(html).toContain("上下文 1.05M");
  expect(html).toContain("上下文 128K");
  expect(html).toContain("上下文 272K");
  expect(html).toContain("接入后上下文：1,050,000 tokens · 手动设置");
});

test("each takeover mode shows its own context, pending defaults and unchanged active legacy windows", () => {
  const entry = model("claude", "unknown");
  const render = (props: Partial<Parameters<typeof TakeoverContextWindow>[0]> = {}) => renderToStaticMarkup(createElement(TakeoverContextWindow, { model: entry, mode: "mixed", ...props }));
  expect(render({ mode: "direct" })).toContain("上下文 272K");
  expect(render({ protocol: "responses" })).toContain("上下文 272K");
  expect(render({ protocol: "anthropic" })).toContain("上下文 128K");
  expect(render({ protocol: "chat_completions" })).toContain("默认值 · 未核实上限");
  expect(render()).toContain("上下文 待识别");
  expect(render()).toContain("Responses 272K / 兼容转换 128K");
  const legacy = render({ protocol: "anthropic", activeWindow: 32_768 });
  expect(legacy).toContain("当前生效上下文 32.8K");
  expect(legacy).toContain("重新接入后：128K");
  expect(legacy).toContain("32,768 tokens");
  for (const mode of ["direct", "mixed"] as const) {
    const apiModel = { ...entry, contextWindow: 200_000 };
    expect(render({ mode, model: apiModel, protocol: "chat_completions" })).toContain("上下文 200K");
    expect(render({ mode, model: { ...apiModel, contextWindowOverride: 32_768 }, protocol: "anthropic" })).toContain("上下文 32.8K");
  }
  const pending = render({ mode: "direct", model: { ...entry, contextWindowOverride: 500_000 }, activeWindow: 128_000 });
  expect(pending).toContain("当前生效上下文 128K");
  expect(pending).toContain("重新接入后：500K");
});

test("full inspection action includes the entire channel count above 20", () => {
  const provider: ApiProvider = { id: "test", name: "测试服务", baseUrl: "https://example.test/v1", connectionStatus: "connected", modelSource: "manual",
    activeForCodex: false, tokenConfigured: true, modelCount: 29, models: Array.from({ length: 29 }, (_, index) => model(`model-${index}`, "unknown")) };
  const html = renderToStaticMarkup(createElement(ProviderDetail, { provider, action: null, onBack: () => {}, onEdit: () => {}, onDelete: () => {},
    onSync: () => {}, onInspect: () => {}, onActivate: () => {}, onContextWindow: async () => {} }));
  expect(html).toContain("检测全部（29）");
  expect(html).not.toContain("前 20");
  expect(html).not.toContain("单次最多 20");
});

test("both model pages group vendors and keep saved defaults and availability order within groups", () => {
  const provider: ApiProvider = {
    id: "groups", name: "百度渠道", baseUrl: "https://example.test/v1", connectionStatus: "connected", modelSource: "auto",
    activeForCodex: false, tokenConfigured: true, modelCount: 6, defaultModelId: "Claude Sonnet 4.6",
    models: [model("Claude Sonnet 4.6", "incompatible", { selectedForCodex: true }), model("DeepSeek-V4.1-Flash", "ready"),
      model("gpt-6-sol", "busy"), model("Opus 5", "ready"), model("gpt-6-astra", "ready", { selectedForCodex: true }), model("private-deployment", "unknown")],
  };
  const activation = renderToStaticMarkup(createElement(CodexActivation, { provider, activeProvider: null, saving: false, disconnecting: false,
    onBack: () => {}, onActivate: () => {}, onActivateMixed: () => {}, onDeactivate: () => {} }));
  const detail = renderToStaticMarkup(createElement(ProviderDetail, { provider, action: null, onBack: () => {}, onEdit: () => {}, onDelete: () => {},
    onSync: () => {}, onInspect: () => {}, onActivate: () => {}, onContextWindow: async () => {} }));
  for (const html of [activation, detail]) {
    expect([...html.matchAll(/data-vendor="([^"]+)"/g)].map((match) => match[1])).toEqual(["openai", "anthropic", "deepseek", "other"]);
    expect(html).toContain('aria-label="厂商筛选"');
    expect(html).toContain("暂未识别厂商");
  }
  expect([...activation.matchAll(/<strong>(gpt-6-sol|gpt-6-astra|Opus 5|Claude Sonnet 4.6|DeepSeek-V4.1-Flash|private-deployment)<\/strong>/g)].map((match) => match[1]))
    .toEqual(["gpt-6-astra", "gpt-6-sol", "Opus 5", "Claude Sonnet 4.6", "DeepSeek-V4.1-Flash", "private-deployment"]);
  expect(activation).toContain('<option value="Claude Sonnet 4.6" selected="">');
  expect(activation).toContain('aria-label="全选 Anthropic · Claude 当前筛选模型"');
  expect(provider.defaultModelId).toBe("Claude Sonnet 4.6");
  expect(provider.models.filter((model) => model.selectedForCodex).map((model) => model.id)).toEqual(["Claude Sonnet 4.6", "gpt-6-astra"]);
});

test("identified interfaces are visible before takeover without implying verified tools", () => {
  const result = { status: "identified" as const, protocol: "chat_completions" as const, checkedAt: Date.now(), message: "已识别" };
  const normalized = normalizeProviderModel({ id: "model", compatibility: result });
  expect(normalized.compatibility).toEqual(result);
  const html = renderToStaticMarkup(createElement(CompatibilityResult, { result: normalized.compatibility, compact: true }));
  expect(html).toContain("已识别：OpenAI Chat");
  expect(html).toContain("工具调用待验证");
  expect(html).not.toContain("已通过");
  const partial = renderToStaticMarkup(createElement(CompatibilityResult, { result: { ...result,
    validation: { checkedAt: Date.now(), conversation: true, toolCalling: true, toolResult: false, message: "结果回传未确认" } } }));
  expect(partial).toContain("结果回传未确认");
  expect(partial).not.toContain("is-success");
});

test("available modes require complete capability checks and are counted independently", () => {
  const identified = { status: "identified" as const, protocol: "chat_completions" as const, checkedAt: Date.now(), message: "已识别" };
  const validation = { checkedAt: Date.now(), conversation: true, toolCalling: true, toolResult: true, message: "通过" };
  expect(takeoverAvailability(model("new", "unknown"))).toMatchObject({ mode: "unknown", checked: false });
  expect(takeoverAvailability(model("chat", "incompatible", { compatibility: identified })).mode).toBe("unknown");
  expect(takeoverAvailability(model("partial", "incompatible", { compatibility: { ...identified, validation: { ...validation, toolResult: false } } })).mode).toBe("unknown");
  expect(takeoverAvailability(model("chat", "incompatible", { compatibility: { ...identified, validation } })).mode).toBe("mixed");
  const both = model("both", "ready", { compatibility: { ...identified, validation } });
  expect(takeoverAvailability(both)).toMatchObject({ mode: "both", directReady: true, mixedReady: true });
  expect(matchesTakeoverFilter(both, "direct")).toBe(true);
  expect(matchesTakeoverFilter(both, "mixed")).toBe(true);
  expect(matchesTakeoverFilter(both, "both")).toBe(true);
  expect(matchesTakeoverFilter(both, "unconfirmed")).toBe(false);
  expect(matchesTakeoverFilter(both, "mixed", "anthropic")).toBe(false);
  expect(takeoverAvailability(model("health-only", "unknown", { health: { responses: { status: "available", checkedAt: Date.now() } } })).mode).toBe("unknown");
  // Connection failures do not invalidate previously confirmed compatibility.
  const stale = model("busy", "busy", { capabilities: { responsesStreaming: true, functionCalling: true, functionCallOutput: true } });
  stale.inspection.capabilitiesSource = "last_successful";
  expect(takeoverAvailability(stale).mode).toBe("both");
  // Older versions erased interface detection on 429; retained Responses evidence still applies to both modes.
  stale.compatibility = { status: "failed", checkedAt: 300, message: "HTTP 429" };
  expect(takeoverAvailability(stale).mode).toBe("both");
});

test("model details offer one capability action and show neutral results for both modes", () => {
  const checked = model("chat-only", "incompatible", { compatibility: {
    status: "identified", protocol: "chat_completions", checkedAt: Date.now(), message: "已识别",
    validation: { checkedAt: Date.now(), conversation: true, toolCalling: true, toolResult: true, message: "通过" },
  } });
  const props = { model: checked, busy: false, onClose: () => {}, onInspect: () => {}, onContextWindow: async () => {} };
  const html = renderToStaticMarkup(createElement(ModelInspectionDrawer, props));
  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]*>/g, ""));
  expect(buttons.filter((label) => label.includes("检测"))).toEqual(["检测能力"]);
  expect(html).toContain('aria-label="chat-only 的直接接管检测结果"><span class="provider-status-badge is-danger"');
  expect(html).toContain('aria-label="chat-only 的混合接管检测结果"><span class="provider-status-badge is-success"');
  expect(html).not.toContain("建议混合接管");
  expect(html).toContain("OpenAI Chat");
  expect(html).toContain("结果回传");
  expect(html).not.toContain("检测兼容性</button>");
  const pending = renderToStaticMarkup(createElement(ModelInspectionDrawer, { ...props, busy: true, inspecting: true }));
  expect(pending).toContain("正在检测两种接管方式");
  expect(pending).toContain("下方保留已完成的结果");
  expect(pending).toContain('aria-busy="true"');
});

test("every model always shows both modes with distinct untested, failed and partial results", () => {
  const compatibility = { status: "identified" as const, protocol: "chat_completions" as const, checkedAt: Date.now(), message: "已识别",
    validation: { checkedAt: Date.now(), conversation: true, toolCalling: true, toolResult: true, message: "通过" } };
  const models = [model("both", "ready", { compatibility }), model("mixed-only", "incompatible", { compatibility }), model("direct-only", "ready"),
    model("partial", "incompatible", { compatibility: { ...compatibility, validation: { ...compatibility.validation, toolResult: false } } }),
    model("failed", "busy", { compatibility: { status: "failed", checkedAt: Date.now(), message: "网络异常，请重试" } }),
    model("identified-only", "unknown", { compatibility: { ...compatibility, validation: undefined } }), model("new", "unknown")];
  const provider: ApiProvider = { id: "test", name: "测试服务", baseUrl: "https://example.test/v1", connectionStatus: "connected", modelSource: "auto",
    activeForCodex: false, tokenConfigured: true, modelCount: models.length, models };
  const list = renderToStaticMarkup(createElement(ProviderDetail, { provider, action: null, onBack: () => {}, onEdit: () => {}, onDelete: () => {},
    onSync: () => {}, onInspect: () => {}, onActivate: () => {}, onContextWindow: async () => {} }));
  expect(list).toContain("接管兼容性");
  expect(list).toContain("<span>兼容直接接管</span><strong>2</strong>");
  expect(list).toContain("<span>兼容混合接管</span><strong>3</strong>");
  expect(list).toContain("<span>两种方式均兼容</span><strong>2</strong>");
  expect(list).not.toContain("暂未确认可用");
  expect(list).not.toContain("优先直接接管");
  expect(list).not.toContain("建议混合接管");
  const expectedStatuses = [["兼容", "兼容"], ["不兼容", "兼容"], ["兼容", "兼容"], ["不兼容", "检测未完成"],
    ["检测未完成", "检测未完成"], ["未检测", "检测未完成"], ["未检测", "未检测"]];
  for (const [index, entry] of models.entries()) {
    const summary = renderToStaticMarkup(createElement(ModelInspectionResult, { model: entry, compact: true }));
    for (const mode of ["直接接管", "混合接管"]) expect(summary).toContain(`aria-label="${entry.id} 的${mode}检测结果"`);
    expect([...summary.matchAll(/class="provider-status-badge [^"]+"[^>]*>([^<]+)<\/span>/g)].map((match) => match[1])).toEqual(expectedStatuses[index]);
    expect(summary).not.toContain("provider-inspection-checks");
    expect(summary).not.toContain("能力检测：");
  }

  const activation = renderToStaticMarkup(createElement(CodexActivation, { provider, activeProvider: null, saving: false, disconnecting: false,
    onBack: () => {}, onActivate: () => {}, onActivateMixed: () => {}, onDeactivate: () => {} }));
  for (const entry of models) for (const mode of ["直接接管", "混合接管"]) expect(activation).toContain(`aria-label="${entry.id} 的${mode}检测结果"`);
  expect(activation).toContain("检测未完成");
  expect(activation).toContain("已识别：OpenAI Chat");
  expect(activation).toContain("结果回传 未完成");
  // A different manually chosen interface cannot inherit the successful Chat check.
  const changedProtocol = renderToStaticMarkup(createElement(TakeoverModeInspection, { model: models[1], mode: "mixed", protocol: "anthropic" }));
  expect(changedProtocol).toContain("此接口尚未检测");
  expect(changedProtocol).not.toContain(">兼容</span>");
});

test("Responses statuses share the direct result and ignore contradictory legacy mixed validation", () => {
  for (const [status, label] of [["ready", "兼容"], ["busy", "检测未完成"], ["timeout", "检测未完成"], ["auth_error", "检测未完成"], ["incompatible", "不兼容"]] as const) {
    const entry = model("native", status, { compatibility: { status: "identified", protocol: "responses", checkedAt: 100,
      message: "旧的独立检测", validation: { checkedAt: 100, conversation: status !== "ready", toolCalling: status !== "ready", toolResult: status !== "ready", message: "旧结果" } } });
    entry.inspection.checkedAt = 200;
    const before = JSON.stringify(entry);
    const html = renderToStaticMarkup(createElement(ModelInspectionResult, { model: entry, compact: true }));
    expect([...html.matchAll(/class="provider-status-badge [^"]+"[^>]*>([^<]+)<\/span>/g)].map((match) => match[1])).toEqual([label, label]);
    expect(takeoverAvailability(entry).directReady).toBe(takeoverAvailability(entry).mixedReady);
    expect(matchesTakeoverFilter(entry, "mixed")).toBe(status === "ready");
    const detail = renderToStaticMarkup(createElement(TakeoverModeInspection, { model: entry, mode: "mixed" }));
    expect(detail).toContain("共用 Responses 检测结果");
    expect(detail).not.toContain("旧结果");
    expect(JSON.stringify(entry)).toBe(before);
    expect(takeoverAvailability(entry, "chat_completions").mixedReady).toBe(false);
  }
  const interrupted = normalizeProviderModel({ id: "interrupted", inspection: { status: "busy", checkedAt: 300 },
    compatibility: { source: "responses", status: "failed", checkedAt: 300, message: "共用结果" } });
  expect(interrupted.compatibility?.source).toBe("responses");
  const html = renderToStaticMarkup(createElement(TakeoverModeInspection, { model: interrupted, mode: "mixed", compact: true }));
  expect(html).toContain("检测未完成");
  expect(html).not.toContain("检测失败");
});

test("compatibility stays visible separately from a failed attempt and survives API normalization", () => {
  const entry = normalizeProviderModel({ id: "native", selectedForCodex: true, contextWindowOverride: 64000,
    inspection: { status: "busy", checkedAt: 300, message: "HTTP 429", compatibility: { status: "compatible", checkedAt: 100 } },
    compatibility: { status: "identified", protocol: "responses", source: "responses", checkedAt: 300, inconclusive: true,
      message: "HTTP 429", assessment: { status: "compatible", checkedAt: 100 } },
    health: { responses: { status: "blocked", checkedAt: Date.now() } } });
  expect(takeoverAvailability(entry)).toMatchObject({ mode: "both", directStatus: "compatible", mixedStatus: "compatible" });
  const html = renderToStaticMarkup(createElement(ModelInspectionResult, { model: entry }));
  expect(html.match(/>兼容<\/span>/g)).toHaveLength(2);
  expect(html).toContain("本次检测未完成，保留兼容结论");
  expect(html).not.toContain(">不兼容</span>");
  expect(entry.contextWindowOverride).toBe(64000);
  expect(entry.selectedForCodex).toBe(true);
  // A definitive later result supersedes history; transient failures cannot revive an older success.
  entry.inspection.compatibility = { status: "incompatible", checkedAt: 200 };
  entry.inspection.history = [{ checkedAt: 100, status: "ready" }];
  expect(takeoverAvailability(entry)).toMatchObject({ directStatus: "incompatible", mixedStatus: "incompatible" });
});

test("inline runtime status uses the active interface while keeping compatibility and pending choices independent", () => {
  const checkedAt = Date.now();
  const entry = model("claude", "ready", {
    selectedForCodex: true,
    compatibility: { status: "identified", protocol: "anthropic", checkedAt, message: "新识别结果" },
    health: {
      responses: { status: "blocked", checkedAt },
      chat_completions: { status: "available", checkedAt },
      anthropic: { status: "unavailable", checkedAt },
    },
  });
  const provider: ApiProvider = { id: "test", name: "测试服务", baseUrl: "https://example.test/v1", connectionStatus: "connected",
    modelSource: "auto", activeForCodex: false, tokenConfigured: true, modelCount: 1, models: [entry], defaultModelId: entry.id };
  const mixed = { active: true, port: 8787, defaultModelId: "mixed-claude", routes: [
    { id: "mixed-claude", providerId: provider.id, modelId: entry.id, protocol: "chat_completions" as const,
      autoDetected: true, displayName: "Claude", contextWindow: 128_000 },
  ] };
  const before = JSON.stringify({ provider, mixed });
  const render = (overrides: Partial<Parameters<typeof CodexActivation>[0]> = {}) => renderToStaticMarkup(createElement(CodexActivation, {
    provider, mixed, activeProvider: null, saving: false, disconnecting: false, healthIntervalMinutes: 30,
    onBack: () => {}, onActivate: () => {}, onActivateMixed: () => {}, onDeactivate: () => {}, ...overrides,
  }));
  const runtime = (html: string) => html.match(/aria-label="claude 的运行状态"[\s\S]*?<\/label>/)?.[0] ?? "";
  const activeMixed = render();
  expect(runtime(activeMixed)).toContain("当前混合接管 · OpenAI Chat");
  expect(runtime(activeMixed)).toContain("畅通");
  expect(runtime(activeMixed)).not.toContain("拥堵");
  expect(runtime(activeMixed)).not.toContain("不可用");
  expect(activeMixed.indexOf('aria-label="claude 的运行状态"')).toBeLessThan(activeMixed.indexOf('<details class="provider-codex-inspection-details"'));
  expect(activeMixed).toContain('aria-label="claude 的直接接管检测结果"><span class="provider-status-badge is-success"');
  const activeDirect = render({ provider: { ...provider, activeForCodex: true }, mixed: { ...mixed, active: false } });
  expect(runtime(activeDirect)).toContain("当前直接接管 · Responses");
  expect(runtime(activeDirect)).toContain("拥堵");
  // Unapplied models show the detected interface, without treating health as a compatibility verdict.
  expect(runtime(render({ mixed: undefined }))).toContain("不可用");
  const refreshed = { ...entry, health: { ...entry.health, chat_completions: { status: "unavailable" as const, checkedAt: checkedAt + 1 } } };
  expect(runtime(render({ provider: { ...provider, models: [refreshed] } }))).toContain("不可用");
  expect(JSON.stringify({ provider, mixed })).toBe(before);
});
