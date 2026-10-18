import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { MixedProtocol } from "../../models/mixed-provider.js";
import { anthropicOptions } from "./anthropic-options.js";
import { COMPLETED_SSE } from "../http-connection-pool.js";

type Json = Record<string, any>;
export const object = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export function compatibilityError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: "mixed_incompatible_input" });
}
type Tool = { wireName: string; name: string; namespace?: string; custom: boolean; search?: boolean; deferred?: boolean; description?: string; parameters: Json };
export type Conversion = { body: Json; tools: Tool[] };
export type CompactionContext = { key: string; scope: string; model?: string };
const COMPACTION_PREFIX = "azt1.";
const REASONING_PREFIX = "aztr1.";
const ANTHROPIC_REASONING_PREFIX = "azta1.";

export function isLocalOpaqueState(value: unknown): boolean {
  return typeof value === "string" && [COMPACTION_PREFIX, REASONING_PREFIX, ANTHROPIC_REASONING_PREFIX].some(prefix => value.startsWith(prefix));
}

function anthropicStateContext(context: CompactionContext, model: string): CompactionContext {
  return { key: context.key, scope: JSON.stringify([context.scope, "anthropic-thinking", context.model ?? model]) };
}

function reasoningContext(context: CompactionContext): CompactionContext {
  return { key: context.key, scope: JSON.stringify([context.scope, "reasoning"]) };
}

function sealReasoning(text: string, context: CompactionContext): string {
  return REASONING_PREFIX + sealCompaction(text, reasoningContext(context)).slice(COMPACTION_PREFIX.length);
}

function openReasoning(value: string, context: CompactionContext): string {
  try { return openCompaction(COMPACTION_PREFIX + value.slice(REASONING_PREFIX.length), reasoningContext(context)); }
  catch { throw compatibilityError("推理状态属于另一服务或接口，或内容已损坏。建议新建对话后使用当前模型。"); }
}

export function sealCompaction(summary: string, context: CompactionContext): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(context.key).digest(), iv);
  const content = Buffer.concat([cipher.update(JSON.stringify({ scope: context.scope, summary }), "utf8"), cipher.final()]);
  return COMPACTION_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), content]).toString("base64url");
}

