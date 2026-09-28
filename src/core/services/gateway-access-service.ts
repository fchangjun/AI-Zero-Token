import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureStateMigrated, getStateDir } from "../store/state-paths.js";
import { getCodexGatewayProviderStatus, withCodexProviderConfigTransaction } from "../store/codex-auth-store.js";

export const KEYED_GATEWAY_PROVIDER_ID = "azt_gateway";
type GatewayAccess = { version: 1; apiKey: string | null };
export type GatewayAccessStatus = { enabled: boolean; apiKey: string | null; invalid?: boolean };
export function getGatewayAccessPath(): string { return path.join(getStateDir(), "gateway-access.json"); }

// A missing file preserves existing installations. A corrupt file must fail closed.
export async function readGatewayAccess(): Promise<GatewayAccess> {
  await ensureStateMigrated();
  try {
    const raw = await fs.readFile(getGatewayAccessPath(), "utf8");
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new Error("API 访问密钥配置无效，请检查本机配置文件。"); }
    if (!data || typeof data !== "object" || !("version" in data) || !("apiKey" in data)) throw new Error("API 访问密钥配置无效，请检查本机配置文件。");
    if (data.version !== 1 || (data.apiKey !== null && (typeof data.apiKey !== "string" || !/^azt_[a-f0-9]{64}$/.test(data.apiKey)))) {
      throw new Error("API 访问密钥配置无效，请在本机重新配置。");
    }
    return { version: 1, apiKey: data.apiKey };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, apiKey: null };
    throw error;
  }
}

export async function getGatewayAccessStatus(): Promise<GatewayAccessStatus> {
  try {
    const { apiKey } = await readGatewayAccess();
    return { enabled: Boolean(apiKey), apiKey };
  } catch {
    // Model routes retain the strict reader and fail closed. Local management
    // stays available so a damaged key file can be replaced safely.
    return { enabled: false, apiKey: null, invalid: true };
  }
}

export function gatewayKeyMatches(expected: string, authorization?: string): boolean {
  const supplied = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? "")?.[1] ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isLocalGatewayUrl(value: string | undefined, port?: number): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return ["localhost", "127.0.0.1", "::1"].includes(host)
      && (port === undefined || Number(url.port || (url.protocol === "https:" ? 443 : 80)) === port)
      && url.pathname.replace(/\/+$/, "") === "/codex/v1";
  } catch { return false; }
}

export function configureLocalGatewayForCodex(params: { baseUrl: string; providerId?: string; model?: string }) {
  // Read the key inside the same queue used by rotation, so a pending connection
  // cannot overwrite the updated Codex config with an expired key.
  return withCodexProviderConfigTransaction(async ({ apply }) => {
    const { apiKey } = await readGatewayAccess();
    return apply({ ...params, kind: "codex_gateway", providerId: apiKey ? KEYED_GATEWAY_PROVIDER_ID : params.providerId, bearerToken: apiKey ?? "" });
  });
}

export async function updateGatewayAccess(action: "enable" | "rotate" | "disable", _port: number) {
  return withCodexProviderConfigTransaction(async ({ apply }) => {
    const current = await readGatewayAccess().catch(() => ({ version: 1 as const, apiKey: null }));
    const apiKey = action === "disable" ? null : action === "enable" && current.apiKey ? current.apiKey : `azt_${randomBytes(32).toString("hex")}`;
    const defaultStatus = await getCodexGatewayProviderStatus();
    const status = !defaultStatus.active && defaultStatus.modelProvider && defaultStatus.modelProvider !== defaultStatus.providerId
      ? await getCodexGatewayProviderStatus({ providerId: defaultStatus.modelProvider })
      : defaultStatus;
    // gateway-access.json is shared by every local instance using this state.
    // Keep an active loopback Codex gateway on the same shared key even if a
    // second instance performs the rotation from another port.
    const codexUpdated = status.active
      && status.managedByAiZeroToken === true
      && !status.providerId.startsWith("azt_external_")
      && isLocalGatewayUrl(status.baseUrl);
    if (codexUpdated) {
      const providerId = apiKey && ["openai", "ai-zero-token"].includes(status.providerId)
        ? KEYED_GATEWAY_PROVIDER_ID
        : status.providerId;
      await apply({
        baseUrl: status.baseUrl!, model: status.model, kind: "codex_gateway",
        providerId,
        bearerToken: apiKey ?? "",
      });
    }
    const target = getGatewayAccessPath();
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.writeFile(temporary, JSON.stringify({ version: 1, apiKey }), { mode: 0o600 });
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }); }
    return { enabled: Boolean(apiKey), apiKey, codexUpdated };
  });
}
