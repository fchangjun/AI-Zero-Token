export type ExternalProviderModelStatus =
  | "ready"
  | "busy"
  | "unavailable"
  | "incompatible"
  | "auth_error"
  | "transport_error";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export type ExternalProviderModelProbe = {
  id: string;
  status: ExternalProviderModelStatus;
  latencyMs: number;
  statusCode?: number;
  error?: string;
  message?: string;
  capabilities: {
    responsesStreaming: boolean;
    functionCalling: boolean;
    functionCallOutput: boolean;
    reasoningEfforts: ReasoningEffort[];
  };
};

export type ExternalProviderFilteredModel = {
  id: string;
  reason: "non_text_model";
};

export type ExternalProviderInspection = {
  inspectionId?: string;
  providerId: string;
  baseUrl: string;
  modelsEndpoint: string;
  modelsUrl: string;
  responsesEndpoint: string;
  tokenSource: "provided" | "stored" | "none";
  discoveredCount: number;
  modelCount: number;
  candidateCount: number;
  truncatedCount: number;
  filteredModels: ExternalProviderFilteredModel[];
  models: ExternalProviderModelProbe[];
  results: ExternalProviderModelProbe[];
  summary: Record<ExternalProviderModelStatus, number>;
  recommendedModel?: string;
  durationMs: number;
};

export class ExternalProviderInspectionError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, options: { code: string; statusCode?: number }) {
    super(message);
    this.name = "ExternalProviderInspectionError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 502;
  }
}

type InspectExternalProviderParams = {
  baseUrl: string;
  bearerToken?: string;
  providerId: string;
  tokenSource: ExternalProviderInspection["tokenSource"];
};

type DiscoveredModel = {
  id: string;
  raw?: Record<string, unknown>;
};

function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as ReasoningEffort;
  return REASONING_EFFORTS.includes(normalized) ? normalized : undefined;
}

function declaredReasoningEfforts(model: DiscoveredModel): ReasoningEffort[] | undefined {
  const raw = model.raw;
  if (!raw) return undefined;
  const capabilities = isRecord(raw.capabilities) ? raw.capabilities : undefined;
  for (const candidate of [
    raw.supported_reasoning_levels,
    raw.reasoning_levels,
    raw.supported_reasoning_efforts,
    capabilities?.supported_reasoning_levels,
    capabilities?.reasoning_levels,
    capabilities?.reasoning_efforts,
  ]) {
    if (!Array.isArray(candidate)) continue;
    const efforts = candidate
      .map((item) => normalizeReasoningEffort(isRecord(item) ? item.effort : item))
      .filter((item): item is ReasoningEffort => Boolean(item));
    if (efforts.length > 0) return [...new Set(efforts)];
  }
  return undefined;
}

type ProbeFunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

type ProbeStreamResult = {
  status: ExternalProviderModelStatus;
  responsesStreaming: boolean;
  functionCall?: ProbeFunctionCall;
  error?: string;
};

type ProbeMode = "function_call" | "function_call_output" | "text";

const MODEL_LIST_TIMEOUT_MS = 15_000;
const MODEL_PROBE_TIMEOUT_MS = 20_000;
const MODEL_LIST_MAX_BYTES = 2 * 1024 * 1024;
const MODEL_PROBE_MAX_BYTES = 512 * 1024;
const MAX_MODELS_TO_PROBE = 200;
const MODEL_PROBE_CONCURRENCY = 3;
const MAX_REDIRECTS = 3;
const PROBE_TOOL_NAME = "azt_provider_probe";
const REASONING_EFFORTS: ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh"];

const PROBE_TOOL = {
  type: "function",
  name: PROBE_TOOL_NAME,
  description: "Return a fixed boolean to verify Codex-compatible function calling.",
  parameters: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
    },
    required: ["ok"],
    additionalProperties: false,
  },
  strict: true,
} as const;

const NON_TEXT_MODEL_ID_PATTERN = /(?:^|[-_.:/])(?:embedding|embeddings|embed|rerank|reranker|moderation|tts|speech|transcribe|transcription|whisper|audio|realtime|image|dall[-_.]?e|sora|video)(?:$|[-_.:/])/i;

function roundMs(value: number): number {
  return Math.max(0, Math.round(value));
}

