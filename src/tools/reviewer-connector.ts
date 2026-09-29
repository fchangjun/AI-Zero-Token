import fs from "node:fs/promises";
import type { ReviewerInstance } from "../../modules/response-reviewer/src/managed.mjs";

type Target = { id: string; type: string; url: string; webSocketDebuggerUrl: string };
type Client = { evaluate(expression: string): Promise<unknown>; close(): void };
type BridgeRequest = { id: string; operation: { method?: string; path?: string; body?: unknown } };
export type ConnectorStatus = { connected: boolean; targets: number; buttons: number; error: string | null };

const bootstrap = `(() => {
  if (window.__codexCompanionModules?.['response-reviewer']) throw new Error('请先关闭旧 Companion 的 Reviewer 注入，再启用 AZT 接入。');
  if (window.__aztReviewerBridge) return true;
  const queue = [], pending = new Map();
  window.__aztReviewerBridge = {
    request(moduleId, operation) {
      if (moduleId !== 'response-reviewer' || pending.size >= 32) return Promise.reject(new Error('Reviewer bridge busy.'));
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('AZT Reviewer 未响应，请检查 AZT 是否运行。')); }, 12000);
        pending.set(id, { resolve, reject, timeout }); queue.push({ id, operation });
      });
    },
    drain() { return queue.splice(0, 32).filter(item => pending.has(item.id)); },
    settle(results) {
      for (const item of results) {
        const waiter = pending.get(item.id); if (!waiter) continue;
        pending.delete(item.id); clearTimeout(waiter.timeout);
        if (item.ok) waiter.resolve(item.payload); else waiter.reject(new Error(item.error));
      }
    },
    close() {
      queue.splice(0);
      for (const waiter of pending.values()) { clearTimeout(waiter.timeout); waiter.reject(new Error('AZT Reviewer disconnected.')); }
      pending.clear(); delete window.__aztReviewerBridge;
    }
  };
  return true;
})()`;

export function validateDebuggerUrl(value: string, port: number): string {
  const url = new URL(value);
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || Number(url.port) !== port ||
    url.username || url.password || !url.pathname.startsWith("/devtools/page/")) {
    throw new Error("Codex 调试连接必须指向指定端口的 127.0.0.1 页面。");
  }
  return url.toString();
}

export function normalizeConnectorError(error: unknown, port: number): string {
  const candidate = error as { message?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
  const message = typeof candidate?.message === "string" ? candidate.message : String(error);
  const causeCode = typeof candidate?.cause?.code === "string" ? candidate.cause.code : "";
  const causeMessage = typeof candidate?.cause?.message === "string" ? candidate.cause.message : "";
  const combined = `${message} ${causeCode} ${causeMessage}`.toLowerCase();
  if (combined.includes("fetch failed") || /econnrefused|ehostunreach|enotfound|etimedout/.test(combined)) {
    return `无法连接 127.0.0.1:${port}。请点击“启动 Codex 接入”；如果 Codex 已经打开，AZT 会先提示你确认退出并重新启动。AZT 不会强制终止 Codex。`;
  }
  return message;
}

async function connect(target: Target, port: number): Promise<Client> {
  const socket = new WebSocket(validateDebuggerUrl(target.webSocketDebuggerUrl, port));
  let nextId = 1;
  const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const rejectAll = () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("Codex 调试连接已断开。")); }
    pending.clear();
  };
  socket.addEventListener("close", rejectAll);
  socket.addEventListener("error", rejectAll);
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id); clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    } catch { /* Ignore unrelated or malformed CDP events. */ }
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("连接 Codex 超时。")); }, 2500);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("无法连接 Codex 调试端口。")); }, { once: true });
  });
  return {
    async evaluate(expression) {
      const id = nextId++;
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("Codex 页面响应超时。")); }, 3000);
        pending.set(id, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } })); }
        catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
      const exception = result.exceptionDetails as { exception?: { description?: string }; text?: string } | undefined;
      if (exception) throw new Error(exception.exception?.description || exception.text || "Codex 注入失败。");
      return (result.result as { value?: unknown })?.value;
    },
    close() { rejectAll(); socket.close(); },
  };
}

export class ReviewerConnector {
  private clients = new Map<string, Client>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private pending: Promise<void> | null = null;
  private nextDiscovery = 0;
  private status: ConnectorStatus = { connected: false, targets: 0, buttons: 0, error: null };

