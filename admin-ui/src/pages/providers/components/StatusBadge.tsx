import type { ProviderInspectionStatus } from "../types";

const INSPECTION_STATUS_META: Record<ProviderInspectionStatus, { label: string; tone: string }> = {
  ready: { label: "检测通过", tone: "success" },
  busy: { label: "服务繁忙", tone: "warning" },
  unavailable: { label: "暂时不可用", tone: "warning" },
  incompatible: { label: "不兼容", tone: "danger" },
  auth_error: { label: "凭据失效", tone: "danger" },
  transport_error: { label: "网络异常", tone: "warning" },
  timeout: { label: "本次检测超时", tone: "warning" },
  skipped: { label: "已跳过", tone: "neutral" },
  pending: { label: "待检测", tone: "neutral" },
  unknown: { label: "未检测", tone: "neutral" },
};

export function InspectionStatusBadge({ status, title }: { status: ProviderInspectionStatus; title?: string }) {
  const meta = INSPECTION_STATUS_META[status] ?? INSPECTION_STATUS_META.unknown;
  return <span className={`provider-status-badge is-${meta.tone}`} title={title}>{meta.label}</span>;
}

function connectionMeta(status: string): { label: string; tone: string } {
  switch (status.toLowerCase()) {
    case "connected":
    case "healthy":
    case "ready":
    case "ok":
      return { label: "连接正常", tone: "success" };
    case "auth_error":
    case "unauthorized":
      return { label: "凭据失效", tone: "danger" };
    case "syncing":
    case "busy":
      return { label: "同步中", tone: "info" };
    case "transport_error":
    case "offline":
    case "error":
      return { label: "连接异常", tone: "warning" };
    default:
      return { label: "待验证", tone: "neutral" };
  }
}

export function ConnectionStatusBadge({ status, title }: { status: string; title?: string }) {
  const meta = connectionMeta(status);
  return <span className={`provider-status-badge is-${meta.tone}`} title={title}>{meta.label}</span>;
}

export function CodexStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`provider-status-badge ${active ? "is-info" : "is-neutral"}`}>
      {active ? "当前接入" : "未接入"}
    </span>
  );
}
