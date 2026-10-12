import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as requestHttp } from "node:http";
import type { ResetAnnouncement, ResetCalendarNotification } from "../src/core/reset-calendar-types.ts";
import { ResetCalendarService, type ResetCalendarServiceOptions } from "../src/core/services/reset-calendar-service.ts";
import { getStateDir } from "../src/core/store/state-paths.ts";
import { createApp } from "../src/server/app.ts";

const route = "/_gateway/admin/reset-calendar";
const now = Date.parse("2026-10-12T09:00:00.000Z");
const announcement: ResetAnnouncement = {
  id: "test-reset-1",
  reset_type: "regular",
  announced_at: "2026-10-11T04:01:09.000Z",
  text: "Reset all propagated.",
  source: { type: "observed" },
};
const meta = { api_version: "v1", generated_at: "2026-10-12T08:59:00.000Z" };

let directory: string;
let statePath: string;
let apps: ReturnType<typeof createApp>[];
let services: ResetCalendarService[];
let restoreSpies: Array<() => void>;

beforeEach(async () => {
  if (!getStateDir().includes("azt-tests-")) {
    throw new Error("Run bun test --preload ./tests/setup.ts to isolate user state.");
  }
  directory = await mkdtemp(join(tmpdir(), "azt-reset-routes-"));
  statePath = join(directory, "reset-calendar.json");
  apps = [];
  services = [];
  restoreSpies = [];
});

afterEach(async () => {
  for (const app of apps) await app.close();
  for (const service of services) await service.stop();
  for (const restore of restoreSpies) restore();
  await rm(directory, { recursive: true, force: true });
});

function makeService(options: ResetCalendarServiceOptions = {}) {
  const service = new ResetCalendarService({
    statePath,
    now: () => now,
    translationFetcher: null,
    fetcher: (async () => { throw new Error("Unexpected external request in route test"); }) as typeof fetch,
    ...options,
  });
  services.push(service);
  return service;
}

function makeApp(service?: ResetCalendarService, callbacks: Parameters<typeof createApp>[0] = {}) {
  const app = createApp({ ...callbacks, ...(service ? { resetCalendarService: service } : {}) });
  apps.push(app);
  return app;
}