  constructor(private port: number, private reviewer: ReviewerInstance, private injectionPath: string) {}
  snapshot(): ConnectorStatus { return { ...this.status }; }
  start(): void { this.schedule(0); }
  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.pending = this.tick().catch((error: unknown) => {
        this.status.connected = false; this.status.targets = 0; this.status.buttons = 0;
        this.status.error = normalizeConnectorError(error, this.port);
      }).finally(() => { this.pending = null; this.schedule(750); });
    }, delay);
    this.timer.unref?.();
  }
  private async tick(): Promise<void> {
    if (Date.now() >= this.nextDiscovery) {
      this.nextDiscovery = Date.now() + 4000;
      const response = await fetch(`http://127.0.0.1:${this.port}/json`, { signal: AbortSignal.timeout(1500), redirect: "error" });
      if (!response.ok) throw new Error(`Codex 调试端口返回 HTTP ${response.status}。`);
      const raw: unknown = await response.json();
      if (!Array.isArray(raw)) throw new Error("Codex 调试目标格式无效。");
      const targets = raw.filter((target): target is Target => target !== null && typeof target === "object" &&
        typeof target.id === "string" && typeof target.webSocketDebuggerUrl === "string" &&
        target.type === "page" && typeof target.url === "string" && /^app:\/\/-\/index\.html(?:[?#]|$)/.test(target.url)).slice(0, 8);
      for (const [id, client] of this.clients) {
        if (!targets.some((target) => target.id === id)) { client.close(); this.clients.delete(id); }
      }
      for (const target of targets) {
        if (this.stopped) return;
        if (!this.clients.has(target.id)) this.clients.set(target.id, await connect(target, this.port));
      }
      if (!targets.length) this.status.error = "已连接本机 CDP 端口，但未找到 Codex 主窗口。请确认 Codex 已完全启动，或重新点击“启动 Codex 接入”。";
    }
    let buttons = 0;
    let tickError: string | null = null;
    for (const [id, client] of this.clients) {
      if (this.stopped) return;
      try {
        const installed = await client.evaluate("Boolean(window.__aztReviewerModules?.['response-reviewer']?.active && window.__aztReviewerBridge)");
        const config = { url: this.reviewer.reviewUrl(), serviceReady: true };
        if (!installed) {
          await client.evaluate(bootstrap);
          const script = await fs.readFile(this.injectionPath, "utf8");
          await client.evaluate(`window.__aztReviewerPendingConfig = ${JSON.stringify(config)};\n${script}`);
        } else {
          // A crashed/restarted AZT rotates the port and token while the page survives.
          await client.evaluate(`(() => {
            const module = window.__aztReviewerModules['response-reviewer'];
            const next = ${JSON.stringify(config)};
            if (module.config.url !== next.url) module.updateConfig(next);
          })()`);
        }
        const requests = await client.evaluate("window.__aztReviewerBridge?.drain() || []") as BridgeRequest[];
        const results = await Promise.all(requests.map(async ({ id: requestId, operation }) => {
          try {
            // The injected UI can only save a selected reply; never proxy arbitrary API paths.
            if (operation?.method !== "POST" || operation.path !== "/api/responses") throw new Error("不允许的 Reviewer 操作。");
            const body = JSON.stringify(operation.body);
            if (!body || Buffer.byteLength(body) > 5 * 1024 * 1024) throw new Error("回复过大。");
            const result = await fetch(new URL("/api/responses", this.reviewer.runtime.baseUrl), {
              method: "POST", headers: { "content-type": "application/json", "x-response-reviewer-token": this.reviewer.runtime.token },
              body, signal: AbortSignal.timeout(6000), redirect: "error",
            });
            const payload = await result.json() as { error?: string };
            if (!result.ok) throw new Error(payload.error || "保存审阅失败。");
            return { id: requestId, ok: true, payload };
          } catch (error) { return { id: requestId, ok: false, error: error instanceof Error ? error.message : String(error) }; }
        }));
        if (results.length) await client.evaluate(`window.__aztReviewerBridge?.settle(${JSON.stringify(results)})`);
        const info = await client.evaluate("window.__aztReviewerModules?.['response-reviewer']?.status()") as { buttons?: number } | null;
        buttons += info?.buttons || 0;
      } catch (error) {
        client.close(); this.clients.delete(id);
        tickError = error instanceof Error ? error.message : String(error);
      }
    }
      this.status = { connected: this.clients.size > 0, targets: this.clients.size, buttons,
      error: tickError ? normalizeConnectorError(tickError, this.port) : (this.clients.size ? null : this.status.error) };
  }
  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.pending;
    await Promise.all([...this.clients.values()].map(async (client) => {
      try { await client.evaluate("window.__aztReviewerModules?.['response-reviewer']?.destroy(); window.__aztReviewerBridge?.close();"); }
      catch { /* A closed/reloaded page already removed its injected controls. */ }
      finally { client.close(); }
    }));
    this.clients.clear();
  }
}
