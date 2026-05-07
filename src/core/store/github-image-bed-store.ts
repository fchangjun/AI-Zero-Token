import fs from "node:fs/promises";
import path from "node:path";
import { ensureStateMigrated, getStateDir } from "./state-paths.js";

export type GithubImageBedStore = {
  version: 1;
  github: {
    token: string;
  };
};

function createEmptyStore(): GithubImageBedStore {
  return {
    version: 1,
    github: {
      token: "",
    },
  };
}

export async function loadGithubImageBedStore(): Promise<GithubImageBedStore> {
  try {
    await ensureStateMigrated();
    const raw = await fs.readFile(getGithubImageBedStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<GithubImageBedStore>;
    return {
      version: 1,
      github: {
        token: typeof parsed.github?.token === "string" ? parsed.github.token.trim() : "",
      },
    };
  } catch {
    return createEmptyStore();
  }
}

export async function saveGithubImageBedStore(store: GithubImageBedStore): Promise<void> {
  await ensureStateMigrated();
  await fs.mkdir(getStateDir(), { recursive: true });
  await fs.writeFile(getGithubImageBedStorePath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function updateGithubImageBedToken(token: string): Promise<GithubImageBedStore> {
  const store = await loadGithubImageBedStore();
  store.github.token = token.trim();
  await saveGithubImageBedStore(store);
  return store;
}

export async function clearGithubImageBedStore(): Promise<void> {
  await saveGithubImageBedStore(createEmptyStore());
}

export function getGithubImageBedStorePath(): string {
  return path.join(getStateDir(), "github-image-bed.json");
}
