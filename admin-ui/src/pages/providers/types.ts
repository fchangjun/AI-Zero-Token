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

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

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
  message?: string;
  checkedAt?: number | string;
  latencyMs?: number;
  capabilities?: ProviderModelCapabilities;
  capabilitiesSource?: "latest" | "last_successful";
  history?: Array<{ checkedAt: number | string; status: ProviderInspectionStatus; message?: string; latencyMs?: number }>;
};

export type ProviderModel = {
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
  inspectionJob?: { status: "running" | "completed" | "failed"; total: number; completed: number; error?: string };
  defaultModelId?: string;
  tokenConfigured: boolean;
  createdAt?: number | string;
  updatedAt?: number | string;
};

export type ProvidersSnapshot = {
  providers: ApiProvider[];
  activeProviderId?: string;
};

export type ProviderDraft = {
  name: string;
  baseUrl: string;
  apiToken: string;
  modelSource: ProviderModelSource;
  manualModelIds: string[];
};
