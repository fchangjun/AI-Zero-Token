import assert from "node:assert/strict";
import { createServer } from "node:http";
import { COMPLETED_SSE, HttpConnectionPool } from "../../src/core/providers/http-connection-pool.ts";

async function main() {
  const pool = new HttpConnectionPool();
  const seen: string[] = [];
  const ports: number[] = [];
  const server = createServer((req, res) => {
    req.resume(); seen.push(req.url!); ports.push(req.socket.remotePort!);
    if (req.url === "/delay") return;
    if (req.url === "/reset") { req.socket.destroy(); return; }
    if (req.url === "/open") { res.writeHead(200); res.write("first"); return; }
    if (req.url === "/tail") { res.writeHead(200); res.write("data: [DONE]\n\n"); setTimeout(() => res.end(), 20); return; }
    if (req.url === "/redirect") { res.writeHead(307, { location: "/never" }); res.end("redirect"); return; }
    res.end("OK");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const request = (route: string, signal?: AbortSignal, timeoutMs = 2000) => pool.request({ url: `http://127.0.0.1:${address.port}${route}`, method: "POST", body: "{}", signal, timeoutMs });
  try {
    for (let n = 0; n < 3; n++) {
      const response = await request("/ok");
      assert.equal(await new Response(response.body).text(), "OK");
      assert.equal(response.reusedConnection, n > 0);
    }
    assert.equal(new Set(ports).size, 1, "sequential requests reuse one TCP connection");
    const tailController = new AbortController();
    const tail = await request("/tail", tailController.signal); const tailReader = tail.body.getReader(); await tailReader.read();
    await tailReader.cancel(COMPLETED_SSE); tailController.abort();
    await new Promise(resolve => setTimeout(resolve, 40));
    const reused = await request("/ok"); assert.equal(await new Response(reused.body).text(), "OK");
    assert.equal(reused.reusedConnection, true, "completed SSE trailers drain without holding the response open");
    assert.equal(new Set(ports).size, 1);
    const redirect = await request("/redirect"); assert.equal(redirect.status, 307); await redirect.body.cancel();
    assert(!seen.includes("/never"));
    await assert.rejects(request("/reset")); assert.equal(seen.filter(x => x === "/reset").length, 1);
    await assert.rejects(request("/delay", undefined, 40), /超时/);
    const controller = new AbortController();
    const response = await request("/open", controller.signal);
    const reader = response.body.getReader(); await reader.read();
    const pending = reader.read(); controller.abort(new Error("cancelled fixture"));
    await assert.rejects(pending, /cancelled fixture/);
    const open = await request("/open"); const read = open.body.getReader(); await read.read();
    const waiting = read.read(); await read.cancel(); assert.equal((await waiting).done, true);
    const last = await request("/ok"); assert.equal(await new Response(last.body).text(), "OK");
    console.log("HTTP_POOL_OK");
  } finally { pool.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
