import { randomUUID } from "node:crypto";
import type { MixedCompatibilityValidation } from "../../models/model-compatibility.js";
import type { ModelHealthTarget } from "../openai-compatible/health.js";
import { requestStream } from "../http-client.js";
import { collectResponse, convertedEvents, convertRequest, readSse, responseText } from "./adapter.js";

type Json = Record<string, any>;
type Request = (body: Json) => Promise<Json>;
class CompatibilityMismatch extends Error {}

function requireCompleted(response: Json): void {
  if (response.status !== "completed") throw new Error("检测响应未完整结束。");
}

/** Synthetic local tool only: no shell, file, network tool or user conversation is sent. */
export async function verifyMixedConversation(request: Request, signal?: AbortSignal): Promise<MixedCompatibilityValidation> {
  const result: MixedCompatibilityValidation = { checkedAt: Date.now(), conversation: false, toolCalling: false, toolResult: false, message: "" };
  let step = "对话回复";
  try {
    signal?.throwIfAborted();
    const plain = await request({ input: "1 + 1 等于几？请简短回答。", max_output_tokens: 512 });
    requireCompleted(plain);
    if (!/(?:^|\D)2(?:\D|$)/.test(responseText(plain))) throw new CompatibilityMismatch();
    result.conversation = true;
    step = "工具调用";
    const name = "azt_compatibility_probe";
    const input = [{ role: "user", content: "Call azt_compatibility_probe with value 7. After receiving the tool result, reply with its marker exactly." }];
    const tools = [{ type: "function", name, description: "Return a local test marker. This is a harmless compatibility test.",
      parameters: { type: "object", properties: { value: { type: "integer", enum: [7] } }, required: ["value"], additionalProperties: false }, strict: true }];
    const first = await request({ input, tools, tool_choice: { type: "function", name }, parallel_tool_calls: false, max_output_tokens: 512 });
    const calls = (Array.isArray(first.output) ? first.output : []).filter((item: Json) => item.type === "function_call");
    const call = calls[0];
    requireCompleted(first);
    let argumentsValid = false;
    try { argumentsValid = JSON.parse(call?.arguments).value === 7; } catch { /* Completed but invalid tool arguments. */ }
    if (calls.length !== 1 || call.name !== name || !call.call_id || !argumentsValid) throw new CompatibilityMismatch();
    result.toolCalling = true;
    step = "工具结果回传";
    // The marker only appears in the tool output, so echoing the initial prompt cannot pass.
    const marker = `AZT_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const second = await request({ input: [...input, ...first.output, { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ marker }) }],
      tools, tool_choice: "none", max_output_tokens: 512 });
    requireCompleted(second);
    if (!responseText(second).includes(marker) || second.output?.some((item: Json) => item.type === "function_call")) throw new CompatibilityMismatch();
    result.toolResult = true;
    result.outcome = "compatible";
    result.message = "对话回复、工具调用及结果回传均通过。此结果不代表图片、内置联网搜索或跨厂商历史兼容性。";
  } catch (error) {
    signal?.throwIfAborted();
    const statusCode = (error as { statusCode?: number })?.statusCode;
    const incompatible = error instanceof CompatibilityMismatch;
    result.outcome = incompatible ? "incompatible" : "inconclusive";
    if (!incompatible) result.connectionStatus = [408, 409, 425, 429].includes(statusCode ?? 0) || (statusCode ?? 0) >= 500
      || error instanceof Error && /timeout|timed out|超时/i.test(error.message) ? "blocked" : "unavailable";
    result.message = incompatible ? `${step}不符合兼容要求，可重新检测确认。`
      : `${step}检测未完成${statusCode ? `（HTTP ${statusCode}）` : ""}，未改变此前的兼容结论，请检查连接或凭据后重试。`;
  }
  return { ...result, checkedAt: Date.now() };
}

/** Use the same conversion as the mixed gateway, without activating or editing Codex. */
export async function inspectMixedCompatibility(target: ModelHealthTarget, signal?: AbortSignal): Promise<MixedCompatibilityValidation> {
  const context = { key: randomUUID(), scope: "azt-compatibility-probe", model: target.modelId };
  return verifyMixedConversation(async (payload) => {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(Object.assign(new Error("检测超时。"), { statusCode: 408 })), 25_000);
    let stream: ReadableStream<Uint8Array> | undefined;
    try {
      const body = { ...payload, model: target.modelId, stream: true, store: false };
      const conversion = target.protocol === "responses" ? undefined : convertRequest(body, target.protocol, target.modelId, context);
      const suffix = target.protocol === "responses" ? "responses" : target.protocol === "anthropic" ? "messages" : "chat/completions";
      const upstream = await requestStream({ url: `${target.baseUrl.replace(/\/+$/, "")}/${suffix}`, method: "POST", singleAttempt: true,
        headers: { "content-type": "application/json", accept: "text/event-stream", ...(target.protocol === "anthropic"
          ? { "x-api-key": target.token, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${target.token}` }) },
        body: JSON.stringify(conversion?.body ?? body), timeoutMs: 25_000, signal: controller.signal });
      stream = upstream.body;
      if (upstream.status < 200 || upstream.status >= 300) throw Object.assign(new Error("上游请求失败。"), { statusCode: upstream.status });
      if (!upstream.headers["content-type"]?.includes("text/event-stream")) throw new Error("未返回可验证的流式响应。");
      let bytes = 0;
      const bounded = stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, writer) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) throw new Error("检测响应过大。");
        writer.enqueue(chunk);
      } }));
      if (conversion) return await collectResponse(convertedEvents(bounded, target.protocol as "chat_completions" | "anthropic", target.modelId, conversion.tools, context));
      async function* nativeEvents() {
        for await (const event of readSse(bounded)) {
          if (event === "[DONE]") break;
          if (event.error || ["error", "response.failed"].includes(event.type)) throw new Error("模型返回错误。");
          yield event;
          if (["response.completed", "response.incomplete"].includes(event.type)) break;
        }
      }
      return await collectResponse(nativeEvents());
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel); controller.abort();
      if (stream && !stream.locked) await stream.cancel().catch(() => undefined);
    }
  }, signal);
}