function cleanModelId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const id = value.trim();
  if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)) {
    return undefined;
  }
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelIdFromItem(value: unknown): string | undefined {
  if (typeof value === "string") {
    return cleanModelId(value);
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return cleanModelId(value.id) ?? cleanModelId(value.model) ?? cleanModelId(value.name);
}

function extractModelItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [];
  }
  for (const key of ["data", "models", "items", "result"]) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }
  return [];
}

function parseModelsPayload(value: unknown): DiscoveredModel[] {
  const seen = new Set<string>();
  const models: DiscoveredModel[] = [];
  for (const item of extractModelItems(value)) {
    const id = modelIdFromItem(item);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    models.push({
      id,
      raw: isRecord(item) ? item : undefined,
    });
  }
  return models;
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function isObviouslyNonTextModel(model: DiscoveredModel): boolean {
  if (NON_TEXT_MODEL_ID_PATTERN.test(model.id)) {
    return true;
  }

  const raw = model.raw;
  if (!raw) {
    return false;
  }
  const typeHints = [raw.type, raw.task, raw.category, raw.family]
    .flatMap(stringValues)
    .join(" ");
  if (NON_TEXT_MODEL_ID_PATTERN.test(typeHints)) {
    return true;
  }

  const capabilities = isRecord(raw.capabilities) ? raw.capabilities : undefined;
  if (capabilities?.text === false || capabilities?.chat === false) {
    return true;
  }

  const outputModalities = [raw.output_modalities, raw.outputModalities, raw.modalities]
    .flatMap(stringValues)
    .map((item) => item.toLowerCase());
  return outputModalities.length > 0 && !outputModalities.some((item) => item.includes("text"));
}

export function normalizeOpenAICompatibleBaseUrl(value: string): string {
  let normalized = value.trim();
  if (!normalized) {
    throw new ExternalProviderInspectionError("外部 API Base URL 不能为空。", {
      code: "invalid_base_url",
      statusCode: 400,
    });
  }
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ExternalProviderInspectionError("外部 API Base URL 格式错误，请填写完整的 http(s) URL。", {
      code: "invalid_base_url",
      statusCode: 400,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ExternalProviderInspectionError("外部 API Base URL 必须是 http(s) URL。", {
      code: "invalid_base_url",
      statusCode: 400,
    });
  }
  if (url.username || url.password) {
    throw new ExternalProviderInspectionError("外部 API Base URL 不能包含用户名或密码。", {
      code: "invalid_base_url",
      statusCode: 400,
    });
  }

  url.hash = "";
  url.search = "";
  let pathname = url.pathname.replace(/\/+$/g, "");
  if (pathname.endsWith("/models") || pathname.endsWith("/responses")) {
    pathname = pathname.replace(/\/(?:models|responses)$/u, "");
  }
  url.pathname = !pathname || pathname === "/" ? "/v1" : pathname;
  return url.toString().replace(/\/+$/g, "");
}

function endpointUrl(baseUrl: string, endpoint: "models" | "responses"): string {
  return `${baseUrl}/${endpoint}`;
}

function createHeaders(token: string | undefined, accept: string): Record<string, string> {
  return {
    Accept: accept,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function inspectionError(
  message: string,
  code: string,
  statusCode = 502,
): ExternalProviderInspectionError {
  return new ExternalProviderInspectionError(message, { code, statusCode });
}

function redirectLocation(response: Response, currentUrl: string): URL | undefined {
  if (response.status < 300 || response.status >= 400) {
    return undefined;
  }
  const location = response.headers.get("location");
  if (!location) {
    throw inspectionError("外部 API 返回了没有 Location 的重定向。", "invalid_redirect");
  }
  return new URL(location, currentUrl);
}

async function fetchWithSafeRedirects(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; cleanup: () => void }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("request_timeout")), timeoutMs);
  let currentUrl = url;
  const initialOrigin = new URL(url).origin;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          ...init,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw inspectionError("连接外部 API 超时。", "request_timeout", 504);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw inspectionError(`无法连接外部 API：${redactErrorMessage(message)}`, "transport_error");
      }

      const nextUrl = redirectLocation(response, currentUrl);
      if (!nextUrl) {
        return {
          response,
          cleanup: () => {
            clearTimeout(timeout);
            controller.abort();
          },
        };
      }
      await response.body?.cancel().catch(() => undefined);
      if (nextUrl.origin !== initialOrigin) {
        throw inspectionError("外部 API 试图跨源重定向，已阻止凭据转发。", "cross_origin_redirect");
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw inspectionError("外部 API 重定向次数过多。", "too_many_redirects");
      }
      currentUrl = nextUrl.toString();
    }
  } catch (error) {
    clearTimeout(timeout);
    controller.abort();
    throw error;
  }

  clearTimeout(timeout);
  controller.abort();
  throw inspectionError("外部 API 重定向次数过多。", "too_many_redirects");
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw inspectionError("外部 API 响应体过大，已停止读取。", "response_too_large");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

