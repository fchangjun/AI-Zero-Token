import { Globe2, Loader2, MonitorCog, PlugZap, RefreshCw, Search, Unplug } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig, ProfileSummary } from "@/shared/types";
import type { BusyAction, SettingDraft } from "@/shared/lib/app-types";
import { errorMessage } from "@/shared/lib/app-utils";
import { formatJson } from "@/shared/lib/format";
import { getPlanType, isAuthInvalid, isQuotaExhausted, profileHealth, profileLabel } from "@/shared/lib/profiles";

type CodexGatewayMode = "local" | "remote";
type CodexProviderMode = "openai" | "ai-zero-token";

function normalizeCodexProviderMode(value?: string | null): CodexProviderMode {
  return value === "ai-zero-token" ? "ai-zero-token" : "openai";
}

function codexProviderModeLabel(mode: CodexProviderMode): string {
  return mode === "openai" ? "openai" : "AI Zero Token";
}

function codexProviderModeDescription(mode: CodexProviderMode): string {
  return mode === "openai" ? "保留 Codex 原生历史" : "新的 provider 历史";
}

function codexProviderWriteTarget(mode: CodexProviderMode): string {
  return mode === "openai" ? "openai_base_url" : "[model_providers.ai-zero-token]";
}

function normalizeCodexGatewayUrl(value: string): string {
  let normalized = value.trim();
  if (!normalized) {
    throw new Error("请填写 Codex 网关 URL。");
  }

  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Codex 网关 URL 格式错误，请填写 http(s) 地址或 IP:端口。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Codex 网关 URL 只支持 http 或 https。");
  }

  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/g, "");
  if (!path || path === "/") {
    url.pathname = "/codex/v1";
  } else if (path === "/v1") {
    url.pathname = "/codex/v1";
  } else if (path.endsWith("/codex")) {
    url.pathname = `${path}/v1`;
  } else {
    url.pathname = path;
  }

  return url.toString().replace(/\/+$/g, "");
}

function normalizeCodexGatewayUrlSafe(value: string): string {
  try {
    return normalizeCodexGatewayUrl(value);
  } catch {
    return value.trim().replace(/\/+$/g, "");
  }
}

function getLocalCodexGatewayUrl(config: AdminConfig | null): string {
  return config?.codexBaseUrl || "http://127.0.0.1:8787/codex/v1";
}

function createSettingsDraft(config: AdminConfig): SettingDraft {
  return {
    defaultModel: config.settings.defaultModel,
    proxyEnabled: config.settings.networkProxy.enabled,
    proxyUrl: config.settings.networkProxy.url,
    proxyNoProxy: config.settings.networkProxy.noProxy || "localhost,127.0.0.1,::1",
    autoSwitchEnabled: config.settings.autoSwitch.enabled,
    autoSwitchExcludedProfileIds: config.settings.autoSwitch.excludedProfileIds || [],
    quotaSyncConcurrency: String(config.settings.runtime?.quotaSyncConcurrency || 3),
    freeAccountWebGenerationEnabled: Boolean(config.settings.image?.freeAccountWebGenerationEnabled),
    serverPort: String(config.settings.server.port || 8787),
  };
}

function profileSearchText(profile: ProfileSummary): string {
  return [profileLabel(profile, true), profile.email || "", profile.accountId, profile.profileId, getPlanType(profile)].join(" ").toLowerCase();
}

