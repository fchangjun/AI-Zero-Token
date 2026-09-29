import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getStateDir } from "../core/store/state-paths.js";
import { startManagedReviewer, reviewerHistory, importLegacyReviewer, type ReviewerInstance } from "../../modules/response-reviewer/src/managed.mjs";
import { ReviewerConnector } from "./reviewer-connector.js";

export const reviewerSettingsSchema = z.object({
  enabled: z.boolean(),
  codexButtonEnabled: z.boolean(),
  cdpPort: z.number().int().min(1024).max(65535),
}).strict().refine((settings) => settings.enabled || !settings.codexButtonEnabled, { message: "请先启用 Reviewer 服务。" });
export type ReviewerSettings = z.infer<typeof reviewerSettingsSchema>;
const defaults: ReviewerSettings = { enabled: false, codexButtonEnabled: false, cdpPort: 9222 };
const modulePath = fileURLToPath(new URL("../../modules/response-reviewer", import.meta.url));
// Node launched by Codex cannot read Electron's virtual ASAR filesystem.
const pluginPath = modulePath.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");

export class ReviewerService {
  readonly root: string;
  readonly legacyStorePath = path.join(os.homedir(), ".response-reviewer", "store.json");
  private settings: ReviewerSettings = { ...defaults };
  private instance: ReviewerInstance | null = null;
  private connector: ReviewerConnector | null = null;
  private loaded = false;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private error: string | null = null;
  private frameOrigins = ["app://-"];

  constructor(root = path.join(getStateDir(), "tools", "response-reviewer")) { this.root = root; }
  private get settingsPath(): string { return path.join(this.root, "settings.json"); }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  allowFrameOrigin(value: string): void {
    const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return;
    if (!this.frameOrigins.includes(url.origin)) this.frameOrigins.push(url.origin);
  }
  private async load(): Promise<void> {
    if (this.loaded) return;
    try { this.settings = reviewerSettingsSchema.parse(JSON.parse(await fs.readFile(this.settingsPath, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Reviewer 配置无效，请检查 settings.json；未覆盖原文件。"); }
    this.loaded = true;
  }
  private async save(settings: ReviewerSettings): Promise<void> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.root, `.settings-${randomUUID()}.json`);
    await fs.writeFile(temporary, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
    await fs.rename(temporary, this.settingsPath);
  }
  async restore(): Promise<void> {
    await this.serial(async () => {
      try { await this.load(); await this.apply(this.settings); }
      catch (error) { this.error = error instanceof Error ? error.message : String(error); }
    });
  }
  private async apply(settings: ReviewerSettings): Promise<void> {
    if (this.closed) throw new Error("AZT 正在关闭。");
    await this.connector?.close(); this.connector = null;
    if (!settings.enabled) {
      await this.instance?.close(); this.instance = null;
      return;
    }
    if (!this.instance) this.instance = await startManagedReviewer({ root: this.root, frameOrigins: this.frameOrigins });
    if (settings.codexButtonEnabled) {
      this.connector = new ReviewerConnector(settings.cdpPort, this.instance, path.join(pluginPath, "injection", "inject.js"));
      this.connector.start();
    }
  }
  async configure(input: unknown): Promise<void> {
    const settings = reviewerSettingsSchema.parse(input);
    await this.serial(async () => {
      await this.load();
      const previous = this.settings;
      try {
        await this.apply(settings);
        await this.save(settings);
        this.settings = settings; this.error = null;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        await this.apply(previous).catch(() => undefined);
        throw error;
      }
    });
  }
  async status() {
    await this.queue;
    await this.load();
    return {
      id: "response-reviewer", settings: { ...this.settings }, running: Boolean(this.instance),
      url: this.instance?.reviewUrl() || null, dataDir: this.root, pluginPath,
      legacyStorePath: this.legacyStorePath, error: this.error,
      connector: this.connector?.snapshot() || { connected: false, targets: 0, buttons: 0, error: null },
    };
  }
  async history() {
    await this.queue;
    return (await reviewerHistory(this.root)).map((item) => ({ ...item, url: this.instance?.reviewUrl({ responseId: item.id }) || null }));
  }
  async importLegacy(source: string) {
    return this.serial(() => importLegacyReviewer(this.root, source));
  }
  async close(): Promise<void> {
    await this.serial(async () => {
      this.closed = true;
      await this.connector?.close(); this.connector = null;
      await this.instance?.close(); this.instance = null;
    });
  }
}
