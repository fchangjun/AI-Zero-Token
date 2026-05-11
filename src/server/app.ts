import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  brotliDecompress,
  gunzip,
  inflate,
  zstdDecompress,
} from "node:zlib";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { createGatewayContext } from "../core/context.js";
import type { ChatResult, OAuthProfile, ProfileSummary } from "../core/types.js";
import { isTransientHttpError, requestText } from "../core/providers/http-client.js";
import { streamOpenAICodex } from "../core/providers/openai-codex/chat.js";
import { generateChatGPTWebImage, type ChatGPTWebImageResult } from "../core/providers/openai-codex/chatgpt-web-image.js";
import type { UsageImageRoute, UsageRecordEvent, UsageTokenUsage } from "../core/services/usage-service.js";

const packageRoot = path.dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const adminUiDistDir = path.join(packageRoot, "admin-ui", "dist");
const adminUiIndexPath = path.join(adminUiDistDir, "index.html");
const BYTES_PER_MIB = 1024 * 1024;
const MAX_GATEWAY_REQUEST_LOGS = 100;
const MAX_CODEX_RESPONSE_PROFILE_BINDINGS = 5000;
const DEFAULT_ROUTE_BODY_LIMIT_BYTES = 128 * BYTES_PER_MIB;
const CODEX_COMPACT_BODY_LIMIT_BYTES = 256 * BYTES_PER_MIB;
const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliDecompressAsync = promisify(brotliDecompress);
const zstdDecompressAsync = typeof zstdDecompress === "function" ? promisify(zstdDecompress) : null;

const assetContentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

type GatewayRequestLog = {
  id: string;
  time: number;
  method: string;
  endpoint: string;
  account: string;
  model: string;
  statusCode: number;
  durationMs: number;
  source: string;
  details?: Record<string, unknown>;
};

type GatewayRequestUsageMeta = {
  profile?: OAuthProfile | null;
  tokenUsage?: UsageTokenUsage | null;
  imageCount?: number;
  imageRoute?: UsageImageRoute;
  errorType?: string;
};

type GatewayShareAddress = {
  host: string;
  label: string;
  adminUrl: string;
  baseUrl: string;
  codexBaseUrl: string;
};

type CodexImageGenerationRequest = {
  prompt: string;
  inputImages: Array<{ imageUrl: string }>;
  imageModel: string;
  size?: string;
  outputFormat?: "png" | "webp" | "jpeg";
};

function getContentType(filePath: string): string {
  return assetContentTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function decodeJsonRequestBody(body: Buffer, contentEncoding: string | string[] | undefined): Promise<Buffer> {
  const encodings = (Array.isArray(contentEncoding) ? contentEncoding.join(",") : contentEncoding ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && item !== "identity");

  let decoded = body;
  for (const encoding of encodings.reverse()) {
    if (encoding === "gzip" || encoding === "x-gzip") {
      decoded = await gunzipAsync(decoded);
    } else if (encoding === "deflate") {
      decoded = await inflateAsync(decoded);
    } else if (encoding === "br") {
      decoded = await brotliDecompressAsync(decoded);
    } else if (encoding === "zstd") {
      if (!zstdDecompressAsync) {
        throw new Error("当前 Node.js 运行时不支持 zstd 请求体解压，请升级运行时后重试。");
      }
      decoded = await zstdDecompressAsync(decoded);
    } else {
      throw new Error(`不支持的请求体压缩格式: ${encoding}`);
    }
  }

  return decoded;
}

async function parseJsonRequestBody(request: FastifyRequest, body: string | Buffer): Promise<unknown> {
  const rawBody = typeof body === "string" ? Buffer.from(body) : body;
  if (rawBody.length === 0) {
    return {};
  }

  const decoded = await decodeJsonRequestBody(rawBody, request.headers["content-encoding"]);
  return JSON.parse(decoded.toString("utf8")) as unknown;
}

async function readAdminUiAsset(assetPath: string): Promise<{ body: Buffer; filePath: string } | null> {
  const normalized = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.resolve(adminUiDistDir, normalized);
  const root = path.resolve(adminUiDistDir);

  if (!filePath.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  try {
    return {
      body: await fs.readFile(filePath),
      filePath,
    };
  } catch {
    return null;
  }
}

const responsesBodySchema = z.object({
  model: z.string().optional(),
  input: z.unknown().optional(),
  instructions: z.string().optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  include: z.array(z.string()).optional(),
  text: z.record(z.string(), z.unknown()).optional(),
  store: z.boolean().optional(),
  parallel_tool_calls: z.boolean().optional(),
  experimental_codex: z
    .object({
      body: z.record(z.string(), z.unknown()).optional(),
      allow_unknown_model: z.boolean().optional(),
      include_raw: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

const chatCompletionContentPartSchema = z
  .object({
    type: z.string().optional(),
    text: z.string().optional(),
    image_url: z
      .union([
        z.string(),
        z
          .object({
            url: z.string().optional(),
          })
          .passthrough(),
      ])
      .optional(),
  })
  .passthrough();

const chatCompletionMessageSchema = z
  .object({
    role: z.string().optional(),
    content: z.union([z.string(), z.array(chatCompletionContentPartSchema)]).optional(),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
  })
  .passthrough();

const chatCompletionsBodySchema = z
  .object({
    model: z.string().optional(),
    messages: z.array(chatCompletionMessageSchema).min(1),
    n: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
    tools: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    response_format: z.unknown().optional(),
    parallel_tool_calls: z.boolean().optional(),
    store: z.boolean().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().optional(),
    max_completion_tokens: z.number().optional(),
    presence_penalty: z.number().optional(),
    frequency_penalty: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    user: z.string().optional(),
  })
  .passthrough();

const settingsUpdateSchema = z.object({
  defaultModel: z.string().min(1).optional(),
  networkProxy: z
    .object({
      enabled: z.boolean(),
      url: z.string().optional(),
      noProxy: z.string().optional(),
    })
    .optional(),
  autoSwitch: z
    .object({
      enabled: z.boolean().optional(),
      excludedProfileIds: z.array(z.string()).optional(),
    })
    .optional(),
  runtime: z
    .object({
      quotaSyncConcurrency: z.number().int().min(1).max(32).optional(),
    })
    .optional(),
  image: z
    .object({
      freeAccountWebGenerationEnabled: z.boolean().optional(),
    })
    .optional(),
  server: z
    .object({
      port: z.number().int().min(1).max(65535),
    })
    .optional(),
});

const proxyTestSchema = z.object({
  networkProxy: z.object({
    enabled: z.boolean(),
    url: z.string().optional(),
    noProxy: z.string().optional(),
  }),
});

const profileActionSchema = z.object({
  profileId: z.string().min(1),
});

const profileRemoveBatchSchema = z.object({
  profileIds: z.array(z.string().min(1)).min(1),
});

const profileImportSchema = z.object({
  profile: z.unknown(),
});

const runtimeRefreshSchema = z.object({
  staleOnly: z.boolean().optional(),
});

const profileExportSchema = z.object({
  profileId: z.string().min(1).optional(),
  profileIds: z.array(z.string().min(1)).optional(),
  all: z.boolean().optional(),
});

const codexApplySchema = z.object({
  profileId: z.string().min(1),
});

const codexProviderConfigSchema = z.object({
  baseUrl: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
});

const githubImageBedConfigSchema = z.object({
  token: z.string().min(1),
});

const githubImageBedUploadSchema = z.object({
  filename: z.string().min(1),
  dataUrl: z.string().min(1),
});

const githubImageBedHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const githubImageBedHistoryParamsSchema = z.object({
  id: z.string().min(1),
});

const imageGenerationsBodySchema = z
  .object({
    prompt: z.string().min(1),
    model: z.string().optional(),
    n: z.number().int().positive().optional(),
    quality: z.enum(["low", "medium", "high", "auto"]).optional(),
    size: z.string().min(1).optional(),
    background: z.enum(["transparent", "opaque", "auto"]).optional(),
    output_format: z.enum(["png", "webp", "jpeg"]).optional(),
    output_compression: z.number().int().min(0).max(100).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    response_format: z.enum(["b64_json", "url"]).optional(),
    user: z.string().optional(),
  })
  .passthrough();

const imageReferenceSchema = z.union([
  z.string().min(1),
  z
    .object({
      image_url: z.string().min(1).optional(),
      file_id: z.string().min(1).optional(),
    })
    .passthrough(),
]);

const imageEditsBodySchema = z
  .object({
    prompt: z.string().min(1),
    images: z.array(imageReferenceSchema).min(1).max(16).optional(),
    image: z.union([imageReferenceSchema, z.array(imageReferenceSchema).min(1).max(16)]).optional(),
    mask: imageReferenceSchema.optional(),
    model: z.string().optional(),
    n: z.number().int().positive().optional(),
    quality: z.enum(["low", "medium", "high", "auto"]).optional(),
    size: z.string().min(1).optional(),
    background: z.enum(["transparent", "opaque", "auto"]).optional(),
    output_format: z.enum(["png", "webp", "jpeg"]).optional(),
    output_compression: z.number().int().min(0).max(100).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    response_format: z.enum(["b64_json", "url"]).optional(),
    user: z.string().optional(),
  })
  .passthrough();

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tokenNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function normalizeTokenUsage(value: unknown): UsageTokenUsage | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const inputTokens = tokenNumber(value.input_tokens ?? value.prompt_tokens);
  const outputTokens = tokenNumber(value.output_tokens ?? value.completion_tokens);
  const totalTokens = tokenNumber(value.total_tokens) ?? (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  if (inputTokens === null && outputTokens === null && totalTokens === null) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function extractTokenUsage(value: unknown, depth = 0): UsageTokenUsage | null {
  if (depth > 5 || !value) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const usage = extractTokenUsage(item, depth + 1);
      if (usage) {
        return usage;
      }
    }
    return null;
  }
  if (!isObjectRecord(value)) {
    return null;
  }
  const direct = normalizeTokenUsage(value);
  if (direct) {
    return direct;
  }
  for (const key of ["usage", "response", "events"]) {
    const usage = extractTokenUsage(value[key], depth + 1);
    if (usage) {
      return usage;
    }
  }
  return null;
}

function imageUsageToTokenUsage(usage: {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
} | undefined): UsageTokenUsage | null {
  if (!usage) {
    return null;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

function extractUsageErrorType(details: Record<string, unknown> | undefined, statusCode: number): string | undefined {
  const error = isObjectRecord(details?.error) ? details.error : null;
  const upstreamErrorCode = error?.upstreamErrorCode;
  const upstreamStatus = error?.upstreamStatus;
  const type = error?.type;
  if (typeof upstreamErrorCode === "string" && upstreamErrorCode.trim()) {
    return upstreamErrorCode.trim();
  }
  if (typeof type === "string" && type.trim()) {
    return type.trim();
  }
  if (typeof upstreamStatus === "number") {
    return `HTTP ${upstreamStatus}`;
  }
  return statusCode >= 400 ? `HTTP ${statusCode}` : undefined;
}

function extractTextFromInputContent(content: unknown): string[] {
  if (typeof content === "string" && content.trim()) {
    return [content.trim()];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part) => {
    if (!part || typeof part !== "object") {
      return [];
    }

    const record = part as Record<string, unknown>;
    return typeof record.text === "string" && record.text.trim() ? [record.text.trim()] : [];
  });
}

function extractTextInput(input: unknown): string {
  if (typeof input === "undefined") {
    return "";
  }

  if (typeof input === "string") {
    return input;
  }

  const chunks: string[] = [];
  if (!Array.isArray(input)) {
    return "";
  }

  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    chunks.push(...extractTextFromInputContent((item as Record<string, unknown>).content));
  }

  return chunks.join("\n").trim();
}

function extractImageUrlFromInputPart(part: unknown): string | null {
  if (!isObjectRecord(part)) {
    return null;
  }

  const imageUrl = part.image_url ?? part.imageUrl;
  if (typeof imageUrl === "string" && imageUrl.trim()) {
    return imageUrl.trim();
  }
  if (isObjectRecord(imageUrl) && typeof imageUrl.url === "string" && imageUrl.url.trim()) {
    return imageUrl.url.trim();
  }

  return null;
}

function extractImageInputs(input: unknown): Array<{ imageUrl: string }> {
  const images: Array<{ imageUrl: string }> = [];
  const addImage = (imageUrl: string | null): void => {
    if (imageUrl && !images.some((item) => item.imageUrl === imageUrl)) {
      images.push({ imageUrl });
    }
  };

  if (!Array.isArray(input)) {
    addImage(extractImageUrlFromInputPart(input));
    return images;
  }

  for (const item of input) {
    addImage(extractImageUrlFromInputPart(item));
    if (!isObjectRecord(item)) {
      continue;
    }
    const content = item.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        addImage(extractImageUrlFromInputPart(part));
      }
    } else {
      addImage(extractImageUrlFromInputPart(content));
    }
  }

  return images;
}

function isFreePlan(profile: OAuthProfile): boolean {
  return profile.quota?.planType?.toLowerCase() === "free";
}

function normalizeResponseInput(input: unknown): unknown {
  if (typeof input === "undefined") {
    return undefined;
  }

  if (typeof input === "string") {
    return [
      {
        role: "user",
        content: [{ type: "input_text", text: input }],
      },
    ];
  }

  return input;
}

function normalizeChatRole(role?: string): string {
  if (role === "developer") {
    return "system";
  }

  return role ?? "user";
}

function safeJsonStringify(value: unknown): string {
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

function normalizeChatContentPart(
  part: z.infer<typeof chatCompletionContentPartSchema>,
  textType: "input_text" | "output_text",
): Record<string, unknown> {
  if (part.type === "image_url") {
    const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
    if (!url) {
      throw new Error("chat.completions 消息里的 image_url 缺少 url。");
    }

    return {
      type: "input_image",
      image_url: url,
    };
  }

  if (part.type === "input_image") {
    return part;
  }

  const text = typeof part.text === "string" ? part.text : "";
  return {
    type: textType,
    text,
  };
}

function normalizeChatContent(
  content: z.infer<typeof chatCompletionMessageSchema>["content"],
  role?: string,
): Array<Record<string, unknown>> {
  const textType = role === "assistant" ? "output_text" : "input_text";

  if (typeof content === "string") {
    return [{ type: textType, text: content }];
  }

  if (!Array.isArray(content) || content.length === 0) {
    return [{ type: textType, text: "" }];
  }

  return content.map((part) => normalizeChatContentPart(part, textType));
}

function normalizeChatMessages(
  messages: z.infer<typeof chatCompletionsBodySchema>["messages"],
): Array<Record<string, unknown>> {
  const normalized: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    const record = message as Record<string, unknown>;

    if (message.role === "tool") {
      normalized.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: typeof message.content === "string" ? message.content : safeJsonStringify(message.content),
      });
      continue;
    }

    normalized.push({
      role: normalizeChatRole(message.role),
      content: normalizeChatContent(message.content, message.role),
      ...(message.name ? { name: message.name } : {}),
      ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    });

    const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
    for (const toolCall of toolCalls) {
      const call = toolCall && typeof toolCall === "object" ? (toolCall as Record<string, unknown>) : {};
      const fn = call.function && typeof call.function === "object" ? (call.function as Record<string, unknown>) : {};
      const name = typeof fn.name === "string" ? fn.name : undefined;
      if (!name) {
        continue;
      }

      normalized.push({
        type: "function_call",
        call_id: typeof call.id === "string" ? call.id : `call_${normalized.length}`,
        name,
        arguments: safeJsonStringify(fn.arguments),
      });
    }
  }

  return normalized;
}

function normalizeChatTools(tools: unknown[] | undefined): unknown[] | undefined {
  if (!tools) {
    return undefined;
  }

  return tools.map((tool) => {
    if (!tool || typeof tool !== "object") {
      return tool;
    }

    const record = tool as Record<string, unknown>;
    const fn = record.function && typeof record.function === "object" ? (record.function as Record<string, unknown>) : null;
    if (record.type !== "function" || !fn) {
      return tool;
    }

    return {
      type: "function",
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    };
  });
}

function normalizeChatToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || typeof toolChoice !== "object") {
    return toolChoice;
  }

  const record = toolChoice as Record<string, unknown>;
  const fn = record.function && typeof record.function === "object" ? (record.function as Record<string, unknown>) : null;
  if (record.type === "function" && fn && typeof fn.name === "string") {
    return {
      type: "function",
      name: fn.name,
    };
  }

  return toolChoice;
}

