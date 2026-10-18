type Json = Record<string, any>;
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Numeric, content-free observations. Never retain prompts, tool arguments or headers. */
export class MixedRequestMetrics {
  private firstText?: number;
  private firstOutput?: number;
  private outputEvents = 0;
  private headersAt?: number;
  private upstreamAt?: number;
  private decoder = new TextDecoder();
  private buffer = "";
  private overflow = false;
  private usage?: { inputTokens?: number; outputTokens?: number; cachedTokens?: number; reasoningTokens?: number };
  private terminal?: string;
  conversionMs = 0;
  requestBytes = 0;
  responseBytes = 0;
  transport?: string;
  reusedConnection?: boolean;
  sessionAffinity = false;
  transportPhases?: Record<string, number>;
  constructor(readonly compaction: "none" | "endpoint" | "trigger" | "client_summary", private start = performance.now()) {}
  private elapsed() { return Math.round((performance.now() - this.start) * 100) / 100; }
  sent(bytes: number) { this.requestBytes = bytes; this.upstreamAt = this.elapsed(); }
  headers(transport: string, phases: Record<string, number>, reused?: boolean) {
    this.headersAt = this.elapsed(); this.transport = transport; this.transportPhases = phases; this.reusedConnection = reused;
  }
  event(event: Json) {
    if (event.type?.endsWith(".delta") && event.delta) this.outputEvents++;
    if (event.type === "response.output_text.delta" && event.delta) this.firstText ??= this.elapsed();
    if ((event.type?.endsWith(".delta") && event.delta) || event.type === "response.output_item.added" && ["function_call", "custom_tool_call", "tool_search_call", "reasoning"].includes(event.item?.type)) this.firstOutput ??= this.elapsed();
    if (["response.completed", "response.incomplete", "response.failed", "error"].includes(event.type)) this.terminal = event.type;
    const usage = event.response?.usage ?? event.usage;
    if (usage && typeof usage === "object") this.usage = {
      inputTokens: number(usage.input_tokens), outputTokens: number(usage.output_tokens),
      cachedTokens: number(usage.input_tokens_details?.cached_tokens), reasoningTokens: number(usage.output_tokens_details?.reasoning_tokens),
    };
    if (event.object === "response.compaction" || event.status === "completed") this.terminal = "response.completed";
  }
  /** Observe native passthrough without delaying, rewriting or rejecting its bytes. */
  bytes(chunk: Uint8Array, sse: boolean) {
    this.responseBytes += chunk.byteLength;
    if (this.overflow) return;
    this.buffer += this.decoder.decode(chunk, { stream: true });
    if (this.buffer.length > 1024 * 1024) { this.overflow = true; this.buffer = ""; return; }
    if (!sse) return;
    this.buffer = this.buffer.replace(/\r\n/g, "\n");
    let end;
    while ((end = this.buffer.indexOf("\n\n")) >= 0) {
      const block = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 2);
      const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      try { this.event(JSON.parse(data)); } catch { /* Statistics must not affect native streams. */ }
    }
  }
  finishJson() { if (!this.overflow) { try { this.event(JSON.parse(this.buffer + this.decoder.decode())); } catch { /* optional usage */ } } this.buffer = ""; }
  finishStream() { this.terminal ??= "response.incomplete"; this.buffer = ""; }
  snapshot(outcome: "completed" | "failed" | "cancelled") {
    const totalMs = this.elapsed();
    const first = this.firstOutput ?? this.firstText;
    const generationMs = first === undefined ? undefined : Math.max(0, totalMs - first);
    return { totalMs, conversionMs: this.conversionMs,
      upstreamWaitMs: this.headersAt === undefined || this.upstreamAt === undefined ? undefined : this.headersAt - this.upstreamAt,
      firstTextMs: this.firstText, firstOutputMs: first, generationMs,
      // A buffered one-shot response cannot establish a meaningful generation rate.
      tokensPerSecond: generationMs && generationMs >= 100 && this.outputEvents > 1 && (this.usage?.outputTokens ?? 0) > 1
        ? Math.round(this.usage!.outputTokens! / (generationMs / 1000) * 10) / 10 : undefined,
      ...this.usage, requestBytes: this.requestBytes, responseBytes: this.responseBytes,
      transport: this.transport, reusedConnection: this.reusedConnection, sessionAffinity: this.sessionAffinity,
      transportPhases: this.transportPhases, compaction: this.compaction,
      outcome: outcome === "cancelled" ? "cancelled" : this.terminal === "response.failed" || this.terminal === "error" ? "failed" : this.terminal === "response.incomplete" ? "incomplete" : outcome,
      usageReported: Boolean(this.usage), terminal: this.terminal,
    };
  }
}
