import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ResetCalendarService } from "../src/core/services/reset-calendar-service.ts";
import type { ResetAnnouncement, ResetCalendarNotification, ResetStatus, ResetWatch } from "../src/core/reset-calendar-types.ts";
import { matchPublicResetTranslation, parsePublicResetTranslations, resetTranslationMaxHtmlLength } from "../src/core/services/reset-calendar-translations.ts";

const initialTime = Date.parse("2026-10-12T04:00:00Z");
const folders: string[] = [];
const services: ResetCalendarService[] = [];
const iso = (time = initialTime) => new Date(time).toISOString();
const announcement = (id = "100", time = initialTime - 86_400_000, reset_type: "regular" | "banked" = "regular"): ResetAnnouncement => ({
  id, reset_type, announced_at: iso(time), text: `Public reset ${id}`,
  source: { type: "x_post", author: "thsottiaux", url: `https://x.com/thsottiaux/status/${id}` },
});
const watch = (id = "200", options: Partial<ResetWatch> = {}): ResetWatch => ({
  level: "elevated", reset_chance_percent: 60, forecast_window: "Within 24 hours",
  observed_at: iso(initialTime - 60_000), expires_at: iso(initialTime + 86_400_000),
  text: "A public forecast", source: announcement(id).source, ...options,
});
const status = (options: Partial<ResetStatus> = {}): ResetStatus => ({
  latest_reset: announcement(), scheduled_reset: null, active_watch: null,
  stats: { total: 1, last_reset_at: announcement().announced_at, days_since_last: 1, avg_interval_days: 3 },
  ...options,
});
const json = (value: unknown, responseStatus = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), {
  status: responseStatus, headers: { "content-type": "application/json", ...headers },
});
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const translatedArticle = (id: string, originalText: string, zhCN: string) => `<article class="announcement tone-1">
  <p class="translation-label">中文速读</p><h3>${escapeHtml(zhCN)}</h3>
  <details><summary>展开英文原文</summary><p>${escapeHtml(originalText)}</p></details>
  <a href="https://x.com/thsottiaux/status/${id}">去 X 看原帖</a></article>`;

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "azt-reset-calendar-"));
  folders.push(directory);
  let time = initialTime;
  let generatedAt: string | null = null;
  let remoteStatus: unknown = status();
  let failure: (() => Response | never) | null = null;
  const calls: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const notifications: ResetCalendarNotification[] = [];
  const pages = new Map<string, { data: ResetAnnouncement[]; pagination: { has_more: boolean; next_cursor: string | null } }>([
    ["", { data: [announcement()], pagination: { has_more: false, next_cursor: null } }],
  ]);
  const fetcher = (async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (failure) return failure();
    const meta = { api_version: "v1", generated_at: generatedAt ?? iso(time) };
    if (url.pathname.endsWith("/status")) return json({ data: remoteStatus, meta });
    const page = pages.get(url.searchParams.get("cursor") ?? "");
    if (!page) throw new Error("unexpected page cursor");
    return json({ ...page, meta });
  }) as typeof fetch;
  const options = {
    statePath: path.join(directory, "calendar.json"), fetcher, now: () => time,
    translationFetcher: null,
    notify: async (notification: ResetCalendarNotification) => { notifications.push(notification); },
    pollIntervalMs: 1000,
  };
  const create = (overrides: Partial<ConstructorParameters<typeof ResetCalendarService>[0]> = {}) => {
    const service = new ResetCalendarService({ ...options, ...overrides });
    services.push(service);
    return service;
  };
  return {
    create, calls, notifications, pages, options,
    advance: (ms: number) => { time += ms; },
    setGeneratedAt: (value: string | null) => { generatedAt = value; },
    setStatus: (value: unknown) => { remoteStatus = value; },
    setFailure: (value: typeof failure) => { failure = value; },
  };
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.stop()));
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { force: true, recursive: true })));
});

