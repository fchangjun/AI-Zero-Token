import type { ReactNode } from "react";

export type BusyAction =
  | "initial"
  | "refresh"
  | "runtime-refresh"
  | "login"
  | "logout"
  | "import"
  | "template"
  | "bulk-remove"
  | "settings"
  | "restart"
  | "proxy"
  | "models"
  | "codex-provider"
  | "test"
  | "image-bed-save"
  | "image-bed-test"
  | "image-bed-delete"
  | "image-bed-upload"
  | `profile:${string}:${string}`
  | null;

export type ResultTab = "response" | "timing" | "preview";

export type ProfileFilter = {
  search: string;
  status:
    | "all"
    | "active"
    | "healthy"
    | "warning"
    | "unknown"
    | "exhausted"
    | "expired"
    | "invalid"
    | "login-invalid"
    | "auth-error"
    | "available"
    | "unavailable"
    | "free"
    | "plus"
    | "pro-team"
    | "api-active"
    | "codex-active"
    | "auto-included"
    | "auto-excluded";
  sort: "quota-desc" | "latency-asc" | "expiry-asc" | "name-asc" | "quota-asc" | "plan-desc" | "email-asc";
};

export type AccountStatItem = {
  key: ProfileFilter["status"];
  label: string;
  value: number;
  tone: "blue" | "green" | "orange" | "red" | "muted" | "brand";
};

export type TrendWindow = 60 | 180 | 720;

export type PreviewImage = { src: string; filename: string; meta: string };

export type ModalImage = { src: string; meta: string; filename?: string };

export type SettingDraft = {
  defaultModel: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyNoProxy: string;
  autoSwitchEnabled: boolean;
  autoSwitchExcludedProfileIds: string[];
  quotaSyncConcurrency: string;
  freeAccountWebGenerationEnabled: boolean;
  serverPort: string;
};

export type SelectOption<T extends string | number> = {
  label: ReactNode;
  value: T;
};
