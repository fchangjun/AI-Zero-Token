import type { ChatRequest, ChatResult } from "../types.js";
import { askOpenAICodex } from "../providers/openai-codex/chat.js";
import { AuthService } from "./auth-service.js";
import { ModelService } from "./model-service.js";

type ChatServiceDeps = {
  authService: AuthService;
  modelService: ModelService;
};

export class ChatService {
  constructor(private readonly deps: ChatServiceDeps) {}

  async chat(request: ChatRequest): Promise<ChatResult> {
    const provider = request.provider ?? "openai-codex";
    const model = await this.deps.modelService.resolveModel(provider, request.model, {
      allowUnknown: request.experimental?.allowUnknownModel,
    });
    const rotation = await this.deps.authService.withProfileRotation(provider, (profile) =>
      askOpenAICodex({
        profile,
        prompt: request.input,
        model,
        system: request.system,
        bodyOverride: request.experimental?.codexBody,
      }),
    );
    const result = rotation.result;

    return {
      provider,
      model,
      profile: rotation.profile,
      retryCount: rotation.retryCount,
      text: result.text,
      toolCalls: result.toolCalls,
      raw: result.raw,
      artifacts: result.artifacts,
    };
  }
}
