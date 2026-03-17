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
    const model = await this.deps.modelService.resolveModel(provider, request.model);
    const profile = await this.deps.authService.requireUsableProfile(provider);
    const result = await askOpenAICodex({
      profile,
      prompt: request.input,
      model,
      system: request.system,
    });

    return {
      provider,
      model,
      text: result.text,
      raw: result.raw,
    };
  }
}
