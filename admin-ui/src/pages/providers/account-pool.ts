import type { AdminConfig } from "@/shared/types";
import type { ApiProvider } from "./types";

export function isAccountPoolGateway(gateway: AdminConfig["codex"]["gatewayProvider"]): boolean {
  return gateway.providerId === "azt_gateway" || (gateway.authType !== "bearer_token" && ["openai", "ai-zero-token"].includes(gateway.providerId));
}

export function sameGatewayUrl(a: string | undefined, b: string | undefined): boolean {
  function normalize(value: string | undefined) {
    try {
      const url = new URL(value || "");
      if (["localhost", "[::1]"].includes(url.hostname)) url.hostname = "127.0.0.1";
      return url.toString().replace(/\/+$/, "");
    } catch { return value?.replace(/\/+$/, ""); }
  }
  return Boolean(a && b && normalize(a) === normalize(b));
}

// The built-in service is a view of existing state, never a copy of account credentials.
export function accountPoolProvider(config: AdminConfig): ApiProvider {
  const gateway = config.codex.gatewayProvider;
  const baseUrl = config.codexBaseUrl || "http://127.0.0.1:8787/codex/v1";
  const active = gateway.active && isAccountPoolGateway(gateway);
  const remote = active && Boolean(gateway.baseUrl && !sameGatewayUrl(gateway.baseUrl, baseUrl));
  return {
    id: "builtin-account-pool",
    kind: "account_pool",
    name: remote ? "AI Zero Token（远程网关）" : "AI Zero Token（账号池）",
    accountCount: config.profiles.length,
    remoteGateway: remote,
    baseUrl: remote ? gateway.baseUrl! : baseUrl,
    connectionStatus: remote ? "unknown" : config.status.loggedIn ? "connected" : "unknown",
    modelSource: "auto",
    models: config.models.map((model) => ({
      id: model.id, name: model.name, selectedForCodex: true,
      inspection: { status: "unknown" },
    })),
    modelCount: config.models.length,
    lastSyncedAt: config.modelCatalog.fetchedAt,
    activeForCodex: active,
    defaultModelId: active ? gateway.model : config.settings.defaultModel,
    tokenConfigured: false,
  };
}
