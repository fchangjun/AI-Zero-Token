import { expect, test } from "bun:test";
import { anthropicOptions, anthropicReasoningCatalog, anthropicReasoningEfforts } from "../src/core/providers/mixed/anthropic-options";
import { buildCodexModelCatalog } from "../src/core/store/codex-auth-store";
import { collectResponse, convertedEvents, convertRequest } from "../src/core/providers/mixed/adapter";
import { MixedRequestMetrics } from "../src/core/providers/mixed/metrics";
import { mixedSessionHeaders } from "../src/core/providers/mixed/routing";

function stream(events: unknown[]) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}
const context = { key: "fixture-secret", scope: "fixture-channel", model: "claude-sonnet-4-6" };
const tool = { type: "function", name: "fixture_lookup", parameters: { type: "object", properties: {}, additionalProperties: false } };
const thinking = [
  { type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "PRIVATE_THINKING" } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "SIGNED" } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "_STATE" } },
  { type: "content_block_stop", index: 0 },
];
const toolEvents = [
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "call1", name: "fixture_lookup", input: {} } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } },
  { type: "content_block_stop", index: 1 },
  { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 12 } },
  { type: "message_stop" },
];

test("Claude thinking signatures survive tool result replay without exposing their content", async () => {
  const conversion = convertRequest({ input: "look up", tools: [tool] }, "anthropic", context.model, context);
  const result = await collectResponse(convertedEvents(stream([...thinking, ...toolEvents]), "anthropic", "local-alias", conversion.tools, context));
  expect(result.usage).toMatchObject({ input_tokens: 60, output_tokens: 12, input_tokens_details: { cached_tokens: 20 } });
  expect(result.output.map((item: any) => item.type)).toEqual(["reasoning", "function_call"]);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_THINKING");
  expect(JSON.stringify(result)).not.toContain("SIGNED_STATE");
  const input = [{ role: "user", content: "look up" }, ...result.output, { type: "function_call_output", call_id: "call1", output: "returned marker" }];
  const replay = convertRequest({ input, tools: [tool] }, "anthropic", context.model, context).body;
  expect(replay.messages[1].content).toEqual([
    { type: "thinking", thinking: "PRIVATE_THINKING", signature: "SIGNED_STATE" },
    { type: "tool_use", id: "call1", name: "fixture_lookup", input: {} },
  ]);
  expect(replay.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "call1", content: [{ type: "text", text: "returned marker" }] });
  expect(() => convertRequest({ input, tools: [tool] }, "anthropic", "claude-opus-4-6", { ...context, model: "claude-opus-4-6" })).toThrow();
  expect(() => convertRequest({ input, tools: [tool] }, "chat_completions", context.model, context)).toThrow();
});

test("Claude refuses missing or truncated signatures and preserves redacted blocks", async () => {
  const conversion = convertRequest({ input: "look up", tools: [tool] }, "anthropic", context.model, context);
  for (const invalid of [thinking.filter(event => event.type !== "content_block_delta"), thinking.filter(event => event.type !== "content_block_stop")]) {
    await expect(collectResponse(convertedEvents(stream([...invalid, ...toolEvents]), "anthropic", "local-alias", conversion.tools, context))).rejects.toThrow();
  }
  const result = await collectResponse(convertedEvents(stream([
    { type: "content_block_start", index: 0, content_block: { type: "redacted_thinking", data: "opaque-upstream-block" } },
    { type: "content_block_stop", index: 0 }, ...toolEvents,
  ]), "anthropic", "local-alias", conversion.tools, context));
  const replay = convertRequest({ input: [...result.output, { type: "function_call_output", call_id: "call1", output: "done" }], tools: [tool] }, "anthropic", context.model, context).body;
  expect(replay.messages[0].content[0]).toEqual({ type: "redacted_thinking", data: "opaque-upstream-block" });
});

