import {
  clearStore,
  getActiveProfile,
  saveProfile,
} from "../store/profile-store.js";
import type { GatewayStatus, OAuthProfile, ProviderId } from "../types.js";
import {
  loginOpenAICodex,
  refreshOpenAICodexToken,
} from "../providers/openai-codex/oauth.js";
import { ConfigService } from "./config-service.js";

export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  async login(provider: ProviderId): Promise<OAuthProfile> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const profile = await loginOpenAICodex();
    await saveProfile(profile);
    return {
      ...profile,
      mode: "oauth_account",
    };
  }

  async getActiveProfile(provider: ProviderId = "openai-codex"): Promise<OAuthProfile | null> {
    const profile = await getActiveProfile();
    if (!profile || profile.provider !== provider) {
      return null;
    }

    return {
      ...profile,
      mode: "oauth_account",
    };
  }

  async requireUsableProfile(provider: ProviderId = "openai-codex"): Promise<OAuthProfile> {
    const profile = await this.getActiveProfile(provider);
    if (!profile) {
      throw new Error(`还没有登录 ${provider}。先运行 bun src/cli.js login`);
    }

    if (Date.now() < profile.expires) {
      return profile;
    }

    const refreshed = await refreshOpenAICodexToken(profile);
    await saveProfile(refreshed);
    return {
      ...refreshed,
      mode: "oauth_account",
    };
  }

  async logoutAll(): Promise<void> {
    await clearStore();
  }

  async getStatus(): Promise<GatewayStatus> {
    const profile = await this.getActiveProfile();
    const defaultModel = await this.configService.getDefaultModel();
    const server = await this.configService.getServerConfig();
    return {
      ok: true,
      activeProvider: profile?.provider,
      activeProfileId: profile?.profileId,
      defaultModel,
      loggedIn: Boolean(profile),
      expiresAt: profile?.expires,
      serverHost: server.host,
      serverPort: server.port,
    };
  }
}
