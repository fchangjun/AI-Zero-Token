import http from "node:http";
import https from "node:https";

export const COMPLETED_SSE = "azt-completed-sse";

/** Owned by the mixed gateway; other transports and proxy preferences stay unchanged. */
export class HttpConnectionPool {
  private http = new http.Agent({ keepAlive: true, maxSockets: 8, maxTotalSockets: 64, maxFreeSockets: 2, timeout: 60_000 });
  private https = new https.Agent({ keepAlive: true, maxSockets: 8, maxTotalSockets: 64, maxFreeSockets: 2, timeout: 60_000 });

  close(): void { this.http.destroy(); this.https.destroy(); }

  request(init: { url: string; method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; timeoutMs?: number }) {
    const started = performance.now();
    const phasesMs: Record<string, number> = {};
    const elapsed = () => Math.round((performance.now() - started) * 100) / 100;
    return new Promise<{
      body: ReadableStream<Uint8Array>; status: number; headers: Record<string, string>;
      transport: "node"; reusedConnection: boolean; timing: { phasesMs: Record<string, number>; totalMs: number };
    }>((resolve, reject) => {
      if (init.signal?.aborted) { reject(init.signal.reason); return; }
      const url = new URL(init.url);
      if (!["http:", "https:"].includes(url.protocol)) { reject(new Error("不支持的上游地址协议。")); return; }
      const secure = url.protocol === "https:";
      let incoming: http.IncomingMessage | undefined;
      let writer: ReadableStreamDefaultController<Uint8Array> | undefined;
      let cancelled = false, ended = false;
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      let draining = false, drainedBytes = 0;
      const request = (secure ? https : http).request(url, {
        method: init.method, headers: { "accept-encoding": "identity", ...init.headers, ...(init.body !== undefined ? { "content-length": String(Buffer.byteLength(init.body)) } : {}) },
        agent: secure ? this.https : this.http,
      });
      const timer = setTimeout(() => request.destroy(Object.assign(new Error("上游请求超时。"), { code: "ETIMEDOUT", statusCode: 504 })), init.timeoutMs ?? 600_000);
      timer.unref?.();
      const cleanup = () => { clearTimeout(timer); clearTimeout(drainTimer); init.signal?.removeEventListener("abort", abort); };
      const abort = () => {
        if (!ended && !cancelled) writer?.error(init.signal?.reason instanceof Error ? init.signal.reason : new Error("请求已取消。"));
        cancelled = true;
        // A complete HTTP body can release its socket even if the SSE consumer
        // stops at its terminal event. An unfinished response must be cancelled.
        if (incoming?.complete) { incoming.resume(); cleanup(); }
        else request.destroy(init.signal?.reason instanceof Error ? init.signal.reason : new Error("请求已取消。"));
      };
      init.signal?.addEventListener("abort", abort, { once: true });
      request.once("socket", (socket) => {
        phasesMs.socketAssignedMs = elapsed();
        if (!request.reusedSocket) {
          socket.once("lookup", () => { phasesMs.dnsReadyMs = elapsed(); });
          socket.once("connect", () => { phasesMs.tcpReadyMs = elapsed(); });
          if (secure) socket.once("secureConnect", () => { phasesMs.tlsReadyMs = elapsed(); });
        }
      });
      request.on("error", (error) => {
        cleanup();
        if (!ended && !cancelled) writer?.error(error);
        ended = true;
        reject(error);
      });
      if (init.signal?.aborted) { abort(); return; }
      request.once("response", (response) => {
        incoming = response;
        phasesMs.waitForHeadersMs = elapsed();
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(", ") : value;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            writer = controller;
            response.on("data", (chunk: Buffer) => {
              if (draining) { drainedBytes += chunk.byteLength; if (drainedBytes > 64 * 1024) request.destroy(); return; }
              if (cancelled || ended) return;
              controller.enqueue(chunk);
              if ((controller.desiredSize ?? 0) <= 0) response.pause();
            });
            response.once("end", () => { cleanup(); if (!ended && !cancelled) controller.close(); ended = true; });
            response.on("error", (error) => { cleanup(); if (!ended && !cancelled) controller.error(error); ended = true; });
          },
          pull() { response.resume(); },
          cancel(reason) {
            cancelled = true;
            if (reason === COMPLETED_SSE && !response.complete && !init.signal?.aborted) {
              // The model has finished. Let a bounded HTTP trailer drain in the
              // background so message_stop arriving before EOF does not kill reuse.
              cleanup(); draining = true;
              drainTimer = setTimeout(() => request.destroy(), 200); drainTimer.unref?.(); response.resume();
            } else abort();
          },
        }, { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength });
        resolve({ body, status: response.statusCode ?? 502, headers, transport: "node", reusedConnection: request.reusedSocket,
          timing: { phasesMs, totalMs: elapsed() } });
      });
      request.end(init.body);
    });
  }
}
