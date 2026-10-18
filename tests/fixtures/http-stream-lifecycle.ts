import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { requestStream } from "../../src/core/providers/http-client.ts";
import { checkModelHealth } from "../../src/core/providers/openai-compatible/health.ts";

if (!process.env.AI_ZERO_TOKEN_HOME?.includes("azt-tests-") || !process.env.CODEX_HOME?.includes("azt-tests-")) {
  throw new Error("This fixture requires the isolated test preload.");
}
process.env.OAUTH_DEMO_USE_CURL = "1";

async function main() {
  const requests: string[] = [];
  const open = new Set<ServerResponse>();
  const payload = "a".repeat(128 * 1024);
  const server = createServer((req, res) => {
    req.resume();
    requests.push(req.url!);
    open.add(res); res.once("close", () => open.delete(res));
    if (req.url === "/body") { res.end(payload); return; }
    if (req.url?.startsWith("/status/")) {
      const status = Number(req.url.split("/")[2]);
      res.writeHead(status, { "content-type": "application/json", ...(status === 307 ? { location: "/must-not-follow" } : {}) });
      res.end(JSON.stringify({ error: { message: payload } })); return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (req.url?.startsWith("/complete/")) {
      const events = req.url.endsWith("/messages")
        ? [{ type: "content_block_delta", delta: { type: "text_delta", text: "OK" } }, { type: "message_stop" }]
        : req.url.endsWith("/chat/completions")
          ? [{ choices: [{ delta: { content: "OK" }, finish_reason: "stop" }] }]
          : [{ type: "response.output_text.delta", delta: "OK" }, { type: "response.completed" }];
      res.write(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
      res.write(`: ${payload}\n\n`); // Leave buffered data and the socket open after the terminal event.
    } else if (req.url?.startsWith("/truncated/")) {
      res.end('data: {"type":"response.output_text.delta","delta":"partial"}\n\n');
    } else {
      res.write(": waiting\n\n"); // The consumer must cancel an outstanding read.
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const readFile = fs.readFile;
  // Ensure response bytes are buffered before the response headers are exposed.
  fs.readFile = (async (...args: Parameters<typeof fs.readFile>) => {
    if (String(args[0]).includes("azt-curl-headers-")) await new Promise((resolve) => setTimeout(resolve, 40));
    return readFile(...args);
  }) as typeof fs.readFile;
  const disconnected = async () => {
    for (let i = 0; open.size && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(open.size, 0, "Cancellation must close the upstream connection");
  };
  const target = (route: string, protocol: "responses" | "chat_completions" | "anthropic" = "responses") => ({
    baseUrl: `${base}/${route}`, modelId: "local-fixture", token: "local-fixture-token", protocol,
  });
  try {
    const response = await requestStream({ method: "POST", url: `${base}/body`, body: "{}", ignoreProxy: true });
    assert.equal(await new Response(response.body).text(), payload, "Slow header reads must not lose buffered response data");
    for (const [status, expected] of [[429, "blocked"], [503, "blocked"], [401, "unavailable"], [404, "unavailable"], [307, "unavailable"]] as const) {
      const before = requests.length;
      const checked = await checkModelHealth(target(`status/${status}`));
      assert.equal(checked.status, expected, `HTTP ${status}: ${checked.message}`);
      await disconnected();
      assert.equal(requests.length - before, 1, "An error response must not be retried or redirected");
    }
    for (const protocol of ["responses", "chat_completions", "anthropic"] as const) {
      assert.equal((await checkModelHealth(target("complete", protocol))).status, "available");
      await disconnected();
    }
    assert.equal((await checkModelHealth(target("truncated"))).status, "unknown");
    assert.equal((await checkModelHealth(target("timeout"), undefined, 150)).status, "blocked");
    await disconnected();
    // Cancel the Web stream directly: no AbortSignal is present to stop curl for it.
    const streaming = await requestStream({ method: "POST", url: `${base}/cancel`, body: "{}", ignoreProxy: true });
    const reader = streaming.body.getReader();
    assert.equal((await reader.read()).done, false);
    const pending = reader.read();
    await reader.cancel();
    assert.equal((await pending).done, true);
    await disconnected();
    const controller = new AbortController();
    const pendingProbe = checkModelHealth(target("abort"), controller.signal);
    for (let i = 0; !requests.includes("/abort/responses") && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert(requests.includes("/abort/responses"));
    controller.abort(new Error("fixture cancelled"));
    await assert.rejects(pendingProbe, /fixture cancelled/);
    await disconnected();
    // Let queued Node callbacks run before reporting success; the original crash occurs here.
    await new Promise((resolve) => setImmediate(resolve));
    console.log(`STREAM_LIFECYCLE_OK: Node ${process.versions.node}${process.versions.electron ? ` / Electron ${process.versions.electron}` : ""}`);
  } finally {
    fs.readFile = readFile;
    const closing = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections(); await closing;
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
