// npm run build && node scripts/mixed-takeover-acceptance.mjs
// Production UI/server with disposable homes and local providers only.
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";

const root = await mkdtemp(join(tmpdir(), "azt-mixed-acceptance-"));
process.env.AI_ZERO_TOKEN_HOME = join(root, "azt");
process.env.CODEX_HOME = join(root, "codex");
await mkdir(process.env.CODEX_HOME, { recursive: true });
await mkdir(join(process.env.AI_ZERO_TOKEN_HOME, ".state"), { recursive: true });
await writeFile(join(process.env.AI_ZERO_TOKEN_HOME, ".state", "store.json"), '{"version":1,"profiles":{}}');
await writeFile(join(process.env.AI_ZERO_TOKEN_HOME, ".state", "settings.json"), '{}');
await writeFile(join(process.env.CODEX_HOME, "config.toml"), 'model = "native-fixture"\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n[features]\napps = false\n');

const upstream = Fastify({ logger: false });
const state = { requests: [], holdOpen: false, cancelled: false, toolMode: false, reasoningMode: false, discoveryMode: false, measureUsage: false };
const encode = (events) => events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join("");
for (const endpoint of ["responses", "responses/compact", "chat/completions", "messages"]) {
  upstream.post(`/v1/${endpoint}`, async (request, reply) => {
    const body = request.body;
    const inputTokens = state.measureUsage ? Math.ceil(JSON.stringify({ messages: body.messages, system: body.system, tools: body.tools }).length / 4) : 10;
    state.requests.push({ path: request.url, model: body.model, input: body.input ?? body.messages, tools: body.tools, inputTokens });
    const supported = { "responses-fixture": ["responses", "responses/compact"], "deepseek-fixture": ["chat/completions"], "claude-fixture": ["messages"] }[body.model];
    if (supported && !supported.includes(endpoint)) return reply.code(404).send({ error: { message: "unsupported fixture endpoint" } });
    if (state.holdOpen) {
      reply.hijack(); reply.raw.writeHead(200, { "content-type": "text/event-stream" }); reply.raw.write(": keepalive\n\n");
      reply.raw.once("close", () => { state.cancelled = true; }); return reply;
    }
    if (endpoint === "responses/compact") return { id: "cmp_fixture", object: "response.compaction", output: [{ type: "compaction", encrypted_content: "fixture-opaque" }] };
    if (endpoint === "responses") {
      const item = { id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "native fixture reply", annotations: [] }] };
      const response = { id: "resp_fixture", object: "response", model: body.model, status: "completed", output: [item], usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } };
      return body.stream ? reply.type("text/event-stream").send(encode([
        { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
        { type: "response.output_item.done", output_index: 0, item }, { type: "response.completed", response },
      ])) : response;
    }
    const chat = endpoint === "chat/completions";
    if (!chat && state.reasoningMode && body.messages.some(message => message.role === "assistant" && message.content.some(part => part.type === "tool_use")
      && !message.content.some(part => part.type === "thinking" && part.thinking === "fixture private thought" && part.signature === "fixture-signature"))) {
      return reply.code(400).send({ error: { message: "fixture requires preserved Claude thinking signature" } });
    }
    if (chat && state.reasoningMode && body.tools?.length && body.messages.some((message) => message.role === "assistant" && typeof message.reasoning_content !== "string")) {
      return reply.code(400).send({ error: { message: "fixture requires reasoning_content on assistant history" } });
    }
    const tools = (body.tools ?? []).map((tool) => chat ? tool.function : tool);
    const callTool = (state.toolMode || state.discoveryMode) && !JSON.stringify(body.messages).includes("fixture_tool_complete")
      ? tools.find((tool) => tool.name.endsWith(state.discoveryMode ? "fixture_lookup" : "fixture_echo"))
        ?? (state.discoveryMode ? tools.find((tool) => tool.name === "tool_search") : undefined) : undefined;
    const args = callTool?.name === "tool_search" ? '{"query":"fixture_lookup","limit":1}' : '{"text":"fixture_tool_complete"}';
    const callId = `call_fixture_${state.requests.length}`;
    const text = "fixture_tool_complete: isolated mixed response";
    const contentIndex = !chat && state.reasoningMode ? 1 : 0;
    return reply.type("text/event-stream").send(encode(chat ? [
      ...(state.reasoningMode ? [{ choices: [{ index: 0, delta: { reasoning_content: "fixture reasoning state" } }] }] : []),
      { choices: [{ index: 0, delta: callTool ? { tool_calls: [{ index: 0, id: callId, type: "function", function: { name: callTool.name, arguments: args } }] } : { content: text } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: callTool ? "tool_calls" : "stop" }], usage: { prompt_tokens: inputTokens, completion_tokens: 5 } }, "[DONE]",
    ] : [
      { type: "message_start", message: { usage: { input_tokens: inputTokens } } },
      ...(state.reasoningMode ? [
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "fixture private thought" } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "fixture-signature" } },
        { type: "content_block_stop", index: 0 },
      ] : []),
      { type: "content_block_start", index: contentIndex, content_block: callTool ? { type: "tool_use", id: callId, name: callTool.name, input: {} } : { type: "text", text: "" } },
      { type: "content_block_delta", index: contentIndex, delta: callTool ? { type: "input_json_delta", partial_json: args } : { type: "text_delta", text } },
      { type: "content_block_stop", index: contentIndex },
      { type: "message_delta", delta: { stop_reason: callTool ? "tool_use" : "end_turn" }, usage: { output_tokens: 5 } }, { type: "message_stop" },
    ]));
  });
}
upstream.get("/fixture/state", async () => state);
upstream.post("/fixture/settings", async (request) => { Object.assign(state, request.body); return { ok: true }; });
await upstream.listen({ host: "127.0.0.1", port: 0 });
const upstreamUrl = `http://127.0.0.1:${upstream.server.address().port}`;
const { ExternalProviderService } = await import("../dist/core/services/external-provider-service.js");
const { createApp } = await import("../dist/server/app.js");
const service = new ExternalProviderService();
const providers = [];
for (const [name, modelId] of [["Responses 示例", "responses-fixture"], ["DeepSeek 示例", "deepseek-fixture"], ["Claude 示例", "claude-fixture"]]) {
  const provider = await service.create({ name, baseUrl: `${upstreamUrl}/v1`, apiToken: "local-fixture-only", modelSource: "manual", manualModelIds: [modelId] });
  providers.push({ providerId: provider.id, modelId });
}
await service.activate(providers[0].providerId, [providers[0].modelId], providers[0].modelId);
const app = createApp();
await app.listen({ host: "127.0.0.1", port: 0 });
console.log(JSON.stringify({ url: `http://127.0.0.1:${app.server.address().port}/#providers`, upstream: upstreamUrl, root, providers }));
async function stop() { await app.close(); await upstream.close(); process.exit(0); }
process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
