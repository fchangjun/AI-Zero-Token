import type { ArtifactCandidate, CodexQuotaSnapshot, OAuthProfile } from "../../types.js";
import { DEFAULT_CODEX_MODEL } from "../../models/openai-codex-models.js";
import { requestText } from "../http-client.js";

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

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
    const error = parsed.error;
    if (!error || typeof error !== "object") {
      return undefined;
    }

    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      param: typeof record.param === "string" || record.param === null ? record.param : undefined,
    };
  } catch {
    return undefined;
  }
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

function parseSseEvents(body: string): CodexSseEvent[] {
  const events: CodexSseEvent[] = [];
  for (const chunk of body.split("\n\n")) {
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
  const artifacts = [
    ...collectArtifactCandidates(responsePayload, "response"),
    ...collectArtifactCandidates(events, "event"),
  ];

  if (completedText) {
    return {
      text: completedText,
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
}): Promise<{ text: string; raw: unknown; artifacts: ArtifactCandidate[]; quota?: CodexQuotaSnapshot }> {
  const requestBody = {
    ...buildDefaultRequestBody(params),
    ...(params.bodyOverride ?? {}),
  };

  if (typeof requestBody.input === "undefined") {
    throw new Error("Codex 请求缺少 input。请提供 prompt 或在实验请求体里显式传入 input。");
  }

  const response = await requestText({
    method: "POST",
    url: CODEX_RESPONSES_URL,
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.profile.access}`,
      "ChatGPT-Account-Id": params.profile.accountId,
      "OpenAI-Beta": "responses=experimental",
      Originator: "pi",
      "User-Agent": "pi (bun demo)",
    },
    body: JSON.stringify(requestBody),
  });
  const quota = extractCodexQuotaSnapshot(response.headers, response.requestId);

  if (response.status < 200 || response.status >= 300) {
    const upstreamError = parseUpstreamErrorBody(response.body);
    const error = new Error(`调用 Responses API 失败: HTTP ${response.status} via ${response.transport} ${response.body}`) as Error & {
      quota?: CodexQuotaSnapshot;
      upstreamStatus?: number;
      upstreamErrorCode?: string;
      upstreamErrorType?: string;
      upstreamErrorMessage?: string;
    };
    error.quota = quota;
    error.upstreamStatus = response.status;
    error.upstreamErrorCode = upstreamError?.code;
    error.upstreamErrorType = upstreamError?.type;
    error.upstreamErrorMessage = upstreamError?.message;
    throw error;
  }

  return {
    ...extractCodexText(response.body, requestBody),
    quota,
  };
}
