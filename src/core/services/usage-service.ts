import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureStateMigrated,
  getUsageDailyPath,
  getUsageDir,
  getUsageEventsDir,
  getUsageLifetimePath,
} from "../store/state-paths.js";

export type UsageTokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

export type UsageImageRoute = "none" | "codex-tool" | "chatgpt-web";

export type UsageRecordEvent = {
  id?: string;
  timestamp?: number;
  method: string;
  endpoint: string;
  model: string;
  source: string;
  statusCode: number;
  success?: boolean;
  durationMs: number;
  profileId?: string;
  accountId?: string;
  accountLabel?: string;
  planType?: string;
  tokenUsage?: UsageTokenUsage | null;
  imageCount?: number;
  imageRoute?: UsageImageRoute;
  errorType?: string;
};

export type UsageAggregate = {
  requestCount: number;
  successCount: number;
  failureCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  unknownTokenCount: number;
  imageCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  p95DurationMs: number;
  durationBuckets: Record<string, number>;
};

export type UsageDimensionRow = {
  key: string;
  label: string;
  aggregate: UsageAggregate;
};

export type UsageSummary = {
  generatedAt: number;
  startedAt: number;
  todayDate: string;
  storageDir: string;
  startup: UsageAggregate;
  today: UsageAggregate;
  lifetime: UsageAggregate;
  daily: Array<{ date: string; aggregate: UsageAggregate }>;
  byAccount: UsageDimensionRow[];
  byModel: UsageDimensionRow[];
  byEndpoint: UsageDimensionRow[];
  byError: UsageDimensionRow[];
  byImageRoute: UsageDimensionRow[];
  bySource: UsageDimensionRow[];
};

type UsageDailyStore = {
  version: 1;
  updatedAt: number;
  days: Record<string, UsageAggregate>;
};

type UsageLifetimeStore = {
  version: 1;
  updatedAt: number;
  aggregate: UsageAggregate;
  byAccount: Record<string, UsageDimensionRow>;
  byModel: Record<string, UsageDimensionRow>;
  byEndpoint: Record<string, UsageDimensionRow>;
  byError: Record<string, UsageDimensionRow>;
  byImageRoute: Record<string, UsageDimensionRow>;
  bySource: Record<string, UsageDimensionRow>;
};

const durationBucketLimits = [100, 300, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, Number.POSITIVE_INFINITY] as const;

function createAggregate(): UsageAggregate {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    unknownTokenCount: 0,
    imageCount: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
    p95DurationMs: 0,
    durationBuckets: {},
  };
}

function cloneAggregate(value: UsageAggregate): UsageAggregate {
  return {
    ...value,
    durationBuckets: { ...value.durationBuckets },
  };
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeAggregate(value: unknown): UsageAggregate {
  if (!value || typeof value !== "object") {
    return createAggregate();
  }
  const record = value as Partial<UsageAggregate>;
  const aggregate: UsageAggregate = {
    requestCount: Math.max(0, Math.trunc(normalizeNumber(record.requestCount))),
    successCount: Math.max(0, Math.trunc(normalizeNumber(record.successCount))),
    failureCount: Math.max(0, Math.trunc(normalizeNumber(record.failureCount))),
    inputTokens: Math.max(0, Math.trunc(normalizeNumber(record.inputTokens))),
    outputTokens: Math.max(0, Math.trunc(normalizeNumber(record.outputTokens))),
    totalTokens: Math.max(0, Math.trunc(normalizeNumber(record.totalTokens))),
    unknownTokenCount: Math.max(0, Math.trunc(normalizeNumber(record.unknownTokenCount))),
    imageCount: Math.max(0, Math.trunc(normalizeNumber(record.imageCount))),
    totalDurationMs: Math.max(0, normalizeNumber(record.totalDurationMs)),
    averageDurationMs: 0,
    p95DurationMs: 0,
    durationBuckets: {},
  };
  if (record.durationBuckets && typeof record.durationBuckets === "object") {
    for (const [key, item] of Object.entries(record.durationBuckets)) {
      aggregate.durationBuckets[key] = Math.max(0, Math.trunc(normalizeNumber(item)));
    }
  }
  refreshDerivedMetrics(aggregate);
  return aggregate;
}

function normalizeDimensionStore(value: unknown): Record<string, UsageDimensionRow> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const row = item && typeof item === "object" ? (item as Partial<UsageDimensionRow>) : {};
      return [
        key,
        {
          key,
          label: typeof row.label === "string" && row.label.trim() ? row.label : key,
          aggregate: normalizeAggregate(row.aggregate),
        },
      ];
    }),
  );
}

function createDailyStore(): UsageDailyStore {
  return {
    version: 1,
    updatedAt: Date.now(),
    days: {},
  };
}

function createLifetimeStore(): UsageLifetimeStore {
  return {
    version: 1,
    updatedAt: Date.now(),
    aggregate: createAggregate(),
    byAccount: {},
    byModel: {},
    byEndpoint: {},
    byError: {},
    byImageRoute: {},
    bySource: {},
  };
}

