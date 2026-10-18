import type { MixedProtocol, MixedProtocolChoice } from "../../../../../src/core/models/mixed-provider";
import { mixedInspection, sharesResponsesInspection } from "../takeover-availability";
import type { ProviderModel } from "../types";
import { ModelAvailabilityBadge } from "./ModelAvailabilityBadge";
import { TakeoverModeInspection } from "./ModelInspectionResult";

export function TakeoverInspectionDetails({ model, protocol, resolvedProtocol, intervalMinutes }: {
  model: ProviderModel; protocol: MixedProtocolChoice; resolvedProtocol?: MixedProtocol; intervalMinutes?: number;
}) {
  const mixed = mixedInspection(model, protocol);
  const shared = sharesResponsesInspection(model, protocol);
  const mixedMessage = shared ? model.inspection.message : mixed?.validation?.message ?? mixed?.message;
  return <details className="provider-codex-inspection-details">
    <summary aria-label={`${model.name || model.id} 的检测详情`}>检测详情</summary>
    <div className="provider-codex-inspection-detail-grid">
      <section>
        <strong>直接接管</strong>
        <TakeoverModeInspection model={model} mode="direct" />
        {model.inspection.message && <p>{model.inspection.message}</p>}
        <div className="provider-codex-protocol-status"><span>连通性</span><ModelAvailabilityBadge model={model} intervalMinutes={intervalMinutes} /></div>
      </section>
      <section>
        <strong>混合接管</strong>
        <TakeoverModeInspection model={model} mode="mixed" protocol={protocol} />
        {mixedMessage && <p>{mixedMessage}</p>}
        {resolvedProtocol && <div className="provider-codex-protocol-status"><span>连通性</span><ModelAvailabilityBadge model={model} protocol={resolvedProtocol} intervalMinutes={intervalMinutes} /></div>}
      </section>
    </div>
    <p className="provider-codex-inspection-explanation">{shared
      ? "两种方式共用 Responses 兼容结论，混合接管仅转发，不重复测试。连通性单独更新。"
      : "混合接管可转换接口，因此可能直接不兼容、混合兼容。连接异常只影响本次检测，不改变已确认的兼容结论。"}</p>
  </details>;
}
