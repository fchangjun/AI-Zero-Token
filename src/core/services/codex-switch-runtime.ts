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

export type CodexOpenFile = { pid: number; command: string; file: string; relativePath: string; startedAt?: number };

/** lsof also reports working directories, executables and plugin resources. */
export function parseCodexOpenFiles(output: string, roots: readonly string[], ownPid = process.pid): CodexOpenFile[] {
  const files: CodexOpenFile[] = [];
  let pid: number | undefined;
  let command = "未知进程";
  for (const line of output.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) { pid = Number(line.slice(1)); command = "未知进程"; }
    else if (line.startsWith("c")) command = line.slice(1).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100) || "未知进程";
    else if (line.startsWith("n") && pid !== undefined && pid !== ownPid) {
      const file = line.slice(1);
      const root = roots.find((root) => file === root || file.startsWith(root + path.sep));
      if (root !== undefined) files.push({ pid, command, file, relativePath: file.slice(root.length).replace(/^[/\\]/, "").replaceAll("\\", "/") });
    }
  }
  return files;
}

function isRollout(file: CodexOpenFile): boolean {
  return /^(sessions|archived_sessions)\/.+\.jsonl(?: \(deleted\))?$/.test(file.relativePath);
}

function isCodexCommand(command: string): boolean {
  return /^(codex|chatgpt)(?:$|[\s._-])/i.test(command);
}

function isSwitchResource(file: CodexOpenFile): boolean {
  return /^state_\d+\.sqlite(?:-(wal|shm))?(?: \(deleted\))?$/.test(file.relativePath)
    || /^(config\.toml|models_cache\.json)$/.test(file.relativePath)
    || /^model-catalogs\//.test(file.relativePath)
    || /^thread-writer-locks\//.test(file.relativePath)
    || isRollout(file)
    // The desktop may have a live frontend before its first backend has started.
    || /^(sqlite|ipc)\//.test(file.relativePath);
}

function describeOwners(files: readonly CodexOpenFile[]): string {
  const byPid = new Map<number, CodexOpenFile[]>();
  for (const file of files) byPid.set(file.pid, [...(byPid.get(file.pid) ?? []), file]);
  const owners = [...byPid.values()].map((owned) => {
    const resources = [...new Set(owned.map((file) => file.relativePath).filter(Boolean))];
    const detail = resources.length ? `，占用 ${resources.slice(0, 2).join("、")}${resources.length > 2 ? " 等文件" : ""}` : "";
    return `${owned[0].command}（PID ${owned[0].pid}${detail}）`;
  });
  return owners.join("；");
}

function inUseError(files: readonly CodexOpenFile[]): Error {
  return Object.assign(new Error(`以下 Codex 进程仍在使用会话设置：${describeOwners(files)}。请等待当前回复结束，并退出对应的 Codex 客户端或 CLI/IDE 后重试；切换尚未完成。`), { statusCode: 409 });
}

export function assertNoRunningCodexClients(files: readonly CodexOpenFile[]): void {
  // Codex caches provider settings in memory. Other database readers can coexist;
  // SQLite transactions, not the presence of an open file, decide write conflicts.
  const blockers = files.filter((file) => isCodexCommand(file.command) && isSwitchResource(file));
  if (blockers.length) throw inUseError(blockers);
}

function processInspectionError(error: unknown, command: string): Error {
  const failure = error as { code?: string | number; killed?: boolean; signal?: string; stderr?: string };
  let reason: string;
  if (failure.code === "ENOENT") reason = `未找到进程检查工具 ${command}（ENOENT）`;
  else if (failure.code === "EACCES" || failure.code === "EPERM") reason = `没有执行 ${command} 的权限（${failure.code}）`;
  else if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") reason = "lsof 输出超过检查容量限制";
  else if (failure.killed && failure.signal === "SIGTERM") reason = "lsof 检查超过 20 秒，已超时终止";
  else {
    const detail = failure.stderr?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
    reason = `lsof 检查失败（${failure.code ?? failure.signal ?? "未知错误"}）${detail ? `：${detail}` : ""}`;
  }
  return Object.assign(new Error(`无法检查 Codex 运行进程，未执行切换。${reason}。`, { cause: error }), {
    code: "AZT_CODEX_PROCESS_CHECK_FAILED",
  });
}

export async function getCodexOpenFiles(home: string): Promise<CodexOpenFile[]> {
  // Enumerate handles, not the filesystem: plugin caches and worktrees can be huge.
  await fs.mkdir(home, { recursive: true });
  const realHome = await fs.realpath(home);
  // Finder and development launchers may not include /usr/sbin in PATH.
  const command = process.platform === "darwin" ? "/usr/sbin/lsof" : "lsof";
  let output = "";
  try {
    const args = ["-n", "-P", "-F", "pcn", ...(process.getuid ? ["-a", "-u", String(process.getuid())] : [])];
    const { stdout } = await exec(command, args, { timeout: 20_000, maxBuffer: 32 * 1024 * 1024 });
    output = stdout;
  } catch (error) {
    if ((error as { code?: unknown }).code === 1 && !(error as { stderr?: string }).stderr?.trim()) output = (error as { stdout?: string }).stdout ?? "";
    else throw processInspectionError(error, command);
  }
  return parseCodexOpenFiles(output, [realHome, path.resolve(home)]);
}