describe("ResetCalendarService", () => {
  test("first synchronization establishes a silent baseline and saves every history page", async () => {
    const f = await fixture();
    f.setStatus(status({ active_watch: watch() }));
    f.pages.set("", { data: [announcement()], pagination: { has_more: true, next_cursor: "older_page" } });
    f.pages.set("older_page", {
      data: [announcement("99", initialTime - 172_800_000)], pagination: { has_more: false, next_cursor: null },
    });
    const service = f.create();
    const result = await service.sync();
    expect(result.sync.phase).toBe("ready");
    expect(result.sync.historyComplete).toBe(true);
    expect(result.records.map((record) => record.id)).toEqual(["100", "99"]);
    expect(f.notifications).toHaveLength(0);
    expect(f.calls.map(({ url }) => url.searchParams.get("cursor"))).toEqual([null, null, "older_page"]);
    const restored = await f.create().getState();
    expect(restored.records).toEqual(result.records);
    expect(restored.status?.active_watch).toEqual(watch());
    expect(restored.sync.lastSyncedAt).toEqual(iso());
  });

  test("deduplicates source-level changes and permits one signal followed by one confirmation", async () => {
    const f = await fixture();
    const service = f.create();
    await service.sync();
    f.setStatus(status({ active_watch: watch() }));
    await service.sync();
    f.setStatus(status({ active_watch: watch("200", { level: "strong", reset_chance_percent: 90 }) }));
    await service.sync();
    f.setStatus(status({ scheduled_reset: { ...announcement("200"), status: "scheduled", scheduled_for: iso(initialTime + 60_000) } }));
    await service.sync();
    expect(f.notifications.map((item) => item.kind)).toEqual(["signal"]);
    f.setStatus(status({ latest_reset: announcement("200", initialTime) }));
    await service.sync();
    await service.sync();
    expect(f.notifications.map((item) => item.kind)).toEqual(["signal", "confirmed"]);
    expect(f.notifications[0]!.eventId).toEqual(f.notifications[1]!.eventId);
    expect(f.notifications[1]!.body).toContain("请以账号实际额度为准");
  });

  test("persists both notification stages across restarts", async () => {
    const f = await fixture();
    const first = f.create();
    await first.sync();
    f.setStatus(status({ active_watch: watch(), latest_reset: announcement("201", initialTime) }));
    await first.sync();
    expect(f.notifications).toHaveLength(2);
    const restarted = f.create();
    await restarted.sync();
    expect(f.notifications).toHaveLength(2);
    f.setStatus(status({ latest_reset: announcement("202", initialTime + 1000) }));
    await restarted.sync();
    expect(f.notifications).toHaveLength(3);
    expect(f.notifications[2]!.kind).toBe("confirmed");
  });

  test("distinct observed reset IDs sharing one source URL are distinct events", async () => {
    const f = await fixture();
    const service = f.create();
    await service.sync();
    const source = { type: "observed" as const, url: "https://codex-resets.com/" };
    f.setStatus(status({ latest_reset: { ...announcement("observed-one", initialTime), source } }));
    await service.sync();
    f.setStatus(status({ latest_reset: { ...announcement("observed-two", initialTime + 1000), source } }));
    await service.sync();
    expect(f.notifications.map((item) => item.eventId)).toEqual(["announcement:observed-one", "announcement:observed-two"]);
  });

  test("observed watches sharing a page URL use observed_at and deduplicate level changes", async () => {
    const f = await fixture();
    const service = f.create();
    await service.sync();
    const source = { type: "observed" as const, url: "https://codex-resets.com/" };
    const firstObservedAt = iso(initialTime - 10_000);
    const secondObservedAt = iso(initialTime - 5000);
    f.setStatus(status({ active_watch: watch("200", { source, observed_at: firstObservedAt }) }));
    await service.sync();
    f.setStatus(status({ active_watch: watch("200", { source, observed_at: firstObservedAt, level: "strong" }) }));
    await service.sync();
    expect(f.notifications).toHaveLength(1);
    f.setStatus(status({ active_watch: watch("200", { source, observed_at: secondObservedAt }) }));
    await service.sync();
    expect(f.notifications.map((item) => item.eventId)).toEqual([`watch:${firstObservedAt}`, `watch:${secondObservedAt}`]);
    expect(f.notifications.every((item) => item.kind === "signal")).toBe(true);
  });

  test("consumes stages while disabled and persists independent switches", async () => {
    const f = await fixture();
    const service = f.create();
    await service.sync();
    await service.updateSettings({ signalNotifications: false });
    f.setStatus(status({ active_watch: watch() }));
    await service.sync();
    await service.updateSettings({ signalNotifications: true, confirmedNotifications: false });
    f.setStatus(status({ active_watch: watch(), latest_reset: announcement("201", initialTime) }));
    await service.sync();
    expect(f.notifications).toHaveLength(0);
    const restart = f.create();
    expect((await restart.getState()).settings).toEqual({ signalNotifications: true, confirmedNotifications: false });
    await restart.updateSettings({ confirmedNotifications: true });
    await restart.sync();
    expect(f.notifications).toHaveLength(0);
    f.setStatus(status({ active_watch: watch("202"), latest_reset: announcement("203", initialTime) }));
    await restart.sync();
    expect(f.notifications.map((item) => item.kind)).toEqual(["signal", "confirmed"]);
  });

  test("expires watches in cached snapshots and never notifies for an expired source", async () => {
    const f = await fixture();
    const service = f.create();
    await service.sync();
    f.setStatus(status({ active_watch: watch("200", { expires_at: iso(initialTime - 1000) }) }));
    const expired = await service.sync();
    expect(expired.status?.active_watch).toBeNull();
    expect(f.notifications).toHaveLength(0);
    f.setStatus(status({ active_watch: watch("201", { expires_at: iso(initialTime + 1000) }) }));
    await service.sync();
    expect(f.notifications).toHaveLength(1);
    f.advance(1001);
    expect((await service.getState()).status?.active_watch).toBeNull();
    expect((await f.create().getState()).status?.active_watch).toBeNull();
  });

  test("a passed scheduled_for never becomes a completion notification", async () => {
    const f = await fixture();
    const service = f.create();
    await service.sync();
    f.setStatus(status({ scheduled_reset: { ...announcement("200"), status: "scheduled", scheduled_for: iso(initialTime - 86_400_000) } }));
    await service.sync();
    f.advance(172_800_000);
    await service.sync();
    expect(f.notifications.map((item) => item.kind)).toEqual(["signal"]);
    expect((await service.getState()).status?.scheduled_reset?.id).toBe("200");
  });

  test("offline catch-up adds all history but only latest_reset confirms execution", async () => {
    const f = await fixture();
    const service = f.create();
    await service.sync();
    const older = announcement("200", initialTime + 1000);
    const latest = announcement("201", initialTime + 2000, "banked");
    f.pages.set("", { data: [latest, older, announcement()], pagination: { has_more: false, next_cursor: null } });
    f.setStatus(status({ latest_reset: latest }));
    const result = await service.sync();
    expect(result.records.map((record) => record.id)).toEqual(["201", "200", "100"]);
    expect(f.notifications).toHaveLength(1);
    expect(f.notifications[0]!.kind).toBe("confirmed");
    expect(f.notifications[0]!.title).toContain("储备重置已发放");
    expect(f.notifications[0]!.body).toContain("不代表账号额度已恢复");
  });

  test("network failures preserve cached records/status and recovery clears the error", async () => {
    const f = await fixture();
    const service = f.create();
    const cached = await service.sync();
    f.setFailure(() => { throw new TypeError("network disconnected"); });
    const failed = await service.sync();
    expect(failed.sync.phase).toBe("error");
    expect(failed.sync.lastSyncedAt).toEqual(cached.sync.lastSyncedAt);
    expect(failed.records).toEqual(cached.records);
    expect(failed.status).toEqual(cached.status);
    f.setFailure(null);
    f.advance(1001);
    const recovered = await service.sync();
    expect(recovered.sync.phase).toBe("ready");
    expect(recovered.sync.error).toBeNull();
  });

  test("honors Retry-After across refreshes and service restarts", async () => {
    const f = await fixture();
    f.setFailure(() => json({}, 429, { "retry-after": "600" }));
    const service = f.create();
    const failed = await service.sync();
    expect(failed.sync.nextSyncAt).toBe(iso(initialTime + 600_000));
    f.setFailure(null);
    await service.sync();
    const restarted = f.create();
    await restarted.sync();
    expect(f.calls).toHaveLength(1);
    f.advance(600_001);
    expect((await restarted.sync()).sync.phase).toBe("ready");
    expect(f.calls).toHaveLength(3);
  });

  test("uses exponential backoff for repeated 503 errors", async () => {
    const f = await fixture();
    f.setFailure(() => json({}, 503));
    const service = f.create();
    expect((await service.sync()).sync.nextSyncAt).toBe(iso(initialTime + 1000));
    f.advance(1001);
    expect((await service.sync()).sync.nextSyncAt).toBe(iso(initialTime + 3001));
    f.advance(2001);
    f.setFailure(null);
    expect((await service.sync()).sync.phase).toBe("ready");
  });

  test("rejects malformed upstream status without replacing the cached status", async () => {
    const f = await fixture();
    const service = f.create();
    const good = await service.sync();
    f.setStatus({ latest_reset: { id: "broken" } });
    const invalid = await service.sync();
    expect(invalid.sync.phase).toBe("error");
    expect(invalid.status).toEqual(good.status);
    expect(invalid.records).toEqual(good.records);
    expect(f.notifications).toHaveLength(0);
  });

  test("older generated_at snapshots cannot roll back the status or trigger stale signals", async () => {
    const f = await fixture();
    const service = f.create();
    const cached = await service.sync();
    f.setStatus(status({ latest_reset: announcement("99", initialTime - 172_800_000), active_watch: watch() }));
    f.setGeneratedAt(iso(initialTime - 1000));
    const stale = await service.sync();
    expect(stale.status).toEqual(cached.status);
    expect(stale.sync.generatedAt).toBe(cached.sync.generatedAt);
    expect(f.notifications).toHaveLength(0);
  });

  test("an old history item becoming latest does not generate a new completion", async () => {
    const f = await fixture();
    const old = announcement("99", initialTime - 172_800_000);
    f.pages.set("", { data: [announcement(), old], pagination: { has_more: false, next_cursor: null } });
    await f.create().sync();
    f.advance(1000);
    f.setStatus(status({ latest_reset: old }));
    const restarted = f.create();
    await restarted.sync();
    expect(f.notifications).toHaveLength(0);
    // The persisted high-water mark survives another restart and a newer CDN snapshot.
    f.advance(1000);
    await f.create().sync();
    expect(f.notifications).toHaveLength(0);
  });

  test("partial history is persisted and resumes at the failing page after restart", async () => {
    const f = await fixture();
    f.pages.set("", { data: [announcement()], pagination: { has_more: true, next_cursor: "older" } });
    const first = f.create();
    const partial = await first.sync();
    expect(partial.sync.phase).toBe("error");
    expect(partial.sync.historyComplete).toBe(false);
    expect(partial.records).toHaveLength(1);
    f.pages.set("older", {
      data: [announcement("99", initialTime - 172_800_000)], pagination: { has_more: false, next_cursor: null },
    });
    f.advance(1001);
    const result = await f.create().sync();
    expect(result.records.map((record) => record.id)).toEqual(["100", "99"]);
    expect(result.sync.historyComplete).toBe(true);
    expect(f.calls[4]!.url.searchParams.get("cursor")).toBe("older");
    expect(f.notifications).toHaveLength(0);
  });

  test("detects a repeated pagination cursor and retains received records", async () => {
    const f = await fixture();
    f.pages.set("", { data: [announcement()], pagination: { has_more: true, next_cursor: "repeat" } });
    f.pages.set("repeat", {
      data: [announcement("99", initialTime - 172_800_000)], pagination: { has_more: true, next_cursor: "repeat" },
    });
    const result = await f.create().sync();
    expect(result.sync.phase).toBe("error");
    expect(result.sync.error).toContain("游标无效");
    expect(result.records).toHaveLength(2);
    expect(f.calls).toHaveLength(3);
  });

  test("merges concurrent refreshes into one upstream request sequence", async () => {
    const f = await fixture();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let requested = 0;
    const fetcher = (async (input, init) => {
      requested += 1;
      await held;
      return f.options.fetcher(input, init);
    }) as typeof fetch;
    const service = f.create({ fetcher });
    const first = service.sync();
    const second = service.sync();
    expect(second).toBe(first);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(requested).toBe(2);
  });

  test("request timeout also bounds a fetch implementation that ignores cancellation", async () => {
    const f = await fixture();
    const fetcher = (async () => await new Promise<Response>(() => undefined)) as typeof fetch;
    const service = f.create({ fetcher, requestTimeoutMs: 10 });
    const result = await service.sync();
    expect(result.sync.phase).toBe("error");
    expect(result.sync.error).toContain("超时");
  });

  test("stop cancels an in-flight request and prevents the polling timer from restarting", async () => {
    const f = await fixture();
    let onRequested!: () => void;
    const requested = new Promise<void>((resolve) => { onRequested = resolve; });
    let requestSignal: AbortSignal | undefined;
    let requestCount = 0;
    const fetcher = (async (_input, init) => {
      requestSignal = init?.signal ?? undefined;
      requestCount += 1;
      onRequested();
      return await new Promise<Response>(() => undefined);
    }) as typeof fetch;
    const service = f.create({ fetcher, pollIntervalMs: 100 });
    service.start();
    await requested;
    const inFlight = service.sync();
    service.stop();
    expect(requestSignal?.aborted).toBe(true);
    const result = await inFlight;
    expect(result.sync.phase).toBe("idle");
    expect(result.sync.nextSyncAt).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(requestCount).toBe(1);
  });

  test("stop awaits persisted receipts without waiting for a stalled notification callback", async () => {
    const f = await fixture();
    let onNotified!: () => void;
    const notified = new Promise<void>((resolve) => { onNotified = resolve; });
    const service = f.create({ notify: () => {
      onNotified();
      return new Promise<boolean>(() => undefined);
    } });
    await service.sync();
    f.setStatus(status({ active_watch: watch() }));
    const inFlight = service.sync();
    await notified;
    await service.stop();
    expect((await inFlight).sync.phase).toBe("ready");
    expect((await service.getState()).sync.nextSyncAt).toBeNull();
    await f.create().sync();
    expect(f.notifications).toHaveLength(0);
  });

  test("background polling starts without blocking and stops cleanly", async () => {
    const f = await fixture();
    const service = f.create({ pollIntervalMs: 100 });
    expect(service.start()).toBeUndefined();
    await service.sync();
    await new Promise((resolve) => setTimeout(resolve, 150));
    // Fake clock stays fixed, but the background timer still runs normally.
    expect(f.calls.length).toBeGreaterThanOrEqual(4);
    service.stop();
    const count = f.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(f.calls).toHaveLength(count);
  });

  test("fetches only public API data with no credentials and returns defensive snapshots", async () => {
    const f = await fixture();
    const service = f.create();
    const state = await service.sync();
    for (const call of f.calls) {
      expect(call.url.origin).toBe("https://codex-resets.com");
      expect(call.init?.credentials).toBe("omit");
      expect(call.init?.cache).toBe("no-cache");
      expect(call.init?.headers).toEqual({ Accept: "application/json", "User-Agent": "AI-Zero-Token/2" });
    }
    state.records.length = 0;
    state.settings.signalNotifications = false;
    const unchanged = await service.getState();
    expect(unchanged.records).toHaveLength(1);
    expect(unchanged.settings.signalNotifications).toBe(true);
  });

  test("test notification reports unsupported or failed delivery without changing phase receipts", async () => {
    const f = await fixture();
    const supported = f.create();
    expect(await supported.testNotification()).toEqual({ sent: true });
    expect(f.notifications[0]!.kind).toBe("test");
    expect(await f.create({ notificationsSupported: false }).testNotification()).toEqual({ sent: false });
    expect(await f.create({ notify: async () => false }).testNotification()).toEqual({ sent: false });
    expect(await f.create({ notify: async () => { throw new Error("desktop unavailable"); } }).testNotification()).toEqual({ sent: false });
  });

  test("attaches matching public Chinese alongside the exact original API text", async () => {
    const f = await fixture();
    const record = { ...announcement(), text: "Paid &amp; pro limits reset. https://t.co/AbC123" };
    f.setStatus(status({ latest_reset: record }));
    f.pages.set("", { data: [record], pagination: { has_more: false, next_cursor: null } });
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    const translationFetcher = (async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(translatedArticle("100", "Paid & pro limits reset.", "付费与 Pro 用户额度已重置。"));
    }) as typeof fetch;
    const result = await f.create({ translationFetcher }).sync();
    expect(result.sync.phase).toBe("ready");
    expect(result.records[0]!.text).toBe(record.text);
    expect(result.records[0]!.translation).toEqual({
      zhCN: "付费与 Pro 用户额度已重置。", source: "ai-resets.com", sourceUrl: "https://ai-resets.com/", originalText: record.text,
    });
    expect(result.status?.latest_reset?.translation).toEqual(result.records[0]!.translation);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.input).toBe("https://ai-resets.com/");
    expect(requests[0]!.init?.credentials).toBe("omit");
    expect(requests[0]!.init?.cache).toBe("no-cache");
    expect(requests[0]!.init?.headers).toEqual({ Accept: "text/html", "User-Agent": "AI-Zero-Token/2" });
  });

  test("matches observed reset source IDs and can translate scheduled announcements and watches", async () => {
    const f = await fixture();
    const observed = { ...announcement("observed-source"), source: { type: "observed" as const, url: announcement("100").source.url } };
    observed.text = "Public reset 100";
    f.setStatus(status({ latest_reset: observed,
      scheduled_reset: { ...announcement("200"), status: "scheduled", scheduled_for: iso(initialTime + 60_000) },
      active_watch: watch("200", { text: "Public reset 200" }),
    }));
    const translationFetcher = (async () => new Response([
      translatedArticle("100", "Public reset 100", "公开重置公告一。"),
      translatedArticle("200", "Public reset 200", "公开重置公告二。"),
    ].join(""))) as typeof fetch;
    const result = await f.create({ translationFetcher }).sync();
    expect(result.status?.latest_reset?.translation?.zhCN).toBe("公开重置公告一。");
    expect(result.status?.scheduled_reset?.translation?.zhCN).toBe("公开重置公告二。");
    expect(result.status?.active_watch?.translation?.zhCN).toBe("公开重置公告二。");
  });

  test("leaves missing or mismatched translations absent without changing original text", async () => {
    const f = await fixture();
    const translationFetcher = (async () => new Response([
      translatedArticle("100", "A different original announcement", "另一份公告。"),
      translatedArticle("999", "Public reset 100", "另一个来源编号的公告。"),
    ].join(""))) as typeof fetch;
    const result = await f.create({ translationFetcher }).sync();
    expect(result.records[0]!.translation).toBeUndefined();
    expect(result.records[0]!.text).toBe(announcement().text);
    expect(result.sync.phase).toBe("ready");
  });

  test("the reviewed local correction matches only its precise observation and retains provenance", async () => {
    const f = await fixture();
    const record = { ...announcement("observed-2097043464538264003"),
      text: "All reset for everyone. Enjoy the week with Astra. https://t.co/WBM38J",
      source: { type: "observed" as const, url: "https://x.com/thsottiaux/status/2097174560412246215" },
    };
    f.setStatus(status({ latest_reset: record }));
    f.pages.set("", { data: [record], pagination: { has_more: false, next_cursor: null } });
    const result = await f.create().sync();
    expect(result.records[0]!.translation).toEqual({
      zhCN: "所有人的额度都已重置。祝大家本周愉快使用 Astra。", source: "ai-zero-token",
      sourceUrl: record.source.url, originalText: record.text,
    });
    expect(result.records[0]!.text).toBe(record.text);
    expect((await f.create().getState()).records[0]!.translation).toEqual(result.records[0]!.translation);
  });

  test("the reviewed correction never applies to changed text, a different ID, or an insecure source", () => {
    const base = { ...announcement("observed-2097043464538264003"),
      text: "All reset for everyone. Enjoy the week with Astra.",
      source: { type: "observed" as const, url: "https://x.com/thsottiaux/status/2097174560412246215" },
    };
    expect(matchPublicResetTranslation({ ...base, text: "All reset for everyone. Enjoy Astra next week." }, new Map())).toBeUndefined();
    expect(matchPublicResetTranslation({ ...base, id: "observed-another" }, new Map())).toBeUndefined();
    expect(matchPublicResetTranslation({ ...base, source: { type: "observed", url: "http://x.com/thsottiaux/status/2097174560412246215" } }, new Map())).toBeUndefined();
  });

  test("conservatively rejects oversized or clearly length-mismatched public translations", () => {
    const shortOriginal = "All reset for everyone. Enjoy the week with Astra.";
    const unrelatedForecast = "这是一段很长的未来预告，与短句确认不匹配。".repeat(12);
    expect(parsePublicResetTranslations(translatedArticle("100", shortOriginal, unrelatedForecast))).toEqual([]);
    expect(parsePublicResetTranslations("x".repeat(resetTranslationMaxHtmlLength + 1))).toEqual([]);
    expect(parsePublicResetTranslations("<html><script>doNotExecute()</script><h3>结构已变化</h3></html>")).toEqual([]);
  });

  test("persists matching translations across secondary outages and drops stale text matches", async () => {
    const f = await fixture();
    const translationFetcher = (async () => new Response(translatedArticle("100", announcement().text, "公开重置公告。"))) as typeof fetch;
    await f.create({ translationFetcher }).sync();
    f.advance(300_001);
    const failingFetcher = (async () => { throw new Error("Translation source unavailable"); }) as typeof fetch;
    const restarted = f.create({ translationFetcher: failingFetcher });
    expect((await restarted.getState()).records[0]!.translation?.zhCN).toBe("公开重置公告。");
    const offlineTranslation = await restarted.sync();
    expect(offlineTranslation.records[0]!.translation?.zhCN).toBe("公开重置公告。");
    expect(offlineTranslation.sync.phase).toBe("ready");
    const changed = { ...announcement(), text: "Public reset 100 was corrected" };
    f.setStatus(status({ latest_reset: changed }));
    f.pages.set("", { data: [changed], pagination: { has_more: false, next_cursor: null } });
    const updated = await restarted.sync();
    expect(updated.records[0]!.translation).toBeUndefined();
    expect(updated.status?.latest_reset?.translation).toBeUndefined();
    expect(updated.records[0]!.text).toBe(changed.text);
  });

  test("refreshes the public translation catalogue for future events after the bounded interval", async () => {
    const f = await fixture();
    let html = translatedArticle("100", announcement().text, "重置公告一。义务译文。");
    let count = 0;
    const translationFetcher = (async () => { count += 1; return new Response(html); }) as typeof fetch;
    const service = f.create({ translationFetcher });
    await service.sync();
    await service.sync();
    expect(count).toBe(1);
    f.advance(300_001);
    const latest = announcement("200", initialTime + 1000);
    f.setStatus(status({ latest_reset: latest }));
    html += translatedArticle("200", latest.text, "新的重置公告。义务译文。");
    const refreshed = await service.sync();
    expect(count).toBe(2);
    expect(refreshed.status?.latest_reset?.translation?.zhCN).toBe("新的重置公告。义务译文。");
  });

  test("bounds a hanging translation page without failing the successful primary sync", async () => {
    const f = await fixture();
    const translationFetcher = (async () => await new Promise<Response>(() => undefined)) as typeof fetch;
    const result = await f.create({ translationFetcher, requestTimeoutMs: 10 }).sync();
    expect(result.sync.phase).toBe("ready");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.translation).toBeUndefined();
  });

  test("secondary Retry-After is persisted without imposing a primary API cooldown", async () => {
    const f = await fixture();
    let requests = 0;
    const translationFetcher = (async () => {
      requests += 1;
      return json({}, 429, { "retry-after": "600" });
    }) as typeof fetch;
    const first = f.create({ translationFetcher });
    expect((await first.sync()).sync.phase).toBe("ready");
    f.advance(300_001);
    const restarted = f.create({ translationFetcher });
    expect((await restarted.sync()).sync.phase).toBe("ready");
    expect(requests).toBe(1);
    expect(f.calls).toHaveLength(4);
    f.advance(300_000);
    expect((await restarted.sync()).sync.phase).toBe("ready");
    expect(requests).toBe(2);
  });

  test("stop cancels secondary translation loading and preserves previously committed status", async () => {
    const f = await fixture();
    let started!: () => void;
    const translationStarted = new Promise<void>((resolve) => { started = resolve; });
    let translationSignal: AbortSignal | undefined;
    const translationFetcher = (async (_input, init) => {
      translationSignal = init?.signal ?? undefined;
      started();
      return await new Promise<Response>(() => undefined);
    }) as typeof fetch;
    const service = f.create({ translationFetcher });
    const inFlight = service.sync();
    await translationStarted;
    await service.stop();
    expect(translationSignal?.aborted).toBe(true);
    expect((await inFlight).status?.latest_reset?.id).toBe("100");
    expect((await service.getState()).sync.nextSyncAt).toBeNull();
  });
});