function normalizeDailyStore(value: unknown): UsageDailyStore {
  if (!value || typeof value !== "object") {
    return createDailyStore();
  }
  const record = value as Partial<UsageDailyStore>;
  return {
    version: 1,
    updatedAt: normalizeNumber(record.updatedAt, Date.now()),
    days: Object.fromEntries(
      Object.entries(record.days ?? {}).map(([date, aggregate]) => [date, normalizeAggregate(aggregate)]),
    ),
  };
}

function normalizeLifetimeStore(value: unknown): UsageLifetimeStore {
  if (!value || typeof value !== "object") {
    return createLifetimeStore();
  }
  const record = value as Partial<UsageLifetimeStore>;
  return {
    version: 1,
    updatedAt: normalizeNumber(record.updatedAt, Date.now()),
    aggregate: normalizeAggregate(record.aggregate),
    byAccount: normalizeDimensionStore(record.byAccount),
    byModel: normalizeDimensionStore(record.byModel),
    byEndpoint: normalizeDimensionStore(record.byEndpoint),
    byError: normalizeDimensionStore(record.byError),
    byImageRoute: normalizeDimensionStore(record.byImageRoute),
    bySource: normalizeDimensionStore(record.bySource),
  };
}

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function durationBucketKey(durationMs: number): string {
  const normalized = Math.max(0, durationMs);
  for (const limit of durationBucketLimits) {
    if (normalized <= limit) {
      return Number.isFinite(limit) ? String(limit) : "inf";
    }
  }
  return "inf";
}

