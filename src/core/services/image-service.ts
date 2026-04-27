import { AuthService } from "./auth-service.js";
import { ConfigService } from "./config-service.js";
import { askOpenAICodex } from "../providers/openai-codex/chat.js";
import type { OAuthProfile } from "../types.js";

type ImageRequest = {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  background?: "transparent" | "opaque" | "auto";
  outputFormat?: "png" | "webp" | "jpeg";
  outputCompression?: number;
  moderation?: "auto" | "low";
};

type ImageResult = {
  created: number;
  data: Array<{
    b64_json: string;
    revised_prompt?: string;
  }>;
  background?: "transparent" | "opaque";
  output_format?: "png" | "webp" | "jpeg";
  quality?: "low" | "medium" | "high";
  size?: string;
  usage?: {
    input_tokens: number;
    input_tokens_details?: {
      image_tokens: number;
      text_tokens: number;
    };
    output_tokens: number;
    output_tokens_details?: {
      image_tokens: number;
      text_tokens: number;
    };
    total_tokens: number;
  };
};

type ImageGenerationOutput = {
  id?: string;
  type?: string;
  result?: string;
  partial_image_b64?: string;
  revised_prompt?: string;
  background?: string;
  output_format?: string;
  quality?: string;
  size?: string;
};

type ImageFailureDetails = {
  code?: string;
  message: string;
  requestId?: string;
  transient: boolean;
};

const SUPPORTED_IMAGE_MODELS = new Set([
  "gpt-image-1",
  "gpt-image-1-mini",
  "gpt-image-1.5",
  "gpt-image-2",
]);

const SUPPORTED_IMAGE_QUALITIES = new Set([
  "low",
  "medium",
  "high",
]);

const SUPPORTED_IMAGE_FORMATS = new Set([
  "png",
  "webp",
  "jpeg",
]);

const SUPPORTED_IMAGE_BACKGROUNDS = new Set([
  "transparent",
  "opaque",
]);

const IMAGE_GENERATION_MAX_ATTEMPTS = 3;
const IMAGE_GENERATION_RETRY_DELAYS_MS = [1500, 4000];

function truncateForLog(value: string, max = 160): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toImageGenerationOutput(value: unknown): ImageGenerationOutput | null {
  if (!isRecord(value) || value.type !== "image_generation_call") {
    return null;
  }

  return value as ImageGenerationOutput;
}

function toImageGenerationEventOutput(value: unknown): ImageGenerationOutput | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  if (value.type.startsWith("response.output_item.") && isRecord(value.item)) {
    return toImageGenerationOutput(value.item);
  }

  if (value.type === "response.image_generation_call.partial_image") {
    return {
      id: typeof value.item_id === "string" ? value.item_id : undefined,
      type: "image_generation_call",
      partial_image_b64: typeof value.partial_image_b64 === "string" ? value.partial_image_b64 : undefined,
      background: typeof value.background === "string" ? value.background : undefined,
      output_format: typeof value.output_format === "string" ? value.output_format : undefined,
      size: typeof value.size === "string" ? value.size : undefined,
    };
  }

  return null;
}

function normalizeReturnedSize(size: unknown, fallback?: string): ImageResult["size"] | undefined {
  if (typeof size === "string" && size.trim()) {
    return size.trim();
  }

  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }

  return undefined;
}

function normalizeReturnedQuality(quality: unknown): ImageResult["quality"] | undefined {
  if (typeof quality === "string" && SUPPORTED_IMAGE_QUALITIES.has(quality)) {
    return quality as ImageResult["quality"];
  }

  return undefined;
}

function normalizeReturnedFormat(format: unknown): ImageResult["output_format"] | undefined {
  if (typeof format === "string" && SUPPORTED_IMAGE_FORMATS.has(format)) {
    return format as ImageResult["output_format"];
  }

  return undefined;
}

function normalizeReturnedBackground(background: unknown): ImageResult["background"] | undefined {
  if (typeof background === "string" && SUPPORTED_IMAGE_BACKGROUNDS.has(background)) {
    return background as ImageResult["background"];
  }

  return undefined;
}

