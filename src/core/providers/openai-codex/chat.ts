import { createHash } from "node:crypto";
import type { ArtifactCandidate, ChatToolCall, CodexQuotaSnapshot, OAuthProfile } from "../../types.js";
import { DEFAULT_CODEX_MODEL } from "../../models/openai-codex-models.js";
import { requestStream, requestText } from "../http-client.js";

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const COMPAT_PROMPT_CACHE_KEY_PREFIX = "compat_cc_";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETAINED_COMPACT_TOKEN_BUDGET = 64_000;
const APPROX_COMPACT_BYTES_PER_TOKEN = 4;

type CodexResponsesEndpoint = "responses" | "responses/compact";

type CodexSseEvent = {
  type?: string;
  response?: unknown;
  delta?: string;
  [key: string]: unknown;
};

type UpstreamErrorBody = {
  message?: string;
  type?: string;
  code?: string;
  param?: string | null;
  planType?: string;
  resetsAt?: number;
  resetsInSeconds?: number;
  promoCampaignId?: string;
  promoMessage?: string;
};

export type CodexStreamResponse = {
  body: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
  quota?: CodexQuotaSnapshot;
  requestId: string;
  status: number;
  compactResponse?: Record<string, unknown>;
};

const URL_KEY_RE = /(url|uri|href|download|preview|thumbnail|image|asset|file)/i;
const REFERENCE_KEY_RE = /(image|asset|file|media|blob|artifact|download|preview|thumbnail)/i;
const REFERENCE_VALUE_RE = /^(file|asset|image|img|media|blob)-[\w-]+$/i;

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }

  return undefined;
}

function parseOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseUpstreamErrorBody(body: string): UpstreamErrorBody | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    const record = asRecord(parsed.error);
    if (!record) {
      return undefined;
    }

    const eligiblePromo = asRecord(record.eligible_promo);
    return {
      message: typeof record.message === "string" ? record.message : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      param: typeof record.param === "string" || record.param === null ? record.param : undefined,
      planType: typeof record.plan_type === "string" ? record.plan_type : undefined,
      resetsAt: typeof record.resets_at === "number" && Number.isFinite(record.resets_at) ? record.resets_at : undefined,
      resetsInSeconds: typeof record.resets_in_seconds === "number" && Number.isFinite(record.resets_in_seconds) ? record.resets_in_seconds : undefined,
      promoCampaignId: typeof eligiblePromo?.campaign_id === "string" ? eligiblePromo.campaign_id : undefined,
      promoMessage: typeof eligiblePromo?.message === "string" ? eligiblePromo.message : undefined,
    };
  } catch {
    return undefined;
  }
}

