import { MIXED_PROTOCOL_LABELS, type ModelCompatibility } from "../../../../../src/core/models/model-compatibility";
import { formatProviderDate } from "./ProvidersList";

export function CompatibilityResult({ result, compact = false }: { result?: ModelCompatibility; compact?: boolean }) {
  if (!result) return <span className="provider-compatibility-empty">混合兼容性未检测</span>;
  const validation = result.validation;
  const verified = validation?.conversation && validation.toolCalling && validation.toolResult;
  const label = result.status === "identified" && result.protocol ? `已识别：${MIXED_PROTOCOL_LABELS[result.protocol]}` : "接口未识别";
  if (result.source === "responses") return <div className={`provider-compatibility-result${compact ? " is-compact" : ""}`}>
    <span className="provider-status-badge is-info">{label}</span>
    <small>共用 Responses 能力检测结果</small>
    {!compact && <p className="provider-model-message">{result.message}</p>}
    <small>能力检测：{formatProviderDate(result.checkedAt)}</small>
  </div>;
  return <div className={`provider-compatibility-result${compact ? " is-compact" : ""}`}>
    <span className={`provider-status-badge ${result.status === "failed" ? "is-warning" : verified ? "is-success" : "is-info"}`} title={result.message}>{label}</span>
    {compact ? <small>{validation ? verified ? "对话、工具调用已通过" : "兼容性检测未全部通过" : "工具调用待验证"}</small> : <>
      <p className="provider-model-message">{result.message}</p>
      <div className="provider-compatibility-checks">
        {([["conversation", "对话回复"], ["toolCalling", "工具调用"], ["toolResult", "结果回传"]] as const).map(([key, title]) =>
          <div key={key}><span>{title}</span><strong className={validation?.[key] ? "is-passed" : ""}>{validation ? validation[key] ? "通过" : "未确认" : "待验证"}</strong></div>)}
      </div>
      {validation && <p className="provider-model-message">{validation.message}</p>}
    </>}
    <small title="这是上次检测的结果，当前可用性以实时请求为准">{validation ? "兼容性检测" : "接口识别"}：{formatProviderDate(validation?.checkedAt ?? result.checkedAt)}</small>
  </div>;
}
