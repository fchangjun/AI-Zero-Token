import { DEFAULT_COMPAT_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW, resolveContextWindow, resolveMixedContextWindow } from "../../../../../src/core/models/context-window";
import type { MixedProtocol } from "../../../../../src/core/models/mixed-provider";
import type { ProviderModel } from "../types";

function formatWindow(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

export function TakeoverContextWindow({ model, mode, protocol, activeWindow, compact = false }: {
  model: ProviderModel;
  mode: "direct" | "mixed";
  protocol?: MixedProtocol;
  activeWindow?: number;
  compact?: boolean;
}) {
  const context = {
    contextWindowOverride: model.contextWindowOverride ?? (model.contextWindowSource === "manual" ? model.effectiveContextWindow : undefined),
    contextWindow: model.contextWindow ?? (model.contextWindowSource === "api" ? model.effectiveContextWindow : undefined),
  };
  const hasKnownWindow = context.contextWindowOverride !== undefined || context.contextWindow !== undefined;
  const configuredWindow = mode === "direct" ? resolveContextWindow(context)
    : protocol || hasKnownWindow ? resolveMixedContextWindow(context, protocol ?? "chat_completions") : undefined;
  const source = context.contextWindowOverride !== undefined ? "手动设置" : context.contextWindow !== undefined ? "渠道返回" : "默认值 · 未核实上限";
  const changed = activeWindow !== undefined && activeWindow !== configuredWindow;
  const value = activeWindow ?? configuredWindow;
  const label = activeWindow !== undefined ? "当前生效上下文" : "接入后上下文";
  const fallbackHint = `Responses ${formatWindow(DEFAULT_CONTEXT_WINDOW)} / 兼容转换 ${formatWindow(DEFAULT_COMPAT_CONTEXT_WINDOW)}`;
  const shortSource = changed ? "已保存" : context.contextWindowOverride !== undefined ? "手动" : context.contextWindow !== undefined ? "渠道" : "默认";

  return <div className={`provider-mode-context${compact ? " is-compact" : ""}`} aria-label={`${model.name || model.id} 的${mode === "direct" ? "直接接管" : "混合接管"}上下文`}>
    <span className="provider-context-badge" title={value === undefined ? `识别接口后确定；${fallbackHint}` : `${label}：${value.toLocaleString()} tokens · ${changed ? "已保存的接入配置" : source}`}>
      {compact ? activeWindow !== undefined ? "当前上下文" : "上下文" : label} {value === undefined ? "待识别" : formatWindow(value)}
    </span>
    {(!compact || value !== undefined) && <small title={changed ? "保留上次接入值" : source}>{compact ? shortSource : changed ? "保留上次接入值" : value === undefined ? fallbackHint : source}</small>}
    {changed && <small title={configuredWindow === undefined ? fallbackHint : `${configuredWindow.toLocaleString()} tokens · ${source}`}>
      重新接入后：{configuredWindow === undefined ? "识别接口后确定" : `${formatWindow(configuredWindow)}${compact ? "" : ` · ${source}`}`}
    </small>}
  </div>;
}