function hashShort(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function stableStringify(value: unknown): string {
  if (typeof value === "undefined") {
    return "";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function shouldAutoInjectPromptCacheKeyForCompat(model: unknown): boolean {
  const normalized = typeof model === "string" && model.trim() ? model.trim().toLowerCase() : DEFAULT_CODEX_MODEL.toLowerCase();
  return normalized.includes("gpt-5") || normalized.includes("codex");
}

function extractInputContentText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    const record = asRecord(content);
    return typeof record?.text === "string" ? record.text.trim() : "";
  }
  return content
    .map((part) => {
      const record = asRecord(part);
      if (!record) {
        return "";
      }
      if (typeof record.text === "string") {
        return record.text.trim();
      }
      if (typeof record.input_text === "string") {
        return record.input_text.trim();
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractFirstInputTextByRole(input: unknown, roles: Set<string>): string {
  if (typeof input === "string") {
    return roles.has("user") ? input.trim() : "";
  }
  if (!Array.isArray(input)) {
    return "";
  }
  for (const item of input) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const role = typeof record.role === "string" ? record.role.trim().toLowerCase() : "user";
    if (!roles.has(role)) {
      continue;
    }
    const text = extractInputContentText(record.content);
    if (text) {
      return text;
    }
  }
  return "";
}

function deriveCompatPromptCacheKey(body: Record<string, unknown>): string {
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_CODEX_MODEL;
  if (!shouldAutoInjectPromptCacheKeyForCompat(model)) {
    return "";
  }

  const seedParts = [`model=${model}`];
  const reasoning = asRecord(body.reasoning);
  if (typeof reasoning?.effort === "string" && reasoning.effort.trim()) {
    seedParts.push(`reasoning_effort=${reasoning.effort.trim()}`);
  }
  if (typeof body.tool_choice !== "undefined") {
    seedParts.push(`tool_choice=${stableStringify(body.tool_choice)}`);
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    seedParts.push(`tools=${stableStringify(body.tools)}`);
  }
  if (typeof body.instructions === "string" && body.instructions.trim()) {
    seedParts.push(`instructions=${body.instructions.trim()}`);
  }

  const systemText = extractFirstInputTextByRole(body.input, new Set(["system", "developer"]));
  if (systemText) {
    seedParts.push(`system=${systemText}`);
  }
  const firstUserText = extractFirstInputTextByRole(body.input, new Set(["user"]));
  if (firstUserText) {
    seedParts.push(`first_user=${firstUserText}`);
  }

  return `${COMPAT_PROMPT_CACHE_KEY_PREFIX}${hashShort(seedParts.join("|"))}`;
}

function withCompatPromptCacheKey(body: Record<string, unknown>): Record<string, unknown> {
  const existing = typeof body.prompt_cache_key === "string" ? body.prompt_cache_key.trim() : "";
  if (existing) {
    return body;
  }
  const promptCacheKey = deriveCompatPromptCacheKey(body);
  return promptCacheKey ? { ...body, prompt_cache_key: promptCacheKey } : body;
}

function deterministicSessionUUID(seed: string): string {
  const hash = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeSessionIdentifier(value: string): string {
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : deterministicSessionUUID(trimmed);
}

function requestBodyString(body: Record<string, unknown> | undefined, key: string): string {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function getCodexAccountId(profile: OAuthProfile): string | undefined {
  return profile.codexAccountId ?? (!profile.accountIdSource ? profile.accountId : undefined);
}

function buildCodexRequestHeaders(profile: OAuthProfile, requestBody?: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    Authorization: `Bearer ${profile.access}`,
    "OpenAI-Beta": "responses=experimental",
    Originator: "pi",
    "User-Agent": "pi (bun demo)",
  };
  const codexAccountId = getCodexAccountId(profile);
  if (codexAccountId) {
    headers["ChatGPT-Account-Id"] = codexAccountId;
  }
  const explicitSessionId = requestBodyString(requestBody, "session_id");
  const conversationId = requestBodyString(requestBody, "conversation_id");
  const promptCacheKey = requestBodyString(requestBody, "prompt_cache_key");
  const sessionSeed = explicitSessionId || promptCacheKey || conversationId;
  if (sessionSeed) {
    headers.session_id = normalizeSessionIdentifier(sessionSeed);
  }
  if (conversationId) {
    headers.conversation_id = normalizeSessionIdentifier(conversationId);
  }
  return headers;
}

function createCodexUpstreamError(
  status: number,
  body: string,
  transport: "fetch" | "curl" | "stream",
  quota?: CodexQuotaSnapshot,
  requestId?: string,
): Error & {
  quota?: CodexQuotaSnapshot;
  upstreamStatus?: number;
  upstreamErrorCode?: string;
  upstreamErrorType?: string;
  upstreamErrorMessage?: string;
} {
  const upstreamError = parseUpstreamErrorBody(body);
  const error = new Error(`调用 Responses API 失败: HTTP ${status} via ${transport} ${body}`) as Error & {
    quota?: CodexQuotaSnapshot;
    upstreamStatus?: number;
    upstreamErrorCode?: string;
    upstreamErrorType?: string;
    upstreamErrorMessage?: string;
  };
  error.quota = quota ?? createUsageLimitQuotaSnapshot(status, upstreamError, requestId);
  error.upstreamStatus = status;
  error.upstreamErrorCode = upstreamError?.code;
  error.upstreamErrorType = upstreamError?.type;
  error.upstreamErrorMessage = upstreamError?.message;
  return error;
}

function createUsageLimitQuotaSnapshot(
  status: number,
  upstreamError: UpstreamErrorBody | undefined,
  requestId: string | undefined,
): CodexQuotaSnapshot | undefined {
  const errorKind = `${upstreamError?.type ?? ""} ${upstreamError?.code ?? ""}`.toLowerCase();
  if (status !== 429 && !errorKind.includes("usage_limit_reached")) {
    return undefined;
  }

  return {
    capturedAt: Date.now(),
    sourceRequestId: requestId,
    planType: upstreamError?.planType,
    primaryUsedPercent: 100,
    primaryResetAt: upstreamError?.resetsAt,
    primaryResetAfterSeconds: upstreamError?.resetsInSeconds,
    creditsHasCredits: false,
    creditsBalance: "0",
    promoCampaignId: upstreamError?.promoCampaignId,
    promoMessage: upstreamError?.promoMessage,
  };
}

export function extractCodexQuotaSnapshot(
  headers: Record<string, string>,
  requestId?: string,
): CodexQuotaSnapshot | undefined {
  const activeLimit = parseOptionalText(headers["x-codex-active-limit"]);
  const planType = parseOptionalText(headers["x-codex-plan-type"]);
  const primaryUsedPercent = parseOptionalNumber(headers["x-codex-primary-used-percent"]);
  const secondaryUsedPercent = parseOptionalNumber(headers["x-codex-secondary-used-percent"]);
  const primaryWindowMinutes = parseOptionalNumber(headers["x-codex-primary-window-minutes"]);
  const secondaryWindowMinutes = parseOptionalNumber(headers["x-codex-secondary-window-minutes"]);
  const primaryResetAfterSeconds = parseOptionalNumber(headers["x-codex-primary-reset-after-seconds"]);
  const secondaryResetAfterSeconds = parseOptionalNumber(headers["x-codex-secondary-reset-after-seconds"]);
  const primaryResetAt = parseOptionalNumber(headers["x-codex-primary-reset-at"]);
  const secondaryResetAt = parseOptionalNumber(headers["x-codex-secondary-reset-at"]);
  const primaryOverSecondaryLimitPercent = parseOptionalNumber(
    headers["x-codex-primary-over-secondary-limit-percent"],
  );
  const creditsHasCredits = parseOptionalBoolean(headers["x-codex-credits-has-credits"]);
  const creditsUnlimited = parseOptionalBoolean(headers["x-codex-credits-unlimited"]);
  const creditsBalance = parseOptionalText(headers["x-codex-credits-balance"]);
  const promoCampaignId = parseOptionalText(headers["x-codex-promo-campaign-id"]);
  const promoMessage = parseOptionalText(headers["x-codex-promo-message"]);

  const hasQuotaData = [
    activeLimit,
    planType,
    primaryUsedPercent,
    secondaryUsedPercent,
    primaryWindowMinutes,
    secondaryWindowMinutes,
    primaryResetAfterSeconds,
    secondaryResetAfterSeconds,
    primaryResetAt,
    secondaryResetAt,
    primaryOverSecondaryLimitPercent,
    creditsHasCredits,
    creditsUnlimited,
    creditsBalance,
    promoCampaignId,
    promoMessage,
  ].some((value) => typeof value !== "undefined");

  if (!hasQuotaData) {
    return undefined;
  }

  return {
    capturedAt: Date.now(),
    sourceRequestId: requestId,
    activeLimit,
    planType,
    primaryUsedPercent,
    secondaryUsedPercent,
    primaryWindowMinutes,
    secondaryWindowMinutes,
    primaryResetAfterSeconds,
    secondaryResetAfterSeconds,
    primaryResetAt,
    secondaryResetAt,
    primaryOverSecondaryLimitPercent,
    creditsHasCredits,
    creditsUnlimited,
    creditsBalance,
    promoCampaignId,
    promoMessage,
  };
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const data = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      text?: string;
    }>;
  };

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  for (const item of data.output ?? []) {
    if (typeof item?.text === "string" && item.text.trim()) {
      return item.text.trim();
    }

    for (const part of item?.content ?? []) {
      if ((part?.type === "output_text" || part?.type === "text") && typeof part.text === "string") {
        const trimmed = part.text.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
  }

  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function approximateCompactTokens(value: unknown): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") / APPROX_COMPACT_BYTES_PER_TOKEN));
}

function fitCompactText(
  text: string,
  maxTokens: number,
  build: (text: string) => Record<string, unknown>,
): Record<string, unknown> | undefined {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (approximateCompactTokens(build(text.slice(0, middle))) <= maxTokens) low = middle;
    else high = middle - 1;
  }
  return low > 0 ? build(text.slice(0, low)) : undefined;
}

function truncateCompactUserMessage(item: unknown, maxTokens: number): Record<string, unknown> | undefined {
  const message = asRecord(item);
  if (!message || message.role !== "user" || (message.type !== undefined && message.type !== "message")) return undefined;
  if (approximateCompactTokens(message) <= maxTokens) return message;

  if (typeof message.content === "string") {
    return fitCompactText(message.content, maxTokens, (text) => ({ ...message, content: text }));
  }

  const content = Array.isArray(message.content) ? message.content : [message.content];
  const retained: unknown[] = [];
  for (const part of content) {
    const record = asRecord(part);
    if (!record || typeof record.text !== "string" || !["input_text", "output_text"].includes(String(record.type))) continue;
    const candidate = { ...message, content: [...retained, record] };
    if (approximateCompactTokens(candidate) <= maxTokens) {
      retained.push(record);
      continue;
    }
    const fitted = fitCompactText(record.text, maxTokens, (text) => ({
      ...message,
      content: [...retained, { ...record, text }],
    }));
    if (fitted) return fitted;
    break;
  }
  return retained.length ? { ...message, content: retained } : undefined;
}

function retainCompactUserInput(input: unknown[]): unknown[] {
  const userMessages = input.filter((item) => {
    const record = asRecord(item);
    return record?.role === "user" && (!record.type || record.type === "message");
  });
  let remaining = RETAINED_COMPACT_TOKEN_BUDGET;
  const retainedReversed: unknown[] = [];
  for (let index = userMessages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const item = userMessages[index];
    const tokens = approximateCompactTokens(item);
    if (tokens <= remaining) {
      retainedReversed.push(item);
      remaining -= tokens;
      continue;
    }
    const boundary = truncateCompactUserMessage(item, remaining);
    if (boundary) retainedReversed.push(boundary);
    // Do not backfill older messages after crossing the newest-history budget.
    remaining = 0;
  }
  retainedReversed.reverse();
  return retainedReversed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function stringifyToolArguments(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "undefined" || value === null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function upsertFunctionCall(items: Map<string, ChatToolCall>, value: unknown): void {
  const record = asRecord(value);
  if (!record || record.type !== "function_call") {
    return;
  }

  const name = optionalString(record.name);
  const id = optionalString(record.call_id) ?? optionalString(record.id);
  if (!name || !id) {
    return;
  }

  items.set(id, {
    id,
    type: "function",
    function: {
      name,
      arguments: stringifyToolArguments(record.arguments),
    },
  });
}

function appendFunctionCallArgumentsDelta(
  items: Map<string, ChatToolCall>,
  argumentDeltas: Map<string, string>,
  event: CodexSseEvent,
): void {
  if (event.type !== "response.function_call_arguments.delta") {
    return;
  }

  const itemId = optionalString(event.item_id) ?? optionalString(event.call_id);
  if (!itemId || typeof event.delta !== "string") {
    return;
  }

  argumentDeltas.set(itemId, `${argumentDeltas.get(itemId) ?? ""}${event.delta}`);
  const existing = items.get(itemId);
  if (existing) {
    existing.function.arguments = argumentDeltas.get(itemId) ?? existing.function.arguments;
  }
}

function extractToolCalls(responsePayload: unknown, events: CodexSseEvent[]): ChatToolCall[] {
  const calls = new Map<string, ChatToolCall>();
  const argumentDeltas = new Map<string, string>();

  const response = asRecord(responsePayload);
  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    upsertFunctionCall(calls, item);
  }

  for (const event of events) {
    if (event.type === "response.output_item.added" || event.type === "response.output_item.done") {
      upsertFunctionCall(calls, event.item);
    }
    appendFunctionCallArgumentsDelta(calls, argumentDeltas, event);
  }

  for (const [id, argumentsDelta] of argumentDeltas) {
    const existing = calls.get(id);
    if (existing && !existing.function.arguments) {
      existing.function.arguments = argumentsDelta;
    }
  }

  return Array.from(calls.values()).filter((call) => call.function.name);
}

function parseSseEvents(body: string): CodexSseEvent[] {
  const events: CodexSseEvent[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split("\n\n")) {
    const lines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (lines.length === 0) {
      continue;
    }

    const data = lines.join("\n").trim();
    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      events.push(JSON.parse(data) as CodexSseEvent);
    } catch {
      // ignore malformed SSE chunks
    }
  }
  return events;
}

function pushArtifactCandidate(
  items: ArtifactCandidate[],
  dedupe: Set<string>,
  candidate: ArtifactCandidate,
): void {
  const signature = `${candidate.source}:${candidate.path}:${candidate.key}:${candidate.kind}:${candidate.value}`;
  if (dedupe.has(signature)) {
    return;
  }

  dedupe.add(signature);
  items.push(candidate);
}

function collectArtifactCandidates(
  value: unknown,
  source: ArtifactCandidate["source"],
  path: string[] = [],
  items: ArtifactCandidate[] = [],
  dedupe: Set<string> = new Set(),
): ArtifactCandidate[] {
  if (typeof value === "string") {
    const key = path[path.length - 1] ?? "";
    const joinedPath = path.join(".");
    const trimmed = value.trim();
    if (!trimmed) {
      return items;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      pushArtifactCandidate(items, dedupe, {
        source,
        path: joinedPath,
        key,
        kind: "url",
        value: trimmed,
      });
      return items;
    }

    if (REFERENCE_KEY_RE.test(key) || REFERENCE_VALUE_RE.test(trimmed)) {
      pushArtifactCandidate(items, dedupe, {
        source,
        path: joinedPath,
        key,
        kind: "reference",
        value: trimmed,
      });
    }
    return items;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectArtifactCandidates(item, source, [...path, String(index)], items, dedupe);
    });
    return items;
  }

  if (!value || typeof value !== "object") {
    return items;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (typeof nested === "string" && (URL_KEY_RE.test(key) || /^https?:\/\//i.test(nested))) {
      collectArtifactCandidates(nested, source, nextPath, items, dedupe);
      continue;
    }

    collectArtifactCandidates(nested, source, nextPath, items, dedupe);
  }

  return items;
}

function buildDefaultRequestBody(params: {
  prompt?: string;
  model?: string;
  system?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model ?? DEFAULT_CODEX_MODEL,
    store: false,
    stream: true,
    instructions: params.system ?? "",
    text: { verbosity: "medium" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
  };

  if (typeof params.prompt === "string" && params.prompt.trim()) {
    body.input = [
      {
        role: "user",
        content: [{ type: "input_text", text: params.prompt }],
      },
    ];
  }

  return body;
}

function extractCodexText(body: string, requestBody: Record<string, unknown>): {
  text: string;
  toolCalls: ChatToolCall[];
  raw: unknown;
  artifacts: ArtifactCandidate[];
} {
  const events = parseSseEvents(body);
  let responsePayload: unknown;
  let accumulated = "";

  for (const event of events) {
    if (typeof event.response !== "undefined") {
      responsePayload = event.response;
    }

    if (
      event.type === "response.completed" ||
      event.type === "response.done" ||
      event.type === "response.incomplete" ||
      event.type === "response.failed"
    ) {
      responsePayload = event.response;
    }

    if (typeof event.delta === "string" && event.delta) {
      accumulated += event.delta;
    }
  }

  const completedText = extractOutputText(responsePayload);
  const toolCalls = extractToolCalls(responsePayload, events);
  const artifacts = [
    ...collectArtifactCandidates(responsePayload, "response"),
    ...collectArtifactCandidates(events, "event"),
  ];

  if (completedText) {
    return {
      text: completedText,
      toolCalls,
      raw: {
        request: requestBody,
        response: responsePayload ?? null,
        events,
      },
      artifacts,
    };
  }

  return {
    text: accumulated.trim(),
    toolCalls,
    raw: {
      request: requestBody,
      response: responsePayload ?? null,
      events,
    },
    artifacts,
  };
}

export async function askOpenAICodex(params: {
  profile: OAuthProfile;
  prompt?: string;
  model?: string;
  system?: string;
  bodyOverride?: Record<string, unknown>;
}): Promise<{ text: string; toolCalls: ChatToolCall[]; raw: unknown; artifacts: ArtifactCandidate[]; quota?: CodexQuotaSnapshot }> {
  const requestBody = withCompatPromptCacheKey({
    ...buildDefaultRequestBody(params),
    ...(params.bodyOverride ?? {}),
  });

  if (typeof requestBody.input === "undefined") {
    throw new Error("Codex 请求缺少 input。请提供 prompt 或在实验请求体里显式传入 input。");
  }

  const response = await requestText({
    method: "POST",
    url: CODEX_RESPONSES_URL,
    headers: buildCodexRequestHeaders(params.profile, requestBody),
    body: JSON.stringify(requestBody),
  });
  const quota = extractCodexQuotaSnapshot(response.headers, response.requestId);

  if (response.status < 200 || response.status >= 300) {
    throw createCodexUpstreamError(response.status, response.body, response.transport, quota, response.requestId);
  }

  return {
    ...extractCodexText(response.body, requestBody),
    quota,
  };
}

export async function streamOpenAICodex(params: {
  profile: OAuthProfile;
  prompt?: string;
  model?: string;
  system?: string;
  bodyOverride?: Record<string, unknown>;
  endpoint?: CodexResponsesEndpoint;
  passthroughBody?: boolean;
  signal?: AbortSignal;
}): Promise<CodexStreamResponse> {
  const requestBody = params.passthroughBody
    ? { ...(params.bodyOverride ?? {}) }
    : withCompatPromptCacheKey({
        ...buildDefaultRequestBody(params),
        ...(params.bodyOverride ?? {}),
      });

  if (!params.passthroughBody && typeof requestBody.input === "undefined") {
    throw new Error("Codex 请求缺少 input。请提供 prompt 或在实验请求体里显式传入 input。");
  }

  const compact = params.endpoint === "responses/compact";
  const compactInput = typeof requestBody.input === "string"
    ? [{ role: "user", content: [{ type: "input_text", text: requestBody.input }] }]
    : Array.isArray(requestBody.input) ? requestBody.input : [];
  if (compact) {
    // Current Codex uses Responses with a compaction_trigger; the former OAuth
    // /responses/compact endpoint no longer exists. Keep the public JSON contract.
    requestBody.input = asRecord(compactInput.at(-1))?.type === "compaction_trigger"
      ? compactInput : [...compactInput, { type: "compaction_trigger" }];
    requestBody.instructions ??= "";
    requestBody.stream = true;
    requestBody.store = false;
  }

  const response = await requestStream({
    method: "POST",
    url: CODEX_RESPONSES_URL,
    headers: buildCodexRequestHeaders(params.profile, requestBody),
    body: JSON.stringify(requestBody),
    signal: params.signal,
  });
  const headers = response.headers;
  const requestId = headers["x-request-id"] ?? response.requestId;
  const quota = extractCodexQuotaSnapshot(headers, requestId);

  if (response.status < 200 || response.status >= 300) {
    const body = await new Response(response.body).text();
    throw createCodexUpstreamError(response.status, body, response.transport, quota, requestId);
  }

  if (compact) {
    const events = parseSseEvents(await new Response(response.body).text());
    const failed = events.find(event => ["error", "response.failed", "response.incomplete"].includes(event.type ?? ""));
    const completed = asRecord(events.find(event => event.type === "response.completed")?.response);
    if (failed || !completed) {
      const error = failed?.error ?? asRecord(failed?.response)?.error ?? { message: "Codex 压缩响应未正常完成。", code: "compaction_incomplete" };
      throw createCodexUpstreamError(502, JSON.stringify({ error }), response.transport, quota, requestId);
    }
    const doneItems = events.filter(event => event.type === "response.output_item.done").map(event => event.item);
    const output = doneItems.length ? doneItems : Array.isArray(completed.output) ? completed.output : [];
    const compactions = output.filter(item => asRecord(item)?.type === "compaction");
    if (compactions.length !== 1 || typeof asRecord(compactions[0])?.encrypted_content !== "string" || !asRecord(compactions[0])?.encrypted_content) {
      throw createCodexUpstreamError(502, JSON.stringify({ error: { message: "Codex 未返回完整的上下文压缩结果。", code: "invalid_compaction_output" } }), response.transport, quota, requestId);
    }
    const retainedInput = retainCompactUserInput(compactInput);
    const compactResponse = {
      id: completed.id,
      object: "response.compaction",
      created_at: completed.created_at,
      output: [...retainedInput, ...compactions],
      usage: completed.usage,
    };
    return {
      body: new Response(JSON.stringify(compactResponse)).body!,
      headers: { ...headers, "content-type": "application/json; charset=utf-8" },
      quota, requestId, status: response.status, compactResponse,
    };
  }

  return {
    body: response.body,
    headers,
    quota,
    requestId,
    status: response.status,
  };
}