function openCompaction(value: unknown, context: CompactionContext): string {
  if (typeof value !== "string" || !value.startsWith(COMPACTION_PREFIX) || value.length > 4_000_000) {
    throw compatibilityError("此压缩上下文无法由当前兼容接口读取。跨厂商切换可能影响对话效果，建议新建对话；AZT 不会自动迁移或删除历史。");
  }
  try {
    const data = Buffer.from(value.slice(COMPACTION_PREFIX.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(context.key).digest(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
    if (payload.scope !== context.scope || typeof payload.summary !== "string") throw new Error("scope");
    return payload.summary;
  } catch {
    throw compatibilityError("压缩上下文属于另一服务或接口，或内容已损坏。建议新建对话后使用当前模型。");
  }
}

function convertTools(raw: unknown): Tool[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw compatibilityError("tools 必须是数组。");
  const result: Tool[] = [];
  function add(value: unknown, namespace?: string) {
    const tool = object(value);
    // Codex includes optional server-side search even for custom providers.
    // Its unavailability is explicitly communicated in convertRequest and the UI.
    if (!namespace && ["web_search", "web_search_preview"].includes(tool.type)) return;
    if (tool.type === "namespace" && typeof tool.name === "string" && Array.isArray(tool.tools)) {
      for (const child of tool.tools) add(child, tool.name);
      return;
    }
    if (tool.type === "tool_search") {
      if (namespace || tool.execution !== "client") throw compatibilityError("兼容接口仅支持由 Codex 执行的工具搜索，不支持服务端工具搜索。");
      if (result.some((item) => item.wireName === "tool_search")) throw compatibilityError("工具名称冲突，无法执行兼容转换。");
      result.push({ wireName: "tool_search", name: "tool_search", custom: false, search: true,
        description: tool.description, parameters: object(tool.parameters) });
      return;
    }
    if (!["function", "custom"].includes(tool.type) || typeof tool.name !== "string") {
      throw compatibilityError(`当前兼容接口不支持工具类型 ${String(tool.type ?? "unknown")}。请使用支持该能力的 Responses 服务。`);
    }
    const rawName = namespace ? `${namespace}__${tool.name}` : tool.name;
    const wireName = /^[A-Za-z0-9_-]{1,64}$/.test(rawName) ? rawName
      : `azt_tool_${createHash("sha256").update(rawName).digest("hex").slice(0, 32)}`;
    if (result.some((item) => item.wireName === wireName)) throw compatibilityError("工具名称冲突，无法执行兼容转换。");
    const description = [tool.description, tool.type === "custom" && tool.format?.type === "grammar"
      ? `Tool input must follow this ${tool.format.syntax || ""} grammar:\n${tool.format.definition}` : ""].filter(Boolean).join("\n\n");
    result.push({ wireName, name: tool.name, namespace, custom: tool.type === "custom", deferred: tool.defer_loading === true, description,
      parameters: tool.type === "custom" ? { type: "object", properties: { input: { type: "string", description: "The complete tool input, following the tool's documented format." } }, required: ["input"], additionalProperties: false }
        : object(tool.parameters).type ? tool.parameters : { type: "object", properties: {} } });
  }
  for (const tool of raw) add(tool);
  return result;
}

/** Only definitions discovered by Codex enter the upstream prompt. Never execute discovery in AZT. */
function requestTools(raw: unknown, input: Json[]): Tool[] {
  const tools = convertTools(raw);
  // Codex's local compaction explicitly supplies no tools. Do not reload historical definitions there.
  if (Array.isArray(raw) && raw.length === 0) return tools;
  for (const item of input) {
    if (!["tool_search_output", "additional_tools"].includes(item.type)) continue;
    for (const loaded of convertTools(item.tools)) {
      const existing = tools.find((tool) => tool.wireName === loaded.wireName);
      if (existing) {
        if (existing.name !== loaded.name || existing.namespace !== loaded.namespace || existing.custom !== loaded.custom || existing.search !== loaded.search) {
          throw compatibilityError("工具搜索结果中的名称冲突，无法执行兼容转换。");
        }
        existing.deferred = false;
      } else tools.push({ ...loaded, deferred: false });
    }
  }
  const canDiscover = tools.some((tool) => tool.search);
  return tools.filter((tool) => !canDiscover || !tool.deferred);
}

function contentBlocks(value: unknown): Json[] {
  if (typeof value === "string") return [{ type: "text", text: value }];
  if (!Array.isArray(value)) throw compatibilityError("消息内容必须是文字或内容数组。");
  return value.map((raw) => {
    const part = object(raw);
    if (["input_text", "output_text", "text", "summary_text"].includes(part.type) && typeof part.text === "string") return { type: "text", text: part.text };
    if (part.type === "input_image" && typeof part.image_url === "string") {
      return { type: "image_url", image_url: { url: part.image_url, ...(part.detail && part.detail !== "original" ? { detail: part.detail } : {}) } };
    }
    throw compatibilityError(`当前兼容接口不支持消息内容 ${String(part.type ?? "unknown")}，未发送请求。`);
  });
}
function chatContent(blocks: Json[]): string | Json[] {
  return blocks.every((part) => part.type === "text") ? blocks.map((part) => part.text).join("\n") : blocks;
}
function anthropicContent(value: string | Json[]): Json[] {
  const blocks = typeof value === "string" ? [{ type: "text", text: value }] : value;
  return blocks.map((part) => {
    if (part.type !== "image_url") return part;
    const url = part.image_url.url as string;
    const data = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
    if (url.startsWith("data:") && !data) throw compatibilityError("Claude 图片仅支持 PNG、JPEG、GIF 或 WebP 的 base64 数据。");
    return { type: "image", source: data ? { type: "base64", media_type: data[1], data: data[2] } : { type: "url", url } };
  });
}

/** Translate explicit full history; never silently drop opaque state or unsupported items. */
export function convertRequest(body: Json, protocol: Exclude<MixedProtocol, "responses">, model: string,
  context: CompactionContext): Conversion {
  if (body.previous_response_id || body.conversation) throw compatibilityError("当前兼容接口需要完整对话历史，不能读取另一服务的响应 ID。建议新建对话。");
  const input = typeof body.input === "string" ? [{ type: "message", role: "user", content: body.input }] : body.input;
  if (!Array.isArray(input)) throw compatibilityError("input 必须是文字或消息数组。");
  const tools = requestTools(body.tools, input.map(object));
  const messages: Json[] = [];
  if (typeof body.instructions === "string" && body.instructions) messages.push({ role: "system", content: body.instructions });
  const hasServerSearch = Array.isArray(body.tools) && body.tools.some((tool: Json) => ["web_search", "web_search_preview"].includes(tool.type));
  if (hasServerSearch) {
    if (["web_search", "web_search_preview"].includes(body.tool_choice?.type) || (body.tool_choice === "required" && !tools.length)) {
      throw compatibilityError("当前兼容接口不支持 Codex 内置联网搜索。请使用支持该能力的 Responses 服务。");
    }
    messages.push({ role: "system", content: "The built-in web_search tool is unavailable with this model connection. Do not claim to have performed web searches. If the user needs that capability, explain the limitation; only use the tools actually declared in this request." });
  }
  const pending = new Set<string>();
  const seenCalls = new Set<string>();
  const searches = new Set<string>();
  let pendingReasoning: string | undefined;
  let pendingThinking: Json[] = [];
  const withReasoning = (message: Json): Json => {
    if (pendingReasoning !== undefined) {
      message.reasoning_content = pendingReasoning; pendingReasoning = undefined;
    }
    if (pendingThinking.length) { message.thinking_blocks = pendingThinking; pendingThinking = []; }
    return message;
  };
  for (const raw of input) {
    const item = object(raw);
    if (item.type === "compaction") {
      if (pendingThinking.length) throw compatibilityError("Claude 推理状态缺少对应的模型回复。");
      messages.push({ role: "user", content: `Previous conversation summary:\n${openCompaction(item.encrypted_content, context)}` });
    } else if (item.type === "reasoning") {
      if (typeof item.encrypted_content === "string" && item.encrypted_content.startsWith(ANTHROPIC_REASONING_PREFIX)) {
        if (protocol !== "anthropic") throw compatibilityError("当前接口无法读取 Claude 的推理状态，建议新建对话。");
        const encoded = COMPACTION_PREFIX + item.encrypted_content.slice(ANTHROPIC_REASONING_PREFIX.length);
        let block: Json;
        try { block = JSON.parse(openCompaction(encoded, anthropicStateContext(context, model))); }
        catch { throw compatibilityError("Claude 推理状态属于另一模型或服务，或内容已损坏，请新建对话。"); }
        if (!(block.type === "thinking" && typeof block.thinking === "string" && typeof block.signature === "string" && block.signature || block.type === "redacted_thinking" && typeof block.data === "string" && block.data)) throw compatibilityError("Claude 推理状态不完整，无法继续当前历史。");
        pendingThinking.push(block);
        continue;
      }
      if (typeof item.encrypted_content === "string" && item.encrypted_content.startsWith(REASONING_PREFIX)) {
        if (protocol !== "chat_completions") throw compatibilityError("当前接口无法读取另一接口的推理状态，建议新建对话。");
        pendingReasoning = openReasoning(item.encrypted_content, context);
        continue;
      }
      if (item.encrypted_content) throw compatibilityError("当前模型无法读取其他接口的加密推理记录。建议新建对话，AZT 不会自动删除此记录。");
      const summary = Array.isArray(item.summary) ? item.summary : [];
      if (summary.length) messages.push({ role: "assistant", content: chatContent(contentBlocks(summary)) });
    } else if (item.type === "message" || (!item.type && item.role)) {
      if (pendingThinking.length && item.role !== "assistant") throw compatibilityError("Claude 推理状态缺少对应的模型回复。");
      if (!["system", "developer", "user", "assistant"].includes(item.role)) throw compatibilityError("不支持的消息角色。");
      if (pending.size) throw compatibilityError("工具调用缺少结果，无法安全转换历史。");
      const message = { role: item.role === "developer" ? "system" : item.role, content: chatContent(contentBlocks(item.content)) };
      messages.push(item.role === "assistant" ? withReasoning(message) : message);
    } else if (item.type === "additional_tools") {
      if (item.role !== "developer" || !Array.isArray(item.tools)) throw compatibilityError("工具定义增量格式无效。");
      messages.push({ role: "system", content: `Additional tools made available: ${convertTools(item.tools).map((tool) => tool.wireName).join(", ")}` });
    } else if (item.type === "function_call" || item.type === "custom_tool_call" || item.type === "tool_search_call") {
      if (typeof item.call_id !== "string" || !item.call_id || seenCalls.has(item.call_id)) throw compatibilityError("工具调用 ID 缺失或重复。");
      const search = item.type === "tool_search_call";
      if (search && (item.execution !== "client" || !item.arguments || typeof item.arguments !== "object" || Array.isArray(item.arguments))) throw compatibilityError("工具搜索调用格式无效。");
      const tool = tools.find((tool) => tool.name === item.name && tool.namespace === item.namespace);
      const name = search ? "tool_search" : tool?.wireName ?? (item.namespace ? `${item.namespace}__${item.name}` : item.name);
      const args = search ? JSON.stringify(item.arguments) : item.type === "custom_tool_call" ? JSON.stringify({ input: item.input }) : item.arguments;
      if (typeof name !== "string" || typeof args !== "string") throw compatibilityError("工具调用格式无效。");
      try { JSON.parse(args); } catch { throw compatibilityError("历史工具调用的参数不是有效 JSON。"); }
      const call = { id: item.call_id, type: "function", function: { name, arguments: args } };
      const last = messages.at(-1);
      if (last?.role === "assistant" && pendingReasoning === undefined && !pendingThinking.length) (last.tool_calls ??= []).push(call);
      else messages.push(withReasoning({ role: "assistant", content: null, tool_calls: [call] }));
      pending.add(item.call_id); seenCalls.add(item.call_id);
      if (search) searches.add(item.call_id);
    } else if (item.type === "tool_search_output") {
      if (item.execution !== "client" || item.status !== "completed" || !Array.isArray(item.tools) || !searches.delete(item.call_id) || !pending.delete(item.call_id)) {
        throw compatibilityError("工具搜索结果缺少对应调用或尚未完成。");
      }
      messages.push({ role: "tool", tool_call_id: item.call_id, content: JSON.stringify({ loaded_tools: convertTools(item.tools).map((tool) => tool.wireName) }) });
    } else if (item.type === "function_call_output" || item.type === "custom_tool_call_output") {
      if (searches.has(item.call_id)) throw compatibilityError("工具搜索必须返回工具定义。");
      if (!pending.delete(item.call_id)) throw compatibilityError("工具结果缺少对应的调用记录，建议新建对话。");
      messages.push({ role: "tool", tool_call_id: item.call_id, content: chatContent(contentBlocks(item.output)) });
    } else {
      throw compatibilityError(`当前兼容接口不支持历史项 ${String(item.type ?? "unknown")}，未删除任何历史。`);
    }
  }
  if (pending.size) throw compatibilityError("工具调用尚未返回全部结果，请等待任务完成。");
  if (pendingReasoning !== undefined || pendingThinking.length) throw compatibilityError("推理状态缺少对应的模型回复，建议新建对话。");

  const maxTokens = typeof body.max_output_tokens === "number" && Number.isSafeInteger(body.max_output_tokens) && body.max_output_tokens > 0 ? body.max_output_tokens : 8192;
  const choice = body.tool_choice;
  let chosen: Tool | undefined;
  if (choice && typeof choice === "object") {
    chosen = tools.find((tool) => choice.type === "tool_search" ? tool.search : tool.name === choice.name && tool.namespace === choice.namespace);
    if (!chosen) throw compatibilityError("指定的工具不在本次工具列表中。");
  }
  if (typeof choice === "string" && !["auto", "none", "required"].includes(choice)) throw compatibilityError("不支持的工具选择方式。");
  const common = { model, stream: true,
    ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
    ...(typeof body.top_p === "number" ? { top_p: body.top_p } : {}) };
  if (protocol === "chat_completions") {
    return { tools, body: { ...common, messages, max_tokens: maxTokens, stream_options: { include_usage: true },
      ...(tools.length ? { tools: tools.map((tool) => ({ type: "function", function: { name: tool.wireName, description: tool.description, parameters: tool.parameters } })) } : {}),
      ...(chosen ? { tool_choice: { type: "function", function: { name: chosen.wireName } } } : choice ? { tool_choice: choice } : {}),
      ...(typeof body.parallel_tool_calls === "boolean" ? { parallel_tool_calls: body.parallel_tool_calls } : {}),
      ...(body.reasoning?.effort ? { reasoning_effort: body.reasoning.effort } : {}),
      ...(body.text?.format ? { response_format: chatResponseFormat(body.text.format) } : {}) } };
  }
  const options = anthropicOptions(body, model, maxTokens);
  const system: Json[] = [];
  const conversation: Json[] = [];
  for (const message of messages) {
    if (message.role === "system") { system.push(...anthropicContent(message.content)); continue; }
    const role = message.role === "assistant" ? "assistant" : "user";
    const content = message.role === "tool" ? [{ type: "tool_result", tool_use_id: message.tool_call_id, content: anthropicContent(message.content) }]
      : [...(message.thinking_blocks ?? []), ...(message.content === null ? [] : anthropicContent(message.content)),
        ...(message.tool_calls ?? []).map((call: Json) => ({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) }))];
    if (conversation.at(-1)?.role === role) conversation.at(-1)!.content.push(...content);
    else conversation.push({ role, content });
  }
  return { tools, body: { ...common, ...options, messages: conversation,
    ...(system.length ? { system } : {}),
    ...(tools.length && choice !== "none" ? { tools: tools.map((tool) => ({ name: tool.wireName, description: tool.description, input_schema: tool.parameters })),
      tool_choice: { ...(chosen ? { type: "tool", name: chosen.wireName } : { type: choice === "required" ? "any" : "auto" }),
        ...(body.parallel_tool_calls === false ? { disable_parallel_tool_use: true } : {}) } } : {}) } };
}

function chatResponseFormat(format: Json): Json {
  if (format.type === "text" || format.type === "json_object") return { type: format.type };
  if (format.type === "json_schema") return { type: "json_schema", json_schema: { name: format.name, schema: format.schema, strict: format.strict } };
  throw compatibilityError("不支持的结构化输出格式。");
}

export async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<Json | "[DONE]"> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBytes = 0;
  let terminal = false;
  try {
    while (true) {
      const chunk = await reader.read();
      receivedBytes += chunk.value?.byteLength ?? 0;
      if (receivedBytes > 128 * 1024 * 1024) throw new Error("上游流式回复过大。");
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      // Normalize after concatenation so CRLF split across chunks stays a single newline.
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        if (end > 4 * 1024 * 1024) throw new Error("上游单个流式事件过大。");
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        if (data === "[DONE]") { terminal = true; yield data; }
        else {
          let parsed: unknown;
          try { parsed = JSON.parse(data); } catch { throw new Error("上游返回了无效的流式 JSON。"); }
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("上游流式事件必须是 JSON 对象。");
          terminal = (parsed as Json).type === "message_stop";
          yield parsed as Json;
        }
      }
      if (buffer.length > 4 * 1024 * 1024) throw new Error("上游单个流式事件过大。");
      if (chunk.done) {
        // Some compatible gateways end with a single newline after [DONE].
        // Accept only this complete sentinel; partial JSON must still fail.
        if (/^data:\s*\[DONE\]\s*$/.test(buffer.trim())) { terminal = true; yield "[DONE]"; }
        else if (buffer.trim() && !buffer.trim().startsWith(":")) throw new Error("上游流式事件未完整结束。");
        break;
      }
    }
  } finally { await reader.cancel(terminal ? COMPLETED_SSE : undefined).catch(() => undefined); reader.releaseLock(); }
}

