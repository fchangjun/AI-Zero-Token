import fs from "node:fs/promises";
import type { OAuthProfile } from "../types.js";
import {
  ensureStateMigrated,
  getStateDir,
  getStorePath,
} from "./state-paths.js";

type DemoStore = {
  version: 1;
  activeProfileId?: string;
  profiles: Record<string, OAuthProfile>;
};

const PROFILE_CLAIM_PATH = "https://api.openai.com/profile";
let storeMutationQueue: Promise<void> = Promise.resolve();

function createEmptyStore(): DemoStore {
  return {
    version: 1,
    profiles: {},
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1] ?? "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = Buffer.from(normalized + padding, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractEmailFromAccessToken(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  const profileClaim = payload?.[PROFILE_CLAIM_PATH] as Record<string, unknown> | undefined;
  const email = profileClaim?.email;
  if (typeof email === "string" && email.trim()) {
    return email.trim();
  }

  const topLevelEmail = payload?.email;
  if (typeof topLevelEmail === "string" && topLevelEmail.trim()) {
    return topLevelEmail.trim();
  }

  return undefined;
}

export async function loadStore(): Promise<DemoStore> {
  try {
    await ensureStateMigrated();
    const raw = await fs.readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DemoStore>;
    const normalizedProfiles = Object.fromEntries(
      Object.entries(parsed.profiles ?? {}).map(([profileId, profile]) => [
        profileId,
        (() => {
          const recoveredEmail =
            typeof profile.email === "string" && profile.email.trim()
              ? profile.email.trim()
              : extractEmailFromAccessToken(profile.access);

          return {
            ...profile,
            mode: "oauth_account" as const,
            email: recoveredEmail,
          };
        })(),
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
  await ensureStateMigrated();
  await fs.mkdir(getStateDir(), { recursive: true });
  await fs.writeFile(getStorePath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function withStoreMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = storeMutationQueue.then(operation, operation);
  storeMutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function saveProfile(profile: OAuthProfile): Promise<void> {
  await withStoreMutation(async () => {
    const store = await loadStore();
    store.profiles[profile.profileId] = profile;
    store.activeProfileId = profile.profileId;
    await saveStore(store);
  });
}

export async function updateProfile(
  profileId: string,
  updater: (profile: OAuthProfile) => OAuthProfile,
): Promise<OAuthProfile | null> {
  return withStoreMutation(async () => {
    const store = await loadStore();
    const profile = store.profiles[profileId];
    if (!profile) {
      return null;
    }

    const updated = updater(profile);
    store.profiles[profileId] = updated;
    await saveStore(store);
    return updated;
  });
}

export async function listProfiles(): Promise<OAuthProfile[]> {
  const store = await loadStore();
  return Object.values(store.profiles);
}

export async function setActiveProfile(profileId: string): Promise<OAuthProfile | null> {
  return withStoreMutation(async () => {
    const store = await loadStore();
    const profile = store.profiles[profileId];
    if (!profile) {
      return null;
    }

    store.activeProfileId = profileId;
    await saveStore(store);
    return profile;
  });
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

export async function removeProfile(profileId: string): Promise<OAuthProfile | null> {
  return withStoreMutation(async () => {
    const store = await loadStore();
    if (!store.profiles[profileId]) {
      return null;
    }

    delete store.profiles[profileId];

    if (store.activeProfileId === profileId) {
      store.activeProfileId = Object.keys(store.profiles)[0];
    }

    await saveStore(store);
    return store.activeProfileId ? store.profiles[store.activeProfileId] ?? null : null;
  });
}

export async function clearStore(): Promise<void> {
  await withStoreMutation(async () => {
    await fs.rm(getStateDir(), { recursive: true, force: true });
  });
}

export { getStateDir, getStorePath };
