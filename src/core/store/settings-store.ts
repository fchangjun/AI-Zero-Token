import { randomUUID } from "node:crypto";
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
      excludedProfileIds: [],
    },
    runtime: {
      quotaSyncConcurrency: 3,
    },
    image: {
      freeAccountWebGenerationEnabled: false,
    },
    server: {
      host: "0.0.0.0",
      port: 8787,
    },
  };
}

function normalizeSettings(parsed: Partial<GatewaySettings>): GatewaySettings {
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
      excludedProfileIds: normalizeStringList(parsed.autoSwitch?.excludedProfileIds),
    },
    runtime: {
      quotaSyncConcurrency: normalizeQuotaSyncConcurrency(parsed.runtime?.quotaSyncConcurrency, defaults.runtime.quotaSyncConcurrency),
    },
    image: {
      freeAccountWebGenerationEnabled: parsed.image?.freeAccountWebGenerationEnabled ?? defaults.image.freeAccountWebGenerationEnabled,
    },
    server: {
      host: parsed.server?.host ?? defaults.server.host,
      port: parsed.server?.port ?? defaults.server.port,
    },
  };
}

export async function loadSettings(): Promise<GatewaySettings> {
  try {
    await ensureStateMigrated();
    const raw = await fs.readFile(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<GatewaySettings>;
    return normalizeSettings(parsed);
  } catch {
    return createDefaultSettings();
  }
}

export function normalizeQuotaSyncConcurrency(value: unknown, fallback = 3): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(32, Math.max(1, Math.trunc(parsed)));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

let settingsSaveQueue = Promise.resolve();

async function writeSettingsAtomic(settings: GatewaySettings): Promise<void> {
  await ensureStateMigrated();
  await fs.mkdir(getStateDir(), { recursive: true });

  const settingsPath = getSettingsPath();
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, settingsPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function saveSettings(settings: GatewaySettings): Promise<void> {
  const nextSave = settingsSaveQueue.then(() => writeSettingsAtomic(settings), () => writeSettingsAtomic(settings));
  settingsSaveQueue = nextSave.catch(() => undefined);
  await nextSave;
}

export { getSettingsPath };
