import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { createGatewayContext } from "../core/context.js";

const responsesBodySchema = z.object({
  model: z.string().optional(),
  input: z.union([
    z.string(),
    z.array(
      z.object({
        role: z.string().optional(),
        content: z
          .array(
            z.object({
              type: z.string().optional(),
              text: z.string().optional(),
            }),
          )
          .optional(),
      }),
    ),
  ]),
  instructions: z.string().optional(),
  stream: z.boolean().optional(),
});

function extractTextInput(input: z.infer<typeof responsesBodySchema>["input"]): string {
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

export function createApp(params?: {
  corsOrigin?: true | string | RegExp | Array<string | RegExp>;
}) {
  const app = Fastify({
    logger: false,
  });
  const ctx = createGatewayContext();

  void app.register(cors, {
    origin: params?.corsOrigin ?? true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.get("/_gateway/health", async () => ({ ok: true }));

  app.get("/_gateway/status", async () => ctx.authService.getStatus());

  app.get("/_gateway/models", async () => ({
    data: await ctx.modelService.listModels(),
  }));

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
          message: "第一阶段暂不支持 stream=true",
        },
      };
    }

    const input = extractTextInput(parsed.data.input);
    if (!input) {
      reply.code(400);
      return {
        error: {
          type: "validation_error",
          message: "没有解析出有效的 input 文本",
        },
      };
    }

    const result = await ctx.chatService.chat({
      model: parsed.data.model,
      input,
      system: parsed.data.instructions,
    });

    return {
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
  });

  return app;
}
