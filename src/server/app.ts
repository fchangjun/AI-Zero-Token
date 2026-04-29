import { randomUUID } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { createGatewayContext } from "../core/context.js";
import type { ChatResult, OAuthProfile, ProfileSummary } from "../core/types.js";
import { renderAdminPage } from "./admin-page.js";

const inputPartSchema = z
  .object({
    type: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();

const inputMessageSchema = z
  .object({
    role: z.string().optional(),
    content: z.array(inputPartSchema).optional(),
  })
  .passthrough();

const responsesBodySchema = z.object({
  model: z.string().optional(),
  input: z.union([z.string(), z.array(inputMessageSchema)]).optional(),
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
});

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
});

const profileActionSchema = z.object({
  profileId: z.string().min(1),
});

const profileImportSchema = z.object({
  profile: z.unknown(),
});

const profileExportSchema = z.object({
  profileId: z.string().min(1).optional(),
  profileIds: z.array(z.string().min(1)).optional(),
  all: z.boolean().optional(),
});

const codexApplySchema = z.object({
  profileId: z.string().min(1),
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

const chatCompletionExcludedKeys = new Set([
  "messages",
  "n",
  "stream",
  "max_tokens",
  "max_completion_tokens",
]);

function extractTextInput(input: z.infer<typeof responsesBodySchema>["input"]): string {
  if (typeof input === "undefined") {
    return "";
  }

  if (typeof input === "string") {
    return input;
  }

  const chunks: string[] = [];
  for (const item of input) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function normalizeResponseInput(input: z.infer<typeof responsesBodySchema>["input"]): unknown {
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

function normalizeChatContentPart(part: z.infer<typeof chatCompletionContentPartSchema>): Record<string, unknown> {
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
    type: "input_text",
    text,
  };
}

function normalizeChatContent(
  content: z.infer<typeof chatCompletionMessageSchema>["content"],
): Array<Record<string, unknown>> {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  if (!Array.isArray(content) || content.length === 0) {
    return [{ type: "input_text", text: "" }];
  }

  return content.map((part) => normalizeChatContentPart(part));
}

function normalizeChatMessages(
  messages: z.infer<typeof chatCompletionsBodySchema>["messages"],
): Array<Record<string, unknown>> {
  return messages.map((message) => ({
    role: normalizeChatRole(message.role),
    content: normalizeChatContent(message.content),
    ...(message.name ? { name: message.name } : {}),
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
  }));
}

function createChatCompletionsCodexBody(
  data: z.infer<typeof chatCompletionsBodySchema>,
): Record<string, unknown> {
  const body = Object.fromEntries(
    Object.entries(data).filter(([key]) => !chatCompletionExcludedKeys.has(key)),
  );

  if (typeof data.max_completion_tokens === "number") {
    body.max_output_tokens = data.max_completion_tokens;
  } else if (typeof data.max_tokens === "number") {
    body.max_output_tokens = data.max_tokens;
  }

  body.input = normalizeChatMessages(data.messages);
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
  const body: Record<string, unknown> = {
    id: `chatcmpl_${randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: result.text,
        },
      },
    ],
  };

  if (result.artifacts.length > 0) {
    body.artifacts = result.artifacts;
  }

  return body;
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

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getErrorStatusCode(error: unknown): number {
  const normalized = normalizeError(error) as Error & { statusCode?: number };
  if (typeof normalized.statusCode === "number") {
    return normalized.statusCode;
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

export function createApp(params?: {
  corsOrigin?: true | string | RegExp | Array<string | RegExp>;
}) {
  const app = Fastify({
    logger: false,
  });
  const ctx = createGatewayContext();

  void app.register(cors, {
    origin: params?.corsOrigin ?? true,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
  });

  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error);
    const statusCode = getErrorStatusCode(normalized);
    console.error("[gateway:error]", {
      method: request.method,
      url: request.url,
      statusCode,
      message: normalized.message,
      stack: normalized.stack,
    });
    reply.code(statusCode);
    return {
      error: {
        type: "gateway_error",
        message: normalized.message,
      },
    };
  });

  async function buildAdminConfig(request: FastifyRequest) {
    const [status, models, modelCatalog, versionStatus, settings, profile, profiles, codexStatus] = await Promise.all([
      ctx.authService.getStatus(),
      ctx.modelService.listModels(),
      ctx.modelService.getCatalog(),
      ctx.versionService.getVersionStatus(),
      ctx.configService.getSettings(),
      ctx.authService.getActiveProfile(),
      ctx.authService.listProfiles(),
      ctx.authService.getCodexStatus(),
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
      adminUrl: `${origin}/`,
      baseUrl: `${origin}/v1`,
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
    reply.header("Content-Type", "text/html; charset=utf-8");
    return renderAdminPage();
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

  app.post("/_gateway/admin/runtime-refresh", async (request) => {
    await Promise.all([
      ctx.authService.syncActiveProfileQuota("openai-codex", {
        suppressErrors: true,
      }),
      ctx.versionService.getVersionStatus({
        force: true,
      }),
    ]);

    return buildAdminConfig(request);
  });

  app.get("/_gateway/admin/config", async (request) => buildAdminConfig(request));

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
    });
    return buildAdminConfig(request);
  });

  app.post("/_gateway/admin/profiles/sync-quota", async (request) => {
    await ctx.authService.syncActiveProfileQuota("openai-codex");
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
        profile: await ctx.authService.exportProfiles(parsed.data.profileIds),
      };
    }

    return {
      profile: await ctx.authService.exportProfile(parsed.data.profileId),
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

    if (parsed.data.defaultModel) {
      await ctx.configService.setDefaultModel(parsed.data.defaultModel);
    }
    if (parsed.data.networkProxy) {
      await ctx.configService.setNetworkProxy(parsed.data.networkProxy);
    }
    return buildAdminConfig(request);
  });

  app.get("/v1/models", async () => ({
    object: "list",
    data: (await ctx.modelService.listModels()).map((model) => ({
      id: model.id,
      object: "model",
      owned_by: model.provider,
    })),
  }));

  app.post("/v1/responses", async (request, reply) => {
    const parsed = responsesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    if (parsed.data.stream) {
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前网关暂不支持 stream=true",
        },
      };
    }

    const input = extractTextInput(parsed.data.input);
    const hasInput =
      typeof parsed.data.input !== "undefined" ||
      typeof parsed.data.experimental_codex?.body?.input !== "undefined";
    if (!hasInput) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: "没有提供 input，也没有在 experimental_codex.body 里透传 input",
        },
      };
    }

    const codexBody: Record<string, unknown> = {
      ...(parsed.data.experimental_codex?.body ?? {}),
    };
    const normalizedInput = normalizeResponseInput(parsed.data.input);
    if (typeof normalizedInput !== "undefined") {
      codexBody.input = normalizedInput;
    }
    if (typeof parsed.data.instructions === "string") {
      codexBody.instructions = parsed.data.instructions;
    }
    if (parsed.data.tools) {
      codexBody.tools = parsed.data.tools;
    }
    if (typeof parsed.data.tool_choice !== "undefined") {
      codexBody.tool_choice = parsed.data.tool_choice;
    }
    if (parsed.data.include) {
      codexBody.include = parsed.data.include;
    }
    if (parsed.data.text) {
      codexBody.text = parsed.data.text;
    }
    if (typeof parsed.data.store === "boolean") {
      codexBody.store = parsed.data.store;
    }
    if (typeof parsed.data.parallel_tool_calls === "boolean") {
      codexBody.parallel_tool_calls = parsed.data.parallel_tool_calls;
    }

    const result = await ctx.chatService.chat({
      model: parsed.data.model,
      input: input || undefined,
      system: parsed.data.instructions,
      experimental: {
        codexBody,
        allowUnknownModel: parsed.data.experimental_codex?.allow_unknown_model,
      },
    });

    return buildResponseApiBody(result, parsed.data.experimental_codex?.include_raw);
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    const parsed = chatCompletionsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: parsed.error.issues[0]?.message ?? "请求体格式错误",
        },
      };
    }

    if (parsed.data.stream) {
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前网关暂不支持 chat.completions 的 stream=true",
        },
      };
    }

    if (typeof parsed.data.n === "number" && parsed.data.n > 1) {
      reply.code(501);
      return {
        error: {
          type: "not_supported",
          message: "当前网关暂不支持一次返回多个 choices（n > 1）",
        },
      };
    }

    const codexBody = createChatCompletionsCodexBody(parsed.data);
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

    const result = await ctx.chatService.chat({
      model: parsed.data.model,
      input: fallbackInput || undefined,
      experimental: {
        codexBody,
      },
    });

    return buildChatCompletionsBody(result);
  });

  app.post("/v1/images/generations", async (request, reply) => {
    const parsed = imageGenerationsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      console.error("[gateway:image] validation failure", {
        method: request.method,
        url: request.url,
        issue: parsed.error.issues[0]?.message ?? "请求体格式错误",
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

    const response = await ctx.imageService.generate({
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

    return response;
  });

  app.post("/v1/images/edits", async (request, reply) => {
    const contentType = request.headers["content-type"] ?? "";
    if (!String(contentType).toLowerCase().includes("application/json")) {
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

    const response = await ctx.imageService.generate({
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

    return response;
  });

  return app;
}
