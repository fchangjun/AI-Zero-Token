import fs from "node:fs/promises";
import path from "node:path";
import { ensureStateMigrated, getStateDir } from "./state-paths.js";

export type GithubImageBedHistoryItem = {
  id: string;
  createdAt: number;
  filename: string;
  path: string;
  url: string;
  htmlUrl: string;
  downloadUrl: string;
  owner: string;
  repository: string;
  branch: string;
  size: number;
  mimeType: string;
  previewUrl: string;
  sha?: string;
};

type GithubImageBedHistoryStore = {
  version: 1;
  items: GithubImageBedHistoryItem[];
};

const MAX_HISTORY_ITEMS = 100;

function createEmptyStore(): GithubImageBedHistoryStore {
  return {
    version: 1,
    items: [],
  };
}

export function getGithubImageBedHistoryPath(): string {
  return path.join(getStateDir(), "github-image-bed-history.json");
}

async function readStore(): Promise<GithubImageBedHistoryStore> {
  try {
    await ensureStateMigrated();
    const raw = await fs.readFile(getGithubImageBedHistoryPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<GithubImageBedHistoryStore>;
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_HISTORY_ITEMS) : [],
    };
  } catch {
    return createEmptyStore();
  }
}

async function writeStore(store: GithubImageBedHistoryStore): Promise<void> {
  await ensureStateMigrated();
  await fs.mkdir(getStateDir(), { recursive: true });
  await fs.writeFile(getGithubImageBedHistoryPath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function listGithubImageBedHistory(limit = 50): Promise<GithubImageBedHistoryItem[]> {
  const store = await readStore();
  return store.items.slice(0, Math.max(1, Math.min(limit, MAX_HISTORY_ITEMS)));
}

export async function appendGithubImageBedHistory(item: GithubImageBedHistoryItem): Promise<GithubImageBedHistoryItem> {
  const store = await readStore();
  store.items = [item, ...store.items.filter((entry) => entry.id !== item.id)].slice(0, MAX_HISTORY_ITEMS);
  await writeStore(store);
  return item;
}

export async function findGithubImageBedHistoryItem(id: string): Promise<GithubImageBedHistoryItem | null> {
  const store = await readStore();
  return store.items.find((entry) => entry.id === id) || null;
}

export async function removeGithubImageBedHistoryItem(id: string): Promise<GithubImageBedHistoryItem | null> {
  const store = await readStore();
  const target = store.items.find((entry) => entry.id === id) || null;
  if (!target) {
    return null;
  }

  store.items = store.items.filter((entry) => entry.id !== id);
  await writeStore(store);
  return target;
}

export async function clearGithubImageBedHistory(): Promise<void> {
  await writeStore(createEmptyStore());
}