function bucketKeyToDuration(key: string): number {
  if (key === "inf") {
    return 120000;
  }
  const parsed = Number.parseInt(key, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function estimateP95Duration(buckets: Record<string, number>, total: number): number {
  if (total <= 0) {
    return 0;
  }
  const target = Math.ceil(total * 0.95);
  let seen = 0;
  for (const limit of durationBucketLimits) {
    const key = Number.isFinite(limit) ? String(limit) : "inf";
    seen += buckets[key] ?? 0;
    if (seen >= target) {
      return bucketKeyToDuration(key);
    }
  }
  return 0;
}

function refreshDerivedMetrics(aggregate: UsageAggregate): void {
  aggregate.averageDurationMs = aggregate.requestCount > 0 ? aggregate.totalDurationMs / aggregate.requestCount : 0;
  aggregate.p95DurationMs = estimateP95Duration(aggregate.durationBuckets, aggregate.requestCount);
}

function tokenNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function addToAggregate(aggregate: UsageAggregate, event: Required<Pick<UsageRecordEvent, "statusCode" | "durationMs">> & UsageRecordEvent): void {
  const success = event.success ?? (event.statusCode >= 200 && event.statusCode < 400);
  const inputTokens = tokenNumber(event.tokenUsage?.inputTokens);
  const outputTokens = tokenNumber(event.tokenUsage?.outputTokens);
  const totalTokens = tokenNumber(event.tokenUsage?.totalTokens) ?? (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  aggregate.requestCount += 1;
  aggregate.successCount += success ? 1 : 0;
  aggregate.failureCount += success ? 0 : 1;
  aggregate.inputTokens += inputTokens ?? 0;
  aggregate.outputTokens += outputTokens ?? 0;
  aggregate.totalTokens += totalTokens ?? 0;
  aggregate.unknownTokenCount += totalTokens === null ? 1 : 0;
  aggregate.imageCount += Math.max(0, Math.trunc(event.imageCount ?? 0));
  aggregate.totalDurationMs += Math.max(0, event.durationMs);
  const bucket = durationBucketKey(event.durationMs);
  aggregate.durationBuckets[bucket] = (aggregate.durationBuckets[bucket] ?? 0) + 1;
  refreshDerivedMetrics(aggregate);
}

function imageRouteLabel(route: string): string {
  if (route === "codex-tool") {
    return "Codex 图片工具";
  }
  if (route === "chatgpt-web") {
    return "ChatGPT 网页生图";
  }
  return "非生图";
}

function bumpDimension(store: Record<string, UsageDimensionRow>, key: string, label: string, event: UsageRecordEvent & { statusCode: number; durationMs: number }): void {
  const normalizedKey = key.trim() || "-";
  const existing = store[normalizedKey] ?? {
    key: normalizedKey,
    label: label.trim() || normalizedKey,
    aggregate: createAggregate(),
  };
  existing.label = label.trim() || existing.label;
  addToAggregate(existing.aggregate, event);
  store[normalizedKey] = existing;
}

function topRows(store: Record<string, UsageDimensionRow>, limit = 12): UsageDimensionRow[] {
  return Object.values(store)
    .sort((a, b) => b.aggregate.requestCount - a.aggregate.requestCount || b.aggregate.totalTokens - a.aggregate.totalTokens || a.label.localeCompare(b.label, "zh-CN"))
    .slice(0, limit)
    .map((row) => ({
      key: row.key,
      label: row.label,
      aggregate: cloneAggregate(row.aggregate),
    }));
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export class UsageService {
  private readonly startedAt = Date.now();
  private readonly startupAggregate = createAggregate();
  private dailyStore: UsageDailyStore | null = null;
  private lifetimeStore: UsageLifetimeStore | null = null;
  private loadPromise: Promise<void> | null = null;
  private saveQueue = Promise.resolve();

  async record(event: UsageRecordEvent): Promise<void> {
    await this.ensureLoaded();
    const timestamp = event.timestamp ?? Date.now();
    const date = formatLocalDate(timestamp);
    const normalized: UsageRecordEvent & { id: string; timestamp: number; statusCode: number; durationMs: number } = {
      ...event,
      id: event.id ?? randomUUID(),
      timestamp,
      statusCode: event.statusCode,
      durationMs: Math.max(0, event.durationMs),
      endpoint: event.endpoint || "-",
      method: event.method || "-",
      model: event.model || "-",
      source: event.source || "-",
      imageRoute: event.imageRoute ?? "none",
      imageCount: Math.max(0, Math.trunc(event.imageCount ?? 0)),
      success: event.success ?? (event.statusCode >= 200 && event.statusCode < 400),
    };
    const daily = this.dailyStore ?? createDailyStore();
    const lifetime = this.lifetimeStore ?? createLifetimeStore();
    daily.days[date] = daily.days[date] ? normalizeAggregate(daily.days[date]) : createAggregate();
    addToAggregate(this.startupAggregate, normalized);
    addToAggregate(daily.days[date], normalized);
    addToAggregate(lifetime.aggregate, normalized);
    bumpDimension(lifetime.byAccount, normalized.profileId || normalized.accountId || normalized.accountLabel || "-", normalized.accountLabel || normalized.accountId || normalized.profileId || "-", normalized);
    bumpDimension(lifetime.byModel, normalized.model || "-", normalized.model || "-", normalized);
    bumpDimension(lifetime.byEndpoint, `${normalized.method} ${normalized.endpoint}`, `${normalized.method} ${normalized.endpoint}`, normalized);
    bumpDimension(lifetime.bySource, normalized.source || "-", normalized.source || "-", normalized);
    bumpDimension(lifetime.byImageRoute, normalized.imageRoute ?? "none", imageRouteLabel(normalized.imageRoute ?? "none"), normalized);
    if (!normalized.success) {
      const errorType = normalized.errorType?.trim() || `HTTP ${normalized.statusCode}`;
      bumpDimension(lifetime.byError, errorType, errorType, normalized);
    }
    daily.updatedAt = timestamp;
    lifetime.updatedAt = timestamp;
    this.dailyStore = daily;
    this.lifetimeStore = lifetime;

    const eventPath = path.join(getUsageEventsDir(), `${date}.jsonl`);
    const dailyPath = getUsageDailyPath();
    const lifetimePath = getUsageLifetimePath();
    this.saveQueue = this.saveQueue.then(async () => {
      await fs.mkdir(getUsageEventsDir(), { recursive: true });
      await fs.appendFile(eventPath, `${JSON.stringify(normalized)}\n`, "utf8");
      await Promise.all([
        writeJsonAtomic(dailyPath, daily),
        writeJsonAtomic(lifetimePath, lifetime),
      ]);
    }, async () => {
      await fs.mkdir(getUsageEventsDir(), { recursive: true });
      await fs.appendFile(eventPath, `${JSON.stringify(normalized)}\n`, "utf8");
      await Promise.all([
        writeJsonAtomic(dailyPath, daily),
        writeJsonAtomic(lifetimePath, lifetime),
      ]);
    });
    await this.saveQueue;
  }

  async getSummary(): Promise<UsageSummary> {
    await this.ensureLoaded();
    const daily = this.dailyStore ?? createDailyStore();
    const lifetime = this.lifetimeStore ?? createLifetimeStore();
    const todayDate = formatLocalDate(Date.now());
    return {
      generatedAt: Date.now(),
      startedAt: this.startedAt,
      todayDate,
      storageDir: getUsageDir(),
      startup: cloneAggregate(this.startupAggregate),
      today: cloneAggregate(daily.days[todayDate] ?? createAggregate()),
      lifetime: cloneAggregate(lifetime.aggregate),
      daily: Object.entries(daily.days)
        .sort(([left], [right]) => right.localeCompare(left))
        .slice(0, 30)
        .map(([date, aggregate]) => ({ date, aggregate: cloneAggregate(aggregate) })),
      byAccount: topRows(lifetime.byAccount, 16),
      byModel: topRows(lifetime.byModel, 16),
      byEndpoint: topRows(lifetime.byEndpoint, 16),
      byError: topRows(lifetime.byError, 16),
      byImageRoute: topRows(lifetime.byImageRoute, 8),
      bySource: topRows(lifetime.bySource, 8),
    };
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        await ensureStateMigrated();
        await fs.mkdir(getUsageDir(), { recursive: true });
        await fs.mkdir(getUsageEventsDir(), { recursive: true });
        const [dailyRaw, lifetimeRaw] = await Promise.all([
          readJsonFile(getUsageDailyPath()),
          readJsonFile(getUsageLifetimePath()),
        ]);
        this.dailyStore = normalizeDailyStore(dailyRaw);
        this.lifetimeStore = normalizeLifetimeStore(lifetimeRaw);
      })();
    }
    await this.loadPromise;
  }
}
