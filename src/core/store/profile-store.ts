import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OAuthProfile } from "../types.js";

type DemoStore = {
  version: 1;
  activeProfileId?: string;
  profiles: Record<string, OAuthProfile>;
};

const projectDir = path.dirname(fileURLToPath(new URL("../../../package.json", import.meta.url)));
const stateDir = path.join(projectDir, ".state");
const storePath = path.join(stateDir, "store.json");

function createEmptyStore(): DemoStore {
  return {
    version: 1,
    profiles: {},
  };
}

export function getStateDir(): string {
  return stateDir;
}

export function getStorePath(): string {
  return storePath;
}

export async function loadStore(): Promise<DemoStore> {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DemoStore>;
    const normalizedProfiles = Object.fromEntries(
      Object.entries(parsed.profiles ?? {}).map(([profileId, profile]) => [
        profileId,
        {
          ...profile,
          mode: "oauth_account" as const,
        },
      ]),
    );
    return {
      version: 1,
      activeProfileId: parsed.activeProfileId,
      profiles: normalizedProfiles,
    };
  } catch {
    return createEmptyStore();
  }
}

export async function saveStore(store: DemoStore): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function saveProfile(profile: OAuthProfile): Promise<void> {
  const store = await loadStore();
  store.profiles[profile.profileId] = profile;
  store.activeProfileId = profile.profileId;
  await saveStore(store);
}

export async function getActiveProfile(): Promise<OAuthProfile | null> {
  const store = await loadStore();
  const activeId = store.activeProfileId?.trim();
  if (activeId && store.profiles[activeId]) {
    return store.profiles[activeId] ?? null;
  }

  const first = Object.values(store.profiles)[0];
  return first ?? null;
}

export async function clearStore(): Promise<void> {
  await fs.rm(stateDir, { recursive: true, force: true });
}
