import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  ResetAnnouncement,
  ResetCalendarNotification,
  ResetCalendarSettings,
  ResetCalendarState,
  ResetSource,
  ResetStatus,
} from "../reset-calendar-types.js";
import { getStateDir } from "../store/state-paths.js";
import {
  attachPublicResetTranslation,
  parsePublicResetTranslations,
  resetTranslationMaxHtmlLength,
  resetTranslationSourceUrl,
  type PublicResetTranslation,
} from "./reset-calendar-translations.js";

const apiOrigin = "https://codex-resets.com";
const dateSchema = z.iso.datetime({ offset: true });
const translationSchema = z.object({
  zhCN: z.string().min(1), source: z.enum(["ai-resets.com", "ai-zero-token"]),
  sourceUrl: z.url().refine((url) => new URL(url).protocol === "https:"), originalText: z.string(),
});
const publicTranslationSchema = z.object({
  sourceId: z.string().regex(/^[0-9]+$/), originalText: z.string().min(1), zhCN: z.string().min(1),
});
const sourceSchema = z.union([
  z.object({ type: z.literal("x_post"), author: z.literal("thsottiaux"), url: z.url() }),
  z.object({ type: z.literal("observed"), url: z.url().optional() }),
]);
const announcementSchema = z.object({
  id: z.string().min(1).max(64),
  reset_type: z.enum(["regular", "banked"]),
  announced_at: dateSchema,
  text: z.string(),
  source: sourceSchema,
  translation: translationSchema.optional(),
});
const watchSchema = z.object({
  level: z.enum(["elevated", "strong"]),
  reset_chance_percent: z.number().int().min(0).max(100).nullable(),
  forecast_window: z.string(),
  observed_at: dateSchema,
  expires_at: dateSchema,
  text: z.string(),
  source: sourceSchema,
  translation: translationSchema.optional(),
});
const statusSchema = z.object({
  latest_reset: announcementSchema.nullable(),
  scheduled_reset: announcementSchema.extend({
    status: z.literal("scheduled"),
    scheduled_for: dateSchema.nullable(),
  }).nullable(),
  active_watch: watchSchema.nullable(),
  stats: z.object({
    total: z.number().int().nonnegative(),
    last_reset_at: dateSchema.nullable(),
    days_since_last: z.number().nonnegative().nullable(),
    avg_interval_days: z.number().nonnegative().nullable(),
  }),
});
const metaSchema = z.object({ api_version: z.literal("v1"), generated_at: dateSchema });
const statusResponseSchema = z.object({ data: statusSchema, meta: metaSchema });
const historyResponseSchema = z.object({
  data: z.array(announcementSchema),
  pagination: z.object({ has_more: z.boolean(), next_cursor: z.string().nullable() }),
  meta: metaSchema,
});
const settingsSchema = z.object({ signalNotifications: z.boolean(), confirmedNotifications: z.boolean() });
const persistedSchema = z.object({
  version: z.literal(1),
  records: z.array(announcementSchema),
  status: statusSchema.nullable(),
  settings: settingsSchema,
  lastSyncedAt: dateSchema.nullable(),
  generatedAt: dateSchema.nullable(),
  historyComplete: z.boolean(),
  historyCursor: z.string().nullable(),
  baselineEstablished: z.boolean(),
  seenSignals: z.array(z.string()),
  seenConfirmed: z.array(z.string()),
  retryAt: z.number().nonnegative().default(0),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  latestConfirmedAnnouncedAt: dateSchema.nullable().default(null),
  publicTranslations: z.array(publicTranslationSchema).default([]),
  translationLastAttemptAt: z.number().nonnegative().default(0),
  translationRetryAt: z.number().nonnegative().default(0),
});

export type ResetCalendarServiceOptions = {
  statePath?: string;
  fetcher?: typeof fetch;
  /** null disables the secondary public translation source (useful in isolated tests). */
  translationFetcher?: typeof fetch | null;
  now?: () => number;
  notify?: (notification: ResetCalendarNotification) => boolean | void | Promise<boolean | void>;
  notificationsSupported?: boolean | (() => boolean);
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
};

