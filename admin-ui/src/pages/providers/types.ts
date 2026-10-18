import type { ReasoningEffort } from "../../../../src/core/models/reasoning-effort";
import type { ModelHealthChecks, ModelHealthInterval } from "../../../../src/core/models/model-availability";
export type { ReasoningEffort } from "../../../../src/core/models/reasoning-effort";

export type ProviderInspectionStatus =
  | "ready"
  | "busy"
  | "unavailable"
  | "incompatible"
  | "auth_error"
  | "transport_error"
  | "timeout"
  | "skipped"
  | "pending"
  | "unknown";

export type ProviderModelCapabilities = {
  responsesStreaming?: boolean;
  functionCalling?: boolean;
  functionCallOutput?: boolean;
  reasoningEfforts?: ReasoningEffort[];
  imageInput?: boolean;
  inputModalities?: Array<"text" | "image">;
};

export type ProviderModelInspection = {
  status: ProviderInspectionStatus;
  compatibility?: import("../../../../src/core/models/model-compatibility").CompatibilityAssessment;
  latestCapabilities?: ProviderModelCapabilities;
  lastSuccessfulAt?: number;
  message?: string;
  checkedAt?: number | string;
  latencyMs?: number;
  capabilities?: ProviderModelCapabilities;
  capabilitiesSource?: "latest" | "last_successful";
  history?: Array<{ checkedAt: number | string; status: ProviderInspectionStatus; message?: string; latencyMs?: number; capabilities?: ProviderModelCapabilities }>;
};

export type ProviderModel = {
  health?: ModelHealthChecks;
  compatibility?: import("../../../../src/core/models/model-compatibility").ModelCompatibility;
  contextWindow?: number;
  contextWindowOverride?: number;
  effectiveContextWindow?: number;
  activeDirectContextWindow?: number;
  contextWindowSource?: "api" | "default" | "manual";
  id: string;
  name?: string;
  description?: string;
  selectedForCodex: boolean;
  catalogStatus?: "available" | "missing";
  inspection: ProviderModelInspection;
  capabilities?: ProviderModelCapabilities;
  latencyMs?: number;
  lastInspectedAt?: number | string;
};

export type ProviderModelSource = "auto" | "manual";

export type ApiProvider = {
  kind?: "account_pool";
  accountCount?: number;
  remoteGateway?: boolean;
  id: string;
  name: string;
  baseUrl: string;
  connectionStatus: string;
  connectionMessage?: string;
  modelSource: ProviderModelSource;
  models: ProviderModel[];
  modelCount: number;
  lastSyncedAt?: number | string;
  activeForCodex: boolean;
  codexNeedsApply?: boolean;
  codexSwitchWarning?: string;
  inspectionJob?: { status: "running" | "completed" | "failed"; total: number; completed: number; error?: string };
  defaultModelId?: string;
  tokenConfigured: boolean;
  createdAt?: number | string;
  updatedAt?: number | string;
};

export type ProvidersSnapshot = {
  modelStatus?: ModelStatusSettings;
  providers: ApiProvider[];
  activeProviderId?: string;
  mixed?: import("../../../../src/core/models/mixed-provider").PublicMixedConfig;
};

export type ModelStatusSettings = {
  intervalMinutes: ModelHealthInterval;
  enabled: boolean;
  job: { running: boolean; total: number; completed: number; finishedAt?: number; error?: string };
};

export type ProviderDraft = {
  name: string;
  baseUrl: string;
  apiToken: string;
  modelSource: ProviderModelSource;
  manualModelIds: string[];
};
