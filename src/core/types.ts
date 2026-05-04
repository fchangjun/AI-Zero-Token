export type ProviderId = "openai-codex";

export type AuthMode = "oauth_account";

export type CodexQuotaSnapshot = {
  capturedAt: number;
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
  primaryOverSecondaryLimitPercent?: number;
  creditsHasCredits?: boolean;
  creditsUnlimited?: boolean;
  creditsBalance?: string;
  promoCampaignId?: string;
  promoMessage?: string;
};

export type ProfileAuthStatus = {
  state: "ok" | "token_invalidated" | "auth_error";
  checkedAt: number;
  message?: string;
  code?: string;
  httpStatus?: number;
};

export type OAuthProfile = {
  provider: ProviderId;
  profileId: string;
  mode: AuthMode;
  access: string;
  refresh: string;
  idToken?: string;
  expires: number;
  accountId: string;
  email?: string;
  quota?: CodexQuotaSnapshot;
  authStatus?: ProfileAuthStatus;
};

export type ProfileSummary = {
  provider: ProviderId;
  profileId: string;
  accountId: string;
  email?: string;
  expiresAt: number;
  accessTokenPreview: string;
  refreshTokenPreview: string;
  isActive: boolean;
  quota?: CodexQuotaSnapshot;
  authStatus?: ProfileAuthStatus;
};

export type ModelInfo = {
  provider: ProviderId;
  id: string;
  name: string;
  input: Array<"text" | "image">;
  source: "static" | "codex-cache";
  isDefault?: boolean;
};

export type ModelCatalogInfo = {
  source: "static-fallback" | "codex-cache";
  cachePath: string;
  fetchedAt?: string;
  modelCount: number;
};

export type ChatRequest = {
  provider?: ProviderId;
  model?: string;
  input?: string;
  system?: string;
  experimental?: {
    codexBody?: Record<string, unknown>;
    allowUnknownModel?: boolean;
  };
};

export type ArtifactCandidate = {
  source: "event" | "response";
  path: string;
  key: string;
  kind: "url" | "reference";
  value: string;
};

export type ChatResult = {
  provider: ProviderId;
  model: string;
  text: string;
  raw: unknown;
  artifacts: ArtifactCandidate[];
};

export type GatewayStatus = {
  ok: boolean;
  activeProvider?: ProviderId;
  activeProfileId?: string;
  defaultModel: string;
  loggedIn: boolean;
  expiresAt?: number;
  profileCount: number;
  serverHost: string;
  serverPort: number;
};

export type GatewaySettings = {
  version: 1;
  defaultProvider: ProviderId;
  defaultModel: string;
  networkProxy: {
    enabled: boolean;
    url: string;
    noProxy: string;
  };
  autoSwitch: {
    enabled: boolean;
  };
  server: {
    host: string;
    port: number;
  };
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