/** Both converted protocols expose the Responses event lifecycle, including streamed function arguments. */
export async function* convertedEvents(source: ReadableStream<Uint8Array>, protocol: Exclude<MixedProtocol, "responses">,
  alias: string, tools: Tool[], context?: CompactionContext): AsyncGenerator<Json> {
  const id = `resp_azt_${randomUUID().replaceAll("-", "")}`;
  const output: Json[] = [];
  let sequence = 0;
  let textItem: Json | undefined;
  let textIndex = -1;
  const texts: Array<{ item: Json; index: number }> = [];
  const thinkingBlocks = new Map<number, { block: Json; item: Json; index: number; closed: boolean }>();
  let reasoning = "", reasoningBytes = 0;
  let reasoningItem: Json | undefined;
  let reasoningIndex = -1;
  let completed = false;
  let finishReason = "";
  let inputTokens = 0, outputTokens = 0;
  let cachedTokens: number | undefined, reasoningTokens: number | undefined;
  let usageReported = false;
  let outputBytes = 0;
  const accountOutput = (value: string) => {
    outputBytes += Buffer.byteLength(value);
    if (outputBytes > 32 * 1024 * 1024) throw new Error("上游输出超过混合接管容量限制。");
  };
  const calls = new Map<number, { item: Json; index: number; args: string; wireName: string; tool?: Tool }>();
  const event = (type: string, value: Json = {}) => ({ type, sequence_number: sequence++, ...value });
  const response = (status: string) => ({ id, object: "response", created_at: Math.floor(Date.now() / 1000), model: alias, status, output: status === "in_progress" ? [] : output,
    ...(usageReported ? { usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
      ...(cachedTokens === undefined ? {} : { input_tokens_details: { cached_tokens: cachedTokens } }),
      ...(reasoningTokens === undefined ? {} : { output_tokens_details: { reasoning_tokens: reasoningTokens } }) } } : {}) });
  yield event("response.created", { response: response("in_progress") });
  yield event("response.in_progress", { response: response("in_progress") });
  const addText = function* (text: string): Generator<Json> {
    if (!text) return;
    accountOutput(text);
    if (!textItem) {
      textIndex = output.length;
      textItem = { id: `msg_${randomUUID().replaceAll("-", "")}`, type: "message", role: "assistant", status: "in_progress", content: [{ type: "output_text", text: "", annotations: [] }] };
      output.push(textItem);
      texts.push({ item: textItem, index: textIndex });
      yield event("response.output_item.added", { output_index: textIndex, item: structuredClone(textItem) });
      yield event("response.content_part.added", { item_id: textItem.id, output_index: textIndex, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
    }
    textItem.content[0].text += text;
    yield event("response.output_text.delta", { item_id: textItem.id, output_index: textIndex, content_index: 0, delta: text });
  };
  const addCall = function* (key: number, callId: string | undefined, name: string | undefined, args: string): Generator<Json> {
    if (typeof args !== "string") throw new Error("上游工具参数增量格式错误。");
    accountOutput(args);
    let call = calls.get(key);
    if (!call) {
      if (calls.size >= 1024) throw new Error("上游单次回复的工具调用过多。");
      if (!callId || !name) throw new Error("上游工具调用缺少 ID 或名称。");
      const tool = tools.find((tool) => tool.wireName === name);
      if (!tool) throw new Error("上游调用了未声明的工具。");
      const item = { id: `fc_${randomUUID().replaceAll("-", "")}`, type: tool.search ? "tool_search_call" : tool.custom ? "custom_tool_call" : "function_call", call_id: callId,
        ...(tool.search ? { execution: "client", arguments: {} } : { name: tool.name,
          ...(tool.namespace ? { namespace: tool.namespace } : {}), ...(tool.custom ? { input: "" } : { arguments: "" }) }), status: "in_progress" };
      call = { item, index: output.length, args: "", wireName: name, tool };
      calls.set(key, call); output.push(item);
      yield event("response.output_item.added", { output_index: call.index, item: structuredClone(item) });
    } else if ((callId && callId !== call.item.call_id) || (name && name !== call.wireName)) {
      throw new Error("上游工具调用的 ID 或名称在生成过程中发生变化。");
    }
    call.args += args;
    if (args && !call.tool?.custom && !call.tool?.search) {
      call.item.arguments += args;
      yield event("response.function_call_arguments.delta", { item_id: call.item.id, output_index: call.index, delta: args });
    }
  };
  for await (const chunk of readSse(source)) {
    if (chunk === "[DONE]") {
      if (protocol !== "chat_completions" || !finishReason) throw new Error("上游回复缺少完成状态。");
      completed = true; break;
    }
    if (chunk.error || chunk.type === "error") throw new Error("上游模型返回错误，回复未完成，请检查服务状态。");
    if (protocol === "chat_completions") {
      if (chunk.usage) {
        usageReported = true;
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens; outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? cachedTokens;
        reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens ?? reasoningTokens;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = object(choice.delta);
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
        if (!context) throw new Error("无法保留上游推理状态。");
        if (textItem || calls.size) throw new Error("上游在回复内容之后返回了无法配对的推理状态。");
        accountOutput(delta.reasoning_content);
        reasoningBytes += Buffer.byteLength(delta.reasoning_content);
        if (reasoningBytes > 2 * 1024 * 1024) throw new Error("上游推理状态过大。");
        if (!reasoningItem) {
          reasoningIndex = output.length;
          reasoningItem = { id: `rs_${randomUUID().replaceAll("-", "")}`, type: "reasoning", summary: [] };
          output.push(reasoningItem);
          yield event("response.output_item.added", { output_index: reasoningIndex, item: structuredClone(reasoningItem) });
        }
        reasoning += delta.reasoning_content;
      }
      if (typeof delta.content === "string") yield* addText(delta.content);
      if (delta.refusal) throw new Error("上游拒绝了该请求。");
      for (const call of delta.tool_calls ?? []) {
        if (!Number.isInteger(call.index)) throw new Error("上游工具调用缺少序号。");
        yield* addCall(call.index, call.id, call.function?.name, call.function?.arguments ?? "");
      }
    } else {
      if (chunk.type === "message_start") {
        usageReported ||= Boolean(chunk.message?.usage);
        inputTokens = chunk.message?.usage?.input_tokens ?? 0;
        cachedTokens = chunk.message?.usage?.cache_read_input_tokens;
        inputTokens += (cachedTokens ?? 0) + (chunk.message?.usage?.cache_creation_input_tokens ?? 0);
      }
      if (chunk.type === "content_block_start") {
        const block = object(chunk.content_block);
        if (block.type === "text") { textItem = undefined; yield* addText(block.text ?? ""); }
        else if (block.type === "tool_use") yield* addCall(chunk.index, block.id, block.name, Object.keys(object(block.input)).length ? JSON.stringify(block.input) : "");
        else if (["thinking", "redacted_thinking"].includes(block.type)) {
          if (!context || !Number.isInteger(chunk.index) || thinkingBlocks.has(chunk.index) || thinkingBlocks.size >= 128) throw new Error("Claude 推理内容块格式无效。");
          const saved = block.type === "thinking" ? { type: "thinking", thinking: block.thinking ?? "", signature: block.signature ?? "" } : { type: "redacted_thinking", data: block.data };
          if (saved.type === "thinking" ? typeof saved.thinking !== "string" || typeof saved.signature !== "string" : typeof saved.data !== "string" || !saved.data) throw new Error("Claude 推理内容块格式无效。");
          reasoningBytes += Buffer.byteLength(JSON.stringify(saved));
          if (reasoningBytes > 2 * 1024 * 1024) throw new Error("上游推理状态过大。");
          accountOutput(JSON.stringify(saved));
          const item = { id: `rs_${randomUUID().replaceAll("-", "")}`, type: "reasoning", summary: [] };
          const index = output.length;
          thinkingBlocks.set(chunk.index, { block: saved, item, index, closed: false }); output.push(item);
          yield event("response.output_item.added", { output_index: index, item: structuredClone(item) });
        }
        else throw new Error(`当前兼容模式不支持上游内容块 ${String(block.type)}。`);
      }
      if (chunk.type === "content_block_delta") {
        if (chunk.delta?.type === "text_delta") yield* addText(chunk.delta.text ?? "");
        else if (chunk.delta?.type === "input_json_delta") yield* addCall(chunk.index, undefined, undefined, chunk.delta.partial_json ?? "");
        else if (["thinking_delta", "signature_delta"].includes(chunk.delta?.type)) {
          const state = thinkingBlocks.get(chunk.index);
          const field = chunk.delta.type === "thinking_delta" ? "thinking" : "signature";
          const delta = chunk.delta[field];
          if (!state || state.closed || state.block.type !== "thinking" || typeof delta !== "string") throw new Error("Claude 推理增量格式无效。");
          accountOutput(delta); reasoningBytes += Buffer.byteLength(delta);
          if (reasoningBytes > 2 * 1024 * 1024) throw new Error("上游推理状态过大。");
          state.block[field] += delta;
        }
        else throw new Error("上游返回了尚未支持的内容增量。");
      }
      if (chunk.type === "content_block_stop") {
        const state = thinkingBlocks.get(chunk.index);
        if (state) {
          if (state.closed || state.block.type === "thinking" && !state.block.signature || state.block.type === "redacted_thinking" && typeof state.block.data !== "string") throw new Error("Claude 推理签名缺失或内容块未完整结束。");
          state.closed = true;
          state.item.encrypted_content = ANTHROPIC_REASONING_PREFIX + sealCompaction(JSON.stringify(state.block), anthropicStateContext(context!, alias)).slice(COMPACTION_PREFIX.length);
          if (state.item.encrypted_content.length > 4_000_000) throw new Error("上游推理状态过大，无法安全保留。");
          yield event("response.output_item.done", { output_index: state.index, item: state.item });
        }
      }
      if (chunk.type === "message_delta") { usageReported ||= Boolean(chunk.usage); finishReason = chunk.delta?.stop_reason ?? finishReason; outputTokens = chunk.usage?.output_tokens ?? outputTokens; }
      if (chunk.type === "message_stop") { completed = Boolean(finishReason); break; }
    }
  }
  if (!completed) throw new Error("上游连接提前结束，回复未完成。");
  if ([...thinkingBlocks.values()].some(state => !state.closed)) throw new Error("Claude 推理内容未完整结束。");
  const incomplete = finishReason === "length" || finishReason === "max_tokens";
  if (!incomplete && !["stop", "tool_calls", "end_turn", "tool_use", "stop_sequence"].includes(finishReason)) throw new Error(`上游回复未正常完成（${finishReason}）。`);
  if (reasoningItem) {
    reasoningItem.encrypted_content = sealReasoning(reasoning, context!);
    yield event("response.output_item.done", { output_index: reasoningIndex, item: reasoningItem });
  }
  for (const { item: textItem, index: textIndex } of texts) {
    textItem.status = incomplete ? "incomplete" : "completed";
    yield event("response.output_text.done", { item_id: textItem.id, output_index: textIndex, content_index: 0, text: textItem.content[0].text });
    yield event("response.content_part.done", { item_id: textItem.id, output_index: textIndex, content_index: 0, part: textItem.content[0] });
    yield event("response.output_item.done", { output_index: textIndex, item: textItem });
  }
  for (const call of calls.values()) {
    if (incomplete) { call.item.status = "incomplete"; continue; }
    let args: Json;
    try { args = JSON.parse(call.args || "{}"); } catch { throw new Error("上游工具调用参数未完整生成。"); }
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("上游工具调用参数必须是 JSON 对象。");
    if (call.tool?.search) {
      call.item.arguments = args;
    } else if (call.tool?.custom) {
      if (typeof args.input !== "string") throw new Error("上游自定义工具输入格式错误。");
      call.item.input = args.input;
      yield event("response.custom_tool_call_input.delta", { item_id: call.item.id, output_index: call.index, delta: args.input });
      yield event("response.custom_tool_call_input.done", { item_id: call.item.id, output_index: call.index, input: args.input });
    } else {
      call.item.arguments = call.args || "{}";
      yield event("response.function_call_arguments.done", { item_id: call.item.id, output_index: call.index, arguments: call.item.arguments });
    }
    call.item.status = "completed";
    yield event("response.output_item.done", { output_index: call.index, item: call.item });
  }
  if (!texts.length && !calls.size) throw new Error("上游未返回文字或工具调用。");
  yield event(incomplete ? "response.incomplete" : "response.completed", { response: { ...response(incomplete ? "incomplete" : "completed"),
    ...(incomplete ? { incomplete_details: { reason: "max_output_tokens" } } : {}) } });
}

export function responseText(response: Json): string {
  return (response.output ?? []).filter((item: Json) => item.type === "message").flatMap((item: Json) => item.content ?? [])
    .filter((part: Json) => part.type === "output_text").map((part: Json) => part.text).join("\n");
}

export async function collectResponse(events: AsyncIterable<Json>): Promise<Json> {
  let result: Json | undefined;
  for await (const event of events) if (event.type === "response.completed" || event.type === "response.incomplete") result = event.response;
  if (!result) throw new Error("上游回复未完成。");
  return result;
}
