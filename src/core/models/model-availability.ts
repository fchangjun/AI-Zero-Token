import type { MixedProtocol, PublicMixedRoute } from "./mixed-provider.js";

export const MODEL_HEALTH_INTERVALS = [0, 15, 30, 60] as const;
export type ModelHealthInterval = typeof MODEL_HEALTH_INTERVALS[number];
export type ModelAvailability = {
  status: "available" | "blocked" | "unavailable" | "unknown";
  checkedAt?: number;
  latencyMs?: number;
  message?: string;
  stale?: boolean;
  /** A valid protocol response can be confirmed even when a small probe exhausts its token budget. */
  protocolConfirmed?: boolean;
};
export type ModelHealthChecks = Partial<Record<MixedProtocol, ModelAvailability>>;
export const MODEL_AVAILABILITY_LABELS = {
  available: "畅通", blocked: "拥堵", unavailable: "不可用", unknown: "未检测",
} as const;

/** Monitor the applied interface first, then saved choices or identified protocols. */
export function modelHealthProtocol(model: {
  selectedForCodex?: boolean;
  compatibility?: { status: string; protocol?: MixedProtocol };
}, options: {
  directActive?: boolean;
  mixedActive?: boolean;
  route?: Pick<PublicMixedRoute, "protocol" | "autoDetected">;
} = {}): MixedProtocol {
  const { route } = options;
  if (options.mixedActive && route) return route.protocol;
  if (options.directActive && model.selectedForCodex) return "responses";
  if (route && !route.autoDetected) return route.protocol;
  if (model.compatibility?.status === "identified" && model.compatibility.protocol) return model.compatibility.protocol;
  return !model.compatibility && route?.autoDetected ? route.protocol : "responses";
}

export function resolveModelAvailability(model: {
  health?: ModelHealthChecks;
  inspection?: { status: string; checkedAt?: number; message?: string };
  latencyMs?: number;
}, protocol: MixedProtocol = "responses", intervalMinutes = 30, now = Date.now()): ModelAvailability {
  const health = model.health?.[protocol];
  const inspection = protocol === "responses" ? model.inspection : undefined;
  let result: ModelAvailability = { status: "unknown" };
  if (inspection?.checkedAt) {
    const status = inspection.status === "ready" ? "available"
      : inspection.status === "busy" ? "blocked"
      : ["unavailable", "incompatible", "auth_error", "transport_error"].includes(inspection.status) ? "unavailable" : "unknown";
    result = { status, checkedAt: inspection.checkedAt, latencyMs: model.latencyMs, message: inspection.message };
  }
  if (health?.checkedAt && health.checkedAt >= (result.checkedAt ?? 0)) result = { ...health };
  // A saved success is a snapshot, never a promise of current availability.
  const maxAgeMinutes = Math.max(60, intervalMinutes * 2);
  const ttl = maxAgeMinutes * 60_000;
  if (result.checkedAt && (now - result.checkedAt > ttl || result.checkedAt > now + 60_000)) {
    const reason = result.checkedAt > now + 60_000 ? "上次检测时间晚于当前时间，请检查系统时间后刷新。"
      : `超过 ${maxAgeMinutes} 分钟未取得新的检测结果。`;
    const previous = result.status === "unknown" ? "尚未确认" : MODEL_AVAILABILITY_LABELS[result.status];
    return { ...result, status: "unknown", stale: true,
      message: `${reason}上次结果：${previous}${result.message ? `（${result.message}）` : ""}` };
  }
  return result;
}

export function availabilityDisplayName(name: string, availability: ModelAvailability): string {
  const symbol = { available: "🟢", blocked: "🟡", unavailable: "🔴", unknown: "⚪" }[availability.status];
  const label = availability.stale ? "待刷新" : availability.checkedAt && availability.status === "unknown" ? "待确认" : MODEL_AVAILABILITY_LABELS[availability.status];
  const title = name.length > 220 ? name.slice(0, 220).replace(/[\uD800-\uDBFF]$/, "") + "…" : name;
  return `${symbol} ${title} · ${label}`;
}
