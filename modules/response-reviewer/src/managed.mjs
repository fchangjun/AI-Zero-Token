import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "./server.mjs";
import { withDataRoot, storePath } from "./paths.mjs";
import { readRuntime } from "./runtime.mjs";
import { healthyRuntime } from "./runtime-client.mjs";
import { readStore, updateStore, listResponses } from "./store.mjs";
import { acquireLock } from "./lock.mjs";
import { normalizeStoredResponse } from "./store.mjs";

export async function startManagedReviewer({ root, frameOrigins }) {
  const release = await acquireLock(root, "service");
  try {
  const previous = await withDataRoot(root, () => readRuntime());
  if (await healthyRuntime(previous)) {
    throw new Error("此数据目录已有 Reviewer 运行，请在原 AZT 实例中管理，或先关闭原实例。");
  }
  // Validate before opening a port; a corrupt store is never silently replaced.
  await withDataRoot(root, () => readStore());
  const instance = await createServer({ root, port: 0, frameOrigins });
  let closing;
  return { ...instance, close() {
    closing ||= instance.close().finally(release);
    return closing;
  } };
  } catch (error) { await release(); throw error; }
}

export function reviewerHistory(root) {
  return withDataRoot(root, async () => (await listResponses({ limit: 100 })).map((item) => ({
    id: item.id, title: item.title, projectDir: item.projectDir, threadKey: item.threadKey,
    updatedAt: item.updatedAt, scopeId: item.scopeId, annotationCount: item.annotations.length,
  })));
}

export async function importLegacyReviewer(root, sourcePath) {
  const source = path.resolve(sourcePath);
  return withDataRoot(root, async () => {
    const actualSource = await fs.realpath(source);
    const actualTarget = await fs.realpath(storePath()).catch(() => storePath());
    if (actualSource === actualTarget) throw new Error("不能把当前数据文件导入自身。");
    const stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new Error("历史数据必须是 50MB 以内的 JSON 文件。");
    const legacy = JSON.parse(await fs.readFile(source, "utf8"));
    if (![1, 2].includes(legacy.version) || !legacy.responses || Array.isArray(legacy.responses) || typeof legacy.responses !== "object") {
      throw new Error("不是受支持的 Reviewer 历史数据。");
    }
    // Validate every record before beginning any write; missing v1 metadata gets
    // deterministic defaults, but invalid metadata is never silently discarded.
    const entries = Object.entries(legacy.responses).map(([id, item]) => [id, normalizeStoredResponse(id, item)]);
    return updateStore((store) => {
      let imported = 0;
      for (const [id, item] of entries) {
        if (Object.hasOwn(store.responses, id)) continue;
        // Preserve snapshots/annotations, not old queues, tokens, or inferred workspace permissions.
        store.responses[id] = { ...item, files: item.files || [], projectDir: null, workspaceSource: null };
        imported += 1;
      }
      return { imported, skipped: entries.length - imported, source, workspaceReconfirmationRequired: true };
    });
  });
}