function extractErrorDetails(text: string): { code?: string; message?: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }
    const error = isRecord(parsed.error) ? parsed.error : parsed;
    return {
      code: cleanModelId(error.code) ?? cleanModelId(error.type),
      message: typeof error.message === "string" ? error.message : undefined,
    };
  } catch {
    return { message: text };
  }
}

function redactErrorMessage(message: string | undefined, bearerToken?: string): string {
  if (!message) {
    return "请求失败";
  }
  let redacted = message;
  if (bearerToken) {
    redacted = redacted.split(bearerToken).join("[REDACTED]");
  }
  redacted = redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.slice(0, 300) || "请求失败";
}

function classifyHttpFailure(
  statusCode: number,
  code: string | undefined,
  message: string | undefined,
): ExternalProviderModelStatus {
  if (statusCode === 401 || statusCode === 403) {
    return "auth_error";
  }
  const hint = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (/not implemented|not supported|unsupported|does not support/.test(hint)) {
    return "incompatible";
  }
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return "busy";
  }
  if (/rate.?limit|overload|busy|capacity|temporar|timeout|try again/.test(hint)) {
    return "busy";
  }
  if (/model.*(?:not found|not exist|not available|unavailable|disabled|denied)|unknown model|no available channel/.test(hint)) {
    return "unavailable";
  }
  if (statusCode === 404 && !/(?:endpoint|route|path|page).*not found|cannot post/.test(hint)) {
    return "unavailable";
  }
  return "incompatible";
}

async function discoverModels(
  modelsEndpoint: string,
  bearerToken: string | undefined,
): Promise<DiscoveredModel[]> {
  const { response, cleanup } = await fetchWithSafeRedirects(modelsEndpoint, {
    method: "GET",
    headers: createHeaders(bearerToken, "application/json"),
  }, MODEL_LIST_TIMEOUT_MS);
  try {
    const text = await readTextLimited(response, MODEL_LIST_MAX_BYTES);
    if (!response.ok) {
      const details = extractErrorDetails(text);
      const message = redactErrorMessage(details.message, bearerToken);
      if (response.status === 401 || response.status === 403) {
        throw inspectionError(`外部 API 鉴权失败：${message}`, "auth_error", response.status);
      }
      throw inspectionError(`读取模型列表失败（HTTP ${response.status}）：${message}`, "models_request_failed", 502);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw inspectionError("模型列表不是有效的 JSON。", "invalid_models_response");
    }
    const models = parseModelsPayload(payload);
    if (models.length === 0) {
      throw inspectionError("模型列表中没有可识别的模型 ID。", "empty_models_response");
    }
    return models;
  } finally {
    cleanup();
  }
}

function parseSseDataBlocks(buffer: string): { events: unknown[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const events: unknown[] = [];
  for (const block of blocks) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      events.push(JSON.parse(data) as unknown);
    } catch {
      // Keep scanning. A proxy may mix keep-alives or non-JSON diagnostics into SSE.
    }
  }
  return { events, remainder };
}

function eventType(value: unknown): string | undefined {
  return isRecord(value) && typeof value.type === "string" ? value.type : undefined;
}

function failedResponsesEvent(value: unknown): { code?: string; message?: string } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const type = eventType(value);
  if (type !== "error" && type !== "response.failed") {
    return undefined;
  }
  const response = isRecord(value.response) ? value.response : undefined;
  const error = isRecord(value.error) ? value.error : isRecord(response?.error) ? response.error : undefined;
  return {
    code: cleanModelId(error?.code) ?? cleanModelId(error?.type),
    message: typeof error?.message === "string" ? error.message : undefined,
  };
}

function functionCallFromItem(value: unknown): ProbeFunctionCall | undefined {
  if (!isRecord(value) || value.type !== "function_call") {
    return undefined;
  }
  const callId = cleanModelId(value.call_id) ?? cleanModelId(value.callId);
  const name = cleanModelId(value.name);
  if (!callId || !name) {
    return undefined;
  }
  return {
    callId,
    name,
    arguments: typeof value.arguments === "string" ? value.arguments : "",
  };
}

