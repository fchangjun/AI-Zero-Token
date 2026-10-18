import { Loader2 } from "lucide-react";
import { MIXED_PROTOCOL_LABELS } from "../../../../../src/core/models/model-compatibility";
import type { MixedProtocolChoice } from "../../../../../src/core/models/mixed-provider";
import { mixedInspection, sharesResponsesInspection, takeoverAvailability } from "../takeover-availability";
import type { ProviderModel } from "../types";
import { formatProviderDate } from "./ProvidersList";

export function TakeoverModeInspection({ model, mode, protocol = "auto", showProtocol = true, compact = false }: {
  model: ProviderModel; mode: "direct" | "mixed"; protocol?: MixedProtocolChoice; showProtocol?: boolean; compact?: boolean;
}) {
  const shared = mode === "mixed" && sharesResponsesInspection(model, protocol);
  const result = mixedInspection(model, protocol);
  const availability = takeoverAvailability(model, protocol);
  const native = mode === "direct" || shared;
  const status = mode === "direct" ? availability.directStatus : availability.mixedStatus;
  const assessment = mode === "direct" ? availability.direct : availability.mixed;
  const meta = {
    compatible: { label: "兼容", tone: "success" }, incompatible: { label: "不兼容", tone: "danger" },
    unknown: { label: "检测未完成", tone: "warning" }, untested: { label: "未检测", tone: "neutral" },
  }[status];
  const validation = result?.validation;
  const protocolLabel = result?.status === "identified" && result.protocol ? MIXED_PROTOCOL_LABELS[result.protocol] : undefined;
  const incomplete = native ? ["busy", "timeout", "transport_error", "unavailable", "auth_error"].includes(model.inspection.status)
    : result?.inconclusive || result?.status === "failed" && !result.assessment || validation?.outcome === "inconclusive";
  const attemptMessage = native ? model.inspection.message : validation?.message ?? result?.message;
  const title = [assessment?.message, incomplete ? `本次检测未完成：${attemptMessage || "请稍后重试。"}` : undefined].filter(Boolean).join(" · ");
  return <div className="provider-mode-inspection" aria-label={`${model.name || model.id} 的${mode === "direct" ? "直接接管" : "混合接管"}检测结果`}>
    <span className={`provider-status-badge is-${meta.tone}`} title={title || attemptMessage}>{meta.label}</span>
    {!compact && <>
      {shared && <small>共用 Responses 检测结果</small>}
      {!native && showProtocol && protocolLabel && <small>{protocolLabel}</small>}
      {!native && validation && <div className="provider-inspection-checks">{([["conversation", "对话"], ["toolCalling", "工具调用"], ["toolResult", "结果回传"]] as const).map(([key, label]) => <span key={key} className={validation[key] ? "is-passed" : ""}>{label} {validation[key] ? "✓" : validation.outcome === "incompatible" ? "未通过" : "未完成"}</span>)}</div>}
      {assessment?.checkedAt && <small>兼容性确认：{formatProviderDate(assessment.checkedAt)}</small>}
      {incomplete && <small title={attemptMessage}>本次检测未完成{assessment ? "，保留兼容结论" : "，请重试"}</small>}
      {!native && !result && protocol !== "auto" && <small>此接口尚未检测</small>}
    </>}
  </div>;
}

export function ModelInspectionResult({ model, compact = false, inspecting = false }: {
  model: ProviderModel; compact?: boolean; inspecting?: boolean;
}) {
  return <div className={`provider-inspection-result${compact ? " is-compact" : ""}`} aria-live={compact ? undefined : "polite"} aria-busy={inspecting}>
    {inspecting && <div className="provider-takeover-availability"><span className="provider-status-badge is-info"><Loader2 size={14} className="provider-spin" />正在检测两种接管方式…</span></div>}
    {!compact && <p className="provider-model-message">{inspecting ? "正在检测模型能力，Responses 共用结果，接口转换追加验证。下方保留已完成的结果。" : "兼容性用于选择接管方式，连通性反映当前连接。网络异常、限流或凭据问题不会改变此前确认的兼容结论。"}</p>}
    <div className="provider-inspection-modes">
      <div><strong>直接接管</strong><TakeoverModeInspection model={model} mode="direct" compact={compact} /></div>
      <div><strong>混合接管</strong><TakeoverModeInspection model={model} mode="mixed" compact={compact} /></div>
    </div>
  </div>;
}
