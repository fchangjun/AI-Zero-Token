import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export type CodexSwitchRuntime = {
  /** May gracefully close a desktop client; must never kill an active turn. */
  prepare?: () => Promise<void>;
  assertStopped: (home: string) => Promise<void>;
};

export async function assertCodexStopped(home: string): Promise<void> {
  if (process.platform === "win32") {
    const { stdout } = await exec("tasklist", ["/FO", "CSV", "/NH"], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    if (/^"[^"\r\n]*(?:codex|chatgpt)[^"\r\n]*\.exe"/im.test(stdout)) throw busyError();
    return;
  }
  // Inspect open handles rather than recursively walking CODEX_HOME: managed
  // worktrees and plugin caches can contain millions of otherwise unrelated files.
  await fs.mkdir(home, { recursive: true });
  const realHome = await fs.realpath(home);
  let output = "";
  try {
    const args = ["-n", "-P", "-F", "pn", ...(process.getuid ? ["-a", "-u", String(process.getuid())] : [])];
    const { stdout } = await exec("lsof", args, { timeout: 20_000, maxBuffer: 32 * 1024 * 1024 });
    output = stdout;
  } catch (error) {
    if ((error as { code?: unknown }).code === 1 && !(error as { stderr?: string }).stderr?.trim()) output = (error as { stdout?: string }).stdout ?? "";
    else throw new Error("无法检查 Codex 运行进程，未执行切换。请确认 lsof 可用。", { cause: error });
  }
  let pid: number | undefined;
  const roots = [realHome, path.resolve(home)];
  for (const line of output.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== undefined && pid !== process.pid) {
      const file = line.slice(1);
      if (roots.some((root) => file === root || file.startsWith(root + path.sep))) throw busyError();
    }
  }
}

function busyError(): Error {
  return Object.assign(new Error("Codex 或共享数据目录的 CLI/IDE 仍在运行。请等待当前回复完成并完全退出后重试；会话设置尚未切换。"), { statusCode: 409 });
}

export const stoppedCodexRuntime: CodexSwitchRuntime = { assertStopped: assertCodexStopped };

/** Only a normal completed turn permits an automatic desktop quit. Unknown tails fail closed. */
export async function assertNoActiveCodexTurns(home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex")): Promise<void> {
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const handle = await fs.open(file, "r");
      try {
        const stats = await handle.stat();
        const size = Math.min(stats.size, 256 * 1024);
        const buffer = Buffer.alloc(size);
        await handle.read(buffer, 0, size, stats.size - size);
        const lines = buffer.toString("utf8").split("\n");
        if (stats.size > size) lines.shift();
        let terminal = false;
        for (const line of lines.reverse()) {
          if (!line.trim()) continue;
          let item: any;
          try { item = JSON.parse(line); } catch { throw busyError(); }
          if (item.type !== "event_msg") continue;
          const type = item.payload?.type;
          if (["task_complete", "turn_aborted"].includes(type)) { terminal = true; break; }
          if (type === "task_started") throw busyError();
        }
        if (!terminal && stats.size > size) throw busyError();
      } finally { await handle.close(); }
    }
  }
  await visit(path.join(home, "sessions"));
}