export async function assertCodexStopped(home: string): Promise<void> {
  if (process.platform === "win32") {
    const { stdout } = await exec("tasklist", ["/FO", "CSV", "/NH"], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    const owners = stdout.split(/\r?\n/).flatMap((line): CodexOpenFile[] => {
      const match = /^"([^"\r\n]*(?:codex|chatgpt)[^"\r\n]*\.exe)","(\d+)"/i.exec(line);
      return match ? [{ pid: Number(match[2]), command: match[1], file: "", relativePath: "" }] : [];
    });
    if (owners.length) throw inUseError(owners);
    return;
  }
  assertNoRunningCodexClients(await getCodexOpenFiles(home));
}

export const stoppedCodexRuntime: CodexSwitchRuntime = { assertStopped: assertCodexStopped };

/** Open handles are diagnostic candidates only after SQLite reports a real lock conflict. */
export async function explainCodexDatabaseError(error: unknown, home: string): Promise<unknown> {
  if (process.platform === "win32" || !(error instanceof Error) || (error as { code?: string }).code !== "AZT_CODEX_DB_BUSY") return error;
  try {
    const files = (await getCodexOpenFiles(home)).filter((file) => /^state_5\.sqlite(?:-(wal|shm|journal))?$/.test(file.relativePath));
    if (!files.length) return error;
    return Object.assign(new Error(`${error.message} 当前打开数据库的程序：${describeOwners(files)}。这些是排查线索，打开文件本身并不代表持有冲突锁。`, { cause: error }), { statusCode: 409, code: "AZT_CODEX_DB_BUSY" });
  } catch { return error; }
}

type LastTurn = { type: "task_started" | "task_complete" | "turn_aborted"; timestamp?: string } | "unknown" | "none";

async function readLastTurn(file: string): Promise<LastTurn> {
  const handle = await fs.open(file, "r");
  try {
    const { size } = await handle.stat();
    if (size === 0) return "none";
    // Large tool outputs can put the latest lifecycle event beyond a single tail.
    for (let limit = 256 * 1024; limit <= 8 * 1024 * 1024; limit *= 2) {
      const length = Math.min(size, limit);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, size - length);
      const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
      if (size > length) lines.shift();
      for (const line of lines.reverse()) {
        if (!line.trim()) continue;
        let item: { type?: string; timestamp?: string; payload?: { type?: string } };
        try { item = JSON.parse(line); } catch { return "unknown"; }
        if (item?.type !== "event_msg") continue;
        const type = item.payload?.type;
        if (type === "task_started" || type === "task_complete" || type === "turn_aborted") return { type, timestamp: item.timestamp };
      }
      if (size <= length) return "none";
    }
    return "unknown";
  } finally { await handle.close(); }
}

async function processStartTimes(files: readonly CodexOpenFile[]): Promise<Map<number, number>> {
  const pids = [...new Set(files.map((file) => file.pid))];
  if (!pids.length) return new Map();
  try {
    const { stdout } = await exec(process.platform === "darwin" ? "/bin/ps" : "ps", ["-p", pids.join(","), "-o", "pid=,lstart="], {
      timeout: 2000, env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });
    const result = new Map<number, number>();
    for (const line of stdout.split(/\r?\n/)) {
      const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
      const timestamp = match ? Date.parse(match[2]) : NaN;
      if (match && Number.isFinite(timestamp)) result.set(Number(match[1]), timestamp);
    }
    return result;
  } catch { return new Map(); } // Without process age, unfinished records still block.
}

/** Closed historical files cannot tell us whether a currently running backend is busy. */
export async function assertNoActiveCodexTurns(
  home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  observedFiles?: readonly CodexOpenFile[],
): Promise<void> {
  const files = (observedFiles ?? await getCodexOpenFiles(home)).filter((file) => isRollout(file) && isCodexCommand(file.command));
  const starts = observedFiles ? new Map<number, number>() : await processStartTimes(files);
  const turns = new Map<string, LastTurn>();
  for (const file of files) {
    let turn = turns.get(file.file);
    if (turn === undefined) {
      try { turn = await readLastTurn(file.file); } catch { turn = "unknown"; }
      turns.set(file.file, turn);
    }
    if (turn === "unknown") throw Object.assign(new Error(`无法确认 Codex 正在打开的会话是否已结束（PID ${file.pid}）。请等待回复完成并手动完全退出 Codex 后重试；尚未修改会话设置。`), { statusCode: 409 });
    if (turn !== "none" && turn.type === "task_started") {
      const startedAt = file.startedAt ?? starts.get(file.pid);
      const eventAt = turn.timestamp ? Date.parse(turn.timestamp) : NaN;
      // An unfinished event from a previous backend lifetime is crash history, not a live turn.
      if (startedAt !== undefined && Number.isFinite(eventAt) && eventAt < startedAt - 1000) continue;
      throw Object.assign(new Error(`Codex 有正在回复的会话（PID ${file.pid}）。请等待回复完成后再切换；尚未修改会话设置。`), { statusCode: 409 });
    }
  }
}