function collectImageGenerationOutputs(raw: unknown): ImageGenerationOutput[] {
  if (!isRecord(raw)) {
    return [];
  }

  const finalItems = new Map<string, ImageGenerationOutput>();
  const partialItems = new Map<string, ImageGenerationOutput>();
  const response = isRecord(raw.response) ? raw.response : null;
  const events = Array.isArray(raw.events) ? raw.events : [];

  if (response && Array.isArray(response.output)) {
    for (const output of response.output) {
      const image = toImageGenerationOutput(output);
      if (!image || !image.id) {
        continue;
      }

      if (typeof image.result === "string" && image.result.length > 0) {
        finalItems.set(image.id, image);
      } else if (typeof image.partial_image_b64 === "string" && image.partial_image_b64.length > 0) {
        partialItems.set(image.id, image);
      }
    }
  }

  for (const event of events) {
    const image = toImageGenerationEventOutput(event);
    if (!image || !image.id) {
      continue;
    }

    if (typeof image.result === "string" && image.result.length > 0) {
      finalItems.set(image.id, image);
    } else if (typeof image.partial_image_b64 === "string" && image.partial_image_b64.length > 0) {
      partialItems.set(image.id, image);
    }
  }

  if (finalItems.size > 0) {
    return Array.from(finalItems.values());
  }

  return Array.from(partialItems.values()).map((item) => ({
    ...item,
    result: item.partial_image_b64,
  }));
}

function summarizeImageDebug(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) {
    return {
      rawType: typeof raw,
    };
  }

  const response = isRecord(raw.response) ? raw.response : null;
  const events = Array.isArray(raw.events) ? raw.events : [];
  const imageEvents = events
    .filter((event) => isRecord(event) && typeof event.type === "string" && event.type.includes("image_generation"))
    .slice(0, 12)
    .map((event) => {
      const safeEvent = event as Record<string, unknown>;
      return {
        type: safeEvent.type,
        item_id: typeof safeEvent.item_id === "string" ? safeEvent.item_id : undefined,
        output_index: typeof safeEvent.output_index === "number" ? safeEvent.output_index : undefined,
        partial_image_b64_length:
          typeof safeEvent.partial_image_b64 === "string" ? safeEvent.partial_image_b64.length : undefined,
      };
    });

  return {
    response_status: typeof response?.status === "string" ? response.status : undefined,
    response_error: isRecord(response?.error)
      ? {
          code: typeof response.error.code === "string" ? response.error.code : undefined,
          message: typeof response.error.message === "string" ? response.error.message : undefined,
          type: typeof response.error.type === "string" ? response.error.type : undefined,
        }
      : undefined,
    response_output_length: Array.isArray(response?.output) ? response.output.length : 0,
    event_count: events.length,
    event_types: events
      .filter((event) => isRecord(event) && typeof event.type === "string")
      .slice(0, 20)
      .map((event) => (event as Record<string, unknown>).type),
    error_events: events
      .filter((event) => isRecord(event) && (event.type === "error" || event.type === "response.failed"))
      .slice(0, 5)
      .map((event) => {
        const safeEvent = event as Record<string, unknown>;
        const eventError = isRecord(safeEvent.error) ? safeEvent.error : null;
        const eventResponse = isRecord(safeEvent.response) ? safeEvent.response : null;
        const responseError = eventResponse && isRecord(eventResponse.error) ? eventResponse.error : null;
        return {
          type: safeEvent.type,
          code:
            typeof eventError?.code === "string"
              ? eventError.code
              : typeof responseError?.code === "string"
                ? responseError.code
                : undefined,
          message:
            typeof eventError?.message === "string"
              ? eventError.message
              : typeof responseError?.message === "string"
                ? responseError.message
                : undefined,
        };
      }),
    image_events: imageEvents,
  };
}

function extractRequestIdFromMessage(message: string): string | undefined {
  const match = message.match(/request ID ([a-z0-9-]+)/i);
  return match?.[1];
}

