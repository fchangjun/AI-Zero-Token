import {
  CODEX_MODEL_INFOS,
  isSupportedCodexModel,
} from "../models/openai-codex-models.js";
import type { ModelInfo, ProviderId } from "../types.js";
import { ConfigService } from "./config-service.js";

export class ModelService {
  constructor(private readonly configService: ConfigService) {}

  async listModels(provider: ProviderId = "openai-codex"): Promise<ModelInfo[]> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const defaultModel = await this.configService.getDefaultModel(provider);
    return CODEX_MODEL_INFOS.map((model) => ({
      ...model,
      isDefault: model.id === defaultModel,
    }));
  }

  async getDefaultModel(provider: ProviderId = "openai-codex"): Promise<string> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    return this.configService.getDefaultModel(provider);
  }

  async resolveModel(
    provider: ProviderId = "openai-codex",
    requested?: string,
    options?: { allowUnknown?: boolean },
  ): Promise<string> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    if (!requested) {
      return this.configService.getDefaultModel(provider);
    }

    if (options?.allowUnknown) {
      return requested;
    }

    if (!isSupportedCodexModel(requested)) {
      throw new Error(`当前 demo 未内置模型: ${requested}`);
    }

    return requested;
  }
}
