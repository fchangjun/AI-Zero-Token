import { MODEL_AVAILABILITY_LABELS, resolveModelAvailability } from "../../../../../src/core/models/model-availability";
import type { MixedProtocol } from "../../../../../src/core/models/mixed-provider";
import type { ProviderModel } from "../types";

export function modelAvailability(model: ProviderModel, protocol: MixedProtocol = "responses", intervalMinutes = 30) {
  const checkedAt = model.inspection.checkedAt;
  return resolveModelAvailability({ ...model, inspection: { ...model.inspection,
    checkedAt: typeof checkedAt === "string" ? new Date(checkedAt).getTime() : checkedAt } }, protocol, intervalMinutes);
}

export function ModelAvailabilityBadge({ model, protocol = "responses", intervalMinutes = 30, compact = false, context, refreshHint }: {
  model: ProviderModel; protocol?: MixedProtocol; intervalMinutes?: number; compact?: boolean; context?: string; refreshHint?: string;
}) {
  const result = modelAvailability(model, protocol, intervalMinutes);
  const label = result.stale ? "待刷新" : result.status === "unknown" && result.checkedAt ? "待确认" : MODEL_AVAILABILITY_LABELS[result.status];
  const date = result.checkedAt ? `上次检测：${new Date(result.checkedAt).toLocaleString()}` : "尚未检测";
  const tooltip = [context, date, result.message && `${result.stale ? "待刷新原因：" : ""}${result.message}`,
    result.stale && refreshHint].filter(Boolean).join("\n");
  return <span className={`model-availability${compact ? " is-compact" : ""}`} title={tooltip}>
    <span className={`model-availability-label is-${result.status}`}><i aria-hidden="true" />{label}</span>
    {!compact && result.checkedAt && <small>{new Date(result.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 检测</small>}
  </span>;
}