function functionCallFromEvent(value: unknown): ProbeFunctionCall | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const direct = functionCallFromItem(value.item);
  if (direct) {
    return direct;
  }
  const response = isRecord(value.response) ? value.response : undefined;
  const output = Array.isArray(response?.output)
    ? response.output
    : Array.isArray(value.output)
      ? value.output
      : [];
  for (const item of output) {
    const call = functionCallFromItem(item);
    if (call) {
      return call;
    }
  }
  return functionCallFromItem(value);
}

function isCompletedResponsesEvent(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const type = eventType(value);
  if (type === "response.completed") {
    const response = isRecord(value.response) ? value.response : undefined;
    return response?.status === "completed";
  }
  return value.object === "response" && value.status === "completed";
}

async function inspectSuccessfulProbeStream(
  response: Response,
  bearerToken: string | undefined,
  mode: ProbeMode,
): Promise<ProbeStreamResult> {
  if (!response.body) {
    return { status: "incompatible", responsesStreaming: false, error: "Responses 流没有响应体" };
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/event-stream")) {
    const text = await readTextLimited(response, MODEL_PROBE_MAX_BYTES);
    return {
      status: "incompatible",
      responsesStreaming: false,
      error: redactErrorMessage(`未返回 SSE 流：${extractErrorDetails(text).message ?? (contentType || "未知内容类型")}`, bearerToken),
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let buffer = "";
  let sawResponsesProtocol = false;
  let sawOutputText = false;
  let functionCall: ProbeFunctionCall | undefined;
  let functionCallDone = false;
  const inspectEvent = (event: unknown): ProbeStreamResult | undefined => {
    const type = eventType(event);
    sawResponsesProtocol ||= Boolean(type?.startsWith("response."));
    sawOutputText ||= type === "response.output_text.delta";
    const nextFunctionCall = functionCallFromEvent(event);
    if (nextFunctionCall) {
      functionCall = nextFunctionCall;
    }
    const completed = isCompletedResponsesEvent(event);
    if (mode === "text" && completed && isRecord(event)) {
      const responseRecord = isRecord(event.response) ? event.response : undefined;
      const reasoning = isRecord(responseRecord?.reasoning) ? responseRecord.reasoning : undefined;
      const acknowledgedEffort = normalizeReasoningEffort(reasoning?.effort ?? responseRecord?.reasoning_effort);
      if (acknowledgedEffort) {
        sawOutputText = true;
      }
    }
    if (completed && nextFunctionCall) {
      functionCallDone = true;
    }
    if (type === "response.output_item.done" || type === "response.function_call_arguments.done") {
      functionCallDone = Boolean(functionCall);
      if (type === "response.function_call_arguments.done" && functionCall && isRecord(event) && typeof event.arguments === "string") {
        functionCall.arguments = event.arguments;
      }
    }

    const failed = failedResponsesEvent(event);
    if (failed) {
      return {
        status: classifyHttpFailure(400, failed.code, failed.message),
        responsesStreaming: true,
        error: redactErrorMessage(failed.message ?? failed.code, bearerToken),
      };
    }
    if (type === "response.incomplete" || (isRecord(event) && event.object === "response" && event.status === "incomplete")) {
      return {
        status: "incompatible",
        responsesStreaming: true,
        error: "Responses 探针未完整完成（response.incomplete）",
      };
    }
    if (completed) {
      if (mode === "text" && sawOutputText) {
        return {
          status: "ready",
          responsesStreaming: true,
        };
      }
      if (mode === "function_call" && functionCallDone && functionCall?.name === PROBE_TOOL_NAME) {
        return {
          status: "ready",
          responsesStreaming: true,
          functionCall,
        };
      }
      if (mode === "function_call_output") {
        return {
          status: "ready",
          responsesStreaming: true,
        };
      }
      return {
        status: "incompatible",
        responsesStreaming: true,
        error: functionCall && functionCall.name !== PROBE_TOOL_NAME
          ? `返回了错误的 function tool：${functionCall.name}`
          : sawOutputText
          ? "支持 Responses 流，但未遵循强制 function tool 调用"
          : "Responses 流完成，但没有返回 function_call",
      };
    }
    return undefined;
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    bytes += chunk.value.byteLength;
    if (bytes > MODEL_PROBE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { status: "transport_error", responsesStreaming: true, error: "Responses 流响应体过大" };
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const parsed = parseSseDataBlocks(buffer);
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      const result = inspectEvent(event);
      if (result) {
        await reader.cancel().catch(() => undefined);
        return result;
      }
    }
  }
  const finalEvents = parseSseDataBlocks(`${buffer}${decoder.decode()}\n\n`).events;
  for (const event of finalEvents) {
    const result = inspectEvent(event);
    if (result) {
      return result;
    }
  }
  return {
    status: "incompatible",
    responsesStreaming: sawResponsesProtocol,
    error: sawResponsesProtocol ? "Responses 流未产生可用输出" : "响应不是有效的 Responses SSE 协议",
  };
}

async function runProbeRequest(params: {
  responsesEndpoint: string;
  bearerToken: string | undefined;
  body: Record<string, unknown>;
  mode: ProbeMode;
}): Promise<ProbeStreamResult & { statusCode?: number }> {
  const { response, cleanup } = await fetchWithSafeRedirects(params.responsesEndpoint, {
    method: "POST",
    headers: {
      ...createHeaders(params.bearerToken, "text/event-stream"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
  }, MODEL_PROBE_TIMEOUT_MS);
  try {
    if (!response.ok) {
      const text = await readTextLimited(response, MODEL_PROBE_MAX_BYTES);
      const details = extractErrorDetails(text);
      return {
        status: classifyHttpFailure(response.status, details.code, details.message),
        responsesStreaming: false,
        statusCode: response.status,
        error: redactErrorMessage(details.message ?? details.code ?? `HTTP ${response.status}`, params.bearerToken),
      };
    }
    return {
      ...(await inspectSuccessfulProbeStream(response, params.bearerToken, params.mode)),
      statusCode: response.status,
    };
  } finally {
    cleanup();
  }
}

async function probeReasoningEfforts(
  responsesEndpoint: string,
  model: DiscoveredModel,
  bearerToken: string | undefined,
): Promise<ReasoningEffort[]> {
  const declared = declaredReasoningEfforts(model);
  if (declared) return declared;
  const supported: ReasoningEffort[] = [];
  for (const effort of REASONING_EFFORTS) {
    const result = await runProbeRequest({
      responsesEndpoint,
      bearerToken,
      mode: "text",
      body: {
        model: model.id,
        input: "Reply with exactly OK.",
        reasoning: { effort },
        max_output_tokens: 32,
        store: false,
        stream: true,
      },
    });
    if (result.status === "ready") supported.push(effort);
  }
  return supported;
}

async function probeModel(
  responsesEndpoint: string,
  model: DiscoveredModel,
  bearerToken: string | undefined,
): Promise<ExternalProviderModelProbe> {
  const startedAt = performance.now();
  const emptyCapabilities = {
    responsesStreaming: false,
    functionCalling: false,
    functionCallOutput: false,
    reasoningEfforts: [] as ReasoningEffort[],
  };
  try {
    const first = await runProbeRequest({
      responsesEndpoint,
      bearerToken,
      mode: "function_call",
      body: {
        model: model.id,
        input: `Call ${PROBE_TOOL_NAME} with {"ok":true}. Do not answer with text.`,
        instructions: `You must call ${PROBE_TOOL_NAME} exactly once.`,
        tools: [PROBE_TOOL],
        tool_choice: { type: "function", name: PROBE_TOOL_NAME },
        parallel_tool_calls: false,
        max_output_tokens: 128,
        store: false,
        stream: true,
      },
    });
    if (first.status !== "ready" || !first.functionCall) {
      return {
        id: model.id,
        status: first.status,
        latencyMs: roundMs(performance.now() - startedAt),
        statusCode: first.statusCode,
        error: first.error,
        capabilities: {
          ...emptyCapabilities,
          responsesStreaming: first.responsesStreaming,
        },
      };
    }

    const functionCall = first.functionCall;
    const second = await runProbeRequest({
      responsesEndpoint,
      bearerToken,
      mode: "function_call_output",
      body: {
        model: model.id,
        input: [
          {
            type: "function_call",
            call_id: functionCall.callId,
            name: functionCall.name,
            arguments: functionCall.arguments || '{"ok":true}',
          },
          {
            type: "function_call_output",
            call_id: functionCall.callId,
            output: '{"ok":true}',
          },
        ],
        instructions: "The tool succeeded. Reply with exactly OK.",
        tools: [PROBE_TOOL],
        tool_choice: "none",
        max_output_tokens: 128,
        store: false,
        stream: true,
      },
    });
    const reasoningEfforts = second.status === "ready"
      ? await probeReasoningEfforts(responsesEndpoint, model, bearerToken)
      : [];
    return {
      id: model.id,
      status: second.status,
      latencyMs: roundMs(performance.now() - startedAt),
      statusCode: second.statusCode,
      error: second.status === "ready" ? undefined : second.error ?? "function_call_output 后续请求失败",
      capabilities: {
        responsesStreaming: first.responsesStreaming && second.responsesStreaming,
        functionCalling: true,
        functionCallOutput: second.status === "ready",
        reasoningEfforts,
      },
    };
  } catch (error) {
    const normalized = error instanceof ExternalProviderInspectionError
      ? error
      : inspectionError(error instanceof Error ? error.message : String(error), "transport_error");
    return {
      id: model.id,
      status: normalized.code === "auth_error"
        ? "auth_error"
        : normalized.code === "request_timeout"
          ? "busy"
          : "transport_error",
      latencyMs: roundMs(performance.now() - startedAt),
      statusCode: normalized.statusCode >= 400 && normalized.statusCode < 600 ? normalized.statusCode : undefined,
      error: redactErrorMessage(normalized.message, bearerToken),
      capabilities: emptyCapabilities,
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

function emptySummary(): Record<ExternalProviderModelStatus, number> {
  return {
    ready: 0,
    busy: 0,
    unavailable: 0,
    incompatible: 0,
    auth_error: 0,
    transport_error: 0,
  };
}

function modelPreferenceScore(id: string, originalIndex: number): number {
  const name = id.toLowerCase();
  let score = 10_000 - originalIndex;
  if (name === "auto") score -= 100_000;
  else if (/^auto(?:[-_.:/]|$)/.test(name)) score -= 80_000;
  if (/(?:codex|coder|code)(?:[-_.:/]|$)/.test(name)) score += 20_000;
  if (/(?:gpt[-_.]?6|gpt[-_.]?5\.6|gpt[-_.]?5\.5)/.test(name)) score += 12_000;
  if (/(?:opus|sonnet|pro)(?:[-_.:/]|$)/.test(name)) score += 4_000;
  if (/(?:mini|nano|flash|haiku|lite)(?:[-_.:/]|$)/.test(name)) score -= 2_000;
  return score;
}

function chooseRecommendedModel(models: ExternalProviderModelProbe[]): string | undefined {
  return models
    .map((model, index) => ({ model, score: modelPreferenceScore(model.id, index) }))
    .filter((item) => item.model.status === "ready")
    .sort((left, right) => right.score - left.score)[0]?.model.id;
}

export async function inspectExternalProvider(
  params: InspectExternalProviderParams,
): Promise<ExternalProviderInspection> {
  const startedAt = performance.now();
  const baseUrl = normalizeOpenAICompatibleBaseUrl(params.baseUrl);
  const bearerToken = params.bearerToken?.trim() || undefined;
  const modelsEndpoint = endpointUrl(baseUrl, "models");
  const responsesEndpoint = endpointUrl(baseUrl, "responses");
  const discovered = await discoverModels(modelsEndpoint, bearerToken);
  const filteredModels = discovered
    .filter(isObviouslyNonTextModel)
    .map((model) => ({ id: model.id, reason: "non_text_model" as const }));
  const allCandidates = discovered.filter((model) => !isObviouslyNonTextModel(model));
  const candidates = allCandidates.slice(0, MAX_MODELS_TO_PROBE);
  const models = await mapWithConcurrency(candidates, MODEL_PROBE_CONCURRENCY, (model) =>
    probeModel(responsesEndpoint, model, bearerToken));
  const summary = emptySummary();
  for (const model of models) {
    summary[model.status] += 1;
  }

  return {
    providerId: params.providerId,
    baseUrl,
    modelsEndpoint,
    modelsUrl: modelsEndpoint,
    responsesEndpoint,
    tokenSource: params.tokenSource,
    discoveredCount: discovered.length,
    modelCount: discovered.length,
    candidateCount: candidates.length,
    truncatedCount: Math.max(0, allCandidates.length - candidates.length),
    filteredModels,
    models: models.map((model) => ({ ...model, message: model.error })),
    results: models.map((model) => ({ ...model, message: model.error })),
    summary,
    recommendedModel: chooseRecommendedModel(models),
    durationMs: roundMs(performance.now() - startedAt),
  };
}