function normalizeReasoningEffort(value: unknown): string | undefined {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  if (value === "minimal") {
    return "low";
  }
  if (value === "xhigh") {
    return "high";
  }

  return undefined;
}

function normalizeChatReasoning(data: z.infer<typeof chatCompletionsBodySchema>): Record<string, unknown> | undefined {
  const record = data as Record<string, unknown>;
  const existing = record.reasoning;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, unknown>;
  }

  const effort = normalizeReasoningEffort(record.reasoning_effort);
  return effort ? { effort } : undefined;
}

function truncateForLog(value: string, maxLength = 300): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function extractChatMessageText(message: z.infer<typeof chatCompletionMessageSchema>): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .map((part) => (typeof part.text === "string" ? part.text : part.image_url ? "[image]" : ""))
    .filter(Boolean)
    .join("\n");
}

function countRoles(messages: z.infer<typeof chatCompletionsBodySchema>["messages"]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const message of messages) {
    const role = message.role ?? "user";
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

function summarizeRecentMessages(
  messages: z.infer<typeof chatCompletionsBodySchema>["messages"],
): Array<Record<string, unknown>> {
  return messages.slice(-8).map((message) => ({
    role: message.role ?? "user",
    textPreview: truncateForLog(extractChatMessageText(message), 180),
    toolCallId: message.tool_call_id,
  }));
}

function summarizeToolNames(tools: unknown[] | undefined): string[] {
  if (!tools) {
    return [];
  }

  return tools
    .map((tool) => {
      if (!tool || typeof tool !== "object") {
        return "";
      }
      const record = tool as Record<string, unknown>;
      const fn = record.function && typeof record.function === "object" ? (record.function as Record<string, unknown>) : null;
      return typeof fn?.name === "string"
        ? fn.name
        : typeof record.name === "string"
          ? record.name
          : typeof record.type === "string"
            ? record.type
            : "";
    })
    .filter(Boolean);
}

function summarizeResponsesRequest(
  data: z.infer<typeof responsesBodySchema>,
  endpoint = "/v1/responses",
): Record<string, unknown> {
  const input = data.input;
  const toolNames = summarizeToolNames(Array.isArray(data.tools) ? data.tools : undefined);
  return {
    endpoint,
    model: data.model ?? "default",
    stream: data.stream ?? false,
    inputKind: typeof input === "string" ? "string" : Array.isArray(input) ? "array" : "override",
    inputItems: Array.isArray(input) ? input.length : undefined,
    inputTextPreview: typeof input === "string" ? truncateForLog(input) : "",
    instructionsLength: typeof data.instructions === "string" ? data.instructions.length : undefined,
    toolCount: Array.isArray(data.tools) ? data.tools.length : 0,
    toolNames: toolNames.slice(0, 50),
    toolNamesTruncated: toolNames.length > 50,
    toolChoice: typeof data.tool_choice === "undefined" ? "default" : typeof data.tool_choice,
    parallelToolCalls: data.parallel_tool_calls,
    hasReasoning: Boolean((data as Record<string, unknown>).reasoning),
    hasPreviousResponseId: Boolean(getPreviousResponseId(data)),
  };
}

function getPreviousResponseId(data: z.infer<typeof responsesBodySchema>): string | undefined {
  const direct = (data as Record<string, unknown>).previous_response_id;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const experimental = data.experimental_codex?.body?.previous_response_id;
  return typeof experimental === "string" && experimental.trim() ? experimental.trim() : undefined;
}

function removePreviousResponseId(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.previous_response_id;
  return next;
}

function createResponsesCodexBody(data: z.infer<typeof responsesBodySchema>): Record<string, unknown> {
  const experimentalBody = data.experimental_codex?.body ?? {};
  const body: Record<string, unknown> = {
    ...experimentalBody,
    ...(data as Record<string, unknown>),
  };
  delete body.experimental_codex;

  const normalizedInput = normalizeResponseInput(data.input);
  if (typeof normalizedInput !== "undefined") {
    body.input = normalizedInput;
  }

  return body;
}

function createCodexPassthroughBody(data: z.infer<typeof responsesBodySchema>, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...(data as Record<string, unknown>),
    model,
  };
  delete body.experimental_codex;
  return body;
}

function getImageGenerationTool(body: Record<string, unknown>): Record<string, unknown> | null {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  for (const tool of tools) {
    if (isObjectRecord(tool) && tool.type === "image_generation") {
      return tool;
    }
  }
  return null;
}

function hasImageGenerationToolChoice(body: Record<string, unknown>): boolean {
  const choice = body.tool_choice;
  if (typeof choice === "string") {
    return choice === "image_generation";
  }
  return isObjectRecord(choice) && choice.type === "image_generation";
}

function normalizeImageOutputFormat(value: unknown): CodexImageGenerationRequest["outputFormat"] | undefined {
  return value === "png" || value === "webp" || value === "jpeg" ? value : undefined;
}

function extractCodexImageGenerationRequest(body: Record<string, unknown>): CodexImageGenerationRequest | null {
  const imageTool = getImageGenerationTool(body);
  if (!hasImageGenerationToolChoice(body)) {
    return null;
  }

  return {
    prompt: extractTextInput(body.input),
    inputImages: extractImageInputs(body.input),
    imageModel: typeof imageTool?.model === "string" && imageTool.model.trim() ? imageTool.model.trim() : "gpt-image-2",
    size: typeof imageTool?.size === "string" && imageTool.size.trim() ? imageTool.size.trim() : undefined,
    outputFormat: normalizeImageOutputFormat(imageTool?.output_format),
  };
}

