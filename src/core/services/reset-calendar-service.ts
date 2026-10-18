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
import { resetNotificationContent } from "../reset-notification-content.js";
import { getStateDir } from "../store/state-paths.js";
import {
  attachPublicResetTranslation,
  parseCentralResetTranslations,
  resetTranslationMaxHtmlLength,
  resetTranslationSourceUrl,
  type PublicResetTranslation,
} from "./reset-calendar-translations.js";

const apiOrigin = "https://codex-resets.com";

const dateSchema = z.iso.datetime({ offset: true });
const translationSchema = z.object({
  zhCN: z.string().min(1), source: z.enum(["ai-resets.com", "ai-zero-token", "codex-intel"]),
  machine: z.boolean().optional(), provider: z.string().optional(), modelRevision: z.string().optional(), translatedAt: dateSchema.optional(),
  sourceUrl: z.url().refine((url) => new URL(url).protocol === "https:"), originalText: z.string(),
});
const publicTranslationSchema = z.object({
  sourceId: z.string().min(1).max(128), originalText: z.string().min(1), zhCN: z.string().min(1),
  source: z.enum(["ai-resets.com", "ai-zero-token", "codex-intel"]).optional(),
  sourceUrl: z.url().optional(), originalSourceUrl: z.url().optional(), exactOriginal: z.boolean().optional(),
  machine: z.boolean().optional(), provider: z.string().optional(), modelRevision: z.string().optional(), translatedAt: dateSchema.optional(),
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
const completedStatuses = ["completed", "complete", "confirmed", "propagated"] as const;
const statusSchema = z.object({
  latest_reset: announcementSchema.extend({ status: z.enum(completedStatuses).optional() }).nullable(),
  scheduled_reset: z.union([
    announcementSchema.extend({ status: z.literal("scheduled"), scheduled_for: dateSchema.nullable() }),
    announcementSchema.extend({ status: z.enum(["cancelled", "canceled", ...completedStatuses]), scheduled_for: dateSchema.nullable().optional() }),
  ]).nullable(),
  active_watch: watchSchema.nullable(),
  stats: z.object({
    total: z.number().int().nonnegative(),
    last_reset_at: dateSchema.nullable(),
    days_since_last: z.number().nonnegative().nullable(),
    avg_interval_days: z.number().nonnegative().nullable(),
  }),
}).transform((status): ResetStatus => {
  const latest = status.latest_reset;
  let scheduled = status.scheduled_reset;
  // A terminal forecast closes that forecast only. Its announced_at still names
  // the original announcement, not a new completion; wait for latest_reset.
  if (scheduled && (scheduled.status !== "scheduled" || (latest?.source.type === "x_post"
    && latest.reset_type === scheduled.reset_type && Date.parse(latest.announced_at) >= Date.parse(scheduled.announced_at)))) scheduled = null;
  return { ...status, latest_reset: latest, scheduled_reset: scheduled as ResetStatus["scheduled_reset"] };
});
const centralSnapshotSchema = z.object({
  version: z.literal(1), generatedAt: dateSchema, capturedAt: dateSchema,
  status: statusSchema, records: z.array(announcementSchema).max(5000), historyComplete: z.boolean(),
});
type CentralSnapshot = z.infer<typeof centralSnapshotSchema>;
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
  source: z.enum(["live", "snapshot"]).default("live"), snapshotCapturedAt: dateSchema.nullable().default(null),
  historyRetryAt: z.number().nonnegative().default(0),
  historyCursor: z.string().nullable(),
  baselineEstablished: z.boolean(),
  seenSignals: z.array(z.string()),
  seenConfirmed: z.array(z.string()),
  retryAt: z.number().nonnegative().default(0),
  manualRetryAt: z.number().nonnegative().optional(),
  lastError: z.string().nullable().default(null),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  latestConfirmedAnnouncedAt: dateSchema.nullable().default(null),
  publicTranslations: z.array(publicTranslationSchema).default([]),
  translationLastAttemptAt: z.number().nonnegative().default(0),
  translationRetryAt: z.number().nonnegative().default(0),
});