test("Claude maps effort and JSON Schema while respecting explicit output limits", () => {
  const schema = { type: "object", properties: { answer: { type: "string", minLength: 1 } }, required: ["answer"], additionalProperties: false };
  expect(anthropicOptions({ reasoning: { effort: "high" }, text: { format: { type: "json_schema", schema } } }, "Opus 5.5", 8192)).toEqual({
    max_tokens: 8192, thinking: { type: "adaptive" }, output_config: { effort: "high", format: { type: "json_schema", schema } },
  });
  expect(anthropicOptions({ reasoning: { effort: "high" } }, "claude-sonnet-4-5", 8192)).toMatchObject({ max_tokens: 10240, thinking: { type: "enabled", budget_tokens: 8192 } });
  expect(anthropicOptions({ reasoning: { effort: "high" }, max_output_tokens: 2048 }, "claude-sonnet-4-5", 2048)).toMatchObject({ max_tokens: 2048, thinking: { budget_tokens: 2047 } });
  expect(() => anthropicOptions({ reasoning: { effort: "high" }, max_output_tokens: 1024 }, "claude-sonnet-4-5", 1024)).toThrow();
  expect(() => anthropicOptions({ reasoning: { effort: "high" }, tool_choice: "required" }, "claude-sonnet-4-5", 8192)).toThrow();
  expect(() => anthropicOptions({ reasoning: { effort: "none" } }, "Opus 5.5", 8192)).toThrow();
  expect(anthropicOptions({}, "custom-claude-model", 4096)).toEqual({ max_tokens: 4096 });
  expect(anthropicReasoningEfforts("custom-claude-model")).toEqual([]);
  expect(anthropicReasoningEfforts("Opus 99")).toEqual([]);
  expect(anthropicReasoningEfforts("Opus 5.5")).toContain("xhigh");
});

test("adding Claude effort controls preserves legacy thinking defaults and existing model defaults", async () => {
  const catalog = await buildCodexModelCatalog([
    { id: "claude-sonnet-4-5", ...anthropicReasoningCatalog("claude-sonnet-4-5") },
    { id: "Opus 5.5", ...anthropicReasoningCatalog("Opus 5.5") },
    { id: "existing-direct-model", reasoningEfforts: ["low", "medium", "high"] },
  ]);
  expect(catalog.models.map(model => model.default_reasoning_level)).toEqual(["none", "medium", "medium"]);
});

test("Baidu session affinity is stable, isolated and restricted to the exact channel", () => {
  const args = ["https://oneapi-comate.baidu-int.com/v1", "provider", "model", "secret", { "session-id": "private-thread" }, { prompt_cache_key: "private-cache-key" }] as const;
  const header = mixedSessionHeaders(...args);
  expect(header).toEqual(mixedSessionHeaders(...args));
  expect(Object.values(header)[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(header)).not.toContain("private");
  expect(mixedSessionHeaders(args[0], "other-provider", ...args.slice(2) as [string, string, typeof args[4], typeof args[5]])).not.toEqual(header);
  expect(mixedSessionHeaders(args[0], args[1], "other-model", args[3], args[4], args[5])).not.toEqual(header);
  expect(mixedSessionHeaders(args[0], args[1], args[2], args[3], { ...args[4], "x-openai-subagent": "review" }, args[5])).not.toEqual(header);
  expect(mixedSessionHeaders("https://oneapi-comate.baidu-int.com.example.test/v1", ...args.slice(1) as [string, string, string, typeof args[4], typeof args[5]])).toEqual({});
  expect(mixedSessionHeaders(args[0], args[1], args[2], args[3], {}, {})).toEqual({});
});

test("timing distinguishes headers from first text and never fabricates missing usage", async () => {
  const metrics = new MixedRequestMetrics("none");
  metrics.sent(10); metrics.headers("node", { waitForHeadersMs: 1 }, true);
  metrics.event({ type: "response.created", response: { status: "in_progress" } });
  expect(metrics.snapshot("completed").firstTextMs).toBeUndefined();
  metrics.event({ type: "response.output_item.added", item: { type: "reasoning" } });
  metrics.event({ type: "response.output_text.delta", delta: "PRIVATE_REPLY" });
  metrics.event({ type: "response.completed", response: { usage: { input_tokens: 300, output_tokens: 20, input_tokens_details: { cached_tokens: 200 } } } });
  const result = metrics.snapshot("completed");
  expect(result.firstOutputMs).toBeLessThanOrEqual(result.firstTextMs!);
  expect(result).toMatchObject({ usageReported: true, inputTokens: 300, outputTokens: 20, cachedTokens: 200, reusedConnection: true });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_REPLY");
  const unknown = new MixedRequestMetrics("endpoint");
  unknown.finishStream();
  expect(unknown.snapshot("completed")).toMatchObject({ usageReported: false, outcome: "incomplete" });
  expect(unknown.snapshot("completed").inputTokens).toBeUndefined();
  const reply = await collectResponse(convertedEvents(stream([
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "OK" } },
    { type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" },
  ]), "anthropic", "alias", [], context));
  expect(reply.usage).toBeUndefined();
});
