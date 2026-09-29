import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
export type ThreadSettings = { id: string; model_provider: string; model: string | null; reasoning_effort: string | null };
export type ThreadSnapshot = { settings: ThreadSettings[]; fingerprint: string };

export function sqlString(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

/** Use the bundled runtime when available; older Node releases use system sqlite3. */
export async function codexSqlite(dbPath: string, sql: string, read = false): Promise<Record<string, unknown>[]> {
  let module: any;
  try {
    const name = process.versions.bun ? "bun:sqlite" : "node:sqlite";
    module = await import(name);
  } catch { /* Node 22 before SQLite was enabled by default. */ }
  if (module) {
    const db = process.versions.bun ? new module.Database(dbPath) : new module.DatabaseSync(dbPath);
    try {
      db.exec("PRAGMA busy_timeout=5000;");
      if (read) return db.prepare(sql).all();
      db.exec(sql);
      return [];
    } finally { db.close(); }
  }
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile("sqlite3", ["-batch", "-bail", "-json", dbPath], {
        timeout: 20_000, maxBuffer: 32 * 1024 * 1024,
      }, (error, output) => error ? reject(error) : resolve(output));
      // A large history can exceed the OS command-line limit; SQL goes through stdin.
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(`PRAGMA busy_timeout=5000; ${sql}\n`);
    });
    // busy_timeout itself returns a row in sqlite3's JSON mode.
    const output = stdout.replace(/^\[\{"timeout":5000\}\]\s*/, "").trim();
    return read && output ? JSON.parse(output) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("当前运行环境缺少 SQLite。请使用新版 AZT 桌面版、Node.js 22.13+ 或安装 sqlite3 后重试。");
    }
    // Do not expose SQL, paths or conversation metadata from child-process errors.
    throw new Error("Codex 会话数据库操作失败，未完成切换。请确认 Codex 已完全退出，且数据库可读写。", { cause: error });
  }
}

export async function readThreadSnapshot(dbPath: string): Promise<ThreadSnapshot> {
  const columns = await codexSqlite(dbPath, "PRAGMA table_info(threads)", true);
  for (const name of ["id", "model_provider", "model", "reasoning_effort", "rollout_path"]) {
    if (!columns.some((column) => column.name === name)) throw new Error(`当前 Codex 数据库结构尚未适配：threads 缺少 ${name}。未修改会话。`);
  }
  const rows = await codexSqlite(dbPath, "SELECT * FROM threads ORDER BY id", true);
  const settings = rows.map((row) => ({
    id: String(row.id), model_provider: String(row.model_provider),
    model: row.model === null ? null : String(row.model),
    reasoning_effort: row.reasoning_effort === null ? null : String(row.reasoning_effort),
  }));
  // Compare all other columns on recovery: never overwrite conversations that advanced.
  const rest = rows.map(({ model_provider, model, reasoning_effort, ...row }) => row);
  const rollouts = await Promise.all(rows.map(async (row) => {
    if (typeof row.rollout_path !== "string" || !row.rollout_path) return null;
    const file = path.resolve(path.dirname(dbPath), row.rollout_path);
    try { const stats = await fs.stat(file); return { file, size: stats.size, mtime: stats.mtimeMs }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { file, missing: true }; throw error; }
  }));
  const { createHash } = await import("node:crypto");
  return { settings, fingerprint: createHash("sha256").update(JSON.stringify({ rest, rollouts })).digest("hex") };
}

export async function updateThreadSettings(dbPath: string, before: ThreadSettings[], after: ThreadSettings[]): Promise<void> {
  if (before.length !== after.length) throw new Error("会话同步计划不完整。");
  const statements = ["BEGIN IMMEDIATE;", "CREATE TEMP TABLE azt_switch_guard (ok INTEGER CHECK(ok=1));",
    `INSERT INTO azt_switch_guard SELECT count(*)=${before.length} FROM threads;`];
  for (let index = 0; index < before.length; index++) {
    const previous = before[index]; const next = after[index];
    if (previous.id !== next.id) throw new Error("会话同步计划顺序不一致。");
    statements.push(`UPDATE threads SET model_provider=${sqlString(next.model_provider)}, model=${sqlString(next.model)}, reasoning_effort=${sqlString(next.reasoning_effort)} WHERE id=${sqlString(previous.id)} AND model_provider IS ${sqlString(previous.model_provider)} AND model IS ${sqlString(previous.model)} AND reasoning_effort IS ${sqlString(previous.reasoning_effort)};`,
      "INSERT INTO azt_switch_guard SELECT changes()=1;");
  }
  statements.push("COMMIT;");
  await codexSqlite(dbPath, statements.join("\n"));
}

export async function backupThreadDatabase(dbPath: string, backupPath: string): Promise<void> {
  await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  await codexSqlite(dbPath, `VACUUM INTO ${sqlString(backupPath)};`);
  await fs.chmod(backupPath, 0o600);
}
