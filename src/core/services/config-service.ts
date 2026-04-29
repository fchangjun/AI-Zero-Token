import type { GatewaySettings, ProviderId } from "../types.js";
import { getPreferredCodexModel, hasCodexModel } from "../models/openai-codex-models.js";
import {
  createDefaultSettings,
  loadSettings,
  saveSettings,
} from "../store/settings-store.js";

export class ConfigService {
  async getSettings(): Promise<GatewaySettings> {
    return this.ensureSettings();
  }

  async ensureSettings(): Promise<GatewaySettings> {
    const settings = await loadSettings();
    await saveSettings(settings);
    return settings;
  }

  async getDefaultProvider(): Promise<ProviderId> {
    const settings = await this.getSettings();
    return settings.defaultProvider;
  }

  async getDefaultModel(provider: ProviderId = "openai-codex"): Promise<string> {
    const settings = await this.getSettings();
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }
    return (await hasCodexModel(settings.defaultModel)) ? settings.defaultModel : getPreferredCodexModel();
  }

  async setDefaultModel(model: string, provider: ProviderId = "openai-codex"): Promise<GatewaySettings> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }
    if (!(await hasCodexModel(model))) {
      throw new Error(`当前网关未找到可用模型: ${model}`);
    }

    const settings = await this.getSettings();
    const next = {
      ...settings,
      defaultProvider: provider,
      defaultModel: model,
    };
    await saveSettings(next);
    return next;
  }

  async setNetworkProxy(params: {
    enabled: boolean;
    url?: string;
    noProxy?: string;
  }): Promise<GatewaySettings> {
    const settings = await this.getSettings();
    const requestedUrl = params.url?.trim() ?? "";
    const url = requestedUrl || (!params.enabled ? settings.networkProxy.url : "");
    const noProxy = params.noProxy?.trim() || settings.networkProxy.noProxy || "localhost,127.0.0.1,::1";

    if (params.enabled) {
      if (!url) {
        throw new Error("启用代理时必须填写代理地址。");
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error("代理地址格式错误，请填写完整的代理 URL。");
      }

      const supportedProtocols = new Set(["http:", "https:", "socks4:", "socks4a:", "socks5:", "socks5h:"]);
      if (!supportedProtocols.has(parsed.protocol)) {
        throw new Error("代理地址仅支持 http、https、socks4、socks4a、socks5 或 socks5h。");
      }
    }

    const next = {
      ...settings,
      networkProxy: {
        enabled: params.enabled,
        url,
        noProxy,
      },
    };
    await saveSettings(next);
    return next;
  }

  async setAutoSwitch(params: { enabled: boolean }): Promise<GatewaySettings> {
    const settings = await this.getSettings();
    const next = {
      ...settings,
      autoSwitch: {
        enabled: params.enabled,
      },
    };
    await saveSettings(next);
    return next;
  }

  async getServerConfig(): Promise<{ host: string; port: number }> {
    const settings = await this.getSettings();
    return settings.server;
  }

  async setServerConfig(params: { host?: string; port?: number }): Promise<GatewaySettings> {
    const settings = await this.getSettings();
    const next = {
      ...settings,
      server: {
        host: params.host ?? settings.server.host,
        port: params.port ?? settings.server.port,
      },
    };
    await saveSettings(next);
    return next;
  }

  async resetSettings(): Promise<GatewaySettings> {
    const defaults = createDefaultSettings();
    await saveSettings(defaults);
    return defaults;
  }
}
