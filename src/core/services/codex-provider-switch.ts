import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ACTIVE_CODEX_PROVIDER_ID, buildCodexSwitchFiles, getCodexConfigPath, getCodexHomeDir,
  parseRootString, readManagedNativeCodexSettings, readNativeCodexSettings, type CodexCatalogModelInput, type NativeCodexSettings,
} from "../store/codex-auth-store.js";
import { backupThreadDatabase, codexSqlite, readThreadSnapshot, updateThreadSettings, type ThreadSettings, type ThreadSnapshot } from "../store/codex-thread-state.js";
import { getStateDir } from "../store/state-paths.js";
import { explainCodexDatabaseError, stoppedCodexRuntime, type CodexSwitchRuntime } from "./codex-switch-runtime.js";
import { codexConfigPathIdentity, normalizeCodexConfigPath } from "./codex-config-path.js";

export type ThirdPartySwitchTarget = {
  modelCatalogUrl?: string;
  baseUrl: string; bearerToken: string; model: string; catalogModels: CodexCatalogModelInput[]; displayName: string;
};
type NativeSnapshot = { model: string | null; effort: string | null; catalog: string | null };
type NativeThreadSettings = { model: string | null; reasoning_effort: string | null };
type SwitchState = { version: 2; home: string; native: NativeSnapshot; nativeThreads: Record<string, NativeThreadSettings> };
type FileChange = { file: string; before: string | null; after: string; index: number };
type Journal = {
  version: 1; home: string; directory: string; files: FileChange[];
  db?: { file: string; before: ThreadSnapshot; after: ThreadSettings[] };
};
export const getCodexSwitchStatePath = () => path.join(getStateDir(), "codex-switch-state.json");
const pendingPath = () => `${getCodexSwitchStatePath()}.pending`;
export async function hasPendingCodexSwitch(): Promise<boolean> { return exists(pendingPath()); }
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
async function readOptional(file: string): Promise<Buffer | undefined> {
  try { return await fs.readFile(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
async function writeAtomic(file: string, data: Buffer | string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Use the same predictable staging path as the existing config editor.
  const temp = `${file}.tmp-${process.pid}`;
  const handle = await fs.open(temp, "wx", 0o600);
  try {
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}
async function exists(file: string): Promise<boolean> {
  try { await fs.stat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
function sameSettings(left: ThreadSettings[], right: ThreadSettings[]): boolean { return JSON.stringify(left) === JSON.stringify(right); }

function nativeSnapshot(settings: NativeCodexSettings): NativeSnapshot {
  return { model: settings.model ?? null, effort: settings.effort ?? null, catalog: settings.catalog ?? null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSwitchState(raw: Buffer | undefined, config: string, home: string): SwitchState {
  if (!raw) return {
    version: 2, home,
    native: nativeSnapshot({ ...readNativeCodexSettings(config), ...readManagedNativeCodexSettings(config) }),
    nativeThreads: Object.create(null),
  };
  let value: unknown;
  try { value = JSON.parse(raw.toString()); }
  catch { throw new Error("Codex 恢复记录无法读取，未执行切换。请保留记录和备份以便修复。"); }
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || value.home !== home
    || !isRecord(value.native) || !isRecord(value.nativeThreads)) throw new Error("切换状态与当前 Codex 目录不匹配。");
  const field = (item: Record<string, unknown>, key: string, optional = false): string | null => {
    const result = item[key];
    if (result === null || (optional && result === undefined)) return null;
    if (typeof result === "string") return result;
    throw new Error("Codex 恢复记录格式无效，未执行切换。请保留记录和备份以便修复。");
  };
  const native: NativeSnapshot = {
    model: field(value.native, "model", value.version === 1),
    effort: field(value.native, "effort", value.version === 1),
    catalog: field(value.native, "catalog", value.version === 1),
  };
  if (value.version === 1) {
    // v1 filled missing defaults from a cache or thread. Matching markers retain the actual original value.
    const original = readManagedNativeCodexSettings(config);
    if (Object.hasOwn(original, "model")) native.model = original.model ?? null;
    if (Object.hasOwn(original, "catalog")) native.catalog = original.catalog ?? null;
  }
  const nativeThreads: SwitchState["nativeThreads"] = Object.create(null);
  for (const [id, settings] of Object.entries(value.nativeThreads)) {
    if (!isRecord(settings)) throw new Error("Codex 对话恢复记录格式无效，未执行切换。");
    nativeThreads[id] = { model: field(settings, "model"), reasoning_effort: field(settings, "reasoning_effort") };
  }
  return { version: 2, home, native, nativeThreads };
}

function chooseEffort(current: string | null | undefined, supported: readonly string[] | undefined): string | null {
  if (supported === undefined) return current ?? null;
  return supported.find((effort) => effort === current) ?? (supported.includes("medium") ? "medium" : supported[0]) ?? null;
}

async function assertNoProjectOverrides(dbPath: string): Promise<void> {
  const columns = await codexSqlite(dbPath, "PRAGMA table_info(threads)", true);
  if (!columns.some((column) => column.name === "cwd")) return;
  const rows = await codexSqlite(dbPath, "SELECT DISTINCT cwd FROM threads", true);
  const checked = new Set<string>([await codexConfigPathIdentity(getCodexConfigPath())]);
  const checkedPaths = new Set<string>();
  for (const row of rows) {
    if (typeof row.cwd !== "string" || !path.isAbsolute(row.cwd)) continue;
    let directory = row.cwd;
    while (directory !== path.dirname(directory)) {
      const configFile = path.join(directory, ".codex", "config.toml");
      const candidate = normalizeCodexConfigPath(configFile);
      if (!checkedPaths.has(candidate)) {
        checkedPaths.add(candidate);
        const identity = await codexConfigPathIdentity(configFile);
        if (!checked.has(identity)) {
          checked.add(identity);
          const text = (await readOptional(configFile))?.toString();
          if (text && /^\s*(model_provider|model|model_reasoning_effort|openai_base_url|model_catalog_json|profile)\s*=/m.test(text)) {
            throw new Error(`项目 ${directory} 的 Codex 配置覆盖了连接或模型。请先移除该覆盖，再统一切换会话。`);
          }
        }
      }
      directory = path.dirname(directory);
    }
  }
}

/** Caller holds both the Codex config lock and the external-provider store lock. */
export class CodexProviderSwitch {
  constructor(private runtime: CodexSwitchRuntime = stoppedCodexRuntime) {}

  async recover(): Promise<void> {
    const raw = await readOptional(pendingPath());
    if (!raw) return;
    await this.runtime.prepare?.();
    await this.runtime.assertStopped(getCodexHomeDir());
    const journal = JSON.parse(raw.toString()) as Journal;
    this.validateJournal(journal);
    try { await this.rollback(journal); }
    catch (error) { throw await explainCodexDatabaseError(error, getCodexHomeDir()); }
  }

  private validateJournal(journal: Journal): void {
    const home = path.resolve(getCodexHomeDir());
    const backups = path.resolve(getStateDir(), "codex-switch-backups") + path.sep;
    const allowed = new Set([getCodexConfigPath(), path.join(home, "model-catalogs", "ai-zero-token-models.json"),
      path.join(getStateDir(), "external-providers.json"), getCodexSwitchStatePath()]);
    if (journal.version !== 1 || journal.home !== home || !path.resolve(journal.directory).startsWith(backups)
      || !Array.isArray(journal.files) || journal.files.some((item) => !allowed.has(item.file) || !Number.isSafeInteger(item.index) || item.index < 0)
      || (journal.db && journal.db.file !== path.join(home, "state_5.sqlite"))) throw new Error("切换恢复记录与当前 Codex 目录不匹配，已停止自动恢复。");
  }

  private async rollback(journal: Journal): Promise<void> {
    // Validate the entire set before restoring anything. New chats or user edits must win.
    for (const item of journal.files) {
      const content = await readOptional(item.file); const actual = content === undefined ? null : hash(content);
      if (actual !== item.before && actual !== item.after) throw new Error("切换中断后配置又被修改，已保留备份并停止自动回滚，避免覆盖新修改。");
      if (item.before !== null) {
        const backup = await fs.readFile(path.join(journal.directory, `before-${item.index}`));
        if (hash(backup) !== item.before) throw new Error("切换备份校验失败，已停止自动恢复。");
      }
    }
    if (journal.db) {
      const current = await readThreadSnapshot(journal.db.file);
      if (current.fingerprint !== journal.db.before.fingerprint || (!sameSettings(current.settings, journal.db.before.settings) && !sameSettings(current.settings, journal.db.after))) {
        throw new Error("切换中断后会话数据已更新，已停止自动回滚并保留备份。请勿用旧数据库覆盖新会话。");
      }
      if (!sameSettings(current.settings, journal.db.before.settings)) await updateThreadSettings(journal.db.file, current.settings, journal.db.before.settings);
    }
    for (const item of [...journal.files].reverse()) {
      if (item.before === null) await fs.rm(item.file, { force: true });
      else {
        const content = await fs.readFile(path.join(journal.directory, `before-${item.index}`));
        // Recovery uses a different staging name, including after a failed target write.
        const temp = `${item.file}.recover-${randomUUID()}`;
        await fs.writeFile(temp, content, { mode: 0o600 });
        await fs.rename(temp, item.file);
      }
    }
    await fs.rm(pendingPath());
  }

  async commit(target: ThirdPartySwitchTarget | undefined, storeContent: string, commitStore: () => Promise<void>): Promise<void> {
    try { await this.commitSwitch(target, storeContent, commitStore); }
    catch (error) { throw await explainCodexDatabaseError(error, getCodexHomeDir()); }
  }

  private async commitSwitch(target: ThirdPartySwitchTarget | undefined, storeContent: string, commitStore: () => Promise<void>): Promise<void> {
    await this.runtime.prepare?.();
    const home = path.resolve(getCodexHomeDir());
    await this.runtime.assertStopped(home);
    if (process.env.OPENAI_BASE_URL) throw new Error("环境变量 OPENAI_BASE_URL 覆盖了 Codex 地址，请先移除后再切换。");
    const raw = (await readOptional(getCodexConfigPath()))?.toString() ?? "";
    const stateRaw = await readOptional(getCodexSwitchStatePath());
    const state = readSwitchState(stateRaw, raw, home);
    if ((parseRootString(raw, "model_provider") ?? "openai") === "openai" && !parseRootString(raw, "openai_base_url")) {
      state.native = nativeSnapshot(readNativeCodexSettings(raw));
    }
    const dbFile = path.join(home, "state_5.sqlite");
    let snapshot: ThreadSnapshot | undefined;
    if (await exists(dbFile)) { snapshot = await readThreadSnapshot(dbFile); await assertNoProjectOverrides(dbFile); }
    else {
      const entries = await fs.readdir(home);
      if (entries.some((name) => /^state_\d+\.sqlite$/.test(name))) throw new Error("当前 Codex 数据库版本尚未适配，未执行切换。");
      for (const folder of ["sessions", "archived_sessions"]) {
        const files = await fs.readdir(path.join(home, folder), { recursive: true }).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error;
        });
        if (files.some((file) => file.endsWith(".jsonl"))) throw new Error("发现会话文件但缺少会话数据库，请先让 Codex 完成索引后再切换。");
      }
    }
    const after = snapshot?.settings.map((row): ThreadSettings => {
      if (target) {
        if (row.model_provider === "openai" && !parseRootString(raw, "openai_base_url") && !Object.hasOwn(state.nativeThreads, row.id)) {
          state.nativeThreads[row.id] = { model: row.model, reasoning_effort: row.reasoning_effort };
        }
        const selected = target.catalogModels.find((model) => model.id === row.model) ?? target.catalogModels.find((model) => model.id === target.model)!;
        return { id: row.id, model_provider: ACTIVE_CODEX_PROVIDER_ID, model: selected.id, reasoning_effort: chooseEffort(row.reasoning_effort, selected.reasoningEfforts ?? []) };
      }
      const preferred = state.nativeThreads[row.id];
      return { id: row.id, model_provider: "openai", model: preferred?.model ?? null, reasoning_effort: preferred?.reasoning_effort ?? null };
    });
    if (!target) state.nativeThreads = {};
    const generated = await buildCodexSwitchFiles(raw, {
      model: state.native.model ?? undefined, effort: state.native.effort ?? undefined, catalog: state.native.catalog ?? undefined,
    }, target);
    const writes = [
      { file: getCodexConfigPath(), content: generated.config },
      ...(generated.catalog === undefined ? [] : [{ file: path.join(home, "model-catalogs", "ai-zero-token-models.json"), content: generated.catalog }]),
      { file: getCodexSwitchStatePath(), content: `${JSON.stringify(state, null, 2)}\n` },
      { file: path.join(getStateDir(), "external-providers.json"), content: storeContent },
    ];
    const directory = path.join(getStateDir(), "codex-switch-backups", randomUUID());
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const journal: Journal = { version: 1, home, directory, files: [], ...(snapshot ? { db: { file: dbFile, before: snapshot, after: after! } } : {}) };
    for (const [index, item] of writes.entries()) {
      const before = await readOptional(item.file);
      if (item.file === getCodexConfigPath() && (before?.toString() ?? "") !== raw) throw new Error("切换期间 Codex 配置被修改，未执行写入。");
      if (item.file === getCodexSwitchStatePath() && (before?.toString() ?? "") !== (stateRaw?.toString() ?? "")) throw new Error("切换期间原生设置记录被修改，未执行写入。");
      if (before !== undefined) await fs.writeFile(path.join(directory, `before-${index}`), before, { mode: 0o600 });
      journal.files.push({ file: item.file, before: before === undefined ? null : hash(before), after: hash(item.content), index });
    }
    if (snapshot) await backupThreadDatabase(dbFile, path.join(directory, "state.sqlite"));
    await writeAtomic(pendingPath(), `${JSON.stringify(journal, null, 2)}\n`);
    try {
      await this.runtime.assertStopped(home);
      for (const item of journal.files) {
        const current = await readOptional(item.file);
        if ((current === undefined ? null : hash(current)) !== item.before) throw new Error("切换期间配置被修改，已停止切换。");
      }
      for (const item of writes.slice(0, -1)) await writeAtomic(item.file, item.content);
      if (snapshot) {
        const current = await readThreadSnapshot(dbFile);
        if (current.fingerprint !== snapshot.fingerprint || !sameSettings(current.settings, snapshot.settings)) throw new Error("切换期间会话数据发生变化，已停止切换。");
        await updateThreadSettings(dbFile, snapshot.settings, after!);
      }
      await this.runtime.assertStopped(home);
      if (snapshot) {
        const current = await readThreadSnapshot(dbFile);
        if (current.fingerprint !== snapshot.fingerprint || !sameSettings(current.settings, after!)) throw new Error("会话设置验证失败。");
      }
      await commitStore();
      for (const item of journal.files) if (hash(await fs.readFile(item.file)) !== item.after) throw new Error("切换文件验证失败。");
      await fs.rm(pendingPath());
    } catch (error) {
      try { await this.runtime.assertStopped(home); await this.rollback(journal); }
      catch (recoveryError) { throw new Error(`切换未完成，自动恢复尚未完成：${recoveryError instanceof Error ? recoveryError.message : "请检查备份"}`, { cause: error }); }
      throw error;
    }
  }
}
