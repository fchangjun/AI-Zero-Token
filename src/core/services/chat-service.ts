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
    const profile = await this.deps.authService.requireUsableProfile(provider);
    try {
      const result = await askOpenAICodex({
        profile,
        prompt: request.input,
        model,
        system: request.system,
        bodyOverride: request.experimental?.codexBody,
      });
      await this.deps.authService.recordProfileRequestSuccess(profile.profileId, result.quota, provider);

      return {
        provider,
        model,
        text: result.text,
        toolCalls: result.toolCalls,
        raw: result.raw,
        artifacts: result.artifacts,
      };
    } catch (error) {
      const quota = (error as { quota?: import("../types.js").CodexQuotaSnapshot }).quota;
      await this.deps.authService.recordProfileRequestFailure(profile.profileId, error, quota, provider);
      throw error;
    }
  }
}
