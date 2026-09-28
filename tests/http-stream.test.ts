import { expect, spyOn, test } from "bun:test";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import { requestStream } from "../src/core/providers/http-client.ts";

test("curl preserves fast error and SSE responses when header reads are delayed", async () => {
  const server = createServer((request, response) => {
    request.resume();
    if (request.url === "/error") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"error":{"code":"model_not_found"}}');
    } else {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end('data: {"type":"response.completed"}\n\n');
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test listener failed");
  const previous = process.env.OAUTH_DEMO_USE_CURL;
  process.env.OAUTH_DEMO_USE_CURL = "1";
  const read = fs.readFile.bind(fs);
  const delayedRead = spyOn(fs, "readFile").mockImplementation(async (...args: Parameters<typeof fs.readFile>) => {
    if (String(args[0]).includes("azt-curl-headers-")) await new Promise(resolve => setTimeout(resolve, 80));
    return read(...args);
  });
  try {
    for (const [route, status, content] of [["error", 404, "model_not_found"], ["stream", 200, "response.completed"]] as const) {
      const result = await requestStream({ method: "POST", url: `http://127.0.0.1:${address.port}/${route}`, body: "{}", ignoreProxy: true, timeoutMs: 2000 });
      expect(result.status).toBe(status);
      expect(await new Response(result.body).text()).toContain(content);
    }
  } finally {
    delayedRead.mockRestore();
    if (previous === undefined) delete process.env.OAUTH_DEMO_USE_CURL;
    else process.env.OAUTH_DEMO_USE_CURL = previous;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
