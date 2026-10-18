import Fastify from "fastify";

export async function startMixedProviderFixture() {
  const app = Fastify({ logger: false });
  const state = { requests: [] as Array<{ path: string; body: any; headers: Record<string, unknown> }>,
    status: 200, redirect: "", holdOpen: false, cancelled: false, supportedEndpoints: {} as Record<string, string[]>,
    unsupportedStatus: 404, compatibilityProbe: false, ignoreToolOutput: false, invalidToolArguments: false,
    compatibilityGate: undefined as Promise<void> | undefined, reasoningStatus: 200, compatibilityStatus: 200 };
  const encode = (events: unknown[]) => events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join("");
  for (const endpoint of ["responses", "responses/compact", "chat/completions", "messages"]) {
    app.post(`/v1/${endpoint}`, async (request, reply) => {
      const body = request.body as any;
      state.requests.push({ path: request.url, body, headers: request.headers });
      if (state.redirect) return reply.redirect(state.redirect, 307);
      if (state.status !== 200) return reply.code(state.status).send({ error: { message: "fixture upstream failed" } });
      if ((body.max_output_tokens === 512 || body.max_tokens === 512) && state.compatibilityStatus !== 200) return reply.code(state.compatibilityStatus).send({ error: { message: "fixture validation unavailable" } });
      if (body.reasoning && state.reasoningStatus !== 200) return reply.code(state.reasoningStatus).send({ error: { message: "fixture reasoning probe failed" } });
      if (state.supportedEndpoints[body.model] && !state.supportedEndpoints[body.model].includes(endpoint)) return reply.code(state.unsupportedStatus).send({ error: { code: "convert_request_failed", message: "not implemented" } });
      if (state.holdOpen) {
        reply.hijack(); reply.raw.writeHead(200, { "content-type": "text/event-stream" }); reply.raw.write(": keepalive\n\n");
        reply.raw.once("close", () => { state.cancelled = true; });
        return reply;
      }
      if (endpoint === "responses/compact") return { id: "cmp_native", object: "response.compaction", output: [{ type: "compaction", encrypted_content: "upstream-opaque" }] };
      if (state.compatibilityProbe) {
        if (body.max_output_tokens === 512 || body.max_tokens === 512) await state.compatibilityGate;
        const input = body.input ?? body.messages;
        const result = Array.isArray(input) && input.flatMap((item: any) => Array.isArray(item.content) ? [item, ...item.content] : [item])
          .find((item: any) => item.type === "function_call_output" || item.type === "tool_result" || item.role === "tool");
        const rawOutput = result && (result.output ?? result.content);
        const outputText = typeof rawOutput === "string" ? rawOutput : Array.isArray(rawOutput) ? rawOutput.map((part) => part.text).join("") : "";
        const text = result && !state.ignoreToolOutput ? JSON.parse(outputText).marker ?? "OK" : "2";
        const tool = !result && body.tools?.[0];
        const name = tool?.name ?? tool?.function?.name;
        const args = JSON.stringify(name === "azt_provider_probe" ? { ok: true } : { value: state.invalidToolArguments ? 9 : 7 });
        if (endpoint === "responses") {
          const response = { status: "completed", output: [tool ? { type: "function_call", call_id: "call_probe", name, arguments: args }
            : { type: "message", role: "assistant", content: [{ type: "output_text", text }] }] };
          return reply.type("text/event-stream").send(encode([...(tool ? [] : [{ type: "response.output_text.delta", delta: text }]), { type: "response.completed", response }]) + "data: [DONE]\n");
        }
        if (endpoint === "chat/completions") return reply.type("text/event-stream").send(encode([
          { choices: [{ index: 0, delta: tool ? { tool_calls: [{ index: 0, id: "call_probe", type: "function", function: { name, arguments: args } }] } : { content: text } }] },
          { choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }] },
        ]) + "data: [DONE]\n");
        return reply.type("text/event-stream").send(encode([
          { type: "content_block_start", index: 0, content_block: tool ? { type: "tool_use", id: "call_probe", name, input: {} } : { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: tool ? { type: "input_json_delta", partial_json: args } : { type: "text_delta", text } },
          { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn" } }, { type: "message_stop" },
        ]));
      }
      if (endpoint === "responses") {
        const response = { id: "resp_native", object: "response", model: body.model, status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "native reply" }] }] };
        if (!body.stream) return response;
        return reply.type("text/event-stream").send(encode([{ type: "response.created", response: { ...response, status: "in_progress", output: [] } }, { type: "response.completed", response }]));
      }
      if (endpoint === "chat/completions") {
        const resultPresent = body.messages.some((message: any) => message.role === "tool");
        const tool = !resultPresent && body.tools?.[0]?.function;
        return reply.type("text/event-stream").send(encode([
          { choices: [{ index: 0, delta: tool ? { tool_calls: [{ index: 0, id: "call_chat", type: "function", function: { name: tool.name, arguments: '{"path":"a"}' } }] } : { content: resultPresent ? "tool complete" : "summary or reply" } }] },
          { choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }] }, "[DONE]",
        ]));
      }
      const resultPresent = body.messages.some((message: any) => Array.isArray(message.content) && message.content.some((part: any) => part.type === "tool_result"));
      const tool = !resultPresent && body.tools?.[0];
      return reply.type("text/event-stream").send(encode([
        { type: "message_start", message: { usage: { input_tokens: 12 } } },
        { type: "content_block_start", index: 0, content_block: tool ? { type: "tool_use", id: "toolu_fixture", name: tool.name, input: {} } : { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: tool ? { type: "input_json_delta", partial_json: '{"path":"a"}' } : { type: "text_delta", text: resultPresent ? "tool complete" : "summary or reply" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 5 } }, { type: "message_stop" },
      ]));
    });
  }
  await app.listen({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/v1`;
  return { baseUrl, state, close: () => app.close() };
}