function createImageFailureDetails(code: unknown, message: unknown): ImageFailureDetails | null {
  const normalizedMessage =
    typeof message === "string" && message.trim()
      ? message.trim()
      : typeof code === "string" && code.trim()
        ? code.trim()
        : null;

  if (!normalizedMessage) {
    return null;
  }

  const normalizedCode = typeof code === "string" && code.trim() ? code.trim() : undefined;
  return {
    code: normalizedCode,
    message: normalizedMessage,
    requestId: extractRequestIdFromMessage(normalizedMessage),
    transient:
      normalizedCode === "server_error" ||
      /retry your request/i.test(normalizedMessage) ||
      /temporar/i.test(normalizedMessage),
  };
}

function extractImageFailureDetails(raw: unknown): ImageFailureDetails | null {
  if (!isRecord(raw)) {
    return null;
  }

  const response = isRecord(raw.response) ? raw.response : null;
  if (response) {
    const responseError = isRecord(response.error) ? response.error : null;
    const responseStatus = typeof response.status === "string" ? response.status : undefined;
    const details = createImageFailureDetails(responseError?.code, responseError?.message);
    if (responseStatus === "failed" && details) {
      return details;
    }
  }

  const events = Array.isArray(raw.events) ? raw.events : [];
  for (const event of events) {
    if (!isRecord(event)) {
      continue;
    }

    if (event.type === "error") {
      const eventError = isRecord(event.error) ? event.error : event;
      const details = createImageFailureDetails(eventError.code, eventError.message);
      if (details) {
        return details;
      }
    }

    if (event.type === "response.failed" && isRecord(event.response)) {
      const responseError = isRecord(event.response.error) ? event.response.error : null;
      const details = createImageFailureDetails(responseError?.code, responseError?.message);
      if (details) {
        return details;
      }
    }
  }

  return null;
}

function createError(message: string, statusCode: number): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractImageUsage(raw: unknown): ImageResult["usage"] | undefined {
  if (!isRecord(raw) || !isRecord(raw.response)) {
    return undefined;
  }

  const toolUsage = isRecord(raw.response.tool_usage) ? raw.response.tool_usage : null;
  const imageGen = toolUsage && isRecord(toolUsage.image_gen) ? toolUsage.image_gen : null;
  if (
    !imageGen ||
    typeof imageGen.input_tokens !== "number" ||
    typeof imageGen.output_tokens !== "number" ||
    typeof imageGen.total_tokens !== "number"
  ) {
    return undefined;
  }

  return {
    input_tokens: imageGen.input_tokens,
    input_tokens_details: isRecord(imageGen.input_tokens_details)
      ? {
          image_tokens: Number(imageGen.input_tokens_details.image_tokens ?? 0),
          text_tokens: Number(imageGen.input_tokens_details.text_tokens ?? 0),
        }
      : undefined,
    output_tokens: imageGen.output_tokens,
    output_tokens_details: isRecord(imageGen.output_tokens_details)
      ? {
          image_tokens: Number(imageGen.output_tokens_details.image_tokens ?? 0),
          text_tokens: Number(imageGen.output_tokens_details.text_tokens ?? 0),
        }
      : undefined,
    total_tokens: imageGen.total_tokens,
  };
}

export class ImageService {
  constructor(
    private readonly deps: {
      authService: AuthService;
      configService: ConfigService;
    },
  ) {}

  private resolveRequestedImageModel(model?: string): string {
    if (!model) {
      return "gpt-image-2";
    }

    if (!SUPPORTED_IMAGE_MODELS.has(model)) {
      throw new Error(`当前网关仅支持这些生图模型: ${Array.from(SUPPORTED_IMAGE_MODELS).join(", ")}`);
    }

    return model;
  }

  private isFreePlan(profile: OAuthProfile): boolean {
    return profile.quota?.planType === "free";
  }

