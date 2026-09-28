import { Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import type { BusyAction, SettingDraft } from "@/shared/lib/app-types";
import { errorMessage } from "@/shared/lib/app-utils";
import { useT } from "@/i18n";
import { formatJson } from "@/shared/lib/format";
import { autoSwitchEligibility, getPlanType, isCodexActiveProfile, profileHealth, profileLabel } from "@/shared/lib/profiles";
function createSettingsDraft(config: AdminConfig): SettingDraft {
  return {
    defaultModel: config.status.defaultModel,
    proxyEnabled: config.settings.networkProxy.enabled,
    proxyUrl: config.settings.networkProxy.url,
    proxyNoProxy: config.settings.networkProxy.noProxy || "localhost,127.0.0.1,::1",
    autoSwitchEnabled: config.settings.autoSwitch.enabled,
    autoSwitchExcludedProfileIds: config.settings.autoSwitch.excludedProfileIds || [],
    quotaSyncConcurrency: String(config.settings.runtime?.quotaSyncConcurrency || 3),
    codexRequestSerializationEnabled: Boolean(config.settings.runtime?.codexRequestSerializationEnabled),
    codexRequestMinDelayMs: String(config.settings.runtime?.codexRequestMinDelayMs ?? 2500),
    codexRequestJitterMs: String(config.settings.runtime?.codexRequestJitterMs ?? 1500),
    captureRequestContentEnabled: Boolean(config.settings.runtime?.captureRequestContentEnabled),
    captureResponseProtocolEnabled: Boolean(config.settings.runtime?.captureResponseProtocolEnabled),
    freeAccountWebGenerationEnabled: Boolean(config.settings.image?.freeAccountWebGenerationEnabled),
    serverPort: String(config.settings.server.port || 8787),
  };
}

function profileSearchText(profile: ProfileSummary): string {
  return [profileLabel(profile, true), profile.email || "", profile.accountId, profile.codexAccountId || "", profile.profileId, getPlanType(profile)].join(" ").toLowerCase();
}

export type SettingsPageProps = {
  showEmails: boolean;
  setShowEmails: Dispatch<SetStateAction<boolean>>;
  config: AdminConfig | null;
  busy: BusyAction;
  status: string;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshConfig: (options?: { runtime?: boolean; silent?: boolean }) => Promise<AdminConfig>;
};

export function SettingsForm(props: SettingsPageProps & { scope: "general" | "models" | "rotation" | "service" }) {

  const t = useT();
  const [settingsDraft, setSettingsDraft] = useState<SettingDraft>({
    defaultModel: "",
    proxyEnabled: false,
    proxyUrl: "",
    proxyNoProxy: "localhost,127.0.0.1,::1",
    autoSwitchEnabled: false,
    autoSwitchExcludedProfileIds: [],
    quotaSyncConcurrency: "3",
    codexRequestSerializationEnabled: true,
    codexRequestMinDelayMs: "2500",
    codexRequestJitterMs: "1500",
    captureRequestContentEnabled: false,
    captureResponseProtocolEnabled: false,
    freeAccountWebGenerationEnabled: false,
    serverPort: "8787",
  });
  const [settingsDirtyFields, setSettingsDirtyFields] = useState<Set<keyof SettingDraft>>(() => new Set());
  const [autoSwitchSearch, setAutoSwitchSearch] = useState("");
  const settingsDirty = settingsDirtyFields.size > 0;

  useEffect(() => {
    if (!props.config || settingsDirty) {
      return;
    }
    setSettingsDraft(createSettingsDraft(props.config));
  }, [props.config, settingsDirty]);

  function markSettingsDirty(next: Partial<SettingDraft>) {
    setSettingsDraft((draft) => ({ ...draft, ...next }));
    setSettingsDirtyFields((current) => {
      const updated = new Set(current);
      for (const key of Object.keys(next) as Array<keyof SettingDraft>) {
        updated.add(key);
      }
      return updated;
    });
  }

  function toggleAutoSwitchExcludedProfile(profileId: string, excluded: boolean) {
    const nextSet = new Set(settingsDraft.autoSwitchExcludedProfileIds);
    if (excluded) {
      nextSet.add(profileId);
    } else {
      nextSet.delete(profileId);
    }
    markSettingsDirty({ autoSwitchExcludedProfileIds: Array.from(nextSet) });
  }

  const excludedProfileIds = useMemo(() => new Set(settingsDraft.autoSwitchExcludedProfileIds), [settingsDraft.autoSwitchExcludedProfileIds]);
  const autoSwitchProfiles = useMemo(() => {
    const query = autoSwitchSearch.trim().toLowerCase();
    return (props.config?.profiles || []).filter((profile) => !query || profileSearchText(profile).includes(query));
  }, [autoSwitchSearch, props.config?.profiles]);
  const autoSwitchTotalCount = props.config?.profiles.length || 0;
  const autoSwitchExcludedCount = (props.config?.profiles || []).filter((profile) => excludedProfileIds.has(profile.profileId)).length;
  const autoSwitchRuntimeReadyCount = (props.config?.profiles || []).filter(
    (profile) => !excludedProfileIds.has(profile.profileId) && autoSwitchEligibility(profile, t).key === "ready",
  ).length;
  const autoSwitchBlockedCount = Math.max(0, autoSwitchTotalCount - autoSwitchExcludedCount - autoSwitchRuntimeReadyCount);

  async function saveSettings(options?: { restart?: boolean }) {
    const hasDirtyField = (...fields: Array<keyof SettingDraft>) => fields.some((field) => settingsDirtyFields.has(field));
    const serverPort = Number.parseInt(settingsDraft.serverPort, 10);
    if (hasDirtyField("serverPort") && (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535)) {
      props.setStatus(t("settings.validation.port"));
      return;
    }
    const quotaSyncConcurrency = Number.parseInt(settingsDraft.quotaSyncConcurrency, 10);
    if (hasDirtyField("quotaSyncConcurrency") && (!Number.isInteger(quotaSyncConcurrency) || quotaSyncConcurrency < 1 || quotaSyncConcurrency > 32)) {
      props.setStatus(t("settings.validation.quotaConcurrency"));
      return;
    }
    const codexRequestMinDelayMs = Number.parseInt(settingsDraft.codexRequestMinDelayMs, 10);
    if (hasDirtyField("codexRequestMinDelayMs") && (!Number.isInteger(codexRequestMinDelayMs) || codexRequestMinDelayMs < 0 || codexRequestMinDelayMs > 60_000)) {
      props.setStatus(t("settings.validation.codexRequestMinDelayMs"));
      return;
    }
    const codexRequestJitterMs = Number.parseInt(settingsDraft.codexRequestJitterMs, 10);
    if (hasDirtyField("codexRequestJitterMs") && (!Number.isInteger(codexRequestJitterMs) || codexRequestJitterMs < 0 || codexRequestJitterMs > 60_000)) {
      props.setStatus(t("settings.validation.codexRequestJitterMs"));
      return;
    }

    const payload: {
      defaultModel?: string;
      networkProxy?: { enabled: boolean; url: string; noProxy: string };
      autoSwitch?: { enabled?: boolean; excludedProfileIds?: string[] };
      runtime?: {
        quotaSyncConcurrency?: number;
        codexRequestSerializationEnabled?: boolean;
        codexRequestMinDelayMs?: number;
        codexRequestJitterMs?: number;
        captureRequestContentEnabled?: boolean;
        captureResponseProtocolEnabled?: boolean;
      };
      image?: { freeAccountWebGenerationEnabled: boolean };
      server?: { port: number };
    } = {};

    if (hasDirtyField("defaultModel")) {
      payload.defaultModel = settingsDraft.defaultModel;
    }
    if (hasDirtyField("proxyEnabled", "proxyUrl", "proxyNoProxy")) {
      payload.networkProxy = {
        enabled: settingsDraft.proxyEnabled,
        url: settingsDraft.proxyUrl,
        noProxy: settingsDraft.proxyNoProxy,
      };
    }
    if (hasDirtyField("autoSwitchEnabled", "autoSwitchExcludedProfileIds")) {
      payload.autoSwitch = {};
      if (hasDirtyField("autoSwitchEnabled")) {
        payload.autoSwitch.enabled = settingsDraft.autoSwitchEnabled;
      }
      if (hasDirtyField("autoSwitchExcludedProfileIds")) {
        payload.autoSwitch.excludedProfileIds = settingsDraft.autoSwitchExcludedProfileIds;
      }
    }
    if (hasDirtyField("quotaSyncConcurrency", "codexRequestSerializationEnabled", "codexRequestMinDelayMs", "codexRequestJitterMs", "captureRequestContentEnabled", "captureResponseProtocolEnabled")) {
      payload.runtime = {};
      if (hasDirtyField("quotaSyncConcurrency")) {
        payload.runtime.quotaSyncConcurrency = quotaSyncConcurrency;
      }
      if (hasDirtyField("codexRequestSerializationEnabled")) {
        payload.runtime.codexRequestSerializationEnabled = settingsDraft.codexRequestSerializationEnabled;
      }
      if (hasDirtyField("codexRequestMinDelayMs")) {
        payload.runtime.codexRequestMinDelayMs = codexRequestMinDelayMs;
      }
      if (hasDirtyField("codexRequestJitterMs")) {
        payload.runtime.codexRequestJitterMs = codexRequestJitterMs;
      }
      if (hasDirtyField("captureRequestContentEnabled")) {
        payload.runtime.captureRequestContentEnabled = settingsDraft.captureRequestContentEnabled;
      }
      if (hasDirtyField("captureResponseProtocolEnabled")) {
        payload.runtime.captureResponseProtocolEnabled = settingsDraft.captureResponseProtocolEnabled;
      }
    }
    if (hasDirtyField("freeAccountWebGenerationEnabled")) {
      payload.image = {
        freeAccountWebGenerationEnabled: settingsDraft.freeAccountWebGenerationEnabled,
      };
    }
    if (hasDirtyField("serverPort")) {
      payload.server = {
        port: serverPort,
      };
    }

    const busyAction: BusyAction = options?.restart ? "restart" : "settings";
    props.setBusy(busyAction);
    try {
      const next = await fetchJson<AdminConfig>("/_gateway/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: formatJson(payload),
      });
      props.setConfig(next);
      setSettingsDirtyFields(new Set());
      if (options?.restart) {
        props.setStatus(t("settings.save.restartSaved"));
        await fetchJson<{ ok: boolean; restarting?: boolean }>("/_gateway/admin/restart", { method: "POST" });
        props.setStatus(t("settings.save.restartDone"));
      } else {
        props.setStatus(t("settings.save.settingsSaved"));
      }
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  async function testProxy() {
    props.setBusy("proxy");
    try {
      const result = await fetchJson<{ status: number; elapsedMs: number }>("/_gateway/admin/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({
          networkProxy: {
            enabled: settingsDraft.proxyEnabled,
            url: settingsDraft.proxyUrl,
            noProxy: settingsDraft.proxyNoProxy,
          },
        }),
      });
      props.setStatus(t("settings.proxy.testSuccess", { status: result.status, elapsedMs: result.elapsedMs }));
    } catch (error) {
      props.setStatus(t("settings.proxy.testFailure", { error: errorMessage(error) }));
    } finally {
      props.setBusy(null);
    }
  }

  async function refreshModels() {
    props.setBusy("models");
    try {
      const result = await fetchJson<{
        catalog?: { modelCount?: number; source?: string; fetchedAt?: string };
      }>("/_gateway/models/refresh", { method: "POST" });
      await props.refreshConfig({ silent: true });
      const count = result.catalog?.modelCount ?? 0;
      props.setStatus(count > 0 ? t("settings.modelSync.refreshed", { count }) : t("settings.modelSync.refreshedEmpty"));
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  return (
    <section className="settings-page">
      {props.scope === "models" && <div className="settings-page-head settings-page-head-actions-only">
        <div className="settings-page-actions">
          <button className="btn-secondary" type="button" onClick={refreshModels} disabled={props.busy === "models"}>
            {props.busy === "models" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            {props.busy === "models" ? t("settings.syncButton.busy") : t("settings.syncButton.label")}
          </button>
        </div>
      </div>}

      <div className="settings-grid">
        {props.scope === "models" && (
        <section className="settings-section">
          <h4>{t("settings.section.model.heading")}</h4>
          <label className="field">
            <span>{t("settings.section.model.defaultLabel")}</span>
            <select className="control" value={settingsDraft.defaultModel} onChange={(event) => markSettingsDirty({ defaultModel: event.target.value })}>
              {(props.config?.models || []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">{t("settings.section.model.hint", { source: props.config?.modelCatalog.source || "-", count: props.config?.modelCatalog.modelCount || 0 })}</p>
        </section>
        )}
        {props.scope === "models" && (
        <section className="settings-section free-image-section">
          <h4>{t("settings.section.freeImage.heading")}</h4>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={settingsDraft.freeAccountWebGenerationEnabled}
              onChange={(event) => markSettingsDirty({ freeAccountWebGenerationEnabled: event.target.checked })}
            />
            <span>{t("settings.section.freeImage.label")}</span>
          </label>
          <p className="hint">{t("settings.section.freeImage.hint")}</p>
          <p className="free-image-warning">
            <strong>{t("settings.section.freeImage.banRisk")}</strong>{t("settings.section.freeImage.banRiskBody")}<strong>{t("settings.section.freeImage.limitedQuota")}</strong>{t("settings.section.freeImage.limitedQuotaBody")}
          </p>
        </section>
        )}
        {props.scope === "general" && (
        <section className="settings-section">
          <h4>{t("settings.section.proxy.heading")}</h4>
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.proxyEnabled} onChange={(event) => markSettingsDirty({ proxyEnabled: event.target.checked })} />
            <span>{t("settings.section.proxy.enableLabel")}</span>
          </label>
          <label className="field">
            <span>{t("settings.section.proxy.urlLabel")}</span>
            <input className="input" value={settingsDraft.proxyUrl} onChange={(event) => markSettingsDirty({ proxyUrl: event.target.value })} placeholder="http://127.0.0.1:7890" />
          </label>
          <label className="field">
            <span>{t("settings.section.proxy.noProxyLabel")}</span>
            <input className="input" value={settingsDraft.proxyNoProxy} onChange={(event) => markSettingsDirty({ proxyNoProxy: event.target.value })} />
          </label>
          <button className="btn-secondary" type="button" onClick={testProxy} disabled={props.busy === "proxy"}>
            {t("settings.section.proxy.testButton")}
          </button>
        </section>
        )}
        {props.scope === "service" && (
        <section className="settings-section">
          <h4>{t("settings.section.port.heading")}</h4>
          <label className="field">
            <span>{t("settings.section.port.label")}</span>
            <input className="input" inputMode="numeric" type="number" min={1} max={65535} value={settingsDraft.serverPort} onChange={(event) => markSettingsDirty({ serverPort: event.target.value })} />
          </label>
          <p className="hint">{t("settings.section.port.hint")}</p>
        </section>
        )}
        {props.scope === "rotation" && (
        <section className="settings-section">
          <h4>{t("settings.section.policy.heading")}</h4>
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.autoSwitchEnabled} onChange={(event) => markSettingsDirty({ autoSwitchEnabled: event.target.checked })} />
            <span>{t("settings.section.policy.autoSwitchLabel")}</span>
          </label>
          <label className="field">
            <span>{t("settings.section.policy.quotaConcurrencyLabel")}</span>
            <input
              className="input"
              inputMode="numeric"
              max={32}
              min={1}
              type="number"
              value={settingsDraft.quotaSyncConcurrency}
              onChange={(event) => markSettingsDirty({ quotaSyncConcurrency: event.target.value })}
            />
          </label>
          <p className="hint">{t("settings.section.policy.quotaConcurrencyHint")}</p>
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.codexRequestSerializationEnabled} onChange={(event) => markSettingsDirty({ codexRequestSerializationEnabled: event.target.checked })} />
            <span>{t("settings.section.policy.serializationLabel")}</span>
          </label>
          <div className="settings-inline-fields">
            <label className="field">
              <span>{t("settings.section.policy.minDelayLabel")}</span>
              <input
                className="input"
                inputMode="numeric"
                max={60000}
                min={0}
                type="number"
                value={settingsDraft.codexRequestMinDelayMs}
                onChange={(event) => markSettingsDirty({ codexRequestMinDelayMs: event.target.value })}
              />
            </label>
            <label className="field">
              <span>{t("settings.section.policy.jitterLabel")}</span>
              <input
                className="input"
                inputMode="numeric"
                max={60000}
                min={0}
                type="number"
                value={settingsDraft.codexRequestJitterMs}
                onChange={(event) => markSettingsDirty({ codexRequestJitterMs: event.target.value })}
              />
            </label>
          </div>
          <p className="hint">{t("settings.section.policy.delayHint")}</p>
        </section>
        )}
        {props.scope === "general" && (
        <section className="settings-section">
          <h4>{t("routes.logs")}</h4>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={settingsDraft.captureRequestContentEnabled}
              onChange={(event) => markSettingsDirty({
                captureRequestContentEnabled: event.target.checked,
                ...(!event.target.checked ? { captureResponseProtocolEnabled: false } : {}),
              })}
            />
            <span>{t("settings.section.policy.captureRequestLabel")}</span>
          </label>
          <p className="hint">{t("settings.section.policy.captureRequestHint")}</p>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={settingsDraft.captureResponseProtocolEnabled}
              onChange={(event) => markSettingsDirty({ captureResponseProtocolEnabled: event.target.checked })}
              disabled={!settingsDraft.captureRequestContentEnabled}
            />
            <span>{t("settings.section.policy.captureResponseLabel")}</span>
          </label>
          <p className="hint">{t("settings.section.policy.captureResponseHint")}</p>
        </section>
        )}
        {props.scope === "rotation" && (
        <section className="settings-section auto-switch-exclusion-section">
          <div className="auto-switch-exclusion-head">
            <div>
              <h4>{t("settings.section.autoSwitch.heading")}</h4>
              <p className="hint">{t("settings.section.autoSwitch.description")}</p>
            </div>
            <div className="auto-switch-counts" aria-label={t("settings.section.autoSwitch.countsAria")}>
              <span className="count-pill is-included">{t("settings.section.autoSwitch.countsIncluded", { count: autoSwitchRuntimeReadyCount })}</span>
              <span className="count-pill is-blocked">{t("settings.section.autoSwitch.countsBlocked", { count: autoSwitchBlockedCount })}</span>
              <span className="count-pill is-excluded">{t("settings.section.autoSwitch.countsExcluded", { count: autoSwitchExcludedCount })}</span>
            </div>
          </div>

          <label className="auto-switch-search">
            <Search size={16} />
            <input value={autoSwitchSearch} onChange={(event) => setAutoSwitchSearch(event.target.value)} placeholder={t("settings.section.autoSwitch.searchPlaceholder")} />
          </label>

          <div className="auto-switch-profile-list">
            {autoSwitchProfiles.length === 0 ? (
              <div className="auto-switch-empty">{t("settings.section.autoSwitch.empty")}</div>
            ) : (
              autoSwitchProfiles.map((profile) => {
                const excluded = excludedProfileIds.has(profile.profileId);
                const eligibility = autoSwitchEligibility(profile, t);
                const health = profileHealth(profile, t);
                const codexActive = isCodexActiveProfile(profile, props.config?.codex.accountId);
                const disabledReason = eligibility.key === "ready" ? "" : eligibility.label;
                const stateClass = excluded ? "is-excluded" : eligibility.key === "ready" ? "is-included" : "is-blocked";
                const stateLabel = excluded ? t("settings.section.autoSwitch.manualExcluded") : eligibility.label;
                return (
                  <label className={`auto-switch-profile-row ${excluded ? "is-excluded" : ""}`} key={profile.profileId}>
                    <input type="checkbox" checked={excluded} onChange={(event) => toggleAutoSwitchExcludedProfile(profile.profileId, event.target.checked)} />
                    <span className="auto-switch-profile-main">
                      <strong>{profileLabel(profile, props.showEmails)}</strong>
                      <span>
                        {getPlanType(profile)} · {health.label}
                        {profile.isActive ? t("settings.section.autoSwitch.activeApiSuffix") : ""}
                        {codexActive ? t("settings.section.autoSwitch.codexActiveSuffix") : ""}
                        {disabledReason ? ` · ${disabledReason}` : ""}
                      </span>
                    </span>
                    <span className={`auto-switch-state-pill ${stateClass}`}>{stateLabel}</span>
                  </label>
                );
              })
            )}
          </div>
        </section>
        )}
        {props.scope === "general" && (
        <section className="settings-section">
          <h4>{t("settings.section.display.heading")}</h4>
          <label className="switch-line">
            <input type="checkbox" checked={props.showEmails} onChange={(event) => props.setShowEmails(event.target.checked)} />
            <span>{t("settings.section.display.maskLabel")}</span>
          </label>
          <p className="hint">{t("settings.section.display.maskHint")}</p>
        </section>
        )}
      </div>

      <div className="settings-page-actions settings-page-footer-actions">
        <p className="hint" role="status">{props.status}</p>
        <button className="btn-secondary" type="button" onClick={() => void saveSettings()} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty}>
          {t("settings.footer.save")}
        </button>
        {props.scope === "service" && <button className="btn-primary" type="button" onClick={() => void saveSettings({ restart: true })} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty || !props.config?.restartSupported}>
          {t("settings.footer.saveRestart")}
        </button>}
      </div>
    </section>
  );
}
