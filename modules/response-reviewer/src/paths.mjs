import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

const roots = new AsyncLocalStorage();
export function withDataRoot(root, operation) {
  return roots.run(path.resolve(root), operation);
}

export const pluginRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function dataRoot() {
  return path.resolve(
    roots.getStore() || path.join(
      process.env.AI_ZERO_TOKEN_HOME || path.join(os.homedir(), ".ai-zero-token"),
      ".state", "tools", "response-reviewer",
    ),
  );
}

export function runtimePath() {
  return path.join(dataRoot(), "runtime.json");
}

export function storePath() {
  return path.join(dataRoot(), "store.json");
}

export function resolveProjectDir(projectDir) {
  return path.resolve(projectDir || process.cwd());
}