class CalendarRequestError extends Error {
  constructor(message: string, readonly retryAfterMs = 0) {
    super(message);
  }
}

function sourceKey(source: ResetSource): string | null {
  // Observations can reuse a generic page URL for entirely different forecasts.
  // Their stable identity is the watch's observed_at, supplied by the caller.
  if (source.type !== "x_post") return null;
  const postId = /\/(?:status|statuses)\/([0-9]+)(?:\/|$)/.exec(new URL(source.url).pathname)?.[1];
  // A watch and a scheduled announcement about the same post share one signal stage.
  return postId ? `announcement:${postId}` : `source:${source.url}`;
}

function announcementKey(record: ResetAnnouncement): string {
  // Observed events may link to the same page; their upstream IDs still differ.
  return `announcement:${record.id}`;
}

function mergeRecords(previous: ResetAnnouncement[], incoming: ResetAnnouncement[]): ResetAnnouncement[] {
  const byId = new Map(previous.map((record) => [record.id, record]));
  for (const record of incoming) {
    const previousTranslation = byId.get(record.id)?.translation;
    byId.set(record.id, !record.translation && previousTranslation?.originalText === record.text
      ? { ...record, translation: previousTranslation } : record);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.announced_at) - Date.parse(a.announced_at) || a.id.localeCompare(b.id));
}

export class ResetCalendarService {
  private readonly statePath: string;
  private readonly fetcher: typeof fetch;
  private readonly translationFetcher: typeof fetch | null;
  private readonly now: () => number;
  private readonly notify?: ResetCalendarServiceOptions["notify"];
  private readonly notificationsSupported: boolean | (() => boolean);
  private readonly pollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly seenSignals = new Set<string>();
  private readonly seenConfirmed = new Set<string>();
  private readonly state: ResetCalendarState = {
    records: [], status: null,
    settings: { signalNotifications: true, confirmedNotifications: true },
    sync: { phase: "idle", lastSyncedAt: null, generatedAt: null, error: null, nextSyncAt: null, historyComplete: false },
    notificationsSupported: false,
  };
  private loadPromise: Promise<void> | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private syncPromise: Promise<ResetCalendarState> | null = null;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopGeneration = 0;
  private baselineEstablished = false;
  private historyCursor: string | null = null;
  private retryAt = 0;
  private consecutiveFailures = 0;
  private latestConfirmedAnnouncedAt: string | null = null;
  private readonly publicTranslations = new Map<string, PublicResetTranslation>();
  private translationLastAttemptAt = 0;
  private translationRetryAt = 0;