export function SettingsPage(props: {
  showEmails: boolean;
  setShowEmails: Dispatch<SetStateAction<boolean>>;
  config: AdminConfig | null;
  busy: BusyAction;
  status: string;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshConfig: (options?: { runtime?: boolean; silent?: boolean }) => Promise<AdminConfig>;
}) {
  const [settingsDraft, setSettingsDraft] = useState<SettingDraft>({
    defaultModel: "",
    proxyEnabled: false,
    proxyUrl: "",
    proxyNoProxy: "localhost,127.0.0.1,::1",
    autoSwitchEnabled: false,
    autoSwitchExcludedProfileIds: [],
    quotaSyncConcurrency: "3",
    freeAccountWebGenerationEnabled: false,
    serverPort: "8787",
  });
  const [codexGatewayMode, setCodexGatewayMode] = useState<CodexGatewayMode>("local");
  const [codexGatewayUrl, setCodexGatewayUrl] = useState("http://127.0.0.1:8787/codex/v1");
  const [codexGatewayTouched, setCodexGatewayTouched] = useState(false);
  const [settingsDirtyFields, setSettingsDirtyFields] = useState<Set<keyof SettingDraft>>(() => new Set());
  const [autoSwitchSearch, setAutoSwitchSearch] = useState("");
  const [codexProviderMode, setCodexProviderMode] = useState<CodexProviderMode>("openai");
  const [codexProviderModeTouched, setCodexProviderModeTouched] = useState(false);
  const settingsDirty = settingsDirtyFields.size > 0;

  useEffect(() => {
    if (!props.config || settingsDirty) {
      return;
    }
    setSettingsDraft(createSettingsDraft(props.config));
  }, [props.config, settingsDirty]);

  useEffect(() => {
    if (!props.config || codexGatewayTouched) {
      return;
    }

    const localUrl = getLocalCodexGatewayUrl(props.config);
    const activeUrl = props.config.codex.gatewayProvider?.baseUrl;
    const nextUrl = activeUrl || localUrl;
    setCodexGatewayUrl(nextUrl);
    setCodexGatewayMode(activeUrl && normalizeCodexGatewayUrlSafe(activeUrl) !== normalizeCodexGatewayUrlSafe(localUrl) ? "remote" : "local");
  }, [props.config, codexGatewayTouched]);

  useEffect(() => {
    if (!props.config || codexProviderModeTouched) {
      return;
    }

    setCodexProviderMode(normalizeCodexProviderMode(props.config.codex.gatewayProvider?.providerId));
  }, [props.config, codexProviderModeTouched]);

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

  function selectCodexGatewayMode(mode: CodexGatewayMode) {
    const localUrl = getLocalCodexGatewayUrl(props.config);
    setCodexGatewayTouched(true);
    setCodexGatewayMode(mode);
    if (mode === "local") {
      setCodexGatewayUrl(localUrl);
    } else if (!codexGatewayUrl.trim()) {
      setCodexGatewayUrl(localUrl);
    }
  }

  function getSelectedCodexGatewayUrl(): string {
    return codexGatewayMode === "local" ? getLocalCodexGatewayUrl(props.config) : codexGatewayUrl;
  }

  function selectCodexProviderMode(mode: CodexProviderMode) {
    setCodexProviderModeTouched(true);
    setCodexProviderMode(mode);
  }

  const excludedProfileIds = useMemo(() => new Set(settingsDraft.autoSwitchExcludedProfileIds), [settingsDraft.autoSwitchExcludedProfileIds]);
  const autoSwitchProfiles = useMemo(() => {
    const query = autoSwitchSearch.trim().toLowerCase();
    return (props.config?.profiles || []).filter((profile) => !query || profileSearchText(profile).includes(query));
  }, [autoSwitchSearch, props.config?.profiles]);
  const autoSwitchTotalCount = props.config?.profiles.length || 0;
  const autoSwitchExcludedCount = (props.config?.profiles || []).filter((profile) => excludedProfileIds.has(profile.profileId)).length;
  const autoSwitchIncludedCount = Math.max(0, autoSwitchTotalCount - autoSwitchExcludedCount);

  async function saveSettings(options?: { restart?: boolean }) {
    const hasDirtyField = (...fields: Array<keyof SettingDraft>) => fields.some((field) => settingsDirtyFields.has(field));
    const serverPort = Number.parseInt(settingsDraft.serverPort, 10);
    if (hasDirtyField("serverPort") && (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535)) {
      props.setStatus("端口必须是 1 到 65535 之间的整数。");
      return;
    }
    const quotaSyncConcurrency = Number.parseInt(settingsDraft.quotaSyncConcurrency, 10);
    if (hasDirtyField("quotaSyncConcurrency") && (!Number.isInteger(quotaSyncConcurrency) || quotaSyncConcurrency < 1 || quotaSyncConcurrency > 32)) {
      props.setStatus("全局额度刷新并发数必须是 1 到 32 之间的整数。");
      return;
    }

    const payload: {
      defaultModel?: string;
      networkProxy?: { enabled: boolean; url: string; noProxy: string };
      autoSwitch?: { enabled?: boolean; excludedProfileIds?: string[] };
      runtime?: { quotaSyncConcurrency: number };
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
    if (hasDirtyField("quotaSyncConcurrency")) {
      payload.runtime = {
        quotaSyncConcurrency,
      };
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
        props.setStatus("设置已保存，正在重启本地网关...");
        await fetchJson<{ ok: boolean; restarting?: boolean }>("/_gateway/admin/restart", { method: "POST" });
        props.setStatus("本地网关正在重启，页面会自动恢复。");
      } else {
        props.setStatus("设置已保存。");
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
      props.setStatus(`代理测试通过: HTTP ${result.status}，耗时 ${result.elapsedMs} ms。`);
    } catch (error) {
      props.setStatus(`代理测试失败: ${errorMessage(error)}`);
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
      props.setStatus(count > 0 ? `Codex 模型列表已从网络同步，共 ${count} 个。` : "Codex 模型列表已从网络同步。");
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  async function promptCodexRestart(options: {
    config?: AdminConfig | null;
    confirmMessage: string;
    deferStatus: string;
    restartingStatus: string;
    restartedStatus: string;
    failedStatusPrefix: string;
  }) {
    if (options.config?.codexRestartSupported && window.confirm(options.confirmMessage)) {
      props.setStatus(options.restartingStatus);
      try {
        await fetchJson<{ ok: boolean; restarted?: boolean }>("/_gateway/admin/desktop/restart-codex", { method: "POST" });
        props.setStatus(options.restartedStatus);
      } catch (error) {
        props.setStatus(`${options.failedStatusPrefix}: ${errorMessage(error)}`);
      }
      return;
    }

    props.setStatus(options.deferStatus);
  }

  async function toggleCodexProvider() {
    props.setBusy("codex-provider");
    try {
      const selectedProviderMode = codexProviderMode;
      const selectedProviderLabel = codexProviderModeLabel(selectedProviderMode);
      const selectedBaseUrl = normalizeCodexGatewayUrl(getSelectedCodexGatewayUrl());
      const activeBaseUrl = props.config?.codex.gatewayProvider?.baseUrl;
      const currentProviderMode = normalizeCodexProviderMode(props.config?.codex.gatewayProvider?.providerId);
      const providerChanged = Boolean(
        props.config?.codex.gatewayProvider?.active &&
        currentProviderMode !== selectedProviderMode,
      );
      const activeBaseUrlChanged = Boolean(
        props.config?.codex.gatewayProvider?.active &&
        activeBaseUrl &&
        normalizeCodexGatewayUrlSafe(activeBaseUrl) !== selectedBaseUrl,
      );

      if (props.config?.codex.gatewayProvider?.active && !activeBaseUrlChanged && !providerChanged) {
        const result = await fetchJson<{
          codexProvider: {
            path: string;
            backupPath?: string;
            providerId: string;
            removed: boolean;
          };
          config?: AdminConfig;
        }>("/_gateway/admin/codex/remove-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: formatJson({ providerId: selectedProviderMode }),
        });
        if (result.config) {
          props.setConfig(result.config);
        }
        if (result.codexProvider.removed) {
          await promptCodexRestart({
            config: result.config ?? props.config,
            confirmMessage: `Codex ${selectedProviderLabel} 接管已解除，是否现在重启 Codex 客户端？\n\nCodex 通常在启动时读取本机 config.toml，重启后会回到原本的 Codex 配置。`,
            deferStatus: `已解除 ${selectedProviderLabel} 接管。重启 Codex 后会回到原本的 Codex 配置。`,
            restartingStatus: "正在重启 Codex 客户端...",
            restartedStatus: `已解除 ${selectedProviderLabel} 接管，并已重启 Codex 客户端。`,
            failedStatusPrefix: `已解除 ${selectedProviderLabel} 接管，但重启 Codex 失败`,
          });
        } else {
          props.setStatus("未发现当前受管的 Codex provider 配置。");
        }
        return;
      }

      const wasUpdating = Boolean(props.config?.codex.gatewayProvider?.active);
      const result = await fetchJson<{
        codexProvider: {
          path: string;
          backupPath?: string;
          providerId: string;
          baseUrl: string;
          historyMigration?: {
            path: string;
            backupPath?: string;
            migratedCount: number;
            skipped?: boolean;
            error?: string;
          };
        };
        config?: AdminConfig;
      }>("/_gateway/admin/codex/configure-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ baseUrl: selectedBaseUrl, providerId: selectedProviderMode }),
      });
      if (result.config) {
        props.setConfig(result.config);
      }
      const migratedCount = result.codexProvider.historyMigration?.migratedCount || 0;
      const migrationSuffix = migratedCount > 0 ? `，已迁移 ${migratedCount} 条历史记录` : "";
      await promptCodexRestart({
        config: result.config ?? props.config,
        confirmMessage: selectedProviderMode === "openai"
          ? "Codex 接管将使用 openai 历史记录模式，是否现在重启 Codex 客户端？\n\n重启后请求仍会走 AI Zero Token 网关，历史记录会继续归在 Codex 原生 openai provider 下。"
          : "Codex 接管将切换到 AI Zero Token 新 provider，是否现在重启 Codex 客户端？\n\n重启后请求仍会走 AI Zero Token 网关，历史记录会归在新的 AI Zero Token provider 下。",
        deferStatus: `${wasUpdating ? "已更新" : "已写入"} ${selectedProviderLabel} 接管配置：${result.codexProvider.baseUrl}${migrationSuffix}。重启 Codex 后生效。`,
        restartingStatus: "正在重启 Codex 客户端...",
        restartedStatus: `${wasUpdating ? "已更新" : "已接管"} ${selectedProviderLabel} 请求，并已重启 Codex 客户端。`,
        failedStatusPrefix: `${wasUpdating ? "已更新" : "已接管"} ${selectedProviderLabel} 请求，但重启 Codex 失败`,
      });
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  const currentProviderMode = normalizeCodexProviderMode(props.config?.codex.gatewayProvider?.providerId);
  const currentProviderLabel = codexProviderModeLabel(currentProviderMode);
  const selectedProviderWriteTarget = codexProviderWriteTarget(codexProviderMode);
  const codexProviderActive = Boolean(props.config?.codex.gatewayProvider?.active);
  const codexProviderBusy = props.busy === "codex-provider";
  const localCodexGatewayUrl = getLocalCodexGatewayUrl(props.config);
  const selectedCodexGatewayUrl = codexGatewayMode === "local" ? localCodexGatewayUrl : codexGatewayUrl;
  const normalizedSelectedCodexGatewayUrl = normalizeCodexGatewayUrlSafe(selectedCodexGatewayUrl);
  const currentCodexProviderUrl = props.config?.codex.gatewayProvider?.baseUrl || "";
  const codexProviderUrlChanged = Boolean(
    codexProviderActive &&
    currentCodexProviderUrl &&
    normalizeCodexGatewayUrlSafe(currentCodexProviderUrl) !== normalizedSelectedCodexGatewayUrl,
  );
  const codexProviderModeChanged = Boolean(
    codexProviderActive &&
    currentProviderMode !== codexProviderMode,
  );
  const codexProviderButtonClass = [
    "btn-secondary",
    "codex-provider-button",
    codexProviderBusy
      ? "is-busy"
      : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged
        ? "is-active"
        : "is-inactive",
  ].join(" ");
  const codexProviderButtonLabel = codexProviderBusy
    ? "处理中"
    : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged
      ? "解除 Codex 接管"
      : codexProviderActive
        ? "更新接管配置"
        : "写入并接管";
  const codexProviderStatusLabel = codexProviderActive ? currentProviderLabel : "未接管";
  const codexProviderStatusClass = codexProviderActive ? "is-included" : "is-excluded";

  return (
    <section className="settings-page">
      <div className="settings-page-head settings-page-head-actions-only">
        <div className="settings-page-actions">
          <button className="btn-secondary" type="button" onClick={refreshModels} disabled={props.busy === "models"}>
            {props.busy === "models" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            同步 Codex 模型
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-section codex-provider-section">
          <div className="codex-provider-head">
            <div>
              <h4>Codex 请求接管</h4>
              <p className="hint">默认使用 openai 保留 Codex 原生历史；也可以切到 AI Zero Token，写入新的 provider 历史分组。接管地址既可以是本机网关，也可以是远程网关 URL。</p>
            </div>
            <span className={`count-pill ${codexProviderStatusClass}`}>{codexProviderStatusLabel}</span>
          </div>

          <div className="codex-provider-mode-row">
            <div className="codex-provider-mode-copy">
              <div className="codex-provider-mode-title">历史记录模式</div>
              <p className="hint">{codexProviderModeLabel(codexProviderMode)} · {codexProviderModeDescription(codexProviderMode)}</p>
            </div>
            <div className="codex-provider-mode-toggle" role="group" aria-label="历史记录模式">
              <button className={`codex-provider-mode-option ${codexProviderMode === "openai" ? "is-active" : ""}`} type="button" onClick={() => selectCodexProviderMode("openai")}>
                openai
              </button>
              <button className={`codex-provider-mode-option ${codexProviderMode === "ai-zero-token" ? "is-active" : ""}`} type="button" onClick={() => selectCodexProviderMode("ai-zero-token")}>
                AI Zero Token
              </button>
            </div>
          </div>

          <div className="codex-provider-controls">
            <div className="codex-mode-toggle" role="group" aria-label="Codex 网关模式">
              <button className={`codex-mode-option ${codexGatewayMode === "local" ? "is-active" : ""}`} type="button" onClick={() => selectCodexGatewayMode("local")}>
                <MonitorCog size={16} />
                本机网关
              </button>
              <button className={`codex-mode-option ${codexGatewayMode === "remote" ? "is-active" : ""}`} type="button" onClick={() => selectCodexGatewayMode("remote")}>
                <Globe2 size={16} />
                远程网关
              </button>
            </div>

            <label className="field codex-url-field">
              <span>Codex 网关 URL</span>
              <input
                className="input codex-url-input"
                value={codexGatewayMode === "local" ? localCodexGatewayUrl : codexGatewayUrl}
                onChange={(event) => {
                  setCodexGatewayTouched(true);
                  setCodexGatewayMode("remote");
                  setCodexGatewayUrl(event.target.value);
                }}
                placeholder="http://192.168.1.10:8787/codex/v1"
                readOnly={codexGatewayMode === "local"}
              />
            </label>

            <div className="codex-provider-actions">
              <button className="btn-secondary" type="button" onClick={() => selectCodexGatewayMode("local")}>
                <MonitorCog size={16} />
                使用本机地址
              </button>
              <button className={codexProviderButtonClass} type="button" onClick={toggleCodexProvider} disabled={codexProviderBusy}>
                {codexProviderBusy ? (
                  <Loader2 className="spin" size={16} />
                ) : codexProviderActive && !codexProviderUrlChanged ? (
                  <Unplug size={16} />
                ) : (
                  <PlugZap size={16} />
                )}
                {codexProviderButtonLabel}
              </button>
            </div>
          </div>

          <p className="hint">
            可直接输入 IP:端口，系统会自动补全为 http://IP:端口/codex/v1。当前将写入 <code>{selectedProviderWriteTarget}</code>：<code>{normalizedSelectedCodexGatewayUrl || "-"}</code>
          </p>

          <div className="codex-provider-meta-strip">
            <div>
              <span>配置文件</span>
              <code>{props.config?.codex.gatewayProvider.path || "~/.codex/config.toml"}</code>
            </div>
            <div>
              <span>当前状态</span>
              <code>{codexProviderActive ? `${currentProviderLabel} · ${codexProviderModeDescription(currentProviderMode)}` : "未接管"}</code>
            </div>
            <div>
              <span>写入目标</span>
              <code>{selectedProviderWriteTarget}</code>
            </div>
            <div>
              <span>接管地址</span>
              <code>{currentCodexProviderUrl || "未写入受管配置"}</code>
            </div>
            <div className="is-warning">
              <span>远程网关提示</span>
              <strong>远程请求会消耗对方网关机器上保存的账号额度。</strong>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h4>模型</h4>
          <label className="field">
            <span>默认文本模型</span>
            <select className="control" value={settingsDraft.defaultModel} onChange={(event) => markSettingsDirty({ defaultModel: event.target.value })}>
              {(props.config?.models || []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">模型列表来源：{props.config?.modelCatalog.source || "-"}，共 {props.config?.modelCatalog.modelCount || 0} 个。</p>
        </section>

        <section className="settings-section free-image-section">
          <h4>Free 账号生图</h4>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={settingsDraft.freeAccountWebGenerationEnabled}
              onChange={(event) => markSettingsDirty({ freeAccountWebGenerationEnabled: event.target.checked })}
            />
            <span>允许 Free 账号使用 ChatGPT 网页链路生图</span>
          </label>
          <p className="hint">关闭时，Free 账号生图会继续走原先 Codex Responses 图片工具链路，由上游决定是否可用。</p>
          <p className="free-image-warning">
            <strong>封号风险：</strong>该能力不是官方 API 标准流程，使用 Free 账号生图存在账号风控或封号风险。<strong>额度较少：</strong>Free 额度通常较少，当前经验值大约 8 张，实际以上游账号为准。
          </p>
        </section>

        <section className="settings-section">
          <h4>上游代理</h4>
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.proxyEnabled} onChange={(event) => markSettingsDirty({ proxyEnabled: event.target.checked })} />
            <span>启用 OAuth、模型刷新和接口转发代理</span>
          </label>
          <label className="field">
            <span>代理地址</span>
            <input className="input" value={settingsDraft.proxyUrl} onChange={(event) => markSettingsDirty({ proxyUrl: event.target.value })} placeholder="http://127.0.0.1:7890" />
          </label>
          <label className="field">
            <span>No Proxy</span>
            <input className="input" value={settingsDraft.proxyNoProxy} onChange={(event) => markSettingsDirty({ proxyNoProxy: event.target.value })} />
          </label>
          <button className="btn-secondary" type="button" onClick={testProxy} disabled={props.busy === "proxy"}>
            测试代理
          </button>
        </section>

        <section className="settings-section">
          <h4>端口</h4>
          <label className="field">
            <span>网关端口</span>
            <input className="input" inputMode="numeric" type="number" min={1} max={65535} value={settingsDraft.serverPort} onChange={(event) => markSettingsDirty({ serverPort: event.target.value })} />
          </label>
          <p className="hint">修改后重启本地网关生效，桌面窗口不会退出。若端口被占用，启动时会自动顺延到下一个可用端口。</p>
        </section>

        <section className="settings-section">
          <h4>账号运行策略</h4>
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.autoSwitchEnabled} onChange={(event) => markSettingsDirty({ autoSwitchEnabled: event.target.checked })} />
            <span>当前 API 账号额度耗尽后自动切换到下一个仍有额度的账号</span>
          </label>
          <label className="field">
            <span>全局额度刷新并发数</span>
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
          <p className="hint">手动刷新全部账号额度时使用，默认 3。账号很多可以调高，遇到限流或失败增多时调低。</p>
          <p className="hint">{props.status}</p>
        </section>

        <section className="settings-section auto-switch-exclusion-section">
          <div className="auto-switch-exclusion-head">
            <div>
              <h4>不参与自动轮换名单</h4>
              <p className="hint">这些账号不会被自动切换选中，也不会在自己额度耗尽时触发自动切走；仍可在账号页手动应用到网关或 Codex。</p>
            </div>
            <div className="auto-switch-counts" aria-label="自动轮换账号统计">
              <span className="count-pill is-included">参与 {autoSwitchIncludedCount} 个</span>
              <span className="count-pill is-excluded">不参与 {autoSwitchExcludedCount} 个</span>
            </div>
          </div>

          <label className="auto-switch-search">
            <Search size={16} />
            <input value={autoSwitchSearch} onChange={(event) => setAutoSwitchSearch(event.target.value)} placeholder="搜索邮箱、账号 ID 或 Profile ID" />
          </label>

          <div className="auto-switch-profile-list">
            {autoSwitchProfiles.length === 0 ? (
              <div className="auto-switch-empty">还没有匹配的账号。</div>
            ) : (
              autoSwitchProfiles.map((profile) => {
                const excluded = excludedProfileIds.has(profile.profileId);
                const health = profileHealth(profile);
                const codexActive = Boolean(props.config?.codex.accountId && props.config.codex.accountId === profile.accountId);
                const disabledReason = isAuthInvalid(profile) ? "登录不可用" : isQuotaExhausted(profile) ? "额度耗尽" : "";
                return (
                  <label className={`auto-switch-profile-row ${excluded ? "is-excluded" : ""}`} key={profile.profileId}>
                    <input type="checkbox" checked={excluded} onChange={(event) => toggleAutoSwitchExcludedProfile(profile.profileId, event.target.checked)} />
                    <span className="auto-switch-profile-main">
                      <strong>{profileLabel(profile, props.showEmails)}</strong>
                      <span>
                        {getPlanType(profile)} · {health.label}
                        {profile.isActive ? " · 当前 API 使用中" : ""}
                        {codexActive ? " · Codex 使用中" : ""}
                        {disabledReason ? ` · ${disabledReason}` : ""}
                      </span>
                    </span>
                    <span className={`auto-switch-state-pill ${excluded ? "is-excluded" : "is-included"}`}>
                      {excluded ? "不参与轮换" : "参与轮换"}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </section>

        <section className="settings-section">
          <h4>显示</h4>
          <label className="switch-line">
            <input type="checkbox" checked={props.showEmails} onChange={(event) => props.setShowEmails(event.target.checked)} />
            <span>脱敏模式</span>
          </label>
          <p className="hint">开启后账号邮箱将以脱敏形式展示。</p>
        </section>
      </div>

      <div className="settings-page-actions settings-page-footer-actions">
        <button className="btn-secondary" type="button" onClick={() => void saveSettings()} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty}>
          保存设置
        </button>
        <button className="btn-primary" type="button" onClick={() => void saveSettings({ restart: true })} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty || !props.config?.restartSupported}>
          保存并重启网关
        </button>
      </div>
    </section>
  );
}