async function writeResponsesSseBlock(reply: FastifyReply, block: string): Promise<number> {
  if (!reply.raw.write(block)) {
    await new Promise((resolve) => reply.raw.once("drain", resolve));
  }
  return Buffer.byteLength(block);
}

async function writeResponsesSseEvent(reply: FastifyReply, eventName: string, payload: Record<string, unknown>): Promise<number> {
  return writeResponsesSseBlock(reply, `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function sendSyntheticCodexImageSse(params: {
  reply: FastifyReply;
  result: ChatGPTWebImageResult;
  model: string;
  prompt: string;
  requestedSize?: string;
  requestedOutputFormat?: "png" | "webp" | "jpeg";
}): Promise<{ bytes: number; imageCount: number }> {
  const responseId = `resp_${randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);
  const outputFormat = params.result.output_format ?? params.requestedOutputFormat ?? "png";
  const size = params.result.size ?? params.requestedSize;
  const output = params.result.data.map((image, index) => ({
    id: `ig_${randomUUID().replace(/-/g, "")}`,
    type: "image_generation_call",
    status: "completed",
    result: image.b64_json,
    revised_prompt: image.revised_prompt ?? params.prompt,
    output_format: outputFormat,
    ...(size ? { size } : {}),
  }));
  let bytes = 0;

  params.reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  params.reply.raw.flushHeaders?.();

  bytes += await writeResponsesSseEvent(params.reply, "response.created", {
    type: "response.created",
    response: {
      id: responseId,
      object: "response",
      created_at: created,
      model: params.model,
      status: "in_progress",
      output: [],
    },
  });

  for (let index = 0; index < output.length; index += 1) {
    const item = output[index] as Record<string, unknown>;
    bytes += await writeResponsesSseEvent(params.reply, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: index,
      item: {
        id: item.id,
        type: item.type,
        status: "in_progress",
      },
    });
    bytes += await writeResponsesSseEvent(params.reply, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: index,
      item,
    });
  }

  bytes += await writeResponsesSseEvent(params.reply, "response.completed", {
    type: "response.completed",
    response: {
      id: responseId,
      object: "response",
      created_at: created,
      model: params.model,
      status: "completed",
      output,
      usage: null,
    },
  });
  bytes += await writeResponsesSseBlock(params.reply, "data: [DONE]\n\n");
  params.reply.raw.end();

  return {
    bytes,
    imageCount: output.length,
  };
}

function summarizeChatCompletionsRequest(data: z.infer<typeof chatCompletionsBodySchema>): Record<string, unknown> {
  const lastUserMessage = [...data.messages].reverse().find((message) => (message.role ?? "user") === "user");
  const toolNames = summarizeToolNames(data.tools);
  return {
    endpoint: "/v1/chat/completions",
    model: data.model ?? "default",
    stream: data.stream ?? false,
    messageCount: data.messages.length,
    roleCounts: countRoles(data.messages),
    recentMessages: summarizeRecentMessages(data.messages),
    lastUserTextPreview: lastUserMessage ? truncateForLog(extractChatMessageText(lastUserMessage)) : "",
    toolCount: data.tools?.length ?? 0,
    toolNames: toolNames.slice(0, 50),
    toolNamesTruncated: toolNames.length > 50,
    toolChoice: typeof data.tool_choice === "undefined" ? "default" : typeof data.tool_choice,
    parallelToolCalls: data.parallel_tool_calls,
    hasReasoning: Boolean((data as Record<string, unknown>).reasoning || (data as Record<string, unknown>).reasoning_effort),
    maxTokens: data.max_completion_tokens ?? data.max_tokens,
  };
}

function summarizeCodexChatBody(body: Record<string, unknown>): Record<string, unknown> {
  const toolNames = summarizeToolNames(Array.isArray(body.tools) ? body.tools : undefined);
  return {
    keys: Object.keys(body).sort(),
    model: body.model ?? "default",
    stream: body.stream,
    store: body.store,
    inputItems: Array.isArray(body.input) ? body.input.length : undefined,
    tools: Array.isArray(body.tools) ? body.tools.length : undefined,
    toolNames: toolNames.slice(0, 50),
    toolNamesTruncated: toolNames.length > 50,
    toolChoice: typeof body.tool_choice === "undefined" ? "default" : typeof body.tool_choice,
    parallelToolCalls: body.parallel_tool_calls,
    hasReasoning: Boolean(body.reasoning),
  };
}

async function buildOpenAIModelsResponse(ctx: ReturnType<typeof createGatewayContext>) {
  return {
    object: "list",
    data: (await ctx.modelService.listModels()).map((model) => ({
      id: model.id,
      object: "model",
      owned_by: model.provider,
    })),
  };
}

async function buildCodexModelsResponse(ctx: ReturnType<typeof createGatewayContext>) {
  const [models, catalog] = await Promise.all([
    ctx.modelService.listModels(),
    ctx.modelService.getCatalog(),
  ]);
  return {
    fetched_at: catalog.fetchedAt ?? new Date().toISOString(),
    models: models.map((model, index) => ({
      slug: model.id,
      display_name: model.name,
      description: model.name,
      default_reasoning_level: "medium",
      supported_reasoning_levels: [
        { effort: "low", description: "Fast responses with lighter reasoning" },
        { effort: "medium", description: "Balanced speed and reasoning" },
        { effort: "high", description: "Deeper reasoning" },
        { effort: "xhigh", description: "Extra deep reasoning" },
      ],
      shell_type: "shell_command",
      visibility: "list",
      supported_in_api: true,
      priority: index,
      input_modalities: model.input,
    })),
  };
}

function profileLogLabel(profile: OAuthProfile | null): string {
  return profile?.email || profile?.accountId || profile?.profileId || "-";
}

function requestSourceFromUserAgent(userAgent: unknown): string {
  if (typeof userAgent !== "string") {
    return "API";
  }

  const normalized = userAgent.toLowerCase();
  if (normalized.includes("codex")) {
    return "Codex";
  }
  if (normalized.includes("openclaw")) {
    return "OpenClaw";
  }
  return "API";
}

function createChatCompletionsCodexBody(
  data: z.infer<typeof chatCompletionsBodySchema>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    store: false,
    stream: true,
    input: normalizeChatMessages(data.messages),
  };

  if (data.model) {
    body.model = data.model;
  }
  if (typeof data.parallel_tool_calls === "boolean") {
    body.parallel_tool_calls = data.parallel_tool_calls;
  }
  if (data.tools) {
    body.tools = normalizeChatTools(data.tools);
  }
  if (typeof data.tool_choice !== "undefined") {
    body.tool_choice = normalizeChatToolChoice(data.tool_choice);
  }
  const reasoning = normalizeChatReasoning(data);
  if (reasoning) {
    body.reasoning = reasoning;
  }
  return body;
}

function summarizeImageRequestForLog(body: z.infer<typeof imageGenerationsBodySchema>): Record<string, unknown> {
  return {
    model: body.model ?? "default",
    promptLength: body.prompt.length,
    size: body.size ?? "default",
    quality: body.quality ?? "default",
    background: body.background ?? "default",
    output_format: body.output_format ?? "default",
    output_compression: typeof body.output_compression === "number" ? body.output_compression : undefined,
    moderation: body.moderation ?? "default",
    response_format: body.response_format ?? "default",
    user: body.user ?? undefined,
  };
}

function getImageEditReferences(data: z.infer<typeof imageEditsBodySchema>): Array<z.infer<typeof imageReferenceSchema>> {
  if (Array.isArray(data.images)) {
    return data.images;
  }

  if (Array.isArray(data.image)) {
    return data.image;
  }

  if (data.image) {
    return [data.image];
  }

  return [];
}

function normalizeJsonImageReference(reference: z.infer<typeof imageReferenceSchema>): { imageUrl?: string; fileId?: string } {
  if (typeof reference === "string") {
    return {
      imageUrl: normalizeJsonImageUrl(reference),
    };
  }

  return {
    imageUrl: reference.image_url ? normalizeJsonImageUrl(reference.image_url) : undefined,
    fileId: reference.file_id,
  };
}

function normalizeJsonImageUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Za-z0-9+/=_-]+$/.test(trimmed) && trimmed.length > 80) {
    return `data:image/png;base64,${trimmed}`;
  }

  return trimmed;
}

function summarizeImageEditRequestForLog(body: z.infer<typeof imageEditsBodySchema>): Record<string, unknown> {
  return {
    ...summarizeImageRequestForLog(body),
    imageCount: getImageEditReferences(body).length,
    hasMask: Boolean(body.mask),
  };
}

function buildResponseApiBody(result: ChatResult, includeRaw?: boolean): Record<string, unknown> {
  const responseBody: Record<string, unknown> = {
    object: "response",
    provider: result.provider,
    model: result.model,
    output_text: result.text,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: result.text,
          },
        ],
      },
    ],
  };

  if (result.artifacts.length > 0) {
    responseBody.artifacts = result.artifacts;
  }

  if (includeRaw) {
    responseBody.raw = result.raw;
  }

  return responseBody;
}

