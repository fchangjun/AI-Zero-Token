import {
  clearStore,
  getActiveProfile,
  listProfiles,
  removeProfile,
  saveProfile,
  setActiveProfile,
  updateProfile,
} from "../store/profile-store.js";
import type { CodexQuotaSnapshot, GatewayStatus, OAuthProfile, ProfileSummary, ProviderId } from "../types.js";
import {
  loginOpenAICodex,
  refreshOpenAICodexToken,
} from "../providers/openai-codex/oauth.js";
import { askOpenAICodex } from "../providers/openai-codex/chat.js";
import { ConfigService } from "./config-service.js";

export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  private maskSecret(value: string): string {
    if (value.length <= 12) {
      return value;
    }

    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  }

  private toManagedProfile(profile: OAuthProfile): OAuthProfile {
    return {
      ...profile,
      mode: "oauth_account",
    };
  }

  private toProfileSummary(profile: OAuthProfile, activeProfileId?: string): ProfileSummary {
    return {
      provider: profile.provider,
      profileId: profile.profileId,
      accountId: profile.accountId,
      email: profile.email,
      quota: profile.quota,
      expiresAt: profile.expires,
      accessTokenPreview: this.maskSecret(profile.access),
      refreshTokenPreview: this.maskSecret(profile.refresh),
      isActive: profile.profileId === activeProfileId,
    };
  }

  async login(provider: ProviderId): Promise<OAuthProfile> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const profile = await loginOpenAICodex();
    await saveProfile(profile);
    return this.toManagedProfile(profile);
  }

  async getActiveProfile(provider: ProviderId = "openai-codex"): Promise<OAuthProfile | null> {
    const profile = await getActiveProfile();
    if (!profile || profile.provider !== provider) {
      return null;
    }

    return this.toManagedProfile(profile);
  }

  async listProfiles(provider: ProviderId = "openai-codex"): Promise<ProfileSummary[]> {
    const [profiles, activeProfile] = await Promise.all([
      listProfiles(),
      this.getActiveProfile(provider),
    ]);
    const activeProfileId = activeProfile?.profileId;

    return profiles
      .filter((profile) => profile.provider === provider)
      .sort((left, right) => {
        if (left.profileId === activeProfileId) {
          return -1;
        }
        if (right.profileId === activeProfileId) {
          return 1;
        }
        return right.expires - left.expires;
      })
      .map((profile) => this.toProfileSummary(profile, activeProfileId));
  }

  async activateProfile(profileId: string, provider: ProviderId = "openai-codex"): Promise<OAuthProfile> {
    const profiles = await listProfiles();
    const target = profiles.find((profile) => profile.profileId === profileId && profile.provider === provider);
    if (!target) {
      throw new Error(`没有找到可切换的账号: ${profileId}`);
    }

    const activated = await setActiveProfile(profileId);
    if (!activated) {
      throw new Error(`切换账号失败: ${profileId}`);
    }

    return this.toManagedProfile(activated);
  }

  async removeProfile(profileId: string, provider: ProviderId = "openai-codex"): Promise<void> {
    const profiles = await listProfiles();
    const target = profiles.find((profile) => profile.profileId === profileId && profile.provider === provider);
    if (!target) {
      throw new Error(`没有找到要删除的账号: ${profileId}`);
    }

    await removeProfile(profileId);
  }

  async requireUsableProfile(provider: ProviderId = "openai-codex"): Promise<OAuthProfile> {
    const profile = await this.getActiveProfile(provider);
    if (!profile) {
      throw new Error(`还没有登录 ${provider}。先运行 azt login`);
    }

    if (Date.now() < profile.expires) {
      return profile;
    }

    const refreshed = await refreshOpenAICodexToken(profile);
    await saveProfile(refreshed);
    return this.toManagedProfile(refreshed);
  }

  async logoutAll(): Promise<void> {
    await clearStore();
  }

  async syncActiveProfileQuota(
    provider: ProviderId = "openai-codex",
    options?: { suppressErrors?: boolean },
  ): Promise<void> {
    let profile: OAuthProfile;
    try {
      profile = await this.requireUsableProfile(provider);
    } catch (error) {
      if (options?.suppressErrors) {
        return;
      }
      throw error;
    }
    const model = await this.configService.getDefaultModel(provider);

    try {
      const result = await askOpenAICodex({
        profile,
        model,
        system: "Reply with OK only.",
        prompt: "ping",
        bodyOverride: {
          text: { verbosity: "low" },
        },
      });
      await this.updateProfileQuota(profile.profileId, result.quota, provider);
    } catch (error) {
      const quota = (error as { quota?: CodexQuotaSnapshot }).quota;
      await this.updateProfileQuota(profile.profileId, quota, provider);

      if (!options?.suppressErrors) {
        throw error;
      }

      console.warn("[auth] sync active profile quota failed", {
        provider,
        profileId: profile.profileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async updateProfileQuota(
    profileId: string,
    quota: CodexQuotaSnapshot | undefined,
    provider: ProviderId = "openai-codex",
  ): Promise<void> {
    if (!quota) {
      return;
    }

    await updateProfile(profileId, (profile) => {
      if (profile.provider !== provider) {
        return profile;
      }

      return {
        ...profile,
        quota,
      };
    });
  }

  async getStatus(): Promise<GatewayStatus> {
    const [profile, profiles] = await Promise.all([
      this.getActiveProfile(),
      this.listProfiles(),
    ]);
    const defaultModel = await this.configService.getDefaultModel();
    const server = await this.configService.getServerConfig();
    return {
      ok: true,
      activeProvider: profile?.provider,
      activeProfileId: profile?.profileId,
      defaultModel,
      loggedIn: Boolean(profile),
      expiresAt: profile?.expires,
      profileCount: profiles.length,
      serverHost: server.host,
      serverPort: server.port,
    };
  }
}
