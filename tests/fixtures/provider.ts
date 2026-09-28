import { createServer } from "node:http";
import { once } from "node:events";

export async function startProviderFixture() {
  const state = {
    models: [{ id: "model-ready", display_name: "示例推理模型", context_window: 128000 }, { id: "model-busy" }, { id: "text-embedding-3-small" }],
    listStatus: 200,
    probeStatus: 200,
    continuationStatus: 200,
    listDelayMs: 0,
    delayMs: 0,
    requests: [] as Array<{ url: string; body?: Record<string, unknown> }>,
  };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const body = text ? JSON.parse(text) : undefined;
    state.requests.push({ url: req.url ?? "", body });
    const json = (code: number, value: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (req.url === "/v1/models") {
      if (state.listDelayMs) await new Promise((resolve) => setTimeout(resolve, state.listDelayMs));
      return json(state.listStatus, state.listStatus === 200 ? { data: state.models } : { error: { message: "model list unavailable" } });
    }
    if (req.url !== "/v1/responses") return json(404, { error: { message: "unsupported" } });
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    const status = state.probeStatus !== 200 ? state.probeStatus : Array.isArray(body.input) && state.continuationStatus !== 200 ? state.continuationStatus : body.model === "model-busy" ? 429 : body.model.startsWith("text-embedding") ? 400 : 200;
    if (status !== 200) return json(status, { error: { message: status === 429 ? "server busy" : "model not supported" } });
    res.writeHead(200, { "content-type": "text/event-stream" });
    const events = Array.isArray(body.input) || body.reasoning
      ? [{ type: "response.output_text.delta", delta: "OK" }]
      : [{ type: "response.output_item.done", item: { type: "function_call", call_id: "call-test", name: "azt_provider_probe", arguments: '{"ok":true}' } }];
    for (const event of [...events, { type: "response.completed", response: { status: "completed" } }]) res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server failed");
  return { state, baseUrl: `http://127.0.0.1:${address.port}/v1`, close: async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  } };
}
