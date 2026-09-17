import fs from "node:fs/promises";
import path from "node:path";
import type { ExternalProviderInspection } from "../providers/openai-compatible/inspect.js";
import { ensureStateMigrated, getExternalProviderInspectionHistoryPath } from "./state-paths.js";

export type ExternalProviderInspectionHistoryEntry = {
  id: string;
  createdAt: number;
  providerId: string;
  baseUrl: string;
  inspection: ExternalProviderInspection;
  submittedCatalogModelIds?: string[];
  writtenCatalogModelIds?: string[];
  configuredModelId?: string;
};

type Store = { version: 1; entries: ExternalProviderInspectionHistoryEntry[] };
type StoreOptions = { path?: string };
const MAX_ENTRIES = 30;

async function readStore(storePath = getExternalProviderInspectionHistoryPath()): Promise<Store> {
  try {
    await ensureStateMigrated();
    const parsed = JSON.parse(await fs.readFile(storePath, "utf8")) as Partial<Store>;
    return { version: 1, entries: Array.isArray(parsed.entries) ? parsed.entries.slice(0, MAX_ENTRIES) : [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeStore(store: Store, storePath = getExternalProviderInspectionHistoryPath()): Promise<void> {
  await ensureStateMigrated();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const target = storePath;
  const temp = `${target}.tmp-${process.pid}`;
  await fs.writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temp, target);
  await fs.chmod(target, 0o600);
}

export async function appendExternalProviderInspectionHistory(entry: ExternalProviderInspectionHistoryEntry, options?: StoreOptions): Promise<void> {
  const storePath = options?.path ?? getExternalProviderInspectionHistoryPath();
  const store = await readStore(storePath);
  store.entries = [entry, ...store.entries.filter((item) => item.id !== entry.id)].slice(0, MAX_ENTRIES);
  await writeStore(store, storePath);
}

export async function updateExternalProviderInspectionHistory(
  id: string,
  update: Pick<ExternalProviderInspectionHistoryEntry, "submittedCatalogModelIds" | "writtenCatalogModelIds" | "configuredModelId">,
  options?: StoreOptions,
): Promise<void> {
  const storePath = options?.path ?? getExternalProviderInspectionHistoryPath();
  const store = await readStore(storePath);
  const entry = store.entries.find((item) => item.id === id);
  if (!entry) return;
  Object.assign(entry, update);
  await writeStore(store, storePath);
}

export async function listExternalProviderInspectionHistory(limit = 10, options?: StoreOptions): Promise<ExternalProviderInspectionHistoryEntry[]> {
  return (await readStore(options?.path)).entries.slice(0, Math.max(1, Math.min(limit, MAX_ENTRIES)));
}
