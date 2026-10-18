import fs from "node:fs/promises";
import path from "node:path";

/** Use only for identity checks; keep the original path for file operations. */
export function normalizeCodexConfigPath(file: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") return path.posix.resolve(file);
  // Node can record a thread cwd as \\?\C:\... (or \\?\UNC\server\share\...).
  // Convert both ordinary and namespaced paths to the same Windows spelling.
  return path.win32.toNamespacedPath(path.win32.resolve(file)).toLowerCase();
}

export async function codexConfigPathIdentity(file: string): Promise<string> {
  try {
    // Also recognize directory junctions and symlinks to the global config file.
    return normalizeCodexConfigPath(await fs.realpath(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return normalizeCodexConfigPath(file);
  }
}
