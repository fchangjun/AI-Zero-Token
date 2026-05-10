export type QuotaSnapshot = {
  capturedAt?: number;
  sourceRequestId?: string;
  activeLimit?: string;
  planType?: string;
  primaryUsedPercent?: number;
  secondaryUsedPercent?: number;
  primaryWindowMinutes?: number;
  secondaryWindowMinutes?: number;
  primaryResetAfterSeconds?: number;
  secondaryResetAfterSeconds?: number;
  primaryResetAt?: number;
  secondaryResetAt?: number;
  creditsHasCredits?: boolean;
  creditsUnlimited?: boolean;
  creditsBalance?: string;
  promoMessage?: string;
};

export type AuthStatus = {
  state: "ok" | "token_invalidated" | "auth_error";
  checkedAt: number;
  message?: string;
  code?: string;
  httpStatus?: number;
};

export type ProfileExportAudit = {
  exported: boolean;
  count: number;
  firstExportedAt?: number;
  lastExportedAt?: number;
  lastExportKind?: "single" | "batch" | "all";
};

export type ProfileSummary = {
  provider: string;
  profileId: string;
  accountId: string;
  email?: string;
  quota?: QuotaSnapshot;
  authStatus?: AuthStatus;
  expiresAt: number;
  accessTokenPreview: string;
  refreshTokenPreview: string;
  isActive: boolean;
  exportAudit?: ProfileExportAudit;
};

export type GatewaySettings = {
  version: number;
  defaultProvider: string;
  defaultModel: string;
  networkProxy: {
    enabled: boolean;
    url: string;
    noProxy: string;
  };
  autoSwitch: {
    enabled: boolean;
    excludedProfileIds: string[];
  };
  runtime: {
    quotaSyncConcurrency: number;
  };
  image: {
    freeAccountWebGenerationEnabled: boolean;
  };
  server: {
    host: string;
    port: number;
  };
};

export type GatewayStatus = {
  ok: boolean;
  activeProvider?: string;
  activeProfileId?: string;
  defaultModel: string;
  loggedIn: boolean;
  expiresAt?: number;
  profileCount: number;
  serverHost: string;
  serverPort: number;
};

export type ModelInfo = {
  provider: string;
  id: string;
  name: string;
  input: Array<"text" | "image">;
  source: string;
  isDefault?: boolean;
};

export type ModelCatalogInfo = {
  source: string;
  cachePath: string;
  fetchedAt?: string;
  modelCount: number;
};

export type VersionStatus = {
  packageName: string;
  currentVersion: string;
  latestVersion?: string;
  checkedAt: number;
  needsUpdate: boolean;
  registryUrl: string;
  status: "ok" | "update-available" | "error";
  error?: string;
};

export type SupportedEndpoint = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
};

export type UsageAggregate = {
  requestCount: number;
  successCount: number;
  failureCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  unknownTokenCount: number;
  imageCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  p95DurationMs: number;
  durationBuckets: Record<string, number>;
};

export type UsageDimensionRow = {
  key: string;
  label: string;
  aggregate: UsageAggregate;
};

export type UsageSummary = {
  generatedAt: number;
  startedAt: number;
  todayDate: string;
  storageDir: string;
  startup: UsageAggregate;
  today: UsageAggregate;
  lifetime: UsageAggregate;
  daily: Array<{ date: string; aggregate: UsageAggregate }>;
  byAccount: UsageDimensionRow[];
  byModel: UsageDimensionRow[];
  byEndpoint: UsageDimensionRow[];
  byError: UsageDimensionRow[];
  byImageRoute: UsageDimensionRow[];
  bySource: UsageDimensionRow[];
};

export type AdminConfig = {
  status: GatewayStatus;
  settings: GatewaySettings;
  models: ModelInfo[];
  modelCatalog: ModelCatalogInfo;
  versionStatus: VersionStatus;
  profile: ProfileSummary | null;
  profiles: ProfileSummary[];
  codex: {
    exists: boolean;
    path: string;
    accountId?: string;
    email?: string;
    gatewayProvider: {
      path: string;
      providerId: string;
      exists: boolean;
      active: boolean;
      baseUrl?: string;
      modelProvider?: string;
    };
  };
  usage?: UsageSummary;
  adminUrl: string;
  baseUrl: string;
  codexBaseUrl?: string;
  supportedEndpoints: SupportedEndpoint[];
  restartSupported?: boolean;
  codexRestartSupported?: boolean;
};

export type RequestLog = {
  id: string;
  time: number;
  method: string;
  endpoint: string;
  account: string;
  model: string;
  statusCode: number;
  durationMs: number;
  source: string;
  details?: Record<string, unknown>;
};