export type ResetCalendarServiceOptions = {
  statePath?: string;
  fetcher?: typeof fetch;
  /** null disables the central static snapshot and translation catalogue. */
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
    const previousRecord = byId.get(record.id);
    const previousTranslation = previousRecord?.translation;
    byId.set(record.id, !record.translation && previousRecord?.source.url === record.source.url && previousTranslation?.originalText === record.text
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
  private historyRetryAt = 0;
  private centralSnapshot: CentralSnapshot | null = null;
  private retryAt = 0;
  private manualRetryAt = 0;
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
  sync(options: { manual?: boolean } = {}): Promise<ResetCalendarState> {
    if (this.syncPromise) return this.syncPromise;
    const generation = this.stopGeneration;
    this.syncPromise = this.performSync(generation, options.manual === true).finally(() => {
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
    const content = resetNotificationContent("scheduled");
    return { sent: await this.send({
      ...content, kind: "test", title: `${content.title} · 测试`,
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
    snapshot.sync.manualRetryAt = this.manualRetryAt > this.now() ? new Date(this.manualRetryAt).toISOString() : null;
    snapshot.notificationsSupported = this.supportsNotifications();
    const watch = snapshot.status?.active_watch;
    if (watch && (Date.parse(watch.expires_at) <= this.now()
      || Date.parse(watch.observed_at) > this.now() + 5 * 60_000
      || (snapshot.status?.latest_reset?.source.type === "x_post"
        && Date.parse(watch.observed_at) <= Date.parse(snapshot.status.latest_reset.announced_at)))) snapshot.status!.active_watch = null;
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
      this.state.sync.source = data.source;
      this.state.sync.snapshotCapturedAt = data.snapshotCapturedAt;
      this.historyRetryAt = data.historyRetryAt;
      this.state.sync.phase = data.lastSyncedAt ? "ready" : "idle";
      this.historyCursor = data.historyCursor;
      this.baselineEstablished = data.baselineEstablished;
      this.retryAt = data.retryAt;
      // Old caches only record automatic backoff, not a known manual deadline.
      // Let a deliberate retry reach the source; any returned Retry-After will
      // then be honored and persisted separately by the new client.
      this.manualRetryAt = data.manualRetryAt ?? 0;
      this.consecutiveFailures = data.consecutiveFailures;
      if (data.consecutiveFailures > 0) {
        this.state.sync.phase = "error";
        this.state.sync.error = data.lastError ?? "同步失败，已保留本地记录，将自动重试。";
        this.state.sync.nextSyncAt = new Date(this.retryAt).toISOString();
      }
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
      source: this.state.sync.source ?? "live", snapshotCapturedAt: this.state.sync.snapshotCapturedAt ?? null,
      historyRetryAt: this.historyRetryAt,
      baselineEstablished: this.baselineEstablished,
      seenSignals: [...this.seenSignals], seenConfirmed: [...this.seenConfirmed],
      retryAt: this.retryAt, consecutiveFailures: this.consecutiveFailures,
      manualRetryAt: this.manualRetryAt, lastError: this.state.sync.error,
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

  private async performSync(generation: number, manual: boolean): Promise<ResetCalendarState> {
    await this.ensureLoaded();
    if (generation !== this.stopGeneration) return this.snapshot();
    if ((manual ? this.manualRetryAt : this.retryAt) > this.now()) {
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
        this.state.sync.source = "live";
        this.state.sync.snapshotCapturedAt = null;
        const notifications = this.advanceStages(parsedStatus.data.data);
        this.baselineEstablished = true;
        if (parsedStatus.data.data.latest_reset) {
          this.state.records = mergeRecords(this.state.records, [parsedStatus.data.data.latest_reset]);
        }
        // Persist the baseline and intentionally suppressed stages before delivery.
        // Eligible stages are acknowledged only after the desktop reports success.
        await this.save();
        if (signal.aborted) return this.snapshot();
        for (const notification of notifications) {
          if (signal.aborted) return this.snapshot();
          if (await this.send(notification, signal)) {
            const seen = notification.kind === "signal" ? this.seenSignals : this.seenConfirmed;
            seen.add(notification.eventId);
            await this.save();
          }
        }
      }
      let historyError: string | null = null;
      if (this.historyRetryAt <= this.now()) {
        try {
          await this.syncHistory(signal);
          this.historyRetryAt = 0;
        } catch (error) {
          if (signal.aborted) return this.snapshot();
          this.state.sync.historyComplete = false;
          historyError = `通告已更新，历史暂不可用。${error instanceof CalendarRequestError ? error.message : "将稍后重试。"}`;
          if (error instanceof CalendarRequestError && error.retryAfterMs > 0) this.historyRetryAt = this.now() + error.retryAfterMs;
        }
      } else {
        historyError = "通告已更新，历史接口正在按要求等待重试。";
      }
      if (signal.aborted) return this.snapshot();
      // Public-stage notifications are already delivered; a slow secondary page
      // cannot delay the signal/confirmation itself or fail the primary sync.
      await this.syncTranslations(signal);
      if (signal.aborted) return this.snapshot();
      this.applyTranslations();
      this.consecutiveFailures = 0;
      this.retryAt = 0;
      this.manualRetryAt = 0;
      this.state.sync.phase = "ready";
      this.state.sync.error = historyError;
      this.state.sync.lastSyncedAt = new Date(this.now()).toISOString();
      this.state.sync.nextSyncAt = new Date(this.now() + this.pollIntervalMs).toISOString();
      await this.save();
    } catch (error) {
      if (generation !== this.stopGeneration) {
        this.state.sync.phase = this.state.sync.lastSyncedAt ? "ready" : "idle";
        this.state.sync.nextSyncAt = null;
        return this.snapshot();
      }
      // A validated static backup can restore display data, never replay notifications.
      await this.syncTranslations(signal);
      if (generation !== this.stopGeneration || signal.aborted) {
        this.state.sync.phase = this.state.sync.lastSyncedAt ? "ready" : "idle";
        this.state.sync.nextSyncAt = null;
        return this.snapshot();
      }
      const backup = this.centralSnapshot;
      if (backup && (!this.state.sync.generatedAt || Date.parse(backup.generatedAt) >= Date.parse(this.state.sync.generatedAt))) {
        this.state.status = backup.status;
        this.state.records = mergeRecords(this.state.records, backup.records);
        if (backup.status.latest_reset) this.state.records = mergeRecords(this.state.records, [backup.status.latest_reset]);
        this.state.sync.generatedAt = backup.generatedAt;
        this.state.sync.source = "snapshot";
        this.state.sync.snapshotCapturedAt = backup.capturedAt;
        this.state.sync.historyComplete = backup.historyComplete;
        // Consume the static backup's stages silently; first live recovery does not
        // burst old alerts, while any genuinely new live stage remains eligible.
        this.baselineEstablished = false;
        this.advanceStages(backup.status);
        this.baselineEstablished = true;
        this.applyTranslations();
      }
      this.consecutiveFailures += 1;
      const backoff = Math.min(60 * 60_000, this.pollIntervalMs * 2 ** Math.min(8, this.consecutiveFailures - 1));
      const retryAfter = error instanceof CalendarRequestError ? error.retryAfterMs : 0;
      this.retryAt = this.now() + Math.max(backoff, retryAfter);
      // Manual recovery must not wait for exponential polling backoff. A short
      // cooldown prevents repeated clicks, while server Retry-After stays binding.
      this.manualRetryAt = this.now() + Math.max(10_000, retryAfter);
      this.state.sync.phase = "error";
      this.state.sync.error = this.state.sync.source === "snapshot"
        ? "实时接口暂不可用，正在显示情报站备用快照，将自动重试。"
        : error instanceof CalendarRequestError ? error.message : "同步失败，已保留本地记录，将自动重试。";
      this.state.sync.nextSyncAt = new Date(this.retryAt).toISOString();
      await this.save().catch(() => undefined);
    }
    return this.snapshot();
  }

  private advanceStages(status: ResetStatus): ResetCalendarNotification[] {
    const notifications: ResetCalendarNotification[] = [];
    const watch = status.active_watch;
    const signalKey = watch && Date.parse(watch.expires_at) > this.now()
      && Date.parse(watch.expires_at) > Date.parse(watch.observed_at)
      && Date.parse(watch.observed_at) <= this.now() + 5 * 60_000
      && !(status.latest_reset?.source.type === "x_post" && Date.parse(watch.observed_at) <= Date.parse(status.latest_reset.announced_at))
      ? sourceKey(watch.source) ?? `watch:${watch.observed_at}` : null;
    if (signalKey) this.advance("signal", signalKey, {
      kind: "signal", eventId: signalKey,
      ...resetNotificationContent("watch"),
    }, notifications);
    const scheduled = status.scheduled_reset;
    if (scheduled) this.advance("signal", announcementKey(scheduled), {
      kind: "signal", eventId: announcementKey(scheduled),
      ...resetNotificationContent("scheduled", scheduled.reset_type, scheduled.scheduled_for, this.now()),
    }, notifications);
    const latest = status.latest_reset;
    if (latest) {
      const olderThanLatest = this.latestConfirmedAnnouncedAt !== null
        && Date.parse(latest.announced_at) < Date.parse(this.latestConfirmedAnnouncedAt);
      this.advance("confirmed", announcementKey(latest), {
        kind: "confirmed", eventId: announcementKey(latest),
        ...resetNotificationContent("confirmed", latest.reset_type),
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
    if (seen.has(key) || notifications.some((item) => item.kind === kind && item.eventId === key)) return;
    const enabled = kind === "signal" ? this.state.settings.signalNotifications : this.state.settings.confirmedNotifications;
    if (this.baselineEstablished && enabled && !suppress && this.supportsNotifications()) {
      // A failed delivery remains eligible while the source still reports this stage.
      notifications.push(notification);
    } else {
      // First sync and disabled/unsupported notifications do not create a later burst.
      seen.add(key);
    }
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
      const raw = await this.requestPublic(resetTranslationSourceUrl, signal, {
        fetcher: this.translationFetcher, accept: "application/json", timeoutMs: Math.min(5000, this.requestTimeoutMs),
        parse: async (response) => {
          if (Number(response.headers.get("content-length")) > resetTranslationMaxHtmlLength) throw new Error("Translation page exceeds the size limit");
          const text = await response.text();
          if (text.length > resetTranslationMaxHtmlLength) throw new Error("Translation page exceeds the size limit");
          return JSON.parse(text) as unknown;
        },
      });
      if (signal.aborted) return;
      const parsed = centralSnapshotSchema.safeParse(raw);
      if (!parsed.success || Date.parse(parsed.data.generatedAt) > this.now() + 5 * 60_000
        || Date.parse(parsed.data.capturedAt) > this.now() + 5 * 60_000
        || Date.parse(parsed.data.capturedAt) < Date.parse(parsed.data.generatedAt)) return;
      this.centralSnapshot = parsed.data;
      this.translationRetryAt = 0;
      for (const translation of parseCentralResetTranslations(raw)) this.publicTranslations.set(translation.sourceId, translation);
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
