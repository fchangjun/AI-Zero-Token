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
  status: "all" | "active" | "healthy" | "warning" | "exhausted" | "expired" | "invalid";
  sort: "quota-desc" | "latency-asc" | "expiry-asc" | "name-asc" | "quota-asc" | "plan-desc" | "email-asc";
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
  quotaSyncConcurrency: string;
  serverPort: string;
};

export type SelectOption<T extends string | number> = {
  label: ReactNode;
  value: T;
};
