import {
  clearStore,
  getActiveProfile,
  listProfiles,
  removeProfile,
  saveProfile,
  setActiveProfile,
  updateProfile,
} from "../store/profile-store.js";
import type {
  CodexQuotaSnapshot,
  GatewayStatus,
  OAuthProfile,
  ProfileAuthStatus,
  ProfileSummary,
  ProviderId,
} from "../types.js";
import {
  loginOpenAICodex,
  refreshOpenAICodexToken,
} from "../providers/openai-codex/oauth.js";
import { askOpenAICodex } from "../providers/openai-codex/chat.js";
import { ConfigService } from "./config-service.js";
import {
  applyProfileToCodexAuth,
  getCodexAuthStatus,
  type ApplyCodexAuthResult,
  type CodexAuthStatus,
} from "../store/codex-auth-store.js";
import {
  exportProfilesToJson,
  exportProfileToJson,
  getProfileImportTemplate,
  importProfileFromJson,
  importProfilesFromJson,
  type ExportedProfileBundle,
  type ExportedProfile,
} from "../store/profile-transfer.js";

const QUOTA_SYNC_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as T);
    }
  }));

  return results;
}

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
      authStatus: profile.authStatus,
    };
  }

  private createOkAuthStatus(): ProfileAuthStatus {
    return {
      state: "ok",
      checkedAt: Date.now(),
    };
  }

  private createAuthStatusFromError(error: unknown): ProfileAuthStatus | undefined {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const details = normalized as Error & {
      upstreamStatus?: unknown;
      upstreamErrorCode?: unknown;
      upstreamErrorMessage?: unknown;
    };
    const httpStatus = typeof details.upstreamStatus === "number" ? details.upstreamStatus : undefined;
    const code = typeof details.upstreamErrorCode === "string" ? details.upstreamErrorCode : undefined;
    const upstreamMessage = typeof details.upstreamErrorMessage === "string" ? details.upstreamErrorMessage : undefined;
    const message = upstreamMessage || normalized.message;
    const fingerprint = `${code || ""} ${message}`.toLowerCase();

    if (
      code === "token_invalidated" ||
      fingerprint.includes("token_invalidated") ||
      fingerprint.includes("authentication token has been invalidated")
    ) {
      return {
        state: "token_invalidated",
        checkedAt: Date.now(),
        message,
        code: code || "token_invalidated",
        httpStatus,
      };
    }

    if (
      httpStatus === 401 ||
      httpStatus === 403 ||
      /http\s+40[13]/i.test(message) ||
      fingerprint.includes("刷新 token 失败")
    ) {
      return {
        state: "auth_error",
        checkedAt: Date.now(),
        message,
        code,
        httpStatus,
      };
    }

    return undefined;
  }

  private getQuotaPercents(profile: OAuthProfile): number[] {
    const quota = profile.quota;
    if (!quota) {
      return [];
    }

    return [quota.primaryUsedPercent, quota.secondaryUsedPercent].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
  }

  private isQuotaExhausted(profile: OAuthProfile): boolean {
    const percents = this.getQuotaPercents(profile);
    return percents.length > 0 && percents.some((value) => value >= 100);
  }

  private hasKnownAvailableQuota(profile: OAuthProfile): boolean {
    if (profile.authStatus?.state === "token_invalidated" || profile.authStatus?.state === "auth_error") {
      return false;
    }

    const percents = this.getQuotaPercents(profile);
    return percents.length > 0 && percents.every((value) => value < 100);
  }

  private hasInvalidAuthStatus(profile: OAuthProfile): boolean {
    return profile.authStatus?.state === "token_invalidated" || profile.authStatus?.state === "auth_error";
  }

  private getQuotaUsageScore(profile: OAuthProfile): number {
    const percents = this.getQuotaPercents(profile);
    if (percents.length === 0) {
      return 100;
    }

    return Math.max(...percents);
  }

  private async applyProfileRuntimeUpdate(
    profileId: string,
    provider: ProviderId,
    updater: (profile: OAuthProfile) => OAuthProfile,
    options?: { skipAutoSwitch?: boolean; checkAutoSwitch?: boolean },
  ): Promise<OAuthProfile | null> {
    const updated = await updateProfile(profileId, (profile) => {
      if (profile.provider !== provider) {
        return profile;
      }

      return updater(profile);
    });

    if (
      !options?.checkAutoSwitch ||
      options.skipAutoSwitch ||
      !updated ||
      updated.provider !== provider ||
      !this.isQuotaExhausted(updated)
    ) {
      return updated;
    }

    const activeProfile = await this.getActiveProfile(provider);
    if (activeProfile?.profileId === updated.profileId) {
      await this.maybeAutoSwitchProfile(updated, provider);
    }

    return updated;
  }

  private async refreshStoredProfile(profile: OAuthProfile, provider: ProviderId): Promise<OAuthProfile> {
    try {
      const refreshed = await refreshOpenAICodexToken(profile);
      const merged = await this.applyProfileRuntimeUpdate(
        profile.profileId,
        provider,
        (current) => ({
          ...refreshed,
          email: refreshed.email ?? current.email,
          quota: current.quota,
          authStatus: this.createOkAuthStatus(),
        }),
      );
      return this.toManagedProfile(merged ?? {
        ...refreshed,
        quota: profile.quota,
        authStatus: this.createOkAuthStatus(),
      });
    } catch (error) {
      await this.recordProfileRequestFailure(profile.profileId, error, undefined, provider, {
        skipAutoSwitch: true,
      });
      throw error;
    }
  }

  private async maybeAutoSwitchProfile(profile: OAuthProfile, provider: ProviderId): Promise<OAuthProfile> {
    const settings = await this.configService.getSettings();
    if (!settings.autoSwitch.enabled || !this.isQuotaExhausted(profile)) {
      return profile;
    }

    const [profiles, codexStatus] = await Promise.all([
      listProfiles(),
      getCodexAuthStatus(),
    ]);
    const currentIndex = profiles.findIndex((item) => item.profileId === profile.profileId);
    const codexAccountId = codexStatus.accountId;
    const candidates = profiles
      .map((item, index) => ({
        profile: item,
        index,
        distance: currentIndex >= 0
          ? (index - currentIndex + profiles.length) % profiles.length
          : index + 1,
      }))
      .filter((item) => item.profile.provider === provider && item.profile.profileId !== profile.profileId)
      .filter((item) => this.hasKnownAvailableQuota(item.profile))
      .sort((left, right) => {
        const leftCodexConflict = codexAccountId && left.profile.accountId === codexAccountId ? 1 : 0;
        const rightCodexConflict = codexAccountId && right.profile.accountId === codexAccountId ? 1 : 0;
        const codexDiff = leftCodexConflict - rightCodexConflict;
        if (codexDiff !== 0) {
          return codexDiff;
        }

        const distanceDiff = left.distance - right.distance;
        if (distanceDiff !== 0) {
          return distanceDiff;
        }

        const usageDiff = this.getQuotaUsageScore(left.profile) - this.getQuotaUsageScore(right.profile);
        if (usageDiff !== 0) {
          return usageDiff;
        }

        const leftCapturedAt = left.profile.quota?.capturedAt ?? 0;
        const rightCapturedAt = right.profile.quota?.capturedAt ?? 0;
        if (leftCapturedAt !== rightCapturedAt) {
          return leftCapturedAt - rightCapturedAt;
        }

        return right.profile.expires - left.profile.expires;
      })
      .map((item) => item.profile);

    const nextProfile = candidates[0];
    if (!nextProfile) {
      return profile;
    }

    const activated = await setActiveProfile(nextProfile.profileId);
    if (!activated) {
      return profile;
    }

    console.info("[auth] auto switched active profile after quota exhaustion", {
      provider,
      fromProfileId: profile.profileId,
      toProfileId: activated.profileId,
      avoidedCodexAccount: Boolean(codexAccountId && activated.accountId !== codexAccountId),
    });
    return this.toManagedProfile(activated);
  }

  async login(provider: ProviderId): Promise<OAuthProfile> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const profile = await loginOpenAICodex();
    await saveProfile(profile);
    return this.toManagedProfile(profile);
  }

  async importProfile(value: unknown, provider: ProviderId = "openai-codex"): Promise<OAuthProfile> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const profile = importProfileFromJson(value);
    await saveProfile(profile);
    return this.toManagedProfile(profile);
  }

  validateProfilesImport(value: unknown, provider: ProviderId = "openai-codex"): OAuthProfile[] {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    return importProfilesFromJson(value);
  }

  async importProfiles(value: unknown, provider: ProviderId = "openai-codex"): Promise<OAuthProfile[]> {
    if (provider !== "openai-codex") {
      throw new Error(`暂不支持 provider: ${provider}`);
    }

    const profiles = importProfilesFromJson(value);
    for (const profile of profiles) {
      await saveProfile(profile);
    }
    return profiles.map((profile) => this.toManagedProfile(profile));
  }

  async exportProfile(profileId?: string, provider: ProviderId = "openai-codex"): Promise<ExportedProfile> {
    const profiles = await listProfiles();
    const activeProfile = await this.getActiveProfile(provider);
    const targetProfileId = profileId?.trim() || activeProfile?.profileId;
    const profile = profiles.find((item) => item.provider === provider && item.profileId === targetProfileId);
    if (!profile) {
      throw new Error(targetProfileId ? `没有找到可导出的账号: ${targetProfileId}` : "没有可导出的当前账号。");
    }

    return exportProfileToJson(profile);
  }

  async exportProfiles(profileIds?: string[], provider: ProviderId = "openai-codex"): Promise<ExportedProfileBundle> {
    const profiles = await listProfiles();
    const idSet = profileIds && profileIds.length > 0 ? new Set(profileIds.map((item) => item.trim()).filter(Boolean)) : null;
    const selected = profiles
      .filter((item) => item.provider === provider)
      .filter((item) => !idSet || idSet.has(item.profileId));
    if (selected.length === 0) {
      throw new Error("没有找到可导出的账号。");
    }

    return exportProfilesToJson(selected);
  }

  getProfileImportTemplate(): ExportedProfileBundle {
    return getProfileImportTemplate();
  }

  async getCodexStatus(): Promise<CodexAuthStatus> {
    return getCodexAuthStatus();
  }

  async applyProfileToCodex(profileId: string, provider: ProviderId = "openai-codex"): Promise<ApplyCodexAuthResult> {
    const profile = await this.requireFreshProfileWithIdToken(profileId, provider);
    return applyProfileToCodexAuth(profile);
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

  async requireUsableProfile(
    provider: ProviderId = "openai-codex",
    options?: { skipAutoSwitch?: boolean },
  ): Promise<OAuthProfile> {
    const activeProfile = await this.getActiveProfile(provider);
    const profile = activeProfile
      ? options?.skipAutoSwitch
        ? activeProfile
        : await this.maybeAutoSwitchProfile(activeProfile, provider)
      : null;
    if (!profile) {
      throw new Error(`还没有登录 ${provider}。先运行 azt login`);
    }

    if (Date.now() < profile.expires) {
      return profile;
    }

    return this.refreshStoredProfile(profile, provider);
  }

  async requireFreshProfileWithIdToken(profileId: string, provider: ProviderId = "openai-codex"): Promise<OAuthProfile> {
    const profiles = await listProfiles();
    const profile = profiles.find((item) => item.provider === provider && item.profileId === profileId);
    if (!profile) {
      throw new Error(`没有找到账号: ${profileId}`);
    }

    if (profile.idToken && Date.now() < profile.expires) {
      return this.toManagedProfile(profile);
    }

    const refreshed = await this.refreshStoredProfile(profile, provider);
    if (!refreshed.idToken) {
      throw new Error("刷新 token 成功，但上游没有返回 id_token。");
    }

    return this.toManagedProfile(refreshed);
  }

  async logoutAll(): Promise<void> {
    await clearStore();
  }

  async syncActiveProfileQuota(
    provider: ProviderId = "openai-codex",
    options?: { suppressErrors?: boolean; skipAutoSwitch?: boolean },
  ): Promise<void> {
    let profile: OAuthProfile;
    try {
      profile = await this.requireUsableProfile(provider, {
        skipAutoSwitch: options?.skipAutoSwitch,
      });
    } catch (error) {
      if (options?.suppressErrors) {
        return;
      }
      throw error;
    }
    const model = await this.configService.getDefaultModel(provider);
    await this.syncQuotaForProfile(profile, model, provider, options);
  }

  async syncProfileQuota(
    profileId: string,
    provider: ProviderId = "openai-codex",
    options?: { suppressErrors?: boolean; skipAutoSwitch?: boolean },
  ): Promise<void> {
    const profiles = await listProfiles();
    const profile = profiles.find((item) => item.provider === provider && item.profileId === profileId);
    if (!profile) {
      throw new Error(`没有找到账号: ${profileId}`);
    }

    const model = await this.configService.getDefaultModel(provider);
    await this.syncQuotaForProfile(profile, model, provider, options);
  }

  async syncAllProfileQuotas(
    provider: ProviderId = "openai-codex",
    options?: { suppressErrors?: boolean; skipAutoSwitch?: boolean; staleAfterMs?: number },
  ): Promise<{ total: number; synced: number; failed: number; skipped: number }> {
    const [profiles, activeProfile, model] = await Promise.all([
      listProfiles(),
      this.getActiveProfile(provider),
      this.configService.getDefaultModel(provider),
    ]);
    const providerProfiles = profiles.filter((profile) => profile.provider === provider);
    const now = Date.now();
    const targets = providerProfiles
      .filter((profile) => !this.hasInvalidAuthStatus(profile))
      .filter((profile) => {
        if (!options?.staleAfterMs) {
          return true;
        }

        const capturedAt = profile.quota?.capturedAt;
        return !capturedAt || now - capturedAt >= options.staleAfterMs;
      })
      .sort((left, right) => Number(right.profileId === activeProfile?.profileId) - Number(left.profileId === activeProfile?.profileId));
    const skipped = providerProfiles.length - targets.length;
    const results = await mapWithConcurrency(targets, QUOTA_SYNC_CONCURRENCY, (profile) => this.syncQuotaForProfile(profile, model, provider, options));

    const failed = results.filter((item) => !item.ok).length;
    return {
      total: providerProfiles.length,
      synced: results.length - failed,
      failed,
      skipped,
    };
  }

  private async syncQuotaForProfile(
    profile: OAuthProfile,
    model: string,
    provider: ProviderId,
    options?: { suppressErrors?: boolean; skipAutoSwitch?: boolean },
  ): Promise<{ ok: boolean; profileId: string; error?: string }> {
    try {
      const usableProfile = Date.now() < profile.expires
        ? this.toManagedProfile(profile)
        : await this.refreshStoredProfile(profile, provider);
      const result = await askOpenAICodex({
        profile: usableProfile,
        model,
        system: "Reply with OK only.",
        prompt: "ping",
        bodyOverride: {
          text: { verbosity: "low" },
        },
      });
      await this.recordProfileRequestSuccess(usableProfile.profileId, result.quota, provider, {
        skipAutoSwitch: options?.skipAutoSwitch,
      });
      return {
        ok: true,
        profileId: usableProfile.profileId,
      };
    } catch (error) {
      const quota = (error as { quota?: CodexQuotaSnapshot }).quota;
      await this.recordProfileRequestFailure(profile.profileId, error, quota, provider, {
        skipAutoSwitch: options?.skipAutoSwitch,
      });

      if (!options?.suppressErrors) {
        throw error;
      }

      console.warn("[auth] sync profile quota failed", {
        provider,
        profileId: profile.profileId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        profileId: profile.profileId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async recordProfileRequestSuccess(
    profileId: string,
    quota: CodexQuotaSnapshot | undefined,
    provider: ProviderId = "openai-codex",
    options?: { skipAutoSwitch?: boolean },
  ): Promise<void> {
    await this.applyProfileRuntimeUpdate(
      profileId,
      provider,
      (profile) => ({
        ...profile,
        ...(quota ? { quota } : {}),
        authStatus: this.createOkAuthStatus(),
      }),
      {
        skipAutoSwitch: options?.skipAutoSwitch,
        checkAutoSwitch: Boolean(quota),
      },
    );
  }

  async recordProfileRequestFailure(
    profileId: string,
    error: unknown,
    quota: CodexQuotaSnapshot | undefined,
    provider: ProviderId = "openai-codex",
    options?: { skipAutoSwitch?: boolean },
  ): Promise<void> {
    const authStatus = this.createAuthStatusFromError(error);
    if (!quota && !authStatus) {
      return;
    }

    await this.applyProfileRuntimeUpdate(
      profileId,
      provider,
      (profile) => ({
        ...profile,
        ...(quota ? { quota } : {}),
        ...(authStatus ? { authStatus } : {}),
      }),
      {
        skipAutoSwitch: options?.skipAutoSwitch,
        checkAutoSwitch: Boolean(quota),
      },
    );
  }

  async updateProfileQuota(
    profileId: string,
    quota: CodexQuotaSnapshot | undefined,
    provider: ProviderId = "openai-codex",
    options?: { skipAutoSwitch?: boolean },
  ): Promise<void> {
    if (!quota) {
      return;
    }

    await this.applyProfileRuntimeUpdate(
      profileId,
      provider,
      (profile) => ({
        ...profile,
        quota,
      }),
      {
        skipAutoSwitch: options?.skipAutoSwitch,
        checkAutoSwitch: true,
      },
    );
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
