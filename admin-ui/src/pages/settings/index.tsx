import { Globe2, KeyRound, Loader2, MonitorCog, PlugZap, RefreshCw, Search, Share2, Unplug } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig, GatewayShareInfo, ProfileSummary } from "@/shared/types";
import type { BusyAction, SettingDraft } from "@/shared/lib/app-types";
import { copyText, errorMessage } from "@/shared/lib/app-utils";
import { formatJson } from "@/shared/lib/format";
import { autoSwitchEligibility, getPlanType, isCodexActiveProfile, profileHealth, profileLabel } from "@/shared/lib/profiles";

type CodexGatewayMode = "local" | "remote" | "external";
type CodexProviderMode = "openai" | "ai-zero-token";
type ShareGatewayFeedback = {
  tone: "success" | "warning";
  title: string;
  detail: string;
  codexUrl?: string;
  baseUrl?: string;
  apiKey?: string;
};

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

function normalizeHttpProviderUrl(value: string, defaultPath: "/codex/v1" | "/v1"): string {
  let normalized = value.trim();
  if (!normalized) {
    throw new Error(defaultPath === "/codex/v1" ? "请填写 Codex 网关 URL。" : "请填写外部 API Base URL。");
  }

  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(defaultPath === "/codex/v1" ? "Codex 网关 URL 格式错误，请填写 http(s) 地址或 IP:端口。" : "外部 API Base URL 格式错误，请填写完整的 http(s) 地址。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(defaultPath === "/codex/v1" ? "Codex 网关 URL 只支持 http 或 https。" : "外部 API Base URL 只支持 http 或 https。");
  }

  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/g, "");
  if (defaultPath === "/v1") {
    url.pathname = !path || path === "/" ? "/v1" : path;
  } else if (!path || path === "/") {
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

function normalizeCodexGatewayUrl(value: string): string {
  return normalizeHttpProviderUrl(value, "/codex/v1");
}

function normalizeExternalApiBaseUrl(value: string): string {
  return normalizeHttpProviderUrl(value, "/v1");
}

function normalizeCodexGatewayUrlSafe(value: string): string {
  try {
    return normalizeCodexGatewayUrl(value);
  } catch {
    return value.trim().replace(/\/+$/g, "");
  }
}

function normalizeExternalApiBaseUrlSafe(value: string): string {
  try {
    return normalizeExternalApiBaseUrl(value);
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
    codexRequestSerializationEnabled: true,
    codexRequestMinDelayMs: "2500",
    codexRequestJitterMs: "1500",
    captureRequestContentEnabled: false,
    captureResponseProtocolEnabled: false,
    freeAccountWebGenerationEnabled: false,
    serverPort: "8787",
  });
  const [codexGatewayMode, setCodexGatewayMode] = useState<CodexGatewayMode>("local");
  const [codexGatewayUrl, setCodexGatewayUrl] = useState("http://127.0.0.1:8787/codex/v1");
  const [externalApiBaseUrl, setExternalApiBaseUrl] = useState("https://api.openai.com/v1");
  const [externalApiToken, setExternalApiToken] = useState("");
  const [codexGatewayTouched, setCodexGatewayTouched] = useState(false);
  const [settingsDirtyFields, setSettingsDirtyFields] = useState<Set<keyof SettingDraft>>(() => new Set());
  const [autoSwitchSearch, setAutoSwitchSearch] = useState("");
  const [codexProviderMode, setCodexProviderMode] = useState<CodexProviderMode>("openai");
  const [codexProviderModeTouched, setCodexProviderModeTouched] = useState(false);
  const [shareGatewayFeedback, setShareGatewayFeedback] = useState<ShareGatewayFeedback | null>(null);
  const [shareGatewayCopied, setShareGatewayCopied] = useState(false);
  const shareGatewayCopiedTimer = useRef<number | null>(null);
  const settingsDirty = settingsDirtyFields.size > 0;

  useEffect(() => () => {
    if (shareGatewayCopiedTimer.current) {
      window.clearTimeout(shareGatewayCopiedTimer.current);
    }
  }, []);

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
    const activeProvider = props.config.codex.gatewayProvider;
    const activeUrl = activeProvider?.baseUrl;
    const nextUrl = activeUrl || localUrl;
    if (activeProvider?.authType === "bearer_token" && activeUrl) {
      setExternalApiBaseUrl(activeUrl);
      setCodexGatewayMode("external");
    } else {
      setCodexGatewayUrl(nextUrl);
      setCodexGatewayMode(activeUrl && normalizeCodexGatewayUrlSafe(activeUrl) !== normalizeCodexGatewayUrlSafe(localUrl) ? "remote" : "local");
    }
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
    } else if (mode === "remote" && !codexGatewayUrl.trim()) {
      setCodexGatewayUrl(localUrl);
    }
    if (mode === "external") {
      setCodexProviderModeTouched(true);
      setCodexProviderMode("ai-zero-token");
      if (!externalApiBaseUrl.trim()) {
        setExternalApiBaseUrl("https://api.openai.com/v1");
      }
    }
  }

  function getSelectedCodexGatewayUrl(): string {
    if (codexGatewayMode === "external") {
      return externalApiBaseUrl;
    }
    return codexGatewayMode === "local" ? getLocalCodexGatewayUrl(props.config) : codexGatewayUrl;
  }

  function normalizeSelectedCodexProviderUrl(value: string): string {
    return codexGatewayMode === "external" ? normalizeExternalApiBaseUrl(value) : normalizeCodexGatewayUrl(value);
  }

  function normalizeSelectedCodexProviderUrlSafe(value: string): string {
    return codexGatewayMode === "external" ? normalizeExternalApiBaseUrlSafe(value) : normalizeCodexGatewayUrlSafe(value);
  }

  function selectCodexProviderMode(mode: CodexProviderMode) {
    if (codexGatewayMode === "external" && mode === "openai") {
      props.setStatus("外部 API Token 需要使用独立 provider 历史模式。");
      return;
    }
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
  const autoSwitchRuntimeReadyCount = (props.config?.profiles || []).filter(
    (profile) => !excludedProfileIds.has(profile.profileId) && autoSwitchEligibility(profile).key === "ready",
  ).length;
  const autoSwitchBlockedCount = Math.max(0, autoSwitchTotalCount - autoSwitchExcludedCount - autoSwitchRuntimeReadyCount);

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
    const codexRequestMinDelayMs = Number.parseInt(settingsDraft.codexRequestMinDelayMs, 10);
    if (hasDirtyField("codexRequestMinDelayMs") && (!Number.isInteger(codexRequestMinDelayMs) || codexRequestMinDelayMs < 0 || codexRequestMinDelayMs > 60_000)) {
      props.setStatus("Codex 请求最小间隔必须是 0 到 60000 毫秒之间的整数。");
      return;
    }
    const codexRequestJitterMs = Number.parseInt(settingsDraft.codexRequestJitterMs, 10);
    if (hasDirtyField("codexRequestJitterMs") && (!Number.isInteger(codexRequestJitterMs) || codexRequestJitterMs < 0 || codexRequestJitterMs > 60_000)) {
      props.setStatus("Codex 请求随机抖动必须是 0 到 60000 毫秒之间的整数。");
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

  async function shareGateway() {
    props.setBusy("codex-share");
    setShareGatewayCopied(false);
    setShareGatewayFeedback(null);
    if (shareGatewayCopiedTimer.current) {
      window.clearTimeout(shareGatewayCopiedTimer.current);
      shareGatewayCopiedTimer.current = null;
    }
    try {
      const share = await fetchJson<GatewayShareInfo>("/_gateway/admin/share");
      if (!share.primary) {
        const message = share.lanReachable
          ? "没有检测到可分享的局域网地址。请确认设备已连接 Wi-Fi 或局域网。"
          : `当前网关只允许本机访问，不能分享给局域网设备。请把网关监听地址从 ${share.serverHost} 改为 0.0.0.0 后重启。`;
        setShareGatewayFeedback({
          tone: "warning",
          title: "不能分享代理配置",
          detail: message,
        });
        props.setStatus(message);
        return;
      }

      const alternatives = share.addresses
        .slice(1)
        .map((item) => `备用 Codex 远程网关 URL:\n${item.codexBaseUrl}`)
        .join("\n\n");
      const shareText = [
        "AI Zero Token 代理配置",
        "",
        "Codex 远程网关 URL:",
        share.primary.codexBaseUrl,
        "",
        "OpenAI 兼容 Base URL:",
        share.primary.baseUrl,
        "",
        "API Key:",
        "任意值，例如 local",
        "",
        "说明:",
        "远程请求会消耗这台网关机器上保存的账号额度。",
        "请确认两台设备在同一局域网，且防火墙允许访问该端口。",
        ...(alternatives ? ["", alternatives] : []),
      ].join("\n");

      const copied = await copyText(shareText);
      if (copied) {
        setShareGatewayCopied(true);
        shareGatewayCopiedTimer.current = window.setTimeout(() => {
          setShareGatewayCopied(false);
          shareGatewayCopiedTimer.current = null;
        }, 2000);
      }
      setShareGatewayFeedback({
        tone: copied ? "success" : "warning",
        title: copied ? "代理配置已复制" : "复制失败，请手动复制",
        detail: copied
          ? "把这段配置发给对方。对方在 AI Zero Token 的「远程网关」里填 Codex 地址，OpenAI 兼容客户端填 Base URL。"
          : "浏览器未允许写入剪贴板，请手动复制下面的代理配置。",
        codexUrl: share.primary.codexBaseUrl,
        baseUrl: share.primary.baseUrl,
        apiKey: "任意值，例如 local",
      });
      props.setStatus(copied ? `代理配置已复制：${share.primary.codexBaseUrl}` : shareText);
    } catch (error) {
      const message = errorMessage(error);
      setShareGatewayFeedback({
        tone: "warning",
        title: "代理配置生成失败",
        detail: message,
      });
      props.setStatus(message);
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
      const selectedProviderMode = codexGatewayMode === "external" ? "ai-zero-token" : codexProviderMode;
      const selectedProviderLabel = codexProviderModeLabel(selectedProviderMode);
      const selectedTakeoverLabel = codexGatewayMode === "external" ? "外部 API" : selectedProviderLabel;
      const selectedBaseUrl = normalizeSelectedCodexProviderUrl(getSelectedCodexGatewayUrl());
      const activeBaseUrl = props.config?.codex.gatewayProvider?.baseUrl;
      const activeAuthType = props.config?.codex.gatewayProvider?.authType;
      const currentProviderMode = normalizeCodexProviderMode(props.config?.codex.gatewayProvider?.providerId);
      const providerChanged = Boolean(
        props.config?.codex.gatewayProvider?.active &&
        currentProviderMode !== selectedProviderMode,
      );
      const activeBaseUrlChanged = Boolean(
        props.config?.codex.gatewayProvider?.active &&
        activeBaseUrl &&
        normalizeSelectedCodexProviderUrlSafe(activeBaseUrl) !== selectedBaseUrl,
      );
      const externalToken = externalApiToken.trim();
      const externalTokenUpdating = codexGatewayMode === "external" && externalToken.length > 0;
      const externalTokenAlreadySaved = Boolean(
        codexGatewayMode === "external" &&
        props.config?.codex.gatewayProvider?.active &&
        currentProviderMode === selectedProviderMode &&
        activeAuthType === "bearer_token",
      );
      if (codexGatewayMode === "external" && !externalToken && !externalTokenAlreadySaved) {
        props.setStatus("请填写外部 API Token。");
        return;
      }

      if (props.config?.codex.gatewayProvider?.active && !activeBaseUrlChanged && !providerChanged && !externalTokenUpdating) {
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
            confirmMessage: `Codex ${selectedTakeoverLabel} 接管已解除，是否现在重启 Codex 客户端？\n\nCodex 通常在启动时读取本机 config.toml，重启后会回到原本的 Codex 配置。`,
            deferStatus: `已解除 ${selectedTakeoverLabel} 接管。重启 Codex 后会回到原本的 Codex 配置。`,
            restartingStatus: "正在重启 Codex 客户端...",
            restartedStatus: `已解除 ${selectedTakeoverLabel} 接管，并已重启 Codex 客户端。`,
            failedStatusPrefix: `已解除 ${selectedTakeoverLabel} 接管，但重启 Codex 失败`,
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
          kind?: "codex_gateway" | "openai_compatible";
          authType?: "none" | "bearer_token" | "env_key";
          historyMigration?: {
            path: string;
            backupPath?: string;
            migratedCount: number;
            rolloutPatchedCount?: number;
            rolloutPatchErrors?: string[];
            skipped?: boolean;
            error?: string;
          };
        };
        config?: AdminConfig;
      }>("/_gateway/admin/codex/configure-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({
          baseUrl: selectedBaseUrl,
          providerId: selectedProviderMode,
          kind: codexGatewayMode === "external" ? "openai_compatible" : "codex_gateway",
          ...(codexGatewayMode === "external" && externalToken ? { bearerToken: externalToken } : {}),
        }),
      });
      if (result.config) {
        props.setConfig(result.config);
      }
      if (codexGatewayMode === "external") {
        setExternalApiToken("");
      }
      const migratedCount = result.codexProvider.historyMigration?.migratedCount || 0;
      const rolloutPatchedCount = result.codexProvider.historyMigration?.rolloutPatchedCount || 0;
      const migrationSuffix = migratedCount > 0
        ? `，已迁移 ${migratedCount} 条历史记录${rolloutPatchedCount > 0 ? `，已修复 ${rolloutPatchedCount} 个会话索引` : ""}`
        : "";
      await promptCodexRestart({
        config: result.config ?? props.config,
        confirmMessage: codexGatewayMode === "external"
          ? "Codex 接管将直接使用外部 API Base URL 和保存的 token，是否现在重启 Codex 客户端？\n\n重启后请求会绕过 AI Zero Token 网关账号池，历史记录会归在 AI Zero Token provider 下。"
          : selectedProviderMode === "openai"
            ? "Codex 接管将使用 openai 历史记录模式，是否现在重启 Codex 客户端？\n\n重启后请求仍会走 AI Zero Token 网关，历史记录会继续归在 Codex 原生 openai provider 下。"
            : "Codex 接管将切换到 AI Zero Token 新 provider，是否现在重启 Codex 客户端？\n\n重启后请求仍会走 AI Zero Token 网关，历史记录会归在新的 AI Zero Token provider 下。",
        deferStatus: `${wasUpdating ? "已更新" : "已写入"} ${selectedTakeoverLabel} 接管配置：${result.codexProvider.baseUrl}${migrationSuffix}。重启 Codex 后生效。`,
        restartingStatus: "正在重启 Codex 客户端...",
        restartedStatus: `${wasUpdating ? "已更新" : "已接管"} ${selectedTakeoverLabel} 请求，并已重启 Codex 客户端。`,
        failedStatusPrefix: `${wasUpdating ? "已更新" : "已接管"} ${selectedTakeoverLabel} 请求，但重启 Codex 失败`,
      });
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  const currentProviderMode = normalizeCodexProviderMode(props.config?.codex.gatewayProvider?.providerId);
  const currentProviderLabel = codexProviderModeLabel(currentProviderMode);
  const selectedEffectiveProviderMode: CodexProviderMode = codexGatewayMode === "external" ? "ai-zero-token" : codexProviderMode;
  const selectedProviderWriteTarget = codexProviderWriteTarget(selectedEffectiveProviderMode);
  const codexProviderActive = Boolean(props.config?.codex.gatewayProvider?.active);
  const codexProviderBusy = props.busy === "codex-provider";
  const codexShareBusy = props.busy === "codex-share";
  const localCodexGatewayUrl = getLocalCodexGatewayUrl(props.config);
  const selectedCodexGatewayUrl = getSelectedCodexGatewayUrl();
  const normalizedSelectedCodexGatewayUrl = normalizeSelectedCodexProviderUrlSafe(selectedCodexGatewayUrl);
  const currentCodexProviderUrl = props.config?.codex.gatewayProvider?.baseUrl || "";
  const currentAuthType = props.config?.codex.gatewayProvider?.authType;
  const externalModeTokenUpdating = codexGatewayMode === "external" && externalApiToken.trim().length > 0;
  const codexProviderUrlChanged = Boolean(
    codexProviderActive &&
    currentCodexProviderUrl &&
    normalizeSelectedCodexProviderUrlSafe(currentCodexProviderUrl) !== normalizedSelectedCodexGatewayUrl,
  );
  const codexProviderModeChanged = Boolean(
    codexProviderActive &&
    currentProviderMode !== selectedEffectiveProviderMode,
  );
  const codexProviderButtonClass = [
    "btn-secondary",
    "codex-provider-button",
    codexProviderBusy
      ? "is-busy"
      : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged && !externalModeTokenUpdating
        ? "is-active"
        : "is-inactive",
  ].join(" ");
  const codexProviderButtonLabel = codexProviderBusy
    ? "处理中"
    : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged && !externalModeTokenUpdating
      ? "解除 Codex 接管"
      : codexProviderActive
        ? "更新接管配置"
        : "写入并接管";
  const codexProviderStatusLabel = codexProviderActive ? (currentAuthType === "bearer_token" ? "外部 API" : currentProviderLabel) : "未接管";
  const codexProviderStatusClass = codexProviderActive ? "is-included" : "is-excluded";
  const currentProviderAuthLabel = !codexProviderActive
    ? "未配置"
    : currentAuthType === "bearer_token"
      ? "Token 已保存"
      : currentAuthType === "env_key"
        ? `环境变量 ${props.config?.codex.gatewayProvider?.envKey || "-"}`
        : "使用 Codex/OpenAI 登录";
  const externalApiTokenPlaceholder = currentAuthType === "bearer_token" && codexProviderActive ? "已保存，留空沿用现有 token" : "sk-...";

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
              <p className="hint">默认使用 openai 保留 Codex 原生历史；也可以切到 AI Zero Token，写入新的 provider 历史分组。接管地址可以是本机网关、远程网关或外部 OpenAI 兼容 API。</p>
            </div>
            <span className={`count-pill ${codexProviderStatusClass}`}>{codexProviderStatusLabel}</span>
          </div>

          <div className="codex-provider-mode-row">
            <div className="codex-provider-mode-copy">
              <div className="codex-provider-mode-title">历史记录模式</div>
              <p className="hint">{codexProviderModeLabel(codexProviderMode)} · {codexProviderModeDescription(codexProviderMode)}</p>
            </div>
            <div className="codex-provider-mode-toggle" role="group" aria-label="历史记录模式">
              <button
                className={`codex-provider-mode-option ${codexProviderMode === "openai" ? "is-active" : ""}`}
                type="button"
                onClick={() => selectCodexProviderMode("openai")}
                disabled={codexGatewayMode === "external"}
                title={codexGatewayMode === "external" ? "外部 API Token 需要使用独立 provider 历史模式" : undefined}
              >
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
              <button className={`codex-mode-option ${codexGatewayMode === "external" ? "is-active" : ""}`} type="button" onClick={() => selectCodexGatewayMode("external")}>
                <KeyRound size={16} />
                外部 API
              </button>
            </div>

            <div className={`codex-provider-fields ${codexGatewayMode === "external" ? "has-token-field" : ""}`}>
              <label className="field codex-url-field">
                <span>{codexGatewayMode === "external" ? "外部 API Base URL" : "Codex 网关 URL"}</span>
                <input
                  className="input codex-url-input"
                  value={codexGatewayMode === "local" ? localCodexGatewayUrl : codexGatewayMode === "external" ? externalApiBaseUrl : codexGatewayUrl}
                  onChange={(event) => {
                    setCodexGatewayTouched(true);
                    if (codexGatewayMode === "external") {
                      setExternalApiBaseUrl(event.target.value);
                    } else {
                      setCodexGatewayMode("remote");
                      setCodexGatewayUrl(event.target.value);
                    }
                  }}
                  placeholder={codexGatewayMode === "external" ? "https://api.openai.com/v1" : "http://192.168.1.10:8787/codex/v1"}
                  readOnly={codexGatewayMode === "local"}
                />
              </label>

              {codexGatewayMode === "external" ? (
                <label className="field codex-token-field">
                  <span>外部 API Token</span>
                  <input
                    className="input codex-url-input"
                    type="password"
                    value={externalApiToken}
                    onChange={(event) => setExternalApiToken(event.target.value)}
                    placeholder={externalApiTokenPlaceholder}
                    autoComplete="off"
                  />
                </label>
              ) : null}
            </div>

            <div className="codex-provider-actions">
              <button className="btn-secondary share-gateway-button" type="button" onClick={shareGateway} disabled={codexShareBusy}>
                {codexShareBusy ? <Loader2 className="spin" size={16} /> : <Share2 size={16} />}
                {codexShareBusy ? "生成中" : shareGatewayCopied ? "已复制" : "复制代理配置"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => selectCodexGatewayMode("local")}>
                <MonitorCog size={16} />
                使用本机地址
              </button>
              <button className={codexProviderButtonClass} type="button" onClick={toggleCodexProvider} disabled={codexProviderBusy}>
                {codexProviderBusy ? (
                  <Loader2 className="spin" size={16} />
                ) : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged && !externalModeTokenUpdating ? (
                  <Unplug size={16} />
                ) : (
                  <PlugZap size={16} />
                )}
                {codexProviderButtonLabel}
              </button>
            </div>
          </div>

          {shareGatewayFeedback ? (
            <div className={`share-gateway-feedback ${shareGatewayFeedback.tone === "success" ? "is-success" : "is-warning"}`} role="status" aria-live="polite">
              <strong>{shareGatewayFeedback.title}</strong>
              <span>{shareGatewayFeedback.detail}</span>
              <div className="share-gateway-config-list">
                {shareGatewayFeedback.codexUrl ? (
                  <div>
                    <span>Codex 远程网关 URL</span>
                    <code>{shareGatewayFeedback.codexUrl}</code>
                  </div>
                ) : null}
                {shareGatewayFeedback.baseUrl ? (
                  <div>
                    <span>OpenAI 兼容 Base URL</span>
                    <code>{shareGatewayFeedback.baseUrl}</code>
                  </div>
                ) : null}
                {shareGatewayFeedback.apiKey ? (
                  <div>
                    <span>API Key</span>
                    <code>{shareGatewayFeedback.apiKey}</code>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="hint">
            {codexGatewayMode === "external"
              ? "外部 API 可填写 OpenAI 兼容根地址，系统会自动补全为 /v1；token 会保存到 Codex provider 配置。"
              : "可直接输入 IP:端口，系统会自动补全为 http://IP:端口/codex/v1。"}
            当前将写入 <code>{selectedProviderWriteTarget}</code>：<code>{normalizedSelectedCodexGatewayUrl || "-"}</code>
          </p>

          <div className="codex-provider-meta-strip">
            <div>
              <span>配置文件</span>
              <code>{props.config?.codex.gatewayProvider.path || "~/.codex/config.toml"}</code>
            </div>
            <div>
              <span>当前状态</span>
              <code>{codexProviderActive ? `${currentAuthType === "bearer_token" ? "外部 API" : currentProviderLabel} · ${codexProviderModeDescription(currentProviderMode)}` : "未接管"}</code>
            </div>
            <div>
              <span>写入目标</span>
              <code>{selectedProviderWriteTarget}</code>
            </div>
            <div>
              <span>接管地址</span>
              <code>{currentCodexProviderUrl || "未写入受管配置"}</code>
            </div>
            <div>
              <span>认证</span>
              <code>{currentProviderAuthLabel}</code>
            </div>
            <div className="is-warning">
              <span>{codexGatewayMode === "external" || currentAuthType === "bearer_token" ? "外部 API 提示" : "远程网关提示"}</span>
              <strong>{codexGatewayMode === "external" || currentAuthType === "bearer_token" ? "外部 API 会绕过 AI Zero Token 账号池，直接消耗对应 token 的额度。" : "远程请求会消耗对方网关机器上保存的账号额度。"}</strong>
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
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.codexRequestSerializationEnabled} onChange={(event) => markSettingsDirty({ codexRequestSerializationEnabled: event.target.checked })} />
            <span>启用 Codex 请求串行保护</span>
          </label>
          <div className="settings-inline-fields">
            <label className="field">
              <span>最小间隔 ms</span>
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
              <span>随机抖动 ms</span>
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
          <p className="hint">降低数值可以减少每轮转发等待；完全关闭或设为 0 会更快，但更容易形成上游突发请求。</p>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={settingsDraft.captureRequestContentEnabled}
              onChange={(event) => markSettingsDirty({
                captureRequestContentEnabled: event.target.checked,
                ...(!event.target.checked ? { captureResponseProtocolEnabled: false } : {}),
              })}
            />
            <span>将 Codex 请求内容写入独立诊断文件</span>
          </label>
          <p className="hint">默认关闭。开启后新请求会把截断后的 input、instructions、tools、reasoning 和精简返回摘要写入单独诊断文件；普通日志只保存引用，可在请求日志页查看和清理。</p>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={settingsDraft.captureResponseProtocolEnabled}
              onChange={(event) => markSettingsDirty({ captureResponseProtocolEnabled: event.target.checked })}
              disabled={!settingsDraft.captureRequestContentEnabled}
            />
            <span>同时保存完整返回 SSE 协议</span>
          </label>
          <p className="hint">默认关闭。只有排查重复事件、上游协议或流式异常时再开启；它会保存完整 events 和 rawSse，单个诊断文件可能明显变大。</p>
          <p className="hint">{props.status}</p>
        </section>

        <section className="settings-section auto-switch-exclusion-section">
          <div className="auto-switch-exclusion-head">
            <div>
              <h4>不参与自动轮换名单</h4>
              <p className="hint">勾选表示手动排除。登录不可用或额度耗尽的账号即使未勾选，也不会被实际自动轮换选中。</p>
            </div>
            <div className="auto-switch-counts" aria-label="自动轮换账号统计">
              <span className="count-pill is-included">可轮换 {autoSwitchRuntimeReadyCount} 个</span>
              <span className="count-pill is-blocked">不可用 {autoSwitchBlockedCount} 个</span>
              <span className="count-pill is-excluded">手动排除 {autoSwitchExcludedCount} 个</span>
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
                const eligibility = autoSwitchEligibility(profile);
                const health = profileHealth(profile);
                const codexActive = isCodexActiveProfile(profile, props.config?.codex.accountId);
                const disabledReason = eligibility.key === "ready" ? "" : eligibility.label;
                const stateClass = excluded ? "is-excluded" : eligibility.key === "ready" ? "is-included" : "is-blocked";
                const stateLabel = excluded ? "手动排除" : eligibility.label;
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
                    <span className={`auto-switch-state-pill ${stateClass}`}>{stateLabel}</span>
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