describe("reset calendar management routes", () => {
  test("default GET reads local state without starting a monitor or contacting the public API", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("No public network in route tests"); });
    const startSpy = spyOn(ResetCalendarService.prototype, "start").mockImplementation(() => undefined);
    restoreSpies.push(() => fetchSpy.mockRestore(), () => startSpy.mockRestore());
    const response = await makeApp().inject({ method: "GET", url: route });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({ records: [], status: null, notificationsSupported: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
  });

  test("every route rejects remote addresses, nonlocal Host headers, and nonlocal Origins before doing work", async () => {
    const delivered: ResetCalendarNotification[] = [];
    const service = makeService({ notify: async (event) => { delivered.push(event); return true; } });
    const stateSpy = spyOn(service, "getState");
    const syncSpy = spyOn(service, "sync");
    const settingsSpy = spyOn(service, "updateSettings");
    const testSpy = spyOn(service, "testNotification");
    restoreSpies.push(() => stateSpy.mockRestore(), () => syncSpy.mockRestore(), () => settingsSpy.mockRestore(), () => testSpy.mockRestore());
    const app = makeApp(service);
    const endpoints = [
      { method: "GET" as const, url: route },
      { method: "POST" as const, url: `${route}/sync` },
      { method: "PUT" as const, url: `${route}/settings`, payload: { signalNotifications: false, confirmedNotifications: false } },
      { method: "POST" as const, url: `${route}/test-notification` },
    ];
    const deniedRequests = [
      { remoteAddress: "192.168.1.2", headers: { host: "localhost" } },
      { headers: { host: "gateway.example" } },
      { headers: { host: "localhost", origin: "https://evil.example" } },
    ];
    for (const endpoint of endpoints) {
      for (const denied of deniedRequests) {
        const response = await app.inject({ ...endpoint, ...denied });
        expect(response.statusCode).toBe(403);
        expect(response.json().error.type).toBe("local_access_required");
      }
    }
    expect(stateSpy).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();
    expect(settingsSpy).not.toHaveBeenCalled();
    expect(testSpy).not.toHaveBeenCalled();
    expect(delivered).toEqual([]);
  });

  test("settings require exactly two booleans and persist across service instances", async () => {
    const service = makeService();
    const app = makeApp(service);
    for (const payload of [
      {}, { signalNotifications: true },
      { signalNotifications: "false", confirmedNotifications: true },
      { signalNotifications: false, confirmedNotifications: 1 },
      { signalNotifications: null, confirmedNotifications: true },
      { signalNotifications: false, confirmedNotifications: true, extra: true },
    ]) {
      const response = await app.inject({ method: "PUT", url: `${route}/settings`, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.type).toBe("validation_error");
    }
    expect((await service.getState()).settings).toEqual({ signalNotifications: true, confirmedNotifications: true });
    const settings = { signalNotifications: false, confirmedNotifications: true };
    const response = await app.inject({ method: "PUT", url: `${route}/settings`, payload: settings });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().settings).toEqual(settings);
    expect(JSON.parse(await readFile(statePath, "utf8")).settings).toEqual(settings);
    expect((await makeService().getState()).settings).toEqual(settings);
  });

  test("manual synchronization returns validated status and paginated records, then GET serves the local snapshot", async () => {
    const requests: string[] = [];
    const older = { ...announcement, id: "test-reset-older", announced_at: "2026-10-01T00:00:00.000Z", reset_type: "banked" as const };
    const fetcher = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requests.push(url.href);
      if (url.pathname === "/api/v1/status") return Response.json({ data: {
        latest_reset: announcement, scheduled_reset: null, active_watch: null,
        stats: { total: 2, last_reset_at: announcement.announced_at, days_since_last: 1, avg_interval_days: 10 },
      }, meta });
      if (url.pathname === "/api/v1/resets" && !url.searchParams.has("cursor")) {
        return Response.json({ data: [announcement], pagination: { has_more: true, next_cursor: "fixture_page_2" }, meta });
      }
      if (url.pathname === "/api/v1/resets" && url.searchParams.get("cursor") === "fixture_page_2") {
        return Response.json({ data: [older], pagination: { has_more: false, next_cursor: null }, meta });
      }
      throw new Error(`Unexpected fixture URL: ${url.href}`);
    }) as typeof fetch;
    const delivered: ResetCalendarNotification[] = [];
    const app = makeApp(makeService({ fetcher, notify: async (event) => { delivered.push(event); return true; } }));
    const response = await app.inject({ method: "POST", url: `${route}/sync` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      records: [announcement, older], status: { latest_reset: announcement },
      sync: { phase: "ready", generatedAt: meta.generated_at, historyComplete: true, error: null },
    });
    expect(requests).toHaveLength(3);
    expect(delivered).toEqual([]);
    const cached = await app.inject({ method: "GET", url: route });
    expect(cached.json().records).toEqual([announcement, older]);
    expect(requests).toHaveLength(3);
  });

  test("test notification uses the desktop callback and reports actual callback failure or unsupported notifications", async () => {
    const delivered: ResetCalendarNotification[] = [];
    const app = makeApp(undefined, { onResetNotification: async (event) => { delivered.push(event); return true; }, resetNotificationsSupported: () => true });
    const sent = await app.inject({ method: "POST", url: `${route}/test-notification` });
    expect(sent.statusCode).toBe(200);
    expect(sent.headers["cache-control"]).toBe("no-store");
    expect(sent.json()).toEqual({ sent: true });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ kind: "test", title: "AI Zero Token · 重置日历" });

    const unavailable = makeApp(makeService({ notify: async (event) => { delivered.push(event); return true; }, notificationsSupported: false }));
    expect((await unavailable.inject({ method: "POST", url: `${route}/test-notification` })).json()).toEqual({ sent: false });
    expect(delivered).toHaveLength(1);
    const failed = makeApp(makeService({ notify: async () => { throw new Error("Desktop notification denied"); } }));
    expect((await failed.inject({ method: "POST", url: `${route}/test-notification` })).json()).toEqual({ sent: false });
    const declined = makeApp(makeService({ notify: async () => false }));
    expect((await declined.inject({ method: "POST", url: `${route}/test-notification` })).json()).toEqual({ sent: false });
  });

  test("injection leaves monitoring stopped; listening starts once and application close stops the service", async () => {
    const service = makeService();
    const startSpy = spyOn(service, "start").mockImplementation(() => undefined);
    const stopSpy = spyOn(service, "stop");
    restoreSpies.push(() => startSpy.mockRestore(), () => stopSpy.mockRestore());
    const app = makeApp(service);
    let finishListening!: () => void;
    const listeningHooksFinished = new Promise<void>((resolve) => { finishListening = resolve; });
    app.addHook("onListen", async () => { finishListening(); });
    expect((await app.inject({ method: "GET", url: route })).statusCode).toBe(200);
    expect(startSpy).not.toHaveBeenCalled();
    await app.listen({ host: "127.0.0.1", port: 0 });
    // Fastify resolves listen before asynchronous onListen hooks have finished.
    await listeningHooksFinished;
    expect(startSpy).toHaveBeenCalledTimes(1);
    await app.close();
    expect(stopSpy).toHaveBeenCalledTimes(2);
  });

  test("closing an actual HTTP listener cancels a sync request before waiting for it to drain", async () => {
    let releaseNetwork!: () => void;
    const heldNetwork = new Promise<void>((resolve) => { releaseNetwork = resolve; });
    let reportRequested!: () => void;
    const upstreamRequested = new Promise<void>((resolve) => { reportRequested = resolve; });
    let upstreamSignal: AbortSignal | undefined;
    const fetcher = (async (input, options) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/status") {
        upstreamSignal = options?.signal ?? undefined;
        reportRequested();
        // Deliberately ignores cancellation; the service must still bound shutdown.
        await heldNetwork;
        return Response.json({ data: {
          latest_reset: announcement, scheduled_reset: null, active_watch: null,
          stats: { total: 1, last_reset_at: announcement.announced_at, days_since_last: 1, avg_interval_days: 10 },
        }, meta });
      }
      return Response.json({ data: [], pagination: { has_more: false, next_cursor: null }, meta });
    }) as typeof fetch;
    const service = makeService({ fetcher, requestTimeoutMs: 60_000 });
    const originalSync = service.sync.bind(service);
    let syncCount = 0;
    let reportManualSync!: () => void;
    const manualSyncEntered = new Promise<void>((resolve) => { reportManualSync = resolve; });
    const syncSpy = spyOn(service, "sync").mockImplementation(() => {
      syncCount += 1;
      if (syncCount === 2) reportManualSync();
      return originalSync();
    });
    restoreSpies.push(() => syncSpy.mockRestore());
    const app = makeApp(service);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    await upstreamRequested;
    const response = new Promise<{ statusCode: number | undefined; body: { sync: { phase: string } } }>((resolve, reject) => {
      const request = requestHttp(`${address}${route}/sync`, { method: "POST" }, (reply) => {
        let body = "";
        reply.setEncoding("utf8");
        reply.on("data", (chunk) => { body += chunk; });
        reply.on("end", () => {
          try { resolve({ statusCode: reply.statusCode, body: JSON.parse(body) }); }
          catch (error) { reject(error); }
        });
        reply.on("error", reject);
      });
      request.on("error", reject);
      request.end();
    });
    await manualSyncEntered;
    const closing = app.close();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const [_closed, reply] = await Promise.race([
        Promise.all([closing, response]),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("Shutdown waited for the upstream network timeout")), 1500);
        }),
      ]);
      expect(upstreamSignal?.aborted).toBe(true);
      expect(reply.statusCode).toBe(200);
      expect(reply.body.sync.phase).toBe("idle");
    } finally {
      if (timeout) clearTimeout(timeout);
      // Also makes the regression clean up promptly when the preClose hook is absent.
      releaseNetwork();
      await closing;
      await response;
    }
  });
});