function buildChatCompletionsBody(result: ChatResult): Record<string, unknown> {
  const hasToolCalls = result.toolCalls.length > 0;
  const body: Record<string, unknown> = {
    id: `chatcmpl_${randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        finish_reason: hasToolCalls ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: hasToolCalls ? result.text || null : result.text,
          ...(hasToolCalls ? { tool_calls: result.toolCalls } : {}),
        },
      },
    ],
  };

  if (result.artifacts.length > 0) {
    body.artifacts = result.artifacts;
  }

  return body;
}

function writeChatCompletionsSseEvent(reply: FastifyReply, data: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildChatCompletionChunk(params: {
  id: string;
  created: number;
  model: string;
  delta: Record<string, unknown>;
  finishReason?: "stop" | "tool_calls";
}): Record<string, unknown> {
  return {
    id: params.id,
    object: "chat.completion.chunk",
    created: params.created,
    model: params.model,
    choices: [
      {
        index: 0,
        delta: params.delta,
        finish_reason: params.finishReason ?? null,
      },
    ],
  };
}

function sendChatCompletionsStream(reply: FastifyReply, result: ChatResult): void {
  const id = `chatcmpl_${randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  writeChatCompletionsSseEvent(reply, buildChatCompletionChunk({
    id,
    created,
    model: result.model,
    delta: { role: "assistant" },
  }));

  if (result.text) {
    writeChatCompletionsSseEvent(reply, buildChatCompletionChunk({
      id,
      created,
      model: result.model,
      delta: { content: result.text },
    }));
  }

  result.toolCalls.forEach((toolCall, index) => {
    writeChatCompletionsSseEvent(reply, buildChatCompletionChunk({
      id,
      created,
      model: result.model,
      delta: {
        tool_calls: [
          {
            index,
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          },
        ],
      },
    }));
  });

  writeChatCompletionsSseEvent(reply, buildChatCompletionChunk({
    id,
    created,
    model: result.model,
    delta: {},
    finishReason: result.toolCalls.length > 0 ? "tool_calls" : "stop",
  }));
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}

function validateImageRequest(data: z.infer<typeof imageGenerationsBodySchema>): string | null {
  if (data.response_format === "url") {
    return "当前网关仅支持 response_format=b64_json，暂不支持返回托管图片 URL。";
  }

  if (
    data.background === "transparent" &&
    typeof data.output_format === "string" &&
    !["png", "webp"].includes(data.output_format)
  ) {
    return "transparent 背景仅支持 output_format=png 或 webp。";
  }

  if (typeof data.output_compression === "number" && data.output_format === "png") {
    return "output_compression 仅支持 jpeg 或 webp 输出。";
  }

  return null;
}

function validateImageEditRequest(data: z.infer<typeof imageEditsBodySchema>): string | null {
  const generationValidationError = validateImageRequest(data);
  if (generationValidationError) {
    return generationValidationError;
  }

  if (data.mask) {
    return "当前网关的 JSON 版 images.edits 暂不支持 mask；请先使用参考图编辑。";
  }

  const references = getImageEditReferences(data);
  if (references.length === 0) {
    return "images.edits 请求缺少 images 或 image。";
  }

  const normalized = references.map((reference) => normalizeJsonImageReference(reference));
  if (normalized.some((reference) => reference.fileId)) {
    return "当前网关的 JSON 版 images.edits 暂不支持 file_id，请使用 image_url URL 或 base64 data URL。";
  }
  if (normalized.some((reference) => !reference.imageUrl)) {
    return "images.edits 的每个图片引用都需要提供 image_url。";
  }
  if (normalized.some((reference) => reference.imageUrl && !/^https?:\/\//i.test(reference.imageUrl) && !/^data:image\//i.test(reference.imageUrl))) {
    return "images.edits 的 image_url 需要是 http(s) URL、data:image/...;base64,...，或裸 base64 字符串。";
  }

  return null;
}

function maskSecret(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function serializeProfile(profile: OAuthProfile | null): Record<string, unknown> | null {
  if (!profile) {
    return null;
  }

  return {
    provider: profile.provider,
    profileId: profile.profileId,
    accountId: profile.accountId,
    email: profile.email,
    quota: profile.quota,
    authStatus: profile.authStatus,
    exportAudit: profile.exportAudit,
    expiresAt: profile.expires,
    accessTokenPreview: maskSecret(profile.access),
    refreshTokenPreview: maskSecret(profile.refresh),
  };
}

function serializeManagedProfile(profile: ProfileSummary): Record<string, unknown> {
  return {
    provider: profile.provider,
    profileId: profile.profileId,
    accountId: profile.accountId,
    email: profile.email,
    quota: profile.quota,
    authStatus: profile.authStatus,
    exportAudit: profile.exportAudit,
    expiresAt: profile.expiresAt,
    accessTokenPreview: profile.accessTokenPreview,
    refreshTokenPreview: profile.refreshTokenPreview,
    isActive: profile.isActive,
  };
}

function resolveOrigin(request: FastifyRequest): string {
  const host = request.headers.host;
  if (host) {
    return `${request.protocol}://${host}`;
  }

  return "http://127.0.0.1:8787";
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function isPrivateIpv4(address: string): boolean {
  if (address.startsWith("10.")) {
    return true;
  }
  if (address.startsWith("192.168.")) {
    return true;
  }
  const match = address.match(/^172\.(\d+)\./);
  if (!match) {
    return false;
  }
  const second = Number.parseInt(match[1] ?? "", 10);
  return second >= 16 && second <= 31;
}

function getLanIpv4Addresses(): Array<{ address: string; label: string }> {
  const seen = new Set<string>();
  const addresses: Array<{ address: string; label: string; private: boolean }> = [];
  const interfaces = networkInterfaces();

  for (const [name, details] of Object.entries(interfaces)) {
    for (const detail of details ?? []) {
      const family = String(detail.family);
      const isIpv4 = family === "IPv4" || family === "4";
      if (!isIpv4 || detail.internal || seen.has(detail.address)) {
        continue;
      }
      if (detail.address === "0.0.0.0" || detail.address.startsWith("127.") || detail.address.startsWith("169.254.")) {
        continue;
      }
      seen.add(detail.address);
      addresses.push({
        address: detail.address,
        label: name,
        private: isPrivateIpv4(detail.address),
      });
    }
  }

  return addresses
    .sort((left, right) => Number(right.private) - Number(left.private) || left.address.localeCompare(right.address, "en"))
    .map(({ address, label }) => ({ address, label }));
}

function createShareAddress(protocol: string, host: string, port: number, label: string): GatewayShareAddress {
  const origin = `${protocol}://${host}:${port}`;
  return {
    host,
    label,
    adminUrl: `${origin}/`,
    baseUrl: `${origin}/v1`,
    codexBaseUrl: `${origin}/codex/v1`,
  };
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getErrorStatusCode(error: unknown): number {
  const normalized = normalizeError(error) as Error & { statusCode?: number };
  if (typeof normalized.statusCode === "number") {
    return normalized.statusCode;
  }

  const upstreamStatus = (normalized as Error & { upstreamStatus?: unknown }).upstreamStatus;
  if (typeof upstreamStatus === "number" && upstreamStatus >= 400 && upstreamStatus < 600) {
    return upstreamStatus;
  }

  const message = normalized.message;
  if (
    message.includes("缺少") ||
    message.includes("格式错误") ||
    message.includes("未内置模型") ||
    message.includes("不支持") ||
    message.includes("没有提供")
  ) {
    return 400;
  }

  if (message.includes("还没有登录")) {
    return 401;
  }

  return 500;
}

function formatBytesAsMiB(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "未知";
  }

  return `${Math.round((bytes / BYTES_PER_MIB) * 10) / 10} MB`;
}

type SseStreamStats = {
  buffer: string;
  bytes: number;
  terminalEvent?: string;
  completed: boolean;
  responseIds: Set<string>;
  tokenUsage: UsageTokenUsage | null;
};

function createSseStreamStats(): SseStreamStats {
  return {
    buffer: "",
    bytes: 0,
    completed: false,
    responseIds: new Set<string>(),
    tokenUsage: null,
  };
}

function extractSseResponseId(value: unknown): string | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const directId = value.id;
  if (typeof directId === "string" && directId.startsWith("resp_")) {
    return directId;
  }

  const response = value.response;
  if (isObjectRecord(response) && typeof response.id === "string" && response.id.startsWith("resp_")) {
    return response.id;
  }

  return undefined;
}

function trackSseChunk(stats: SseStreamStats, chunk: unknown): void {
  const text = typeof chunk === "string"
    ? chunk
    : chunk instanceof Uint8Array
      ? Buffer.from(chunk).toString("utf8")
      : String(chunk);
  stats.bytes += Buffer.byteLength(text);
  stats.buffer += text.replace(/\r\n/g, "\n");

  let separatorIndex = stats.buffer.indexOf("\n\n");
  while (separatorIndex !== -1) {
    const block = stats.buffer.slice(0, separatorIndex);
    stats.buffer = stats.buffer.slice(separatorIndex + 2);
    const eventName = block
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");

    let eventType = eventName;
    if (data && data !== "[DONE]") {
      try {
        const parsed = JSON.parse(data) as { type?: unknown };
        if (typeof parsed.type === "string") {
          eventType = parsed.type;
        }
        const responseId = extractSseResponseId(parsed);
        if (responseId) {
          stats.responseIds.add(responseId);
        }
        const tokenUsage = extractTokenUsage(parsed);
        if (tokenUsage) {
          stats.tokenUsage = tokenUsage;
        }
      } catch {
        // The tracker is diagnostic only; malformed chunks still pass through.
      }
    }

    if (eventType === "response.completed") {
      stats.completed = true;
      stats.terminalEvent = eventType;
    } else if (eventType === "response.failed" || eventType === "response.incomplete") {
      stats.terminalEvent = eventType;
    }

    separatorIndex = stats.buffer.indexOf("\n\n");
  }

  if (stats.buffer.length > 65536) {
    stats.buffer = stats.buffer.slice(-65536);
  }
}

export function createApp(params?: {
  corsOrigin?: true | string | RegExp | Array<string | RegExp>;
  bodyLimit?: number;
  onRestart?: () => void | Promise<void>;
  onRestartCodex?: () => void | Promise<void>;
}) {
  const defaultBodyLimit = params?.bodyLimit ?? DEFAULT_ROUTE_BODY_LIMIT_BYTES;
  const codexCompactBodyLimit = Math.max(defaultBodyLimit, CODEX_COMPACT_BODY_LIMIT_BYTES);
  const app = Fastify({
    logger: false,
    bodyLimit: defaultBodyLimit,
  });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    /^application\/(?:[\w!#$&^.+-]+\+)?json(?:\s*;.*)?$/i,
    { parseAs: "buffer" },
    (request, body, done) => {
      parseJsonRequestBody(request, Buffer.isBuffer(body) ? body : Buffer.from(body))
        .then((parsed) => done(null, parsed))
        .catch((error) => done(error as Error));
    },
  );
  const ctx = createGatewayContext();
  const gatewayRequestLogs: GatewayRequestLog[] = [];
  const codexResponseProfileBindings = new Map<string, { profileId: string; accountId: string; seenAt: number }>();

  function rememberCodexResponseProfile(responseId: string, profile: OAuthProfile): void {
    codexResponseProfileBindings.set(responseId, {
      profileId: profile.profileId,
      accountId: profile.accountId,
      seenAt: Date.now(),
    });

    if (codexResponseProfileBindings.size <= MAX_CODEX_RESPONSE_PROFILE_BINDINGS) {
      return;
    }

    const overflow = codexResponseProfileBindings.size - MAX_CODEX_RESPONSE_PROFILE_BINDINGS;
    const oldest = Array.from(codexResponseProfileBindings.entries())
      .sort((left, right) => left[1].seenAt - right[1].seenAt)
      .slice(0, overflow);
    for (const [key] of oldest) {
      codexResponseProfileBindings.delete(key);
    }
  }

  function pushGatewayRequestLog(log: Omit<GatewayRequestLog, "id" | "time"> & { id?: string; time?: number; usage?: GatewayRequestUsageMeta }): void {
    const entry: GatewayRequestLog = {
      id: log.id ?? randomUUID(),
      time: log.time ?? Date.now(),
      method: log.method,
      endpoint: log.endpoint,
      account: log.account,
      model: log.model,
      statusCode: log.statusCode,
      durationMs: log.durationMs,
      source: log.source,
      details: log.details,
    };
    gatewayRequestLogs.unshift(entry);
    if (gatewayRequestLogs.length > MAX_GATEWAY_REQUEST_LOGS) {
      gatewayRequestLogs.length = MAX_GATEWAY_REQUEST_LOGS;
    }
    const profile = log.usage?.profile ?? undefined;
    const usageEvent: UsageRecordEvent = {
      id: entry.id,
      timestamp: entry.time,
      method: entry.method,
      endpoint: entry.endpoint,
      model: entry.model,
      source: entry.source,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      success: entry.statusCode >= 200 && entry.statusCode < 400,
      profileId: profile?.profileId,
      accountId: profile?.accountId,
      accountLabel: entry.account,
      planType: profile?.quota?.planType,
      tokenUsage: log.usage?.tokenUsage,
      imageCount: log.usage?.imageCount,
      imageRoute: log.usage?.imageRoute ?? "none",
      errorType: log.usage?.errorType ?? extractUsageErrorType(log.details, entry.statusCode),
    };
    ctx.usageService.record(usageEvent).catch((error) => {
      console.warn("[gateway:usage] 统计写入失败", error);
    });
  }

  void app.register(cors, {
    origin: params?.corsOrigin ?? true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error);
    const statusCode = getErrorStatusCode(normalized);
    const isBodyTooLarge = statusCode === 413;
    const message = isBodyTooLarge
      ? `请求体过大，当前网关默认上限 ${formatBytesAsMiB(defaultBodyLimit)}，Codex compact 上限 ${formatBytesAsMiB(codexCompactBodyLimit)}。如仍不够，请用 AZT_BODY_LIMIT_MB 调大后重启网关。`
      : normalized.message;
    console.error("[gateway:error]", {
      method: request.method,
      url: request.url,
      statusCode,
      message,
      code: (normalized as Error & { code?: unknown }).code,
      upstreamRequestId: (normalized as Error & { requestId?: unknown }).requestId,
      stack: normalized.stack,
    });
    reply.code(statusCode);
    return {
      error: {
        type: "gateway_error",
        message,
      },
    };
  });

  app.get("/_gateway/admin/request-logs", async () => ({
    data: gatewayRequestLogs,
  }));

  app.get("/_gateway/admin/usage", async () => ctx.usageService.getSummary());

  async function buildAdminConfig(request: FastifyRequest) {
    const [status, models, modelCatalog, versionStatus, settings, profile, profiles, codexStatus, usage] = await Promise.all([
      ctx.authService.getStatus(),
      ctx.modelService.listModels(),
      ctx.modelService.getCatalog(),
      ctx.versionService.getVersionStatus(),
      ctx.configService.getSettings(),
      ctx.authService.getActiveProfile(),
      ctx.authService.listProfiles(),
      ctx.authService.getCodexStatus(),
      ctx.usageService.getSummary(),
    ]);
    const origin = resolveOrigin(request);

    return {
      status,
      settings,
      models,
      modelCatalog,
      versionStatus,
      profile: serializeProfile(profile),
      profiles: profiles.map((item) => serializeManagedProfile(item)),
      codex: codexStatus,
      usage,
      adminUrl: `${origin}/`,
      baseUrl: `${origin}/v1`,
      codexBaseUrl: `${origin}/codex/v1`,
      restartSupported: Boolean(params?.onRestart),
      codexRestartSupported: Boolean(params?.onRestartCodex),
      supportedEndpoints: [
        {
          method: "GET",
          path: "/v1/models",
          description: "OpenAI models 列表兼容接口。",
        },
        {
          method: "POST",
          path: "/v1/responses",
          description: "OpenAI responses 兼容接口。",
        },
        {
          method: "POST",
          path: "/codex/v1/responses",
          description: "Codex custom provider 专用 Responses SSE 透传接口。",
        },
        {
          method: "POST",
          path: "/codex/v1/responses/compact",
          description: "Codex custom provider 专用 Responses compact SSE 透传接口。",
        },
        {
          method: "POST",
          path: "/v1/chat/completions",
          description: "OpenAI chat.completions 兼容接口。",
        },
        {
          method: "POST",
          path: "/v1/images/generations",
          description: "OpenAI images.generations 兼容接口。",
        },
        {
          method: "POST",
          path: "/v1/images/edits",
          description: "OpenAI images.edits JSON 兼容接口。",
        },
      ],
    };
  }

  app.get("/", async (_request, reply) => {
    try {
      reply.header("Content-Type", "text/html; charset=utf-8");
      return fs.readFile(adminUiIndexPath, "utf8");
    } catch {
      reply.code(503);
      return {
        error: {
          type: "admin_ui_missing",
          message: "React 管理页未构建，请先运行 npm run build:ui。",
        },
      };
    }
  });

  app.get("/assets/*", async (request, reply) => {
    const assetPath = (request.params as { "*": string })["*"];
    const asset = await readAdminUiAsset(path.join("assets", assetPath));
    if (!asset) {
      reply.code(404);
      return {
        error: {
          type: "not_found",
          message: "asset not found",
        },
      };
    }

    reply.header("Content-Type", getContentType(asset.filePath));
    return asset.body;
  });

  app.get("/favicon.ico", async (_request, reply) => {
    reply.code(204);
    return "";
  });

  app.get("/_gateway/health", async () => ({ ok: true }));

  app.get("/_gateway/status", async () => ctx.authService.getStatus());

  app.get("/_gateway/models", async () => ({
    data: await ctx.modelService.listModels(),
    catalog: await ctx.modelService.getCatalog(),
  }));

  app.post("/_gateway/models/refresh", async () => {
    const result = await ctx.modelService.refreshModels();
    return {
      data: result.models,
      catalog: result.catalog,
    };
  });

  app.post("/_gateway/admin/runtime-refresh", async (request, reply) => {
    const parsed = runtimeRefreshSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const [quotaSync] = await Promise.all([
      ctx.authService.syncAllProfileQuotas("openai-codex", {
        suppressErrors: true,
        staleAfterMs: parsed.data.staleOnly ? 30 * 60 * 1000 : undefined,
      }),
      ctx.versionService.getVersionStatus({
        force: true,
      }),
    ]);

    return {
      ...(await buildAdminConfig(request)),
      quotaSync,
    };
  });

  app.get("/_gateway/admin/config", async (request) => buildAdminConfig(request));

  app.get("/_gateway/admin/share", async (request) => {
    const status = await ctx.authService.getStatus();
    const protocol = request.protocol === "https" ? "https" : "http";
    const port = request.raw.socket.localPort || status.serverPort;
    const serverHost = status.serverHost || "0.0.0.0";
    const lanReachable = serverHost === "0.0.0.0" || serverHost === "::" || !isLoopbackHost(serverHost);
    const addresses = getLanIpv4Addresses().map((item) => createShareAddress(protocol, item.address, port, item.label));
    const requestHost = request.headers.host?.replace(/:\d+$/u, "");

    if (requestHost && !isLoopbackHost(requestHost) && !addresses.some((item) => item.host === requestHost)) {
      addresses.unshift(createShareAddress(protocol, requestHost, port, "当前访问地址"));
    }

    return {
      primary: lanReachable ? addresses[0] ?? null : null,
      addresses,
      local: createShareAddress(protocol, "127.0.0.1", port, "本机"),
      serverHost,
      serverPort: port,
      lanReachable,
    };
  });

  app.post("/_gateway/admin/login", async (request) => {
    await ctx.authService.login("openai-codex");
    await ctx.authService.syncActiveProfileQuota("openai-codex", {
      suppressErrors: true,
    });
    return buildAdminConfig(request);
  });

  app.post("/_gateway/admin/logout", async (request) => {
    await ctx.authService.logoutAll();
    return buildAdminConfig(request);
  });

  app.post("/_gateway/admin/profiles/activate", async (request, reply) => {
    const parsed = profileActionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    await ctx.authService.activateProfile(parsed.data.profileId);
    await ctx.authService.syncActiveProfileQuota("openai-codex", {
      suppressErrors: true,
      skipAutoSwitch: true,
    });
    return buildAdminConfig(request);
  });

  app.post("/_gateway/admin/profiles/sync-quota", async (request, reply) => {
    const parsed = profileActionSchema.partial().safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    if (parsed.data.profileId) {
      await ctx.authService.syncProfileQuota(parsed.data.profileId, "openai-codex");
    } else {
      await ctx.authService.syncActiveProfileQuota("openai-codex");
    }
    return buildAdminConfig(request);
  });

  app.post("/_gateway/admin/profiles/remove", async (request, reply) => {
    const parsed = profileActionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    await ctx.authService.removeProfile(parsed.data.profileId);
    return buildAdminConfig(request);
  });

  app.post("/_gateway/admin/profiles/remove-batch", async (request, reply) => {
    const parsed = profileRemoveBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const removedProfileCount = await ctx.authService.removeProfiles(parsed.data.profileIds);
    return {
      ...(await buildAdminConfig(request)),
      removedProfileCount,
    };
  });

  app.post("/_gateway/admin/profiles/import", async (request, reply) => {
    const parsed = profileImportSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const importedProfiles = await ctx.authService.importProfiles(parsed.data.profile);
    await ctx.authService.syncActiveProfileQuota("openai-codex", {
      suppressErrors: true,
    });
    return {
      ...(await buildAdminConfig(request)),
      importedProfileCount: importedProfiles.length,
    };
  });

  app.post("/_gateway/admin/profiles/import/validate", async (request, reply) => {
    const parsed = profileImportSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const profiles = ctx.authService.validateProfilesImport(parsed.data.profile);
    return {
      valid: true,
      profileCount: profiles.length,
    };
  });

  app.get("/_gateway/admin/profiles/import-template", async () => ({
    profile: ctx.authService.getProfileImportTemplate(),
  }));

  app.post("/_gateway/admin/profiles/export", async (request, reply) => {
    const parsed = profileExportSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    if (parsed.data.all || parsed.data.profileIds) {
      return {
        profile: await ctx.authService.exportProfiles(parsed.data.profileIds, "openai-codex", parsed.data.all ? "all" : "batch"),
        config: await buildAdminConfig(request),
      };
    }

    return {
      profile: await ctx.authService.exportProfile(parsed.data.profileId),
      config: await buildAdminConfig(request),
    };
  });

  app.post("/_gateway/admin/codex/apply", async (request, reply) => {
    const parsed = codexApplySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    return {
      codex: await ctx.authService.applyProfileToCodex(parsed.data.profileId),
      config: await buildAdminConfig(request),
    };
  });

  app.post("/_gateway/admin/codex/configure-provider", async (request, reply) => {
    const parsed = codexProviderConfigSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const origin = resolveOrigin(request);
    const baseUrl = parsed.data.baseUrl ?? `${origin}/codex/v1`;
    return {
      codexProvider: await ctx.authService.applyGatewayToCodexProvider({
        baseUrl,
        providerId: parsed.data.providerId,
      }),
      config: await buildAdminConfig(request),
    };
  });

  app.post("/_gateway/admin/codex/remove-provider", async (request, reply) => {
    const parsed = codexProviderConfigSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    return {
      codexProvider: await ctx.authService.removeGatewayFromCodexProvider({
        providerId: parsed.data.providerId,
      }),
      config: await buildAdminConfig(request),
    };
  });

  app.put("/_gateway/admin/settings", async (request, reply) => {
    const parsed = settingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    await ctx.configService.updateSettings(parsed.data);
    return buildAdminConfig(request);
  });

  app.post("/_gateway/admin/restart", async (_request, reply) => {
    if (!params?.onRestart) {
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前环境不支持重启。",
        },
      };
    }

    setTimeout(() => {
      void Promise.resolve(params.onRestart?.()).catch((error) => {
        console.error("[gateway:restart]", error);
      });
    }, 100);

    return {
      ok: true,
      restarting: true,
    };
  });

  app.post("/_gateway/admin/desktop/restart-codex", async (_request, reply) => {
    if (!params?.onRestartCodex) {
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前环境不支持重启 Codex。",
        },
      };
    }

    await params.onRestartCodex();
    return {
      ok: true,
      restarted: true,
    };
  });

  app.post("/_gateway/admin/settings/proxy-test", async (request, reply) => {
    const parsed = proxyTestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const proxy = {
      enabled: parsed.data.networkProxy.enabled,
      url: parsed.data.networkProxy.url?.trim() ?? "",
      noProxy: parsed.data.networkProxy.noProxy?.trim() || "localhost,127.0.0.1,::1",
    };

    if (proxy.enabled && !proxy.url) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: "启用代理时必须填写代理地址。",
        },
      };
    }

    const startedAt = performance.now();
    try {
      const response = await requestText({
        method: "GET",
        url: "https://chatgpt.com/",
        timeoutMs: 8000,
        proxyOverride: proxy,
      });
      return {
        ok: response.status >= 200 && response.status < 500,
        status: response.status,
        elapsedMs: Math.round(performance.now() - startedAt),
        target: "https://chatgpt.com/",
        transport: response.transport,
      };
    } catch (error) {
      reply.code(502);
      return {
        error: {
          type: "proxy_test_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  app.get("/_gateway/admin/network-detect", async () => {
    const settings = await ctx.configService.getSettings();
    return ctx.networkDetectService.collectReport(settings.networkProxy);
  });

  app.get("/_gateway/image-bed/config", async () => ctx.githubImageBedService.getConfig());

  app.post("/_gateway/image-bed/validate", async () => ctx.githubImageBedService.testConnection());

  app.get("/_gateway/image-bed/history", async (request, reply) => {
    const parsed = githubImageBedHistoryQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求参数格式错误",
        },
      };
    }

    return ctx.githubImageBedService.listHistory(parsed.data.limit ?? 50);
  });

  app.put("/_gateway/image-bed/config", async (request, reply) => {
    const parsed = githubImageBedConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    return ctx.githubImageBedService.saveToken(parsed.data.token);
  });

  app.delete("/_gateway/image-bed/config", async () => ctx.githubImageBedService.clearToken());

  app.post("/_gateway/image-bed/upload", async (request, reply) => {
    const parsed = githubImageBedUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const uploaded = await ctx.githubImageBedService.uploadImage(parsed.data);
    await ctx.githubImageBedService.rememberUpload(uploaded);
    return uploaded;
  });

  app.delete("/_gateway/image-bed/history/:id", async (request, reply) => {
    const parsed = githubImageBedHistoryParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求参数格式错误",
        },
      };
    }

    return ctx.githubImageBedService.deleteHistoryItem(parsed.data.id);
  });

  app.delete("/_gateway/image-bed/history", async () => ctx.githubImageBedService.clearHistory());

  app.get("/v1/models", async () => buildOpenAIModelsResponse(ctx));

  app.get("/codex/v1/models", async () => buildCodexModelsResponse(ctx));

  app.get("/codex/v1/responses", async (_request, reply) => {
    reply.code(426);
    return {
      error: {
        type: "websocket_unsupported",
        message: "AI Zero Token 当前通过 HTTP SSE 转发 Codex Responses 请求。",
      },
    };
  });

  async function handleCodexResponsesPassthrough(
    request: FastifyRequest,
    reply: FastifyReply,
    data: z.infer<typeof responsesBodySchema>,
    startedAt: number,
    upstreamEndpoint: "responses" | "responses/compact" = "responses",
  ) {
    const abortController = new AbortController();
    let streamFinished = false;
    let headersCommitted = false;
    let profile: OAuthProfile | null = null;
    let retryCount = 0;
    let failureRecorded = false;
    let codexImageRoute: UsageImageRoute = "none";
    const originalPreviousResponseId = getPreviousResponseId(data);
    let adventureFallbackUsed = false;
    let adventureFallbackReason: string | undefined;
    reply.raw.on("close", () => {
      if (!streamFinished) {
        abortController.abort();
      }
    });

    try {
      const model = await ctx.modelService.resolveModel("openai-codex", data.model, {
        allowUnknown: data.experimental_codex?.allow_unknown_model,
      });
      let codexBody = createCodexPassthroughBody(data, model);
      let activePreviousResponseId = originalPreviousResponseId;
      let keepProfileSticky = Boolean(activePreviousResponseId);
      let stickyProfileId = activePreviousResponseId ? codexResponseProfileBindings.get(activePreviousResponseId)?.profileId : undefined;
      const useAdventureFallback = async (error: unknown, quota: import("../core/types.js").CodexQuotaSnapshot | undefined): Promise<boolean> => {
        if (!keepProfileSticky || abortController.signal.aborted) {
          return false;
        }

        const failedProfileId = profile?.profileId ?? stickyProfileId;
        if (failedProfileId) {
          await ctx.authService.recordProfileRequestFailure(failedProfileId, error, quota, "openai-codex", {
            skipAutoSwitch: true,
          });
        }

        codexBody = removePreviousResponseId(codexBody);
        activePreviousResponseId = undefined;
        keepProfileSticky = false;
        stickyProfileId = undefined;
        adventureFallbackUsed = true;
        adventureFallbackReason = error instanceof Error ? error.message : String(error);
        retryCount += 1;
        profile = null;
        failureRecorded = false;
        console.warn("[gateway:codex:stream] sticky continuation failed; dropping previous_response_id and retrying as new session", {
          requestId: request.id,
          model,
          retryCount,
          previousResponseId: "[present]",
          failedAccount: failedProfileId,
          errorCode: (error as { code?: unknown }).code,
          upstreamStatus: (error as { upstreamStatus?: unknown }).upstreamStatus,
          upstreamRequestId: (error as { requestId?: unknown }).requestId,
          message: adventureFallbackReason,
        });
        return true;
      };
      const imageRequest = upstreamEndpoint === "responses" ? extractCodexImageGenerationRequest(codexBody) : null;
      if (imageRequest) {
        codexImageRoute = "codex-tool";
        const settings = await ctx.configService.getSettings();
        if (settings.image.freeAccountWebGenerationEnabled) {
          profile = await ctx.authService.requireUsableProfile("openai-codex", {
            skipAutoSwitch: true,
          });
        }
        if (profile && isFreePlan(profile)) {
          if (!imageRequest.prompt) {
            throw new Error("Codex 生图请求缺少文本 prompt。");
          }
          console.info("[gateway:codex:image] using ChatGPT web image route for Free profile", {
            requestId: request.id,
            account: profileLogLabel(profile),
            model,
            imageModel: imageRequest.imageModel,
            promptLength: imageRequest.prompt.length,
            inputImageCount: imageRequest.inputImages.length,
            size: imageRequest.size ?? "default",
          });
          const imageResult = await generateChatGPTWebImage({
            profile,
            prompt: imageRequest.prompt,
            model: imageRequest.imageModel,
            inputImages: imageRequest.inputImages,
            size: imageRequest.size,
            responseFormat: "b64_json",
          });
          await ctx.authService.recordProfileRequestSuccess(profile.profileId, undefined, "openai-codex", {
            skipAutoSwitch: true,
          });
          headersCommitted = true;
          const syntheticStats = await sendSyntheticCodexImageSse({
            reply,
            result: imageResult,
            model,
            prompt: imageRequest.prompt,
            requestedSize: imageRequest.size,
            requestedOutputFormat: imageRequest.outputFormat,
          });
          streamFinished = true;
          pushGatewayRequestLog({
            method: request.method,
            endpoint: request.url,
            account: profileLogLabel(profile),
            model,
            statusCode: 200,
            durationMs: performance.now() - startedAt,
            source: "Codex",
            details: {
              requestId: request.id,
              remoteAddress: request.ip,
              userAgent: request.headers["user-agent"],
              request: summarizeResponsesRequest(data, request.url),
              response: {
                stream: true,
                passthrough: false,
                upstreamEndpoint,
                route: "chatgpt-web-image",
                imageModel: imageRequest.imageModel,
                imageCount: syntheticStats.imageCount,
                bytes: syntheticStats.bytes,
              },
            },
            usage: {
              profile,
              imageCount: syntheticStats.imageCount,
              imageRoute: "chatgpt-web",
            },
          });
          return reply;
        }
      }
      let upstream: Awaited<ReturnType<typeof streamOpenAICodex>> | null = null;
      const maxProfileAttempts = 5;
      const maxTransientStreamRetries = 1;
      let transientStreamRetryCount = 0;

      for (let attempt = 0; attempt < maxProfileAttempts; attempt += 1) {
        try {
          profile = stickyProfileId
            ? await ctx.authService.requireUsableProfileById(stickyProfileId, "openai-codex")
            : await ctx.authService.requireUsableProfile("openai-codex", {
                skipAutoSwitch: keepProfileSticky,
              });
          upstream = await streamOpenAICodex({
            profile,
            model,
            bodyOverride: codexBody,
            endpoint: upstreamEndpoint,
            passthroughBody: true,
            signal: abortController.signal,
          });
          break;
        } catch (error) {
          const quota = (error as { quota?: import("../core/types.js").CodexQuotaSnapshot }).quota;
          if (
            keepProfileSticky &&
            attempt < maxProfileAttempts - 1 &&
            await useAdventureFallback(error, quota)
          ) {
            continue;
          }
          if (
            !keepProfileSticky &&
            isTransientHttpError(error) &&
            transientStreamRetryCount < maxTransientStreamRetries &&
            attempt < maxProfileAttempts - 1 &&
            !abortController.signal.aborted
          ) {
            transientStreamRetryCount += 1;
            retryCount += 1;
            console.warn("[gateway:codex:stream] transient curl stream failure before headers; retrying request", {
              requestId: request.id,
              account: profileLogLabel(profile),
              model,
              retryCount,
              errorCode: (error as { code?: unknown }).code,
              upstreamRequestId: (error as { requestId?: unknown }).requestId,
              message: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
          if (!profile) {
            throw error;
          }
          const switchedProfile = await ctx.authService.recordProfileRequestFailure(profile.profileId, error, quota, "openai-codex", {
            skipAutoSwitch: keepProfileSticky,
          });
          failureRecorded = true;
          if (
            !keepProfileSticky &&
            attempt < maxProfileAttempts - 1 &&
            ctx.authService.isRotationTrigger(error, quota) &&
            switchedProfile &&
            switchedProfile.profileId !== profile.profileId &&
            !abortController.signal.aborted
          ) {
            retryCount += 1;
            failureRecorded = false;
            continue;
          }
          throw error;
        }
      }

      if (!upstream || !profile) {
        throw new Error("Codex stream 未能建立。");
      }

      await ctx.authService.recordProfileRequestSuccess(profile.profileId, upstream.quota, "openai-codex", {
        skipAutoSwitch: keepProfileSticky,
      });

      const headers: Record<string, string> = {
        "Content-Type": upstream.headers["content-type"] ?? "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      };
      if (adventureFallbackUsed) {
        headers["X-AZT-Codex-Continuation-Mode"] = "adventure-fallback";
      }
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (key.startsWith("x-codex-") || key === "x-request-id") {
          headers[key] = value;
        }
      }

      reply.raw.writeHead(upstream.status, headers);
      headersCommitted = true;
      reply.raw.flushHeaders?.();

      const streamStats = createSseStreamStats();
      for await (const chunk of Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0])) {
        trackSseChunk(streamStats, chunk);
        if (!reply.raw.write(chunk)) {
          await new Promise((resolve) => reply.raw.once("drain", resolve));
        }
      }
      streamFinished = true;
      reply.raw.end();
      for (const responseId of streamStats.responseIds) {
        rememberCodexResponseProfile(responseId, profile);
      }
      if (!streamStats.completed) {
        console.warn("[gateway:codex:stream] upstream stream ended without response.completed", {
          requestId: request.id,
          upstreamRequestId: upstream.requestId,
          account: profileLogLabel(profile),
          model,
          bytes: streamStats.bytes,
          terminalEvent: streamStats.terminalEvent,
        });
      }

      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: profileLogLabel(profile),
        model,
        statusCode: upstream.status,
        durationMs: performance.now() - startedAt,
        source: "Codex",
        details: {
          requestId: request.id,
          upstreamRequestId: upstream.requestId,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeResponsesRequest(data, request.url),
          response: {
            stream: true,
            passthrough: true,
            upstreamEndpoint,
            retryCount,
            profileSticky: keepProfileSticky,
            previousResponseId: originalPreviousResponseId ? "[present]" : undefined,
            previousResponseDropped: adventureFallbackUsed,
            adventureFallbackReason: adventureFallbackUsed ? truncateForLog(adventureFallbackReason ?? "") : undefined,
            stickyProfileResolved: Boolean(stickyProfileId),
            responseIdsTracked: streamStats.responseIds.size,
            completed: streamStats.completed,
            terminalEvent: streamStats.terminalEvent,
            bytes: streamStats.bytes,
            usageCaptured: Boolean(streamStats.tokenUsage),
          },
        },
        usage: {
          profile,
          tokenUsage: streamStats.tokenUsage,
          imageRoute: codexImageRoute,
        },
      });
      return reply;
    } catch (error) {
      const quota = (error as { quota?: import("../core/types.js").CodexQuotaSnapshot }).quota;
      if (profile && !failureRecorded) {
        await ctx.authService.recordProfileRequestFailure(profile.profileId, error, quota, "openai-codex", {
          skipAutoSwitch: Boolean(originalPreviousResponseId) && !adventureFallbackUsed,
        });
      }
      const normalized = normalizeError(error);
      const statusCode = getErrorStatusCode(normalized);
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: profileLogLabel(profile),
        model: data.model ?? "default",
        statusCode,
        durationMs: performance.now() - startedAt,
        source: "Codex",
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeResponsesRequest(data, request.url),
          response: {
            upstreamEndpoint,
            retryCount,
            profileSticky: Boolean(originalPreviousResponseId) && !adventureFallbackUsed,
            previousResponseId: originalPreviousResponseId ? "[present]" : undefined,
            previousResponseDropped: adventureFallbackUsed,
            adventureFallbackReason: adventureFallbackUsed ? truncateForLog(adventureFallbackReason ?? "") : undefined,
            stickyProfileResolved: Boolean(originalPreviousResponseId && codexResponseProfileBindings.has(originalPreviousResponseId)),
          },
          error: {
            message: normalized.message,
            code: (normalized as Error & { code?: unknown }).code,
            upstreamRequestId: (normalized as Error & { requestId?: unknown }).requestId,
            upstreamStatus: (normalized as Error & { upstreamStatus?: unknown }).upstreamStatus,
            upstreamErrorCode: (normalized as Error & { upstreamErrorCode?: unknown }).upstreamErrorCode,
            upstreamErrorMessage: (normalized as Error & { upstreamErrorMessage?: unknown }).upstreamErrorMessage,
          },
        },
        usage: {
          profile,
          imageRoute: codexImageRoute,
        },
      });
      if (headersCommitted) {
        streamFinished = true;
        reply.raw.end();
        return reply;
      }
      throw error;
    }
  }

  app.post("/codex/v1/responses", async (request, reply) => {
    const startedAt = performance.now();
    const parsed = responsesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: "-",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: "Codex",
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          error: {
            type: "validation_error",
            message: parsed.error.issues[0]?.message ?? "请求体格式错误",
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    return handleCodexResponsesPassthrough(request, reply, parsed.data, startedAt);
  });

  app.post("/codex/v1/responses/compact", { bodyLimit: codexCompactBodyLimit }, async (request, reply) => {
    const startedAt = performance.now();
    const parsed = responsesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: "-",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: "Codex",
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          error: {
            type: "validation_error",
            message: parsed.error.issues[0]?.message ?? "请求体格式错误",
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    return handleCodexResponsesPassthrough(request, reply, parsed.data, startedAt, "responses/compact");
  });

  app.post("/v1/responses", async (request, reply) => {
    const startedAt = performance.now();
    const parsed = responsesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: "-",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          error: {
            type: "validation_error",
            message: parsed.error.issues[0]?.message ?? "请求体格式错误",
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const wantsEventStream = typeof request.headers.accept === "string" && request.headers.accept.toLowerCase().includes("text/event-stream");
    const input = extractTextInput(parsed.data.input);

    const hasInput =
      typeof parsed.data.input !== "undefined" ||
      typeof parsed.data.experimental_codex?.body?.input !== "undefined";
    if (!hasInput) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: parsed.data.model ?? "default",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeResponsesRequest(parsed.data),
          error: {
            type: "validation_error",
            message: "没有提供 input，也没有在 experimental_codex.body 里透传 input",
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: "没有提供 input，也没有在 experimental_codex.body 里透传 input",
        },
      };
    }

    if (parsed.data.stream || wantsEventStream) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: parsed.data.model ?? "default",
        statusCode: 501,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeResponsesRequest(parsed.data),
          error: {
            type: "not_supported",
            message: "普通 Responses stream 尚未实现；Codex custom provider 请求会走专用透传路径。",
          },
        },
      });
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "普通 Responses stream 尚未实现；Codex custom provider 请求会走专用透传路径。",
        },
      };
    }

    const codexBody = createResponsesCodexBody(parsed.data);
    let result: ChatResult;
    try {
      result = await ctx.chatService.chat({
        model: parsed.data.model,
        input: input || undefined,
        system: parsed.data.instructions,
        experimental: {
          codexBody,
          allowUnknownModel: parsed.data.experimental_codex?.allow_unknown_model,
        },
      });
    } catch (error) {
      const normalized = normalizeError(error);
      const statusCode = getErrorStatusCode(normalized);
      const activeProfile = await ctx.authService.getActiveProfile();
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: profileLogLabel(activeProfile),
        model: parsed.data.model ?? "default",
        statusCode,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeResponsesRequest(parsed.data),
          codex: summarizeCodexChatBody(codexBody),
          error: {
            message: normalized.message,
            upstreamStatus: (normalized as Error & { upstreamStatus?: unknown }).upstreamStatus,
            upstreamErrorCode: (normalized as Error & { upstreamErrorCode?: unknown }).upstreamErrorCode,
            upstreamErrorMessage: (normalized as Error & { upstreamErrorMessage?: unknown }).upstreamErrorMessage,
          },
        },
        usage: {
          profile: activeProfile,
        },
      });
      throw error;
    }

    const activeProfile = result.profile ?? await ctx.authService.getActiveProfile();
    pushGatewayRequestLog({
      method: request.method,
      endpoint: request.url,
      account: profileLogLabel(activeProfile),
      model: result.model,
      statusCode: 200,
      durationMs: performance.now() - startedAt,
      source: requestSourceFromUserAgent(request.headers["user-agent"]),
      details: {
        requestId: request.id,
        remoteAddress: request.ip,
        userAgent: request.headers["user-agent"],
        request: summarizeResponsesRequest(parsed.data),
        codex: summarizeCodexChatBody(codexBody),
        response: {
          textPreview: truncateForLog(result.text),
          textLength: result.text.length,
          artifactCount: result.artifacts.length,
          retryCount: result.retryCount ?? 0,
        },
      },
      usage: {
        profile: activeProfile,
        tokenUsage: extractTokenUsage(result.raw),
      },
    });

    return buildResponseApiBody(result, parsed.data.experimental_codex?.include_raw);
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    const startedAt = performance.now();
    const parsed = chatCompletionsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: "-",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: "API",
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          error: {
            type: "validation_error",
            message: parsed.error.issues[0]?.message ?? "请求体格式错误",
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    if (typeof parsed.data.n === "number" && parsed.data.n > 1) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: parsed.data.model ?? "default",
        statusCode: 501,
        durationMs: performance.now() - startedAt,
        source: "API",
        details: {
          requestId: request.id,
          request: summarizeChatCompletionsRequest(parsed.data),
          error: {
            type: "not_supported",
            message: "当前网关暂不支持一次返回多个 choices（n > 1）",
          },
        },
      });
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前网关暂不支持一次返回多个 choices（n > 1）",
        },
      };
    }

    const codexBody = createChatCompletionsCodexBody(parsed.data);
    console.info("[gateway:chat:request]", {
      requestId: request.id,
      remoteAddress: request.ip,
      userAgent: request.headers["user-agent"],
      ...summarizeChatCompletionsRequest(parsed.data),
      codex: summarizeCodexChatBody(codexBody),
    });
    const fallbackInput = parsed.data.messages
      .map((message) =>
        typeof message.content === "string"
          ? message.content
          : (message.content ?? [])
              .map((part) => (typeof part.text === "string" ? part.text : ""))
              .filter(Boolean)
              .join("\n"),
      )
      .filter(Boolean)
      .join("\n")
      .trim();

    let result: ChatResult;
    try {
      result = await ctx.chatService.chat({
        model: parsed.data.model,
        input: fallbackInput || undefined,
        experimental: {
          codexBody,
        },
      });
    } catch (error) {
      const normalized = normalizeError(error);
      const statusCode = getErrorStatusCode(normalized);
      const activeProfile = await ctx.authService.getActiveProfile();
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: profileLogLabel(activeProfile),
        model: parsed.data.model ?? "default",
        statusCode,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeChatCompletionsRequest(parsed.data),
          codex: summarizeCodexChatBody(codexBody),
          error: {
            message: normalized.message,
            upstreamStatus: (normalized as Error & { upstreamStatus?: unknown }).upstreamStatus,
            upstreamErrorCode: (normalized as Error & { upstreamErrorCode?: unknown }).upstreamErrorCode,
            upstreamErrorMessage: (normalized as Error & { upstreamErrorMessage?: unknown }).upstreamErrorMessage,
          },
        },
        usage: {
          profile: activeProfile,
        },
      });
      throw error;
    }

    const activeProfile = result.profile ?? await ctx.authService.getActiveProfile();
    pushGatewayRequestLog({
      method: request.method,
      endpoint: request.url,
      account: profileLogLabel(activeProfile),
      model: result.model,
      statusCode: 200,
      durationMs: performance.now() - startedAt,
      source: requestSourceFromUserAgent(request.headers["user-agent"]),
      details: {
        requestId: request.id,
        remoteAddress: request.ip,
        userAgent: request.headers["user-agent"],
        request: summarizeChatCompletionsRequest(parsed.data),
        codex: summarizeCodexChatBody(codexBody),
        response: {
          textPreview: truncateForLog(result.text),
          textLength: result.text.length,
          toolCallCount: result.toolCalls.length,
          toolCalls: result.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            argumentsPreview: truncateForLog(toolCall.function.arguments),
          })),
          artifactCount: result.artifacts.length,
          stream: parsed.data.stream ?? false,
          retryCount: result.retryCount ?? 0,
        },
      },
      usage: {
        profile: activeProfile,
        tokenUsage: extractTokenUsage(result.raw),
      },
    });
    console.info("[gateway:chat:response]", {
      requestId: request.id,
      model: result.model,
      stream: parsed.data.stream ?? false,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      textLength: result.text.length,
      toolCallCount: result.toolCalls.length,
      artifactCount: result.artifacts.length,
    });

    if (parsed.data.stream) {
      sendChatCompletionsStream(reply, result);
      return reply;
    }

    return buildChatCompletionsBody(result);
  });

  app.post("/v1/images/generations", async (request, reply) => {
    const startedAt = performance.now();
    const parsed = imageGenerationsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      console.error("[gateway:image] validation failure", {
        method: request.method,
        url: request.url,
        issue: parsed.error.issues[0]?.message ?? "请求体格式错误",
      });
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: "-",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          error: {
            type: "validation_error",
            message: parsed.error.issues[0]?.message ?? "请求体格式错误",
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const validationError = validateImageRequest(parsed.data);
    if (validationError) {
      console.error("[gateway:image] validation failure", {
        method: request.method,
        url: request.url,
        summary: summarizeImageRequestForLog(parsed.data),
        issue: validationError,
      });
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: parsed.data.model ?? "gpt-image-2",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeImageRequestForLog(parsed.data),
          error: {
            type: "validation_error",
            message: validationError,
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: validationError,
        },
      };
    }

    if (typeof parsed.data.n === "number" && parsed.data.n > 1) {
      console.error("[gateway:image] not supported", {
        method: request.method,
        url: request.url,
        summary: summarizeImageRequestForLog(parsed.data),
        issue: "当前网关暂不支持 images.generations 一次返回多张图（n > 1）",
      });
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: parsed.data.model ?? "gpt-image-2",
        statusCode: 501,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeImageRequestForLog(parsed.data),
          error: {
            type: "not_supported",
            message: "当前网关暂不支持 images.generations 一次返回多张图（n > 1）",
          },
        },
      });
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前网关暂不支持 images.generations 一次返回多张图（n > 1）",
        },
      };
    }

    const requestSummary = summarizeImageRequestForLog(parsed.data);
    console.info("[gateway:image] request accepted", {
      method: request.method,
      url: request.url,
      summary: requestSummary,
    });

    const activeProfile = await ctx.authService.getActiveProfile();
    const settings = await ctx.configService.getSettings();
    const imageRoute: UsageImageRoute = activeProfile && isFreePlan(activeProfile) && settings.image.freeAccountWebGenerationEnabled ? "chatgpt-web" : "codex-tool";
    let response: Awaited<ReturnType<typeof ctx.imageService.generate>>;
    try {
      response = await ctx.imageService.generate({
        prompt: parsed.data.prompt,
        model: parsed.data.model,
        n: parsed.data.n,
        size: parsed.data.size,
        quality: parsed.data.quality,
        background: parsed.data.background,
        outputFormat: parsed.data.output_format,
        outputCompression: parsed.data.output_compression,
        moderation: parsed.data.moderation,
      });
    } catch (error) {
      const normalized = normalizeError(error);
      const statusCode = getErrorStatusCode(normalized);
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: profileLogLabel(activeProfile),
        model: parsed.data.model ?? "gpt-image-2",
        statusCode,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: requestSummary,
          error: {
            message: normalized.message,
            upstreamStatus: (normalized as Error & { upstreamStatus?: unknown }).upstreamStatus,
            upstreamErrorCode: (normalized as Error & { upstreamErrorCode?: unknown }).upstreamErrorCode,
            upstreamErrorMessage: (normalized as Error & { upstreamErrorMessage?: unknown }).upstreamErrorMessage,
          },
        },
        usage: {
          profile: activeProfile,
          imageRoute,
        },
      });
      throw error;
    }

    console.info("[gateway:image] response ready", {
      method: request.method,
      url: request.url,
      summary: requestSummary,
      created: response.created,
      imageCount: response.data.length,
      output_format: response.output_format,
      quality: response.quality,
      size: response.size,
    });
    pushGatewayRequestLog({
      method: request.method,
      endpoint: request.url,
      account: profileLogLabel(activeProfile),
      model: parsed.data.model ?? "gpt-image-2",
      statusCode: 200,
      durationMs: performance.now() - startedAt,
      source: requestSourceFromUserAgent(request.headers["user-agent"]),
      details: {
        requestId: request.id,
        remoteAddress: request.ip,
        userAgent: request.headers["user-agent"],
        request: requestSummary,
        response: {
          imageCount: response.data.length,
          outputFormat: response.output_format,
          quality: response.quality,
          size: response.size,
        },
      },
      usage: {
        profile: activeProfile,
        tokenUsage: imageUsageToTokenUsage(response.usage),
        imageCount: response.data.length,
        imageRoute,
      },
    });

    return response;
  });

  app.post("/v1/images/edits", async (request, reply) => {
    const startedAt = performance.now();
    const contentType = request.headers["content-type"] ?? "";
    if (!String(contentType).toLowerCase().includes("application/json")) {
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: "-",
        statusCode: 415,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          error: {
            type: "unsupported_media_type",
            message: "当前网关仅支持 JSON 版 images.edits；请使用 application/json，并通过 images[].image_url 传 URL 或 base64 data URL。",
          },
        },
      });
      reply.code(415);
      return {
        error: {
          type: "unsupported_media_type",
          message: "当前网关仅支持 JSON 版 images.edits；请使用 application/json，并通过 images[].image_url 传 URL 或 base64 data URL。",
        },
      };
    }

    const parsed = imageEditsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      console.error("[gateway:image:edit] validation failure", {
        method: request.method,
        url: request.url,
        issue: parsed.error.issues[0]?.message ?? "请求体格式错误",
      });
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: "-",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          error: {
            type: "validation_error",
            message: parsed.error.issues[0]?.message ?? "请求体格式错误",
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    const validationError = validateImageEditRequest(parsed.data);
    if (validationError) {
      console.error("[gateway:image:edit] validation failure", {
        method: request.method,
        url: request.url,
        summary: summarizeImageEditRequestForLog(parsed.data),
        issue: validationError,
      });
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: parsed.data.model ?? "gpt-image-2",
        statusCode: 400,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeImageEditRequestForLog(parsed.data),
          error: {
            type: "validation_error",
            message: validationError,
          },
        },
      });
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: validationError,
        },
      };
    }

    if (typeof parsed.data.n === "number" && parsed.data.n > 1) {
      console.error("[gateway:image:edit] not supported", {
        method: request.method,
        url: request.url,
        summary: summarizeImageEditRequestForLog(parsed.data),
        issue: "当前网关暂不支持 images.edits 一次返回多张图（n > 1）",
      });
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: "-",
        model: parsed.data.model ?? "gpt-image-2",
        statusCode: 501,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: summarizeImageEditRequestForLog(parsed.data),
          error: {
            type: "not_supported",
            message: "当前网关暂不支持 images.edits 一次返回多张图（n > 1）",
          },
        },
      });
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前网关暂不支持 images.edits 一次返回多张图（n > 1）",
        },
      };
    }

    const imageReferences = getImageEditReferences(parsed.data)
      .map((reference) => normalizeJsonImageReference(reference))
      .map((reference) => ({
        imageUrl: reference.imageUrl ?? "",
      }));
    const requestSummary = summarizeImageEditRequestForLog(parsed.data);
    console.info("[gateway:image:edit] request accepted", {
      method: request.method,
      url: request.url,
      summary: requestSummary,
    });

    const activeProfile = await ctx.authService.getActiveProfile();
    const settings = await ctx.configService.getSettings();
    const imageRoute: UsageImageRoute = activeProfile && isFreePlan(activeProfile) && settings.image.freeAccountWebGenerationEnabled ? "chatgpt-web" : "codex-tool";
    let response: Awaited<ReturnType<typeof ctx.imageService.generate>>;
    try {
      response = await ctx.imageService.generate({
        prompt: parsed.data.prompt,
        inputImages: imageReferences,
        model: parsed.data.model,
        n: parsed.data.n,
        size: parsed.data.size,
        quality: parsed.data.quality,
        background: parsed.data.background,
        outputFormat: parsed.data.output_format,
        outputCompression: parsed.data.output_compression,
        moderation: parsed.data.moderation,
      });
    } catch (error) {
      const normalized = normalizeError(error);
      const statusCode = getErrorStatusCode(normalized);
      pushGatewayRequestLog({
        method: request.method,
        endpoint: request.url,
        account: profileLogLabel(activeProfile),
        model: parsed.data.model ?? "gpt-image-2",
        statusCode,
        durationMs: performance.now() - startedAt,
        source: requestSourceFromUserAgent(request.headers["user-agent"]),
        details: {
          requestId: request.id,
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          request: requestSummary,
          error: {
            message: normalized.message,
            upstreamStatus: (normalized as Error & { upstreamStatus?: unknown }).upstreamStatus,
            upstreamErrorCode: (normalized as Error & { upstreamErrorCode?: unknown }).upstreamErrorCode,
            upstreamErrorMessage: (normalized as Error & { upstreamErrorMessage?: unknown }).upstreamErrorMessage,
          },
        },
        usage: {
          profile: activeProfile,
          imageRoute,
        },
      });
      throw error;
    }

    console.info("[gateway:image:edit] response ready", {
      method: request.method,
      url: request.url,
      summary: requestSummary,
      created: response.created,
      imageCount: response.data.length,
      output_format: response.output_format,
      quality: response.quality,
      size: response.size,
    });
    pushGatewayRequestLog({
      method: request.method,
      endpoint: request.url,
      account: profileLogLabel(activeProfile),
      model: parsed.data.model ?? "gpt-image-2",
      statusCode: 200,
      durationMs: performance.now() - startedAt,
      source: requestSourceFromUserAgent(request.headers["user-agent"]),
      details: {
        requestId: request.id,
        remoteAddress: request.ip,
        userAgent: request.headers["user-agent"],
        request: requestSummary,
        response: {
          imageCount: response.data.length,
          outputFormat: response.output_format,
          quality: response.quality,
          size: response.size,
        },
      },
      usage: {
        profile: activeProfile,
        tokenUsage: imageUsageToTokenUsage(response.usage),
        imageCount: response.data.length,
        imageRoute,
      },
    });

    return response;
  });

  return app;
}
