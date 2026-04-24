import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.dirname(fileURLToPath(new URL("../../../package.json", import.meta.url)));
const legacyStateDir = path.join(packageDir, ".state");
const appHomeDir = process.env.AI_ZERO_TOKEN_HOME || path.join(os.homedir(), ".ai-zero-token");
const stateDir = path.join(appHomeDir, ".state");

let migrationPromise: Promise<void> | null = null;

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(fileName: string): Promise<void> {
  const legacyPath = path.join(legacyStateDir, fileName);
  const nextPath = path.join(stateDir, fileName);

  if (!(await pathExists(legacyPath)) || (await pathExists(nextPath))) {
    return;
  }

  await fs.mkdir(stateDir, { recursive: true });
  await fs.copyFile(legacyPath, nextPath);
}

export function getStateDir(): string {
  return stateDir;
}

export function getStorePath(): string {
  return path.join(stateDir, "store.json");
}

export function getSettingsPath(): string {
  return path.join(stateDir, "settings.json");
}

export async function ensureStateMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      if (legacyStateDir === stateDir) {
        return;
      }

      await copyIfMissing("store.json");
      await copyIfMissing("settings.json");
    })();
  }

  await migrationPromise;
}
