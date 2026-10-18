import type { ModelAvailability } from "../../models/model-availability.js";
import type { MixedProtocol } from "../../models/mixed-provider.js";
import { requestStream } from "../http-client.js";

type Json = Record<string, any>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export type ModelHealthTarget = { baseUrl: string; token: string; modelId: string; protocol: MixedProtocol };
export type ModelProtocolProbe = ModelAvailability & { statusCode?: number; protocolUnsupported?: boolean };

/** One bounded generation, no retries, redirects, tools, images or capability probing. */
export async function checkModelHealth(target: ModelHealthTarget, signal?: AbortSignal, timeoutMs = 15_000): Promise<ModelProtocolProbe> {
  const started = Date.now();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let timedOut = false;
  let statusCode: number | undefined;
  let protocolConfirmed = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const finish = (status: ModelAvailability["status"], message: string): ModelProtocolProbe => ({
    status, message, checkedAt: Date.now(), latencyMs: Date.now() - started,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(protocolConfirmed ? { protocolConfirmed: true } : {}),
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const suffix = target.protocol === "responses" ? "responses" : target.protocol === "anthropic" ? "messages" : "chat/completions";
    const body = target.protocol === "responses"
      ? { model: target.modelId, input: "Reply OK.", max_output_tokens: 32, store: false, stream: true }
      : { model: target.modelId, messages: [{ role: "user", content: "Reply OK." }], max_tokens: 32, stream: true };
    const upstream = await requestStream({
      url: `${target.baseUrl.replace(/\/+$/, "")}/${suffix}`, method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(target.protocol === "anthropic"
        ? { "x-api-key": target.token, "anthropic-version": "2023-06-01" }
        : { authorization: `Bearer ${target.token}` }) },
      timeoutMs, signal: controller.signal, singleAttempt: true,
    });
    statusCode = upstream.status;
    reader = upstream.body.getReader();
    if (upstream.status < 200 || upstream.status >= 300) {
      // Some gateways return 500 for an unsupported protocol conversion. Only an
      // explicit incompatibility permits trying another endpoint; overload still stops.
      let errorText = "", bytes = 0;
      const decoder = new TextDecoder();
      while (bytes < 16_384) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const remaining = 16_384 - bytes;
        bytes += chunk.value.length;
        errorText += decoder.decode(chunk.value.subarray(0, remaining), { stream: true });
      }
      let hint = "";
      try {
        const payload = object(JSON.parse(errorText));
        const error = object(payload.error ?? payload);
        hint = `${String(error.code ?? "")} ${String(error.message ?? "")}`;
      } catch { /* HTML and arbitrary text are not evidence of protocol support. */ }
      if (![401, 403, 408, 409, 425, 429].includes(upstream.status)
        && /not implemented|not supported|unsupported|does not support|不支持|未实现/i.test(hint)
        && !/rate.?limit|overload|quota|capacity|timeout/i.test(hint)) {
        return { ...finish("unavailable", `服务不支持此接口（HTTP ${upstream.status}），将尝试其他兼容接口。`), protocolUnsupported: true };
      }
      const blocked = [408, 409, 425, 429].includes(upstream.status) || upstream.status >= 500;
      return finish(blocked ? "blocked" : "unavailable", `轻量检测返回 HTTP ${upstream.status}。`);
    }
    let text = "", bytes = 0, output = false, terminal = false, ended = false, incomplete = false;
    let failure: ModelAvailability["status"] | undefined;
    const consume = (raw: unknown) => {
      const event = object(raw);
      if (event.error || ["error", "response.failed"].includes(event.type)) {
        const code = String(event.error?.code ?? event.error?.type ?? event.response?.error?.code ?? "");
        failure = /rate_limit|overload|server_error/i.test(code) ? "blocked" : "unavailable";
      }
      if (target.protocol === "responses") {
        if (event.type === "response.output_text.delta" && typeof event.delta === "string" && event.delta.trim()) output = true;
        const response = object(event.response ?? (event.object === "response" ? event : undefined));
        if (response.error || response.status === "failed") failure = "unavailable";
        if (Array.isArray(response.output)) output ||= response.output.some((item: Json) => Array.isArray(item.content)
          && item.content.some((part: Json) => part.type === "output_text" && typeof part.text === "string" && part.text.trim()));
        terminal ||= event.type === "response.completed" || response.status === "completed";
        incomplete ||= event.type === "response.incomplete" || response.status === "incomplete";
        ended ||= incomplete;
      } else if (target.protocol === "chat_completions") {
        if (Array.isArray(event.choices)) for (const choice of event.choices) {
          const content = choice.delta?.content ?? choice.message?.content;
          output ||= typeof content === "string" && Boolean(content.trim());
          terminal ||= choice.finish_reason != null;
          if (choice.finish_reason === "error") failure = "unavailable";
        }
      } else {
        output ||= event.type === "content_block_delta" && event.delta?.type === "text_delta" && Boolean(event.delta.text?.trim());
        if (event.type === "message" && Array.isArray(event.content)) output ||= event.content.some((part: Json) => part.type === "text" && Boolean(part.text?.trim()));
        terminal ||= event.type === "message_stop" || (event.type === "message" && event.stop_reason != null);
      }
    };
    const streaming = upstream.headers["content-type"]?.includes("text/event-stream");
    const decoder = new TextDecoder();
    while (!terminal && !failure && !ended) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 1024 * 1024) return finish("unknown", "检测返回内容过大，未确认可用性。");
      text += decoder.decode(chunk.value, { stream: true });
      if (streaming) {
        // Keep partial lines across chunks; CRLF and multiline SSE data are supported.
        text = text.replace(/\r\n/g, "\n");
        let end: number;
        while ((end = text.indexOf("\n\n")) >= 0) {
          const block = text.slice(0, end); text = text.slice(end + 2);
          const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (data === "[DONE]") { ended = true; continue; }
          if (data) { try { consume(JSON.parse(data)); } catch { failure = "unknown"; } }
        }
      }
    }
    if (!streaming) { try { consume(JSON.parse(text)); } catch { return finish("unknown", "接口未返回有效模型响应。"); } }
    if (failure) return finish(failure, "模型响应中返回错误，未确认可用。");
    // Do not mistake a truncated stream or an arbitrary 200/HTML page for support.
    // A budget-limited Responses result or Chat finish_reason still identifies the protocol.
    protocolConfirmed = terminal || incomplete;
    return terminal && output ? finish("available", "轻量请求已完成；工具、图片与推理档位请查看能力检测。")
      : finish("unknown", "请求未产生完整文本结果；可能耗尽轻量检测预算，尚不能确认可用性。");
  } catch {
    if (signal?.aborted) throw signal.reason ?? new Error("检测已取消。");
    return timedOut ? finish("blocked", "轻量检测超时。") : finish("unavailable", "无法连接模型接口。");
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", cancel); controller.abort();
    await reader?.cancel().catch(() => undefined);
  }
}
