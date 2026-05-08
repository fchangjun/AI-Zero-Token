import fs from "node:fs/promises";
import type { GatewaySettings } from "../types.js";
import {
  ensureStateMigrated,
  getSettingsPath,
  getStateDir,
} from "./state-paths.js";

export function createDefaultSettings(): GatewaySettings {
  return {
    version: 1,
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.4",
    networkProxy: {
      enabled: false,
      url: "",
      noProxy: "localhost,127.0.0.1,::1",
    },
    autoSwitch: {
      enabled: false,
    },
    runtime: {
      quotaSyncConcurrency: 16,
    },
    server: {
      host: "0.0.0.0",
      port: 8787,
    },
  };
}

export async function loadSettings(): Promise<GatewaySettings> {
  try {
    await ensureStateMigrated();
    const raw = await fs.readFile(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<GatewaySettings>;
    const defaults = createDefaultSettings();
    return {
      version: 1,
      defaultProvider: parsed.defaultProvider ?? defaults.defaultProvider,
      defaultModel: parsed.defaultModel ?? defaults.defaultModel,
      networkProxy: {
        enabled: parsed.networkProxy?.enabled ?? defaults.networkProxy.enabled,
        url: parsed.networkProxy?.url ?? defaults.networkProxy.url,
        noProxy: parsed.networkProxy?.noProxy ?? defaults.networkProxy.noProxy,
      },
      autoSwitch: {
        enabled: parsed.autoSwitch?.enabled ?? defaults.autoSwitch.enabled,
      },
      runtime: {
        quotaSyncConcurrency: normalizeQuotaSyncConcurrency(parsed.runtime?.quotaSyncConcurrency, defaults.runtime.quotaSyncConcurrency),
      },
      server: {
        host: parsed.server?.host ?? defaults.server.host,
        port: parsed.server?.port ?? defaults.server.port,
      },
    };
  } catch {
    return createDefaultSettings();
  }
}

export function normalizeQuotaSyncConcurrency(value: unknown, fallback = 16): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(32, Math.max(1, Math.trunc(parsed)));
}

export async function saveSettings(settings: GatewaySettings): Promise<void> {
  await ensureStateMigrated();
  await fs.mkdir(getStateDir(), { recursive: true });
  await fs.writeFile(getSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export { getSettingsPath };