  constructor(options: ResetCalendarServiceOptions = {}) {
    this.statePath = options.statePath ?? path.join(getStateDir(), "reset-calendar.json");
    this.fetcher = options.fetcher ?? fetch;
    this.translationFetcher = options.translationFetcher === null ? null : options.translationFetcher ?? this.fetcher;
    this.now = options.now ?? Date.now;
    this.notify = options.notify;
    this.notificationsSupported = options.notificationsSupported ?? Boolean(options.notify);
    this.pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 5 * 60_000);
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 15_000);
  }

  async getState(): Promise<ResetCalendarState> {
    await this.ensureLoaded();
    return this.snapshot();
  }

  /** Calls share a single flight, including when manual refresh overlaps a poll. */
  sync(): Promise<ResetCalendarState> {
    if (this.syncPromise) return this.syncPromise;
    const generation = this.stopGeneration;
    this.syncPromise = this.performSync(generation).finally(() => {
      this.syncPromise = null;
      this.controller = null;
      if (this.running) this.schedule();
    });
    return this.syncPromise;
  }

  async updateSettings(partial: Partial<ResetCalendarSettings>): Promise<ResetCalendarState> {
    const parsed = settingsSchema.partial().strict().parse(partial);
    await this.ensureLoaded();
    if (parsed.signalNotifications !== undefined) this.state.settings.signalNotifications = parsed.signalNotifications;
    if (parsed.confirmedNotifications !== undefined) this.state.settings.confirmedNotifications = parsed.confirmedNotifications;
    await this.save();
    return this.snapshot();
  }

  async testNotification(): Promise<{ sent: boolean }> {
    return { sent: await this.send({
      kind: "test", title: "AI Zero Token · 重置日历",
      body: "测试通知已送达。开启提醒后，将在出现公开重置信号或公开确认时通知你。",
      eventId: `test:${randomUUID()}`,
    }) };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Loading, network access and notification delivery never block server startup.
    void this.sync().catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopGeneration += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort(new Error("日历同步已停止"));
    this.state.sync.nextSyncAt = null;
    if (this.state.sync.phase === "syncing") this.state.sync.phase = this.state.sync.lastSyncedAt ? "ready" : "idle";
    await this.syncPromise?.catch(() => undefined);
    await this.saveQueue.catch(() => undefined);
  }

  private supportsNotifications(): boolean {
    try {
      return Boolean(this.notify && (typeof this.notificationsSupported === "function"
        ? this.notificationsSupported() : this.notificationsSupported));
    } catch {
      return false;
    }
  }

  private snapshot(): ResetCalendarState {
    const snapshot = structuredClone(this.state);
    snapshot.notificationsSupported = this.supportsNotifications();
    const watch = snapshot.status?.active_watch;
    if (watch && Date.parse(watch.expires_at) <= this.now()) snapshot.status!.active_watch = null;
    return snapshot;
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.load();
    return this.loadPromise;
  }

  private async load(): Promise<void> {
    try {
      const data = persistedSchema.parse(JSON.parse(await fs.readFile(this.statePath, "utf8")));
      this.state.records = mergeRecords([], data.records);
      this.state.status = data.status;
      this.state.settings = data.settings;
      this.state.sync.lastSyncedAt = data.lastSyncedAt;
      this.state.sync.generatedAt = data.generatedAt;
      this.state.sync.historyComplete = data.historyComplete;
      this.state.sync.phase = data.lastSyncedAt ? "ready" : "idle";
      this.historyCursor = data.historyCursor;
      this.baselineEstablished = data.baselineEstablished;
      this.retryAt = data.retryAt;
      this.consecutiveFailures = data.consecutiveFailures;
      this.latestConfirmedAnnouncedAt = data.latestConfirmedAnnouncedAt ?? data.status?.latest_reset?.announced_at ?? null;
      this.translationLastAttemptAt = data.translationLastAttemptAt;
      this.translationRetryAt = data.translationRetryAt;
      for (const translation of data.publicTranslations) this.publicTranslations.set(translation.sourceId, translation);
      this.applyTranslations();
      for (const key of data.seenSignals) this.seenSignals.add(key);
      for (const key of data.seenConfirmed) this.seenConfirmed.add(key);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      this.state.sync.phase = "error";
      this.state.sync.error = "本地日历缓存无法读取，将在同步后重新建立记录。";
    }
  }

  private save(): Promise<void> {
    const serialized = `${JSON.stringify({
      version: 1, records: this.state.records, status: this.state.status, settings: this.state.settings,
      lastSyncedAt: this.state.sync.lastSyncedAt, generatedAt: this.state.sync.generatedAt,
      historyComplete: this.state.sync.historyComplete, historyCursor: this.historyCursor,
      baselineEstablished: this.baselineEstablished,
      seenSignals: [...this.seenSignals], seenConfirmed: [...this.seenConfirmed],
      retryAt: this.retryAt, consecutiveFailures: this.consecutiveFailures,
      latestConfirmedAnnouncedAt: this.latestConfirmedAnnouncedAt,
      publicTranslations: [...this.publicTranslations.values()], translationLastAttemptAt: this.translationLastAttemptAt,
      translationRetryAt: this.translationRetryAt,
    })}\n`;
    const write = async () => {
      await fs.mkdir(path.dirname(this.statePath), { recursive: true });
      const temporary = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
        await fs.rename(temporary, this.statePath);
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
      }
    };
    this.saveQueue = this.saveQueue.then(write, write);
    return this.saveQueue;
  }

  private async performSync(generation: number): Promise<ResetCalendarState> {
    await this.ensureLoaded();
    if (generation !== this.stopGeneration) return this.snapshot();
    if (this.retryAt > this.now()) {
      this.state.sync.nextSyncAt = new Date(this.retryAt).toISOString();
      return this.snapshot();
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.state.sync.phase = "syncing";
    this.state.sync.error = null;
    try {
      const rawStatus = await this.requestJson(`${apiOrigin}/api/v1/status`, signal);
      const parsedStatus = statusResponseSchema.safeParse(rawStatus);
      if (!parsedStatus.success) throw new CalendarRequestError("数据源返回的状态格式无效，请稍后重试。");
      if (signal.aborted) return this.snapshot();
      // An older CDN snapshot cannot roll back status or create a new notification.
      if (!this.state.sync.generatedAt || Date.parse(parsedStatus.data.meta.generated_at) >= Date.parse(this.state.sync.generatedAt)) {
        this.state.status = parsedStatus.data.data;
        this.applyTranslations();
        this.state.sync.generatedAt = parsedStatus.data.meta.generated_at;
        const notifications = this.advanceStages(parsedStatus.data.data);
        this.baselineEstablished = true;
        if (parsedStatus.data.data.latest_reset) {
          this.state.records = mergeRecords(this.state.records, [parsedStatus.data.data.latest_reset]);
        }
        // Commit stage receipts before sending, so a restart cannot duplicate alerts.
        await this.save();
        if (signal.aborted) return this.snapshot();
        for (const notification of notifications) {
          if (signal.aborted) return this.snapshot();
          await this.send(notification, signal);
        }
      }
      await this.syncHistory(signal);
      if (signal.aborted) return this.snapshot();
      // Public-stage notifications are already delivered; a slow secondary page
      // cannot delay the signal/confirmation itself or fail the primary sync.
      await this.syncTranslations(signal);
      if (signal.aborted) return this.snapshot();
      this.applyTranslations();
      this.consecutiveFailures = 0;
      this.retryAt = 0;
      this.state.sync.phase = "ready";
      this.state.sync.lastSyncedAt = new Date(this.now()).toISOString();
      this.state.sync.nextSyncAt = new Date(this.now() + this.pollIntervalMs).toISOString();
      await this.save();
    } catch (error) {
      if (generation !== this.stopGeneration) {
        this.state.sync.phase = this.state.sync.lastSyncedAt ? "ready" : "idle";
        this.state.sync.nextSyncAt = null;
        return this.snapshot();
      }
      this.consecutiveFailures += 1;
      const backoff = Math.min(60 * 60_000, this.pollIntervalMs * 2 ** Math.min(8, this.consecutiveFailures - 1));
      this.retryAt = this.now() + Math.max(backoff, error instanceof CalendarRequestError ? error.retryAfterMs : 0);
      this.state.sync.phase = "error";
      this.state.sync.error = error instanceof CalendarRequestError
        ? error.message : "同步失败，已保留本地记录，将自动重试。";
      this.state.sync.nextSyncAt = new Date(this.retryAt).toISOString();
      await this.save().catch(() => undefined);
    }
    return this.snapshot();
  }

  private advanceStages(status: ResetStatus): ResetCalendarNotification[] {
    const notifications: ResetCalendarNotification[] = [];
    const watch = status.active_watch;
    const signalKey = watch && Date.parse(watch.expires_at) > this.now()
      ? sourceKey(watch.source) ?? `watch:${watch.observed_at}` : null;
    if (signalKey) this.advance("signal", signalKey, {
      kind: "signal", eventId: signalKey,
      title: "Codex 出现重置信号",
      body: "公开监测出现重置信号，属于预测，尚未确认执行。打开重置日历查看来源与详情。",
    }, notifications);
    const scheduled = status.scheduled_reset;
    if (scheduled) this.advance("signal", announcementKey(scheduled), {
      kind: "signal", eventId: announcementKey(scheduled),
      title: scheduled.reset_type === "banked" ? "Codex 储备重置发放公告" : "Codex 重置预告",
      body: scheduled.reset_type === "banked"
        ? "公开来源已发布储备重置发放预告，仍待执行证据；储备发放不代表账号额度已恢复。"
        : "公开来源已发布重置预告，仍待执行证据。预计时间到达不会自动视为完成。",
    }, notifications);
    const latest = status.latest_reset;
    if (latest) {
      const olderThanLatest = this.latestConfirmedAnnouncedAt !== null
        && Date.parse(latest.announced_at) < Date.parse(this.latestConfirmedAnnouncedAt);
      this.advance("confirmed", announcementKey(latest), {
        kind: "confirmed", eventId: announcementKey(latest),
        title: latest.reset_type === "banked" ? "公开来源确认 Codex 储备重置已发放" : "公开来源确认 Codex 已重置",
        body: latest.reset_type === "banked"
          ? "公开来源已确认储备重置发放。储备发放不代表账号额度已恢复，请以账号实际额度为准。"
          : "公开来源已确认重置执行，请以账号实际额度为准。打开重置日历查看详情。",
      }, notifications, olderThanLatest);
      if (!olderThanLatest) this.latestConfirmedAnnouncedAt = latest.announced_at;
    }
    return notifications;
  }

  private advance(
    kind: "signal" | "confirmed", key: string, notification: ResetCalendarNotification,
    notifications: ResetCalendarNotification[], suppress = false,
  ): void {
    const seen = kind === "signal" ? this.seenSignals : this.seenConfirmed;
    if (seen.has(key)) return;
    seen.add(key);
    // Disabled/unsupported notifications still consume the stage, avoiding a later burst.
    const enabled = kind === "signal" ? this.state.settings.signalNotifications : this.state.settings.confirmedNotifications;
    if (this.baselineEstablished && enabled && !suppress) notifications.push(notification);
  }

  private async send(notification: ResetCalendarNotification, signal?: AbortSignal): Promise<boolean> {
    if (!this.supportsNotifications() || signal?.aborted) return false;
    let onAbort: (() => void) | undefined;
    try {
      const sent = Promise.resolve(this.notify!(notification));
      if (!signal) return (await sent) !== false;
      const cancelled = new Promise<false>((resolve) => {
        onAbort = () => resolve(false);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
      return (await Promise.race([sent, cancelled])) !== false;
    } catch {
      return false;
    } finally {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
  }

  private async syncHistory(signal: AbortSignal): Promise<void> {
    const visited = new Set<string>();
    // A bound prevents a broken source from holding a single synchronization forever.
    // Cursor and received records persist, so a larger archive resumes next time.
    for (let page = 0; page < 20; page += 1) {
      const url = new URL("/api/v1/resets", apiOrigin);
      url.searchParams.set("limit", "100");
      url.searchParams.set("order", "desc");
      if (this.historyCursor) url.searchParams.set("cursor", this.historyCursor);
      const parsed = historyResponseSchema.safeParse(await this.requestJson(url.href, signal));
      if (!parsed.success) throw new CalendarRequestError("数据源返回的历史格式无效，请稍后重试。");
      if (signal.aborted) return;
      this.state.records = mergeRecords(this.state.records, parsed.data.data);
      const pagination = parsed.data.pagination;
      if (!pagination.has_more) {
        this.historyCursor = null;
        this.state.sync.historyComplete = true;
        return;
      }
      const cursor = pagination.next_cursor;
      if (!cursor || !/^[A-Za-z0-9_-]{1,1024}$/.test(cursor) || visited.has(cursor) || cursor === this.historyCursor) {
        throw new CalendarRequestError("数据源返回的历史分页游标无效，请稍后重试。");
      }
      visited.add(cursor);
      this.historyCursor = cursor;
      this.state.sync.historyComplete = false;
    }
  }

  private applyTranslations(): void {
    this.state.records = this.state.records.map((record) => attachPublicResetTranslation(record, this.publicTranslations));
    const status = this.state.status;
    if (!status) return;
    if (status.latest_reset) status.latest_reset = attachPublicResetTranslation(status.latest_reset, this.publicTranslations);
    if (status.scheduled_reset) status.scheduled_reset = attachPublicResetTranslation(status.scheduled_reset, this.publicTranslations);
    if (status.active_watch) status.active_watch = attachPublicResetTranslation(status.active_watch, this.publicTranslations);
  }

  private async syncTranslations(signal: AbortSignal): Promise<void> {
    if (!this.translationFetcher || signal.aborted || this.translationRetryAt > this.now() || (this.translationLastAttemptAt > 0
      && this.now() - this.translationLastAttemptAt < 5 * 60_000)) return;
    this.translationLastAttemptAt = this.now();
    try {
      const html = await this.requestPublic(resetTranslationSourceUrl, signal, {
        fetcher: this.translationFetcher, accept: "text/html", timeoutMs: Math.min(5000, this.requestTimeoutMs),
        parse: async (response) => {
          if (Number(response.headers.get("content-length")) > resetTranslationMaxHtmlLength) throw new Error("Translation page exceeds the size limit");
          const text = await response.text();
          if (text.length > resetTranslationMaxHtmlLength) throw new Error("Translation page exceeds the size limit");
          return text;
        },
      });
      if (signal.aborted) return;
      this.translationRetryAt = 0;
      for (const translation of parsePublicResetTranslations(html)) this.publicTranslations.set(translation.sourceId, translation);
    } catch (error) {
      if (error instanceof CalendarRequestError && error.retryAfterMs > 0) this.translationRetryAt = this.now() + error.retryAfterMs;
      // A changed layout, missing translation, timeout, or secondary outage must
      // preserve the validated primary status and previously matched translations.
    }
  }

  private requestJson(url: string, stopSignal: AbortSignal): Promise<unknown> {
    return this.requestPublic(url, stopSignal, {
      fetcher: this.fetcher, accept: "application/json", timeoutMs: this.requestTimeoutMs,
      parse: (response) => response.json(),
    });
  }

  private async requestPublic<T>(url: string, stopSignal: AbortSignal, options: {
    fetcher: typeof fetch; accept: string; timeoutMs: number; parse(response: Response): Promise<T>;
  }): Promise<T> {
    const requestController = new AbortController();
    const forwardAbort = () => requestController.abort(stopSignal.reason);
    stopSignal.addEventListener("abort", forwardAbort, { once: true });
    if (stopSignal.aborted) forwardAbort();
    const timer = setTimeout(() => requestController.abort(new CalendarRequestError("同步超时，已保留本地记录，将自动重试。")), options.timeoutMs);
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(requestController.signal.reason);
      requestController.signal.addEventListener("abort", onAbort, { once: true });
      if (requestController.signal.aborted) onAbort();
    });
    try {
      return await Promise.race([aborted, (async () => {
        const response = await options.fetcher(url, {
          signal: requestController.signal, credentials: "omit", redirect: "error",
          cache: "no-cache",
          headers: { Accept: options.accept, "User-Agent": "AI-Zero-Token/2" },
        });
        if (!response.ok) {
          let retryAfterMs = 0;
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter && (response.status === 429 || response.status === 503)) {
            const seconds = Number(retryAfter);
            retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - this.now());
            if (!Number.isFinite(retryAfterMs)) retryAfterMs = 0;
            // Timers use a signed 32-bit delay; preserve long cooldowns via rescheduling.
            retryAfterMs = Math.min(retryAfterMs, 7 * 24 * 60 * 60_000);
          }
          throw new CalendarRequestError(
            response.status === 429 ? "数据源请求频率受限，将按要求稍后重试。"
              : response.status === 503 ? "数据源暂时不可用，已保留本地记录，将自动重试。"
                : `数据源请求失败（HTTP ${response.status}），已保留本地记录。`, retryAfterMs,
          );
        }
        return await options.parse(response);
      })()]);
    } finally {
      clearTimeout(timer);
      stopSignal.removeEventListener("abort", forwardAbort);
      if (onAbort) requestController.signal.removeEventListener("abort", onAbort);
    }
  }

  private schedule(): void {
    if (!this.running || this.timer) return;
    const due = this.state.sync.nextSyncAt ? Date.parse(this.state.sync.nextSyncAt) : this.now() + this.pollIntervalMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync().catch(() => undefined);
    }, Math.max(1, Math.min(2_147_483_647, due - this.now())));
    this.timer.unref?.();
  }
}
