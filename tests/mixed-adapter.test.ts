import { describe, expect, test } from "bun:test";
import { collectResponse, convertedEvents, convertRequest, readSse, sealCompaction } from "../src/core/providers/mixed/adapter";

const context = { key: "fixture-key", scope: "fixture-provider" };
const tool = { type: "function", name: "read_file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };
function stream(events: unknown[], step = 13) {
  const text = events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\r\n\r\n`).join("");
  const data = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < data.length; i += step) controller.enqueue(data.slice(i, i + step)); controller.close(); } });
}

describe("mixed protocol compatibility", () => {
  test("Codex discovers only needed tools and round-trips search in both converted protocols", async () => {
    const search = { type: "tool_search", execution: "client", description: "Discover tools", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } };
    const loaded = { type: "namespace", name: "files", tools: [{ ...tool, defer_loading: true }] };
    const dormant = { ...tool, name: "unused", description: "Large unused schema ".repeat(10_000), defer_loading: true };
    for (const protocol of ["chat_completions", "anthropic"] as const) {
      const first = convertRequest({ input: "Read a file", tools: [search, dormant], tool_choice: { type: "tool_search" } }, protocol, "model", context);
      expect(first.body.tools).toHaveLength(1);
      expect(JSON.stringify(first.body)).not.toContain("Large unused schema");
      expect(first.body.tool_choice).toEqual(protocol === "chat_completions" ? { type: "function", function: { name: "tool_search" } } : { type: "tool", name: "tool_search" });
      const events = protocol === "chat_completions" ? [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "search1", function: { name: "tool_search", arguments: '{"query":"read file"}' } }] }, finish_reason: "tool_calls" }] }, "[DONE]",
      ] : [
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "search1", name: "tool_search", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"read file"}' } },
        { type: "message_delta", delta: { stop_reason: "tool_use" } }, { type: "message_stop" },
      ];
      const result = await collectResponse(convertedEvents(stream(events), protocol, "model", first.tools, context));
      expect(result.output[0]).toMatchObject({ type: "tool_search_call", call_id: "search1", execution: "client", arguments: { query: "read file" }, status: "completed" });
      const input = [...result.output, { type: "tool_search_output", execution: "client", status: "completed", call_id: "search1", tools: [loaded] },
        { type: "function_call", namespace: "files", name: "read_file", call_id: "read1", arguments: '{"path":"a"}' },
        { type: "function_call_output", call_id: "read1", output: "contents" }];
      const next = convertRequest({ tools: [search, dormant, loaded], input }, protocol, "model", context);
      expect(next.tools.map((t) => t.wireName)).toEqual(["tool_search", "files__read_file"]);
      expect(JSON.stringify(next.body.messages)).toContain("contents");
      const compact = convertRequest({ tools: [], input, instructions: "Summarize" }, protocol, "model", context);
      expect(compact.body.tools).toBeUndefined();
      expect(JSON.stringify(compact.body)).not.toContain("Large unused schema");
    }
  });

  test("search rejects hosted execution, orphan results and name collisions", () => {
    expect(() => convertRequest({ input: "x", tools: [{ type: "tool_search" }] }, "chat_completions", "m", context)).toThrow("服务端工具搜索");
    expect(() => convertRequest({ input: [{ type: "tool_search_output", execution: "client", status: "completed", call_id: "missing", tools: [tool] }] }, "anthropic", "m", context)).toThrow("缺少对应调用");
    expect(() => convertRequest({ input: "x", tools: [{ type: "tool_search", execution: "client" }, { ...tool, name: "tool_search" }] }, "chat_completions", "m", context)).toThrow("名称冲突");
    const extra = convertRequest({ input: [{ type: "additional_tools", role: "developer", tools: [tool] }, { role: "user", content: "read" }] }, "anthropic", "m", context);
    expect(extra.tools.map((t) => t.wireName)).toEqual(["read_file"]);
    // Keep legacy eager behavior unless the request actually declares discovery.
    expect(convertRequest({ input: "read", tools: [{ ...tool, defer_loading: true }] }, "chat_completions", "m", context).tools).toHaveLength(1);
  });

  test("converted text is delivered before the upstream stream finishes", async () => {
    let control!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({ start(controller) { control = controller; } });
    const events = convertedEvents(source, "chat_completions", "model", []);
    control.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n'));
    let first;
    for (let i = 0; i < 5; i++) first = await events.next();
    expect(first?.value).toMatchObject({ type: "response.output_text.delta", delta: "first" });
    control.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
    const result = await collectResponse(events);
    expect(result.status).toBe("completed");
  });

  test("Chat and Anthropic preserve messages, images and multi-tool results", () => {
    const body = { instructions: "Project constraints", tools: [tool], input: [
      { role: "user", content: [{ type: "input_text", text: "inspect" }, { type: "input_image", image_url: "data:image/png;base64,YQ==" }] },
      { type: "function_call", call_id: "call1", name: "read_file", arguments: '{"path":"a"}' },
      { type: "function_call", call_id: "call2", name: "read_file", arguments: '{"path":"b"}' },
      { type: "function_call_output", call_id: "call1", output: "A" },
      { type: "function_call_output", call_id: "call2", output: "B" },
    ] };
    const chat = convertRequest(body, "chat_completions", "model-a", context).body;
    expect(chat.model).toBe("model-a");
    expect(chat.messages[2].tool_calls).toHaveLength(2);
    expect(chat.messages[3]).toMatchObject({ role: "tool", tool_call_id: "call1", content: "A" });
    const claude = convertRequest(body, "anthropic", "model-b", context).body;
    expect(claude.system[0].text).toBe("Project constraints");
    expect(claude.messages[0].content[1]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    expect(claude.messages[1].content).toHaveLength(2);
    expect(claude.messages[2].content.map((part: any) => part.tool_use_id)).toEqual(["call1", "call2"]);
  });

  test("SSE supports UTF-8 and CRLF split at every byte", async () => {
    const values = [];
    for await (const item of readSse(stream([{ text: "中文" }, "[DONE]"], 1))) values.push(item);
    expect(values).toEqual([{ text: "中文" }, "[DONE]"]);
  });

  test("a complete DONE sentinel at EOF is accepted without accepting truncated JSON or missing completion", async () => {
    const raw = (text: string) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
    const body = 'data: {"choices":[{"delta":{"content":"2"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n';
    expect((await collectResponse(convertedEvents(raw(body), "chat_completions", "m", []))).status).toBe("completed");
    await expect(collectResponse(convertedEvents(raw(body.replace('"stop"', 'null')), "chat_completions", "m", []))).rejects.toThrow("完成状态");
    await expect(collectResponse(convertedEvents(raw('data: {"choices":'), "chat_completions", "m", []))).rejects.toThrow("未完整结束");
  });

  test("completion markers end a persistent upstream stream without waiting for disconnect", async () => {
    for (const protocol of ["chat_completions", "anthropic"] as const) {
      let cancelled = false;
      const events = protocol === "chat_completions" ? [
        { choices: [{ delta: { content: "done" }, finish_reason: "stop" }] }, "[DONE]",
      ] : [
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "done" } },
        { type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" },
      ];
      const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join(""))); }, cancel() { cancelled = true; } });
      const response = await collectResponse(convertedEvents(source, protocol, "m", []));
      expect(response.status).toBe("completed"); expect(cancelled).toBe(true);
    }
  });

  test("Chat streams tool arguments as Responses and round-trips the call", async () => {
    const conversion = convertRequest({ tools: [tool], input: "read a" }, "chat_completions", "upstream", context);
    const events = [];
    for await (const event of convertedEvents(stream([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call1", function: { name: "read_file", arguments: '{"path":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 4 } }, "[DONE]",
    ]), "chat_completions", "local-alias", conversion.tools)) events.push(event);
    expect(events.filter((event) => event.type === "response.function_call_arguments.delta").map((event) => event.delta)).toEqual(['{"path":', '"a"}']);
    const result = events.at(-1)!.response;
    expect(result).toMatchObject({ model: "local-alias", status: "completed", usage: { total_tokens: 14 } });
    expect(result.output[0]).toMatchObject({ type: "function_call", call_id: "call1", arguments: '{"path":"a"}' });
    const next = convertRequest({ tools: [tool], input: [...result.output, { type: "function_call_output", call_id: "call1", output: "contents" }] }, "chat_completions", "upstream", context);
    expect(next.body.messages[1].content).toBe("contents");
  });

  test("Claude text and namespaced custom tools round-trip", async () => {
    const tools = [{ type: "namespace", name: "files", tools: [{ type: "custom", name: "apply_patch", description: "Patch files" }] }];
    const conversion = convertRequest({ input: "patch", tools }, "anthropic", "claude", context);
    const result = await collectResponse(convertedEvents(stream([
      { type: "message_start", message: { usage: { input_tokens: 12 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "修改文件" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "files__apply_patch", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"input":"patch text"}' } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } },
      { type: "message_stop" },
    ]), "anthropic", "claude-alias", conversion.tools));
    expect(result.output[0].content[0].text).toBe("修改文件");
    expect(result.output[1]).toMatchObject({ type: "custom_tool_call", namespace: "files", name: "apply_patch", input: "patch text" });
    const next = convertRequest({ tools, input: [...result.output, { type: "custom_tool_call_output", call_id: "toolu_1", output: "done" }] }, "anthropic", "claude", context);
    expect(next.body.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
  });

  test("Chat reasoning state survives tool round trips without exposing or migrating it", async () => {
    const conversion = convertRequest({ input: "read", tools: [tool] }, "chat_completions", "m", context);
    const response = await collectResponse(convertedEvents(stream([
      { choices: [{ delta: { reasoning_content: "fixture reasoning" } }] },
      { choices: [{ delta: { content: "Read the file first." } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "r1", function: { name: "read_file", arguments: '{"path":"a"}' } }] }, finish_reason: "tool_calls" }] }, "[DONE]",
    ]), "chat_completions", "m", conversion.tools, context));
    expect(response.output[0]).toMatchObject({ type: "reasoning", summary: [] });
    expect(JSON.stringify(response)).not.toContain("fixture reasoning");
    const body = { tools: [tool], input: [...response.output, { type: "function_call_output", call_id: "r1", output: "done" }] };
    const next = convertRequest(body, "chat_completions", "m2", context).body;
    expect(next.messages[0]).toMatchObject({ content: "Read the file first.", reasoning_content: "fixture reasoning" });
    expect(next.messages[0].tool_calls[0].id).toBe("r1");
    expect(() => convertRequest(body, "chat_completions", "m2", { ...context, scope: "another-service" })).toThrow("推理状态属于另一服务");
  });

  test("compaction is reusable within its service, never silently migrated or dropped", () => {
    const encrypted_content = sealCompaction("Keep the original public API.", context);
    const body = { input: [{ type: "compaction", encrypted_content }, { role: "user", content: "continue" }] };
    expect(convertRequest(body, "chat_completions", "another-model", context).body.messages[0].content).toContain("original public API");
    expect(() => convertRequest(body, "anthropic", "other", { ...context, scope: "different-provider" })).toThrow("另一服务");
    expect(() => convertRequest({ input: [{ type: "compaction", encrypted_content: "opaque-upstream-state" }] }, "anthropic", "other", context)).toThrow("不会自动迁移");
    expect(() => convertRequest({ input: [{ type: "reasoning", encrypted_content: "opaque" }] }, "chat_completions", "other", context)).toThrow("加密推理");
  });

  test("orphan tools and unsupported built-in tools fail before sending", () => {
    expect(() => convertRequest({ input: [{ type: "function_call_output", call_id: "missing", output: "x" }] }, "anthropic", "m", context)).toThrow("对应");
    expect(() => convertRequest({ input: "x", tools: [{ type: "image_generation" }] }, "anthropic", "m", context)).toThrow("工具类型");
    expect(() => convertRequest({ input: "x", tools: [{ type: "web_search" }], tool_choice: { type: "web_search" } }, "anthropic", "m", context)).toThrow("联网搜索");
    expect(() => convertRequest({ input: "x", previous_response_id: "other-service" }, "anthropic", "m", context)).toThrow("完整对话历史");
  });

  test("Codex optional server search does not block normal calls and its absence is explicit", () => {
    const converted = convertRequest({ input: "x", tools: [{ type: "web_search" }, tool] }, "chat_completions", "m", context);
    expect(converted.body.tools).toHaveLength(1);
    expect(converted.body.messages[0].content).toContain("web_search tool is unavailable");
    expect(() => convertRequest({ input: "x", tools: [{ type: "web_search" }], tool_choice: "required" }, "chat_completions", "m", context)).toThrow("联网搜索");
  });

  test("truncated streams and invalid tool JSON cannot report success", async () => {
    await expect(collectResponse(convertedEvents(stream([{ choices: [{ delta: { content: "partial" } }] }]), "chat_completions", "m", []))).rejects.toThrow("提前结束");
    const conversion = convertRequest({ tools: [tool], input: "x" }, "chat_completions", "m", context);
    await expect(collectResponse(convertedEvents(stream([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "x", function: { name: "read_file", arguments: "{" } }] }, finish_reason: "tool_calls" }] }, "[DONE]",
    ]), "chat_completions", "m", conversion.tools))).rejects.toThrow("未完整生成");
    const limited = await collectResponse(convertedEvents(stream([{ choices: [{ delta: { content: "partial" }, finish_reason: "length" }] }, "[DONE]"]), "chat_completions", "m", []));
    expect(limited.status).toBe("incomplete");
  });
});
