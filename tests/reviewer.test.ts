import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ReviewerService } from "../src/tools/reviewer-service.js";
import { normalizeConnectorError, validateDebuggerUrl, ReviewerConnector } from "../src/tools/reviewer-connector.js";
import { startManagedReviewer, importLegacyReviewer } from "../modules/response-reviewer/src/managed.mjs";
import { createApp } from "../src/server/app.js";

const roots: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function temp() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "azt-reviewer-test-"));
  roots.push(root); return root;
}
async function service(root?: string) {
  const instance = new ReviewerService(root || await temp());
  cleanup.push(() => instance.close()); return instance;
}
async function enable(instance: ReviewerService) {
  await instance.configure({ enabled: true, codexButtonEnabled: false, cdpPort: 9222 });
  return (await instance.status()).url!;
}
async function request(base: string, pathname: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const url = new URL(base);
  const response = await fetch(new URL(pathname, url), {
    method, headers: { "x-response-reviewer-token": url.searchParams.get("token")!, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "error",
  });
  // Drain each response even when an assertion only checks its status.
  return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
}
async function save(base: string, id = "response-one", extra: Record<string, unknown> = {}) {
  const result = await request(base, "/api/responses", "POST", { id, content: "A reply to review.", title: "Test response", ...extra });
  expect(result.status).toBe(201); return result.json();
}

describe("AZT managed Reviewer", () => {
  test("opt-in lifecycle, persisted settings, loopback isolation and removal of runtime on close", async () => {
    const instance = await service();
    expect((await instance.status()).running).toBe(false);
    const url = await enable(instance);
    expect(new URL(url).hostname).toBe("127.0.0.1");
    const status = await instance.status();
    expect(status.connector.connected).toBe(false);
    expect((await fs.stat(path.join(instance.root, "runtime.json"))).mode & 0o777).toBe(0o600);
    await save(url);
    await instance.close();
    await expect(fetch(url)).rejects.toThrow();
    await expect(fs.stat(path.join(instance.root, "runtime.json"))).rejects.toThrow();
    const restored = await service(instance.root);
    await restored.restore();
    expect((await restored.status()).running).toBe(true);
    expect((await restored.history())[0].id).toBe("response-one");
    await restored.configure({ enabled: false, codexButtonEnabled: false, cdpPort: 9222 });
    expect((await restored.history()).length).toBe(1);
  });

  test("token, host, JSON validation, scoped frame origins and managed shutdown", async () => {
    const instance = await service();
    instance.allowFrameOrigin("http://127.0.0.1:8787");
    const base = await enable(instance);
    const unauthorized = await fetch(new URL("/api/responses", base));
    expect(unauthorized.status).toBe(401);
    expect((await request(base, "/api/responses", "GET", undefined, { host: "attacker.example" })).status).toBe(403);
    expect((await request(base, "/api/responses", "POST", null)).status).toBe(400);
    expect((await request(base, "/api/responses", "POST", { id: "__proto__", content: "unsafe" })).status).toBe(400);
    expect((await request(base, "/api/responses/constructor")).status).toBe(404);
    expect((await request(base, "/api/shutdown", "POST", {})).status).toBe(403);
    const page = await fetch(base);
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors app://- http://127.0.0.1:8787;");
    expect(await page.text()).toContain("AI Zero Token");
    const allowed = await request(base, "/api/health", "GET", undefined, { origin: "http://127.0.0.1:8787" });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8787");
    for (const origin of ["null", "http://127.0.0.1:9876", "https://attacker.example"]) {
      expect((await request(base, "/api/health", "GET", undefined, { origin })).headers.get("access-control-allow-origin")).toBeNull();
    }
    expect((await request(base, "/api/health")).status).toBe(200);
  });

  test("snapshot, annotations, prompt compilation and independent data roots", async () => {
    const first = await service(); const second = await service();
    const [a, b] = await Promise.all([enable(first), enable(second)]);
    await Promise.all([save(a, "a"), save(b, "b")]);
    const annotation = await request(a, "/api/responses/a/annotations", "POST", { quote: "reply", comment: "补充示例", kind: "suggestion" });
    expect(annotation.status).toBe(201);
    const { annotation: item } = await annotation.json();
    const prompt = await (await request(a, "/api/responses/a/prompt")).json();
    expect(prompt.prompt).toContain("补充示例"); expect(prompt.prompt).toContain("建议替换");
    expect((await first.history())[0].annotationCount).toBe(1);
    expect((await second.history()).map((item) => item.id)).toEqual(["b"]);
    await save(a, "a");
    expect((await first.history())[0].annotationCount).toBe(1);
    expect((await request(a, `/api/responses/a/annotations/${item.id}`, "DELETE")).status).toBe(200);
    expect((await first.history())[0].annotationCount).toBe(0);
    expect((await request(a, "/api/responses/a/composer", "POST", {})).status).toBe(409);
  });

  test("file review requires an explicit workspace and denies outside paths and symlink escapes", async () => {
    const instance = await service(); const base = await enable(instance);
    const project = await temp(); const outside = await temp();
    await fs.writeFile(path.join(project, "safe.txt"), "safe content");
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
    await fs.symlink(path.join(outside, "secret.txt"), path.join(project, "escape.txt"));
    await save(base, "files", { files: [{ id: "safe", path: "safe.txt" }, { id: "escape", path: "escape.txt" }, { id: "outside", path: path.join(outside, "secret.txt") }] });
    expect((await request(base, "/api/responses/files/files/safe")).status).toBe(409);
    expect((await request(base, "/api/responses/files/workspace", "PATCH", { projectDir: project })).status).toBe(200);
    const file = await (await request(base, "/api/responses/files/files/safe")).json();
    expect(file.file.content).toBe("safe content");
    expect((await request(base, "/api/responses/files/files/escape")).status).toBe(403);
    expect((await request(base, "/api/responses/files/files/outside")).status).toBe(403);
    expect((await request(base, "/api/responses/files/files/not-declared")).status).toBe(404);
    expect(await fs.readFile(path.join(outside, "secret.txt"), "utf8")).toBe("secret");
  });

  test("legacy import is read-only, idempotent, annotation preserving and discards permissions/outbox", async () => {
    const legacy = await service(); const base = await enable(legacy);
    const project = await temp();
    await save(base, "legacy", { projectDir: project, threadKey: "thread-original", files: [{ id: "file", path: "test.txt" }] });
    await request(base, "/api/responses/legacy/annotations", "POST", { comment: "原批注" });
    await request(base, "/api/responses/legacy/outbox", "POST", {});
    const source = path.join(legacy.root, "store.json");
    const original = await fs.readFile(source, "utf8");
    const target = await service();
    expect((await target.importLegacy(source)).imported).toBe(1);
    expect((await target.importLegacy(source)).skipped).toBe(1);
    const contents = JSON.parse(await fs.readFile(path.join(target.root, "store.json"), "utf8"));
    expect(contents.responses.legacy.annotations[0].comment).toBe("原批注");
    expect(contents.responses.legacy.projectDir).toBeNull();
    expect(contents.responses.legacy.threadKey).toBe("thread-original");
    expect(contents.projects).toEqual({}); expect(contents.workspaceBindings).toEqual({}); expect(contents.outbox).toEqual([]);
    const targetUrl = await enable(target);
    await request(targetUrl, "/api/responses/legacy/annotations", "POST", { comment: "新批注" });
    await target.importLegacy(source);
    expect((await target.history())[0].annotationCount).toBe(2);
    expect(await fs.readFile(source, "utf8")).toBe(original);
    const alias = path.join(await temp(), "alias.json");
    await fs.symlink(path.join(target.root, "store.json"), alias);
    await expect(target.importLegacy(alias)).rejects.toThrow("自身");
  });

  test("invalid import and corrupt stores cannot cause partial writes or empty replacement", async () => {
    const instance = await service(); const base = await enable(instance); await save(base);
    const before = await fs.readFile(path.join(instance.root, "store.json"), "utf8");
    const source = path.join(await temp(), "bad.json");
    await fs.writeFile(source, JSON.stringify({ version: 2, responses: {
      valid: { id: "valid", content: "ok", annotations: [] },
      broken: { id: "broken", content: "bad", annotations: [], updatedAt: {} },
    } }));
    await expect(instance.importLegacy(source)).rejects.toThrow("无效");
    expect(await fs.readFile(path.join(instance.root, "store.json"), "utf8")).toBe(before);
    const brokenRoot = await temp();
    await fs.writeFile(path.join(brokenRoot, "store.json"), "{broken");
    await expect(startManagedReviewer({ root: brokenRoot, frameOrigins: [] })).rejects.toThrow();
    await expect(importLegacyReviewer(brokenRoot, path.join(instance.root, "store.json"))).rejects.toThrow();
    expect(await fs.readFile(path.join(brokenRoot, "store.json"), "utf8")).toBe("{broken");
  });

  test("two managers cannot own the same data root; failed startup releases ownership", async () => {
    const root = await temp();
    const results = await Promise.allSettled([startManagedReviewer({ root, frameOrigins: [] }), startManagedReviewer({ root, frameOrigins: [] })]);
    expect(results.filter((item) => item.status === "fulfilled").length).toBe(1);
    const winner = results.find((item) => item.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof startManagedReviewer>>>;
    await winner.value.close();
    const restarted = await startManagedReviewer({ root, frameOrigins: [] });
    await restarted.close();
    const stale = path.join(root, ".service.lock");
    await fs.mkdir(stale);
    await fs.writeFile(path.join(stale, "2147483647-stale.json"), "{}");
    const recovered = await startManagedReviewer({ root, frameOrigins: [] });
    await recovered.close();
  });

  test("invalid settings do not start services or overwrite saved settings", async () => {
    const instance = await service();
    await enable(instance);
    const before = await fs.readFile(path.join(instance.root, "settings.json"), "utf8");
    await expect(instance.configure({ enabled: false, codexButtonEnabled: true, cdpPort: 9222 })).rejects.toThrow();
    await expect(instance.configure({ enabled: true, codexButtonEnabled: true, cdpPort: 80 })).rejects.toThrow();
    expect(await fs.readFile(path.join(instance.root, "settings.json"), "utf8")).toBe(before);
  });
});

describe("Reviewer integration boundaries", () => {
  test("management routes reject remote clients, nonlocal hosts and external origins", async () => {
    const app = await createApp(); cleanup.push(() => app.close());
    for (const url of ["/_gateway/tools", "/_gateway/tools/reviewer", "/_gateway/tools/reviewer/history", "/_gateway/tools/reviewer/start-codex"]) {
      expect((await app.inject({ url, remoteAddress: "192.168.1.20" })).statusCode).toBe(403);
      expect((await app.inject({ url, headers: { host: "attacker.example" } })).statusCode).toBe(403);
      expect((await app.inject({ url, headers: { origin: "https://attacker.example" } })).statusCode).toBe(403);
    }
    expect((await app.inject({ url: "/_gateway/tools", headers: { host: "127.0.0.1" } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/_gateway/tools/reviewer/settings", method: "PUT", remoteAddress: "192.168.1.20", payload: { enabled: true, codexButtonEnabled: true, cdpPort: 9222 } })).statusCode).toBe(403);
  });

  test("normalizes local CDP connection failures into an actionable message", () => {
    const message = normalizeConnectorError(new TypeError("fetch failed"), 9222);
    expect(message).toContain("127.0.0.1:9222");
    expect(message).toContain("启动 Codex 接入");
    expect(normalizeConnectorError(new Error("connect ECONNREFUSED 127.0.0.1:9222"), 9222)).toContain("启动 Codex 接入");
    expect(normalizeConnectorError(new Error("Codex 调试目标格式无效。"), 9222)).toBe("Codex 调试目标格式无效。");
  });

  test("Reviewer start route uses saved settings, stays local and reports cancellation", async () => {
    let requestedPort = 0;
    const app = await createApp({
      onStartCodexWithReviewer: async (cdpPort) => {
        requestedPort = cdpPort;
        return { started: false, cancelled: true };
      },
    });
    cleanup.push(() => app.close());

    expect((await app.inject({ url: "/_gateway/tools/reviewer/start-codex", method: "POST" })).statusCode).toBe(400);
    const configured = await app.inject({
      url: "/_gateway/tools/reviewer/settings",
      method: "PUT",
      payload: { enabled: true, codexButtonEnabled: true, cdpPort: 9333 },
    });
    expect(configured.statusCode).toBe(200);

    const result = await app.inject({ url: "/_gateway/tools/reviewer/start-codex", method: "POST" });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ ok: true, started: false, cancelled: true });
    expect(requestedPort).toBe(9333);
  });

  test("CDP validates discovery endpoints and surfaces connection failure without spawning Codex", async () => {
    expect(validateDebuggerUrl("ws://127.0.0.1:9222/devtools/page/abc", 9222)).toBe("ws://127.0.0.1:9222/devtools/page/abc");
    for (const url of ["ws://evil.example:9222/devtools/page/a", "ws://127.0.0.1:9333/devtools/page/a", "ws://127.0.0.1:9222/devtools/browser/a", "ws://user:pass@127.0.0.1:9222/devtools/page/a"]) {
      expect(() => validateDebuggerUrl(url, 9222)).toThrow();
    }
    const root = await temp(); const reviewer = await startManagedReviewer({ root, frameOrigins: [] });
    cleanup.push(() => reviewer.close());
    const connector = new ReviewerConnector(1, reviewer, path.resolve("modules/response-reviewer/injection/inject.js"));
    cleanup.push(() => connector.close()); connector.start();
    for (let i = 0; i < 50 && !connector.snapshot().error; i++) await Bun.sleep(30);
    expect(connector.snapshot().connected).toBe(false);
    expect(connector.snapshot().error).toBeTruthy();
  });

  test("MCP connects to AZT-owned runtime, serves prompts and never starts a detached server", async () => {
    const home = await temp(); const instance = await service(path.join(home, ".state/tools/response-reviewer"));
    const base = await enable(instance); await save(base, "mcp-review");
    await request(base, "/api/responses/mcp-review/annotations", "POST", { comment: "MCP 批注" });
    async function call(method: string, params: unknown = {}) {
      const child = Bun.spawn(["node", path.resolve("modules/response-reviewer/src/mcp-server.mjs")], {
        env: { ...process.env, AI_ZERO_TOKEN_HOME: home }, stdin: "pipe", stdout: "pipe", stderr: "pipe",
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n"); child.stdin.end();
      const output = await new Response(child.stdout).text();
      expect(await child.exited).toBe(0);
      return JSON.parse(output.trim());
    }
    const tools = await call("tools/list");
    expect(tools.result.tools.length).toBe(4);
    const prompt = await call("tools/call", { name: "get_review_prompt", arguments: { responseId: "mcp-review" } });
    expect(JSON.stringify(prompt)).toContain("MCP 批注");
    await instance.close();
    const closed = await call("tools/call", { name: "open_reviewer", arguments: { projectDir: home } });
    expect(JSON.stringify(closed)).toContain("启用服务");
    await expect(fs.stat(path.join(instance.root, "runtime.json"))).rejects.toThrow();
  });
});