  async generate(request: ImageRequest): Promise<ImageResult> {
    const profile = await this.deps.authService.requireUsableProfile("openai-codex");
    if (this.isFreePlan(profile)) {
      throw new Error("当前账号为 free 套餐，不支持图片生成。请切换到 Plus 或更高套餐账号。");
    }
    const orchestratorModel = await this.deps.configService.getDefaultModel();
    const requestedImageModel = this.resolveRequestedImageModel(request.model);
    const requestSummary = {
      requestedImageModel,
      orchestratorModel,
      promptLength: request.prompt.length,
      promptPreview: truncateForLog(request.prompt),
      size: request.size ?? "default",
      quality: request.quality ?? "default",
      background: request.background ?? "default",
      outputFormat: request.outputFormat ?? "default",
      outputCompression: typeof request.outputCompression === "number" ? request.outputCompression : undefined,
      moderation: request.moderation ?? "default",
    };

    console.info("[gateway:image] upstream request", requestSummary);

    const tool: Record<string, unknown> = {
      type: "image_generation",
      model: requestedImageModel,
    };

    if (request.size) {
      tool.size = request.size;
    }
    if (request.quality) {
      tool.quality = request.quality;
    }
    if (request.background) {
      tool.background = request.background;
    }
    if (request.outputFormat) {
      tool.output_format = request.outputFormat;
    }
    if (typeof request.outputCompression === "number") {
      tool.output_compression = request.outputCompression;
    }
    if (request.moderation) {
      tool.moderation = request.moderation;
    }

    for (let attempt = 1; attempt <= IMAGE_GENERATION_MAX_ATTEMPTS; attempt += 1) {
      let result;
      try {
        result = await askOpenAICodex({
          profile,
          model: orchestratorModel,
          bodyOverride: {
            model: orchestratorModel,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: request.prompt,
                  },
                ],
              },
            ],
            tools: [tool],
            tool_choice: {
              type: "image_generation",
            },
            include: ["reasoning.encrypted_content"],
          },
        });
        await this.deps.authService.updateProfileQuota(profile.profileId, result.quota, "openai-codex");
      } catch (error) {
        const quota = (error as { quota?: import("../types.js").CodexQuotaSnapshot }).quota;
        await this.deps.authService.updateProfileQuota(profile.profileId, quota, "openai-codex");
        throw error;
      }

      const raw = isRecord(result.raw) ? result.raw : {};
      const response = isRecord(raw.response) ? raw.response : null;
      const images = collectImageGenerationOutputs(raw);
      const debugSummary = summarizeImageDebug(raw);
      if (images.length === 0) {
        const upstreamFailure = extractImageFailureDetails(raw);
        console.error("[gateway:image] parse failure", {
          ...requestSummary,
          attempt,
          upstreamFailure,
          debug: debugSummary,
        });

        if (upstreamFailure?.transient && attempt < IMAGE_GENERATION_MAX_ATTEMPTS) {
          const retryDelayMs = IMAGE_GENERATION_RETRY_DELAYS_MS[attempt - 1] ?? 4000;
          console.warn("[gateway:image] transient upstream failure, retrying", {
            ...requestSummary,
            attempt,
            retryDelayMs,
            code: upstreamFailure.code,
            requestId: upstreamFailure.requestId,
          });
          await sleep(retryDelayMs);
          continue;
        }

        if (upstreamFailure) {
          const reason = upstreamFailure.code ? `${upstreamFailure.code}: ${upstreamFailure.message}` : upstreamFailure.message;
          throw createError(`上游图片生成失败: ${reason}`, upstreamFailure.transient ? 503 : 502);
        }
        throw createError("图片生成请求已完成，但没有解析出 image_generation_call 结果。", 502);
      }

      const first = images[0];
      const imageResult = {
        created:
          typeof response?.created_at === "number"
            ? response.created_at
            : Math.floor(Date.now() / 1000),
        data: images.map((image) => ({
          b64_json: image.result ?? "",
          ...(image.revised_prompt ? { revised_prompt: image.revised_prompt } : {}),
        })),
        background: normalizeReturnedBackground(first.background),
        output_format: normalizeReturnedFormat(first.output_format),
        quality: normalizeReturnedQuality(first.quality),
        size: normalizeReturnedSize(first.size, request.size),
        usage: extractImageUsage(raw),
      };

      console.info("[gateway:image] upstream response", {
        ...requestSummary,
        attempt,
        imageCount: imageResult.data.length,
        firstImageBase64Length: imageResult.data[0]?.b64_json.length ?? 0,
        outputFormat: imageResult.output_format ?? request.outputFormat ?? "unknown",
        quality: imageResult.quality ?? request.quality ?? "unknown",
        size: imageResult.size ?? request.size ?? "unknown",
        debug: debugSummary,
      });

      return imageResult;
    }

    throw createError("图片生成失败：超过最大重试次数。", 503);
  }
}
