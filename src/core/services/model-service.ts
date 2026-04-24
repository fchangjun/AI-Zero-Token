import {
  getCodexModelCatalog,
  hasCodexModel,
} from "../models/openai-codex-models.js";
import type { ModelCatalogInfo, ModelInfo, ProviderId } from "../types.js";
import { ConfigService } from "./config-service.js";

export class ModelService {
  constructor(private readonly configService: ConfigService) {}

  async listModels(provider: ProviderId = "openai-codex"): Promise<ModelInfo[]> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const [{ models }, defaultModel] = await Promise.all([
      getCodexModelCatalog(),
      this.configService.getDefaultModel(provider),
    ]);
    return models.map((model) => ({
      ...model,
      isDefault: model.id === defaultModel,
    }));
  }

  async getCatalog(provider: ProviderId = "openai-codex"): Promise<ModelCatalogInfo> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    return (await getCodexModelCatalog()).catalog;
  }

  async refreshModels(provider: ProviderId = "openai-codex"): Promise<{
    models: ModelInfo[];
    catalog: ModelCatalogInfo;
  }> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const [{ models, catalog }, defaultModel] = await Promise.all([
      getCodexModelCatalog(),
      this.configService.getDefaultModel(provider),
    ]);

    return {
      models: models.map((model) => ({
        ...model,
        isDefault: model.id === defaultModel,
      })),
      catalog,
    };
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

    if (!(await hasCodexModel(requested))) {
      throw new Error(`当前网关未找到可用模型: ${requested}`);
    }

    return requested;
  }
}
