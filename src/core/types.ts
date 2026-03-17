export type ProviderId = "openai-codex";

export type AuthMode = "oauth_account";

export type OAuthProfile = {
  provider: ProviderId;
  profileId: string;
  mode: AuthMode;
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
  email?: string;
};

export type ModelInfo = {
  provider: ProviderId;
  id: string;
  name: string;
  input: Array<"text" | "image">;
  source: "static";
  isDefault?: boolean;
};

export type ChatRequest = {
  provider?: ProviderId;
  model?: string;
  input: string;
  system?: string;
};

export type ChatResult = {
  provider: ProviderId;
  model: string;
  text: string;
  raw: unknown;
};

export type GatewayStatus = {
  ok: boolean;
  activeProvider?: ProviderId;
  activeProfileId?: string;
  defaultModel: string;
  loggedIn: boolean;
  expiresAt?: number;
  serverHost: string;
  serverPort: number;
};

export type GatewaySettings = {
  version: 1;
  defaultProvider: ProviderId;
  defaultModel: string;
  server: {
    host: string;
    port: number;
  };
};
