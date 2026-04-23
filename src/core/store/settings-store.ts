import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GatewaySettings } from "../types.js";

const projectDir = path.dirname(fileURLToPath(new URL("../../../package.json", import.meta.url)));
const stateDir = path.join(projectDir, ".state");
const settingsPath = path.join(stateDir, "settings.json");

export function createDefaultSettings(): GatewaySettings {
  return {
    version: 1,
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.4",
    server: {
      host: "0.0.0.0",
      port: 8787,
    },
  };
}

export function getSettingsPath(): string {
  return settingsPath;
}

export async function loadSettings(): Promise<GatewaySettings> {
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<GatewaySettings>;
    const defaults = createDefaultSettings();
    return {
      version: 1,
      defaultProvider: parsed.defaultProvider ?? defaults.defaultProvider,
      defaultModel: parsed.defaultModel ?? defaults.defaultModel,
      server: {
        host: parsed.server?.host ?? defaults.server.host,
        port: parsed.server?.port ?? defaults.server.port,
      },
    };
  } catch {
    return createDefaultSettings();
  }
}

export async function saveSettings(settings: GatewaySettings): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
