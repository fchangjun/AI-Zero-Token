import { Globe2, KeyRound, Loader2, MonitorCog, PlugZap, RefreshCw, Search, Share2, Unplug } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig, GatewayShareInfo, ProfileSummary } from "@/shared/types";
import type { BusyAction, SettingDraft } from "@/shared/lib/app-types";
import { copyText, errorMessage } from "@/shared/lib/app-utils";
import { useLocaleValue, useT } from "@/i18n";
import { formatJson } from "@/shared/lib/format";
import { autoSwitchEligibility, getPlanType, isCodexActiveProfile, profileHealth, profileLabel, type Translator } from "@/shared/lib/profiles";
import {
  mergeReadyExternalCatalogModels,
  resolveExternalConnectAction,
  restoreExternalProviderCache,
  selectCachedExternalModel,
  type CodexCatalogModel,
  type ExternalInspectionHistoryEntry,
  type ExternalModelInspectionResult,
  type ExternalModelStatus,
  type ExternalProviderInspection,
} from "./external-provider-cache";

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

const externalModelStatusClassName: Record<ExternalModelStatus, string> = {
  ready: "is-ready",
  busy: "is-busy",
  unavailable: "is-unavailable",
  incompatible: "is-incompatible",
  auth_error: "is-auth-error",
  transport_error: "is-transport-error",
  skipped: "is-skipped",
};

function externalModelStatusMeta(t: Translator): Record<ExternalModelStatus, { label: string; className: string }> {
  return {
    ready: { label: t("settings.externalModelStatus.ready"), className: externalModelStatusClassName.ready },
    busy: { label: t("settings.externalModelStatus.busy"), className: externalModelStatusClassName.busy },
    unavailable: { label: t("settings.externalModelStatus.unavailable"), className: externalModelStatusClassName.unavailable },
    incompatible: { label: t("settings.externalModelStatus.incompatible"), className: externalModelStatusClassName.incompatible },
    auth_error: { label: t("settings.externalModelStatus.auth_error"), className: externalModelStatusClassName.auth_error },
    transport_error: { label: t("settings.externalModelStatus.transport_error"), className: externalModelStatusClassName.transport_error },
    skipped: { label: t("settings.externalModelStatus.skipped"), className: externalModelStatusClassName.skipped },
  };
}

function normalizeCodexProviderMode(value?: string | null): CodexProviderMode {
  return value === "ai-zero-token" ? "ai-zero-token" : "openai";
}

function codexProviderModeLabel(mode: CodexProviderMode, t: Translator): string {
  return mode === "openai" ? t("settings.providerMode.openai.label") : t("settings.providerMode.aiZeroToken.label");
}

function codexProviderModeDescription(mode: CodexProviderMode, t: Translator): string {
  return mode === "openai" ? t("settings.providerMode.openai.description") : t("settings.providerMode.aiZeroToken.description");
}

function codexProviderWriteTarget(mode: CodexProviderMode, t: Translator): string {
  return mode === "openai" ? t("settings.providerMode.openai.writeTarget") : t("settings.providerMode.aiZeroToken.writeTarget");
}

function normalizeHttpProviderUrl(value: string, defaultPath: "/codex/v1" | "/v1", t: Translator): string {
  let normalized = value.trim();
  if (!normalized) {
    throw new Error(defaultPath === "/codex/v1" ? t("settings.urlError.codex.empty") : t("settings.urlError.external.empty"));
  }

  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    normalized = `${defaultPath === "/v1" ? "https" : "http"}://${normalized}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(defaultPath === "/codex/v1" ? t("settings.urlError.codex.format") : t("settings.urlError.external.format"));
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(defaultPath === "/codex/v1" ? t("settings.urlError.codex.scheme") : t("settings.urlError.external.scheme"));
  }
  if (url.username || url.password) {
    throw new Error(defaultPath === "/codex/v1" ? t("settings.urlError.codex.credentials") : t("settings.urlError.external.credentials"));
  }

  url.hash = "";
  url.search = "";
  let path = url.pathname.replace(/\/+$/g, "");
  if (defaultPath === "/v1") {
    path = path.replace(/\/(?:models|responses)$/i, "");
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

function normalizeCodexGatewayUrl(value: string, t: Translator): string {
  return normalizeHttpProviderUrl(value, "/codex/v1", t);
}

function normalizeExternalApiBaseUrl(value: string, t: Translator): string {
  return normalizeHttpProviderUrl(value, "/v1", t);
}

function normalizeCodexGatewayUrlSafe(value: string, t: Translator): string {
  try {
    return normalizeCodexGatewayUrl(value, t);
  } catch {
    return value.trim().replace(/\/+$/g, "");
  }
}

function normalizeExternalApiBaseUrlSafe(value: string, t: Translator): string {
  try {
    return normalizeExternalApiBaseUrl(value, t);
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

  const t = useT();
  const locale = useLocaleValue();
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";
  const gatewayProvider = props.config?.codex.gatewayProvider;
  const savedExternalProvider = props.config?.codex.savedExternalProvider
    ?? (gatewayProvider?.providerId === "ai-zero-token" ? gatewayProvider : undefined);
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
  const [externalApiBaseUrl, setExternalApiBaseUrl] = useState("");
  const [externalApiToken, setExternalApiToken] = useState("");
  const [externalModelOverride, setExternalModelOverride] = useState("");
  const [externalSelectedModel, setExternalSelectedModel] = useState("");
  const [externalInspection, setExternalInspection] = useState<ExternalProviderInspection | null>(null);
  const [externalInspectionExpanded, setExternalInspectionExpanded] = useState(true);
  const [externalCatalogModels, setExternalCatalogModels] = useState<CodexCatalogModel[]>([]);
  const [externalCatalogBaseUrl, setExternalCatalogBaseUrl] = useState("");
  const [externalInspectionHistory, setExternalInspectionHistory] = useState<ExternalInspectionHistoryEntry[]>([]);
  const [externalInspectionHistoryLoaded, setExternalInspectionHistoryLoaded] = useState(false);
  const [externalInspectionFromHistory, setExternalInspectionFromHistory] = useState(false);
  const [externalInspectionRunning, setExternalInspectionRunning] = useState(false);
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
      setCodexGatewayMode(activeUrl && normalizeCodexGatewayUrlSafe(activeUrl, t) !== normalizeCodexGatewayUrlSafe(localUrl, t) ? "remote" : "local");
    }
  }, [props.config, codexGatewayTouched]);

  useEffect(() => {
    if (codexGatewayTouched || !savedExternalProvider?.baseUrl) {
      return;
    }
    setExternalApiBaseUrl(savedExternalProvider.baseUrl);
  }, [codexGatewayTouched, savedExternalProvider?.baseUrl]);

  useEffect(() => {
    if (!props.config || codexProviderModeTouched) {
      return;
    }

    setCodexProviderMode(normalizeCodexProviderMode(props.config.codex.gatewayProvider?.providerId));
  }, [props.config, codexProviderModeTouched]);

  useEffect(() => {
    const saved = props.config?.codex.gatewayProvider?.catalogModels;
    const savedBaseUrl = props.config?.codex.gatewayProvider?.baseUrl;
    if (saved?.length && savedBaseUrl) {
      setExternalCatalogModels(saved);
      setExternalCatalogBaseUrl(normalizeExternalApiBaseUrlSafe(savedBaseUrl, t));
    }
  }, [props.config?.codex.gatewayProvider?.baseUrl, props.config?.codex.gatewayProvider?.catalogModels, t]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    fetchJson<{ data: ExternalInspectionHistoryEntry[] }>("/_gateway/admin/codex/inspection-history", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!cancelled) {
          setExternalInspectionHistory(result.data || []);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) {
          setExternalInspectionHistoryLoaded(true);
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (externalInspection || !externalApiBaseUrl.trim()) return;
    const normalized = normalizeExternalApiBaseUrlSafe(externalApiBaseUrl, t);
    const latest = externalInspectionHistory.find((entry) => (
      (!entry.providerId || entry.providerId === "ai-zero-token")
      && normalizeExternalApiBaseUrlSafe(entry.baseUrl, t) === normalized
    ));
    if (!latest) return;
    const restored = restoreExternalProviderCache(latest);
    setExternalInspection({ ...latest.inspection, inspectionId: latest.id });
    setExternalInspectionFromHistory(true);
    setExternalInspectionExpanded(true);
    setExternalCatalogModels(restored.catalogModels);
    setExternalCatalogBaseUrl(normalized);
    setExternalSelectedModel(restored.selectedModel);
  }, [externalApiBaseUrl, externalInspection, externalInspectionHistory, t]);

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
    }
  }

  function clearExternalInspection() {
    setExternalInspection(null);
    setExternalInspectionFromHistory(false);
    setExternalSelectedModel("");
  }

  function externalCatalogForBaseUrl(baseUrl: string): CodexCatalogModel[] {
    const normalized = normalizeExternalApiBaseUrlSafe(baseUrl, t);
    if (externalCatalogBaseUrl === normalized) {
      return externalCatalogModels;
    }
    const latest = externalInspectionHistory.find((entry) => (
      (!entry.providerId || entry.providerId === "ai-zero-token")
      && normalizeExternalApiBaseUrlSafe(entry.baseUrl, t) === normalized
    ));
    return latest ? restoreExternalProviderCache(latest).catalogModels : [];
  }

  function mergeExternalCatalogModels(models: ExternalModelInspectionResult[], baseUrl: string): CodexCatalogModel[] {
    return mergeReadyExternalCatalogModels(externalCatalogForBaseUrl(baseUrl), models);
  }

  function clearExternalProviderDraft() {
    clearExternalInspection();
    setExternalModelOverride("");
    setExternalApiToken("");
  }

  function getSelectedCodexGatewayUrl(): string {
    if (codexGatewayMode === "external") {
      return externalApiBaseUrl;
    }
    return codexGatewayMode === "local" ? getLocalCodexGatewayUrl(props.config) : codexGatewayUrl;
  }

  function normalizeSelectedCodexProviderUrl(value: string): string {
    return codexGatewayMode === "external" ? normalizeExternalApiBaseUrl(value, t) : normalizeCodexGatewayUrl(value, t);
  }

  function normalizeSelectedCodexProviderUrlSafe(value: string): string {
    return codexGatewayMode === "external" ? normalizeExternalApiBaseUrlSafe(value, t) : normalizeCodexGatewayUrlSafe(value, t);
  }

  function selectCodexProviderMode(mode: CodexProviderMode) {
    if (codexGatewayMode === "external" && mode === "openai") {
      props.setStatus(t("settings.providerMode.externalRequireProvider"));
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
          ? t("settings.shareGateway.noAddress")
          : t("settings.shareGateway.localOnly", { host: share.serverHost });
        setShareGatewayFeedback({
          tone: "warning",
          title: t("settings.shareGateway.cannotShareTitle"),
          detail: message,
        });
        props.setStatus(message);
        return;
      }

      const alternatives = share.addresses
        .slice(1)
        .map((item) => t("settings.shareGateway.altLine", { codexBaseUrl: item.codexBaseUrl }))
        .join("\n\n");
      const shareText = [
        t("settings.shareGateway.configTitle"),
        "",
        t("settings.shareGateway.codexLine"),
        share.primary.codexBaseUrl,
        "",
        t("settings.shareGateway.openaiLine"),
        share.primary.baseUrl,
        "",
        t("settings.shareGateway.apiKeyLabel"),
        t("settings.shareGateway.apiKeyValue"),
        "",
        t("settings.shareGateway.notesLabel"),
        t("settings.shareGateway.noteLine1"),
        t("settings.shareGateway.noteLine2"),
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
        title: copied ? t("settings.shareGateway.copiedTitle") : t("settings.shareGateway.copyFailedTitle"),
        detail: copied
          ? t("settings.shareGateway.shareSuccessDetail")
          : t("settings.shareGateway.shareFailDetail"),
        codexUrl: share.primary.codexBaseUrl,
        baseUrl: share.primary.baseUrl,
        apiKey: t("settings.shareGateway.apiKeyValue"),
      });
      props.setStatus(copied ? t("settings.shareGateway.copiedStatus", { url: share.primary.codexBaseUrl }) : shareText);
    } catch (error) {
      const message = errorMessage(error);
      setShareGatewayFeedback({
        tone: "warning",
        title: t("settings.shareGateway.generateFailedTitle"),
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

  async function toggleCodexProvider(options?: { externalAction?: "connect" | "rescan" | "remove" }) {
    props.setBusy("codex-provider");
    try {
      const selectedProviderMode = codexGatewayMode === "external" ? "ai-zero-token" : codexProviderMode;
      const selectedProviderLabel = codexProviderModeLabel(selectedProviderMode, t);
      const selectedTakeoverLabel = codexGatewayMode === "external" ? t("settings.providerStatus.external") : selectedProviderLabel;
      const selectedBaseUrl = normalizeSelectedCodexProviderUrl(getSelectedCodexGatewayUrl());
      const cachedExternalCatalogModels = codexGatewayMode === "external"
        ? externalCatalogForBaseUrl(selectedBaseUrl)
        : [];
      const resolvedExternalAction = resolveExternalConnectAction(
        options?.externalAction === "rescan" ? "rescan" : "connect",
        cachedExternalCatalogModels,
      );
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
        savedExternalProvider?.exists &&
        savedExternalProvider.providerId === selectedProviderMode &&
        savedExternalProvider.authType === "bearer_token" &&
        savedExternalProvider.baseUrl &&
        normalizeExternalApiBaseUrlSafe(savedExternalProvider.baseUrl, t) === selectedBaseUrl,
      );

      const removeRequested = options?.externalAction === "remove" || (
        codexGatewayMode !== "external" &&
        props.config?.codex.gatewayProvider?.active &&
        !activeBaseUrlChanged &&
        !providerChanged &&
        !externalTokenUpdating
      );
      if (removeRequested) {
        const result = await fetchJson<{
          codexProvider: {
            path: string;
            backupPath?: string;
            providerId: string;
            removed: boolean;
            providerDefinitionRetained?: boolean;
            credentialsRetained?: boolean;
          };
          config?: AdminConfig;
        }>("/_gateway/admin/codex/remove-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: formatJson({ providerId: currentProviderMode }),
        });
        if (result.config) {
          props.setConfig(result.config);
        }
        if (result.codexProvider.removed) {
          if (activeAuthType === "bearer_token") {
            clearExternalProviderDraft();
          }
          await promptCodexRestart({
            config: result.config ?? props.config,
            confirmMessage: result.codexProvider.providerDefinitionRetained
              ? t("settings.providerTakeover.confirmDeactivateCompatible", { target: selectedTakeoverLabel })
              : t("settings.providerTakeover.confirmRemove", { target: selectedTakeoverLabel }),
            deferStatus: result.codexProvider.providerDefinitionRetained
              ? t("settings.providerTakeover.deferDeactivateCompatible", { target: selectedTakeoverLabel })
              : t("settings.providerTakeover.deferRemove", { target: selectedTakeoverLabel }),
            restartingStatus: t("settings.providerTakeover.restarting"),
            restartedStatus: result.codexProvider.providerDefinitionRetained
              ? t("settings.providerTakeover.deactivatedCompatibleAndRestarted", { target: selectedTakeoverLabel })
              : t("settings.providerTakeover.removedAndRestarted", { target: selectedTakeoverLabel }),
            failedStatusPrefix: t("settings.providerTakeover.removedButRestartFailed", { target: selectedTakeoverLabel }),
          });
        } else {
          props.setStatus(t("settings.providerTakeover.unmanaged"));
        }
        return;
      }

      if (codexGatewayMode === "external" && !externalToken && !externalTokenAlreadySaved) {
        props.setStatus(activeBaseUrlChanged ? t("settings.providerTakeover.externalAddressChanged") : t("settings.providerTakeover.externalTokenMissing"));
        return;
      }

      let configuredBaseUrl = selectedBaseUrl;
      let selectedExternalModel = "";
      const matchingCachedInspection = externalInspection
        && normalizeExternalApiBaseUrlSafe(externalInspection.baseUrl, t) === selectedBaseUrl
        ? externalInspection
        : null;
      let inspectionForConfigure = resolvedExternalAction === "apply-cached" ? matchingCachedInspection : null;
      let catalogModelsForConfigure = cachedExternalCatalogModels;
      if (codexGatewayMode === "external" && resolvedExternalAction === "inspect-and-configure") {
        clearExternalInspection();
        props.setStatus(t("settings.providerTakeover.inspecting"));
        setExternalInspectionRunning(true);
        let inspection: ExternalProviderInspection;
        try {
          inspection = await fetchJson<ExternalProviderInspection>("/_gateway/admin/codex/inspect-provider", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: formatJson({
              baseUrl: selectedBaseUrl,
              providerId: "ai-zero-token",
              ...(externalToken ? { bearerToken: externalToken } : {}),
            }),
          });
        } finally {
          setExternalInspectionRunning(false);
        }
        setExternalInspection(inspection);
        setExternalInspectionFromHistory(false);
        setExternalInspectionHistory((current) => [{
          id: inspection.inspectionId || crypto.randomUUID(),
          createdAt: Date.now(),
          providerId: "ai-zero-token",
          baseUrl: inspection.baseUrl,
          inspection,
        }, ...current]);
        const inspectedCatalogModels = mergeExternalCatalogModels(inspection.results, inspection.baseUrl || selectedBaseUrl);
        inspectionForConfigure = inspection;
        catalogModelsForConfigure = inspectedCatalogModels;
        setExternalCatalogModels(inspectedCatalogModels);
        setExternalCatalogBaseUrl(normalizeExternalApiBaseUrlSafe(inspection.baseUrl || selectedBaseUrl, t));
        setExternalInspectionExpanded(true);
        configuredBaseUrl = inspection.baseUrl || selectedBaseUrl;
        const readyResults = inspection.results.filter((item) => item.status === "ready");
        const modelOverride = externalModelOverride.trim();
        if (modelOverride) {
          const overrideResult = inspection.results.find((item) => item.id === modelOverride);
          if (overrideResult?.status !== "ready") {
            setExternalSelectedModel("");
            const detail = overrideResult
              ? t("settings.providerTakeover.inspectStatus", { status: externalModelStatusMeta(t)[overrideResult.status].label })
              : t("settings.providerTakeover.inspectMissing");
            props.setStatus(t("settings.providerTakeover.inspectInvalidModel", { id: modelOverride, detail }));
            return;
          }
          selectedExternalModel = overrideResult.id;
        } else {
          selectedExternalModel = readyResults.find((item) => item.id === inspection.recommendedModel)?.id
            || readyResults[0]?.id
            || "";
        }
        setExternalSelectedModel(selectedExternalModel);
        if (!selectedExternalModel) {
          props.setStatus(t("settings.providerTakeover.noReadyModels", { count: inspection.modelCount }));
          return;
        }
        props.setStatus(t("settings.providerTakeover.selectedWriting", { id: selectedExternalModel }));
      }

      if (codexGatewayMode === "external" && resolvedExternalAction === "apply-cached") {
        const cachedCatalogModels = cachedExternalCatalogModels;
        catalogModelsForConfigure = cachedCatalogModels;
        selectedExternalModel = selectCachedExternalModel(
          cachedCatalogModels,
          externalSelectedModel,
          currentProviderIsExternal ? currentCodexProviderModel : undefined,
          matchingCachedInspection?.recommendedModel,
        );
        if (!selectedExternalModel || cachedCatalogModels.length === 0) {
          props.setStatus(t("settings.externalInspect.noCachedModels"));
          return;
        }
        setExternalSelectedModel(selectedExternalModel);
        props.setStatus(t("settings.providerTakeover.cachedWriting", { id: selectedExternalModel }));
      }

      const wasUpdating = Boolean(props.config?.codex.gatewayProvider?.active);
      const result = await fetchJson<{
        codexProvider: {
          path: string;
          backupPath?: string;
          providerId: string;
          baseUrl: string;
          model?: string;
          modelCatalogPath?: string;
          modelCatalogCount?: number;
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
          baseUrl: configuredBaseUrl,
          providerId: selectedProviderMode,
          kind: codexGatewayMode === "external" ? "openai_compatible" : "codex_gateway",
          ...(codexGatewayMode === "external" && externalToken ? { bearerToken: externalToken } : {}),
          ...(codexGatewayMode === "external" && selectedExternalModel ? { model: selectedExternalModel } : {}),
          ...(codexGatewayMode === "external" ? {
            catalogModels: catalogModelsForConfigure,
            ...(inspectionForConfigure?.inspectionId ? { inspectionId: inspectionForConfigure.inspectionId } : {}),
          } : {}),
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
        ? t("settings.providerTakeover.migratedSuffix", { count: migratedCount })
          + (rolloutPatchedCount > 0 ? t("settings.providerTakeover.rolloutPatchedSuffix", { count: rolloutPatchedCount }) : "")
        : "";
      const defaultModelSuffix = selectedExternalModel
        ? t("settings.providerTakeover.defaultModelSuffix", { model: selectedExternalModel })
        : "";
      const catalogSuffix = result.codexProvider.modelCatalogCount
        ? t("settings.providerTakeover.catalogSuffix", { count: result.codexProvider.modelCatalogCount })
        : "";
      const takeoverAction = wasUpdating ? t("settings.providerTakeover.actionUpdated") : t("settings.providerTakeover.actionWrote");
      await promptCodexRestart({
        config: result.config ?? props.config,
        confirmMessage: codexGatewayMode === "external"
          ? t(resolvedExternalAction === "apply-cached"
            ? "settings.providerTakeover.confirmExternalCached"
            : "settings.providerTakeover.confirmExternal", {
              count: result.codexProvider.modelCatalogCount || 1,
              model: selectedExternalModel,
            })
          : selectedProviderMode === "openai"
            ? t("settings.providerTakeover.confirmOpenai")
            : t("settings.providerTakeover.confirmAzt"),
        deferStatus: t("settings.providerTakeover.deferStatus", {
          action: takeoverAction,
          target: selectedTakeoverLabel,
          url: result.codexProvider.baseUrl,
          model: defaultModelSuffix,
          catalog: catalogSuffix,
          migration: migrationSuffix,
        }),
        restartingStatus: t("settings.providerTakeover.restarting"),
        restartedStatus: t("settings.providerTakeover.restartedStatus", {
          action: wasUpdating ? t("settings.providerTakeover.actionUpdated") : t("settings.providerTakeover.actionTookover"),
          target: selectedTakeoverLabel,
        }),
        failedStatusPrefix: t("settings.providerTakeover.restartFailed", {
          action: wasUpdating ? t("settings.providerTakeover.actionUpdated") : t("settings.providerTakeover.actionTookover"),
          target: selectedTakeoverLabel,
        }),
      });
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  const currentProviderMode = normalizeCodexProviderMode(props.config?.codex.gatewayProvider?.providerId);
  const currentProviderLabel = codexProviderModeLabel(currentProviderMode, t);
  const selectedEffectiveProviderMode: CodexProviderMode = codexGatewayMode === "external" ? "ai-zero-token" : codexProviderMode;
  const selectedProviderWriteTarget = codexProviderWriteTarget(selectedEffectiveProviderMode, t);
  const codexProviderActive = Boolean(props.config?.codex.gatewayProvider?.active);
  const codexProviderBusy = props.busy === "codex-provider";
  const codexShareBusy = props.busy === "codex-share";
  const localCodexGatewayUrl = getLocalCodexGatewayUrl(props.config);
  const selectedCodexGatewayUrl = getSelectedCodexGatewayUrl();
  const normalizedSelectedCodexGatewayUrl = normalizeSelectedCodexProviderUrlSafe(selectedCodexGatewayUrl);
  const currentCodexProviderUrl = props.config?.codex.gatewayProvider?.baseUrl || "";
  const currentCodexProviderModel = props.config?.codex.gatewayProvider?.model || "";
  const currentAuthType = props.config?.codex.gatewayProvider?.authType;
  const externalModeTokenUpdating = codexGatewayMode === "external" && externalApiToken.trim().length > 0;
  const selectedExternalCatalogModels = externalCatalogForBaseUrl(externalApiBaseUrl);
  const codexProviderUrlChanged = Boolean(
    codexProviderActive &&
    currentCodexProviderUrl &&
    normalizeSelectedCodexProviderUrlSafe(currentCodexProviderUrl) !== normalizedSelectedCodexGatewayUrl,
  );
  const codexProviderModeChanged = Boolean(
    codexProviderActive &&
    currentProviderMode !== selectedEffectiveProviderMode,
  );
  const currentProviderIsExternal = codexProviderActive && currentAuthType === "bearer_token";
  const externalSavedTokenReusable = Boolean(
    savedExternalProvider?.exists &&
    savedExternalProvider.authType === "bearer_token" &&
    savedExternalProvider.providerId === "ai-zero-token" &&
    savedExternalProvider.baseUrl &&
    normalizeExternalApiBaseUrlSafe(savedExternalProvider.baseUrl, t) === normalizeExternalApiBaseUrlSafe(externalApiBaseUrl, t),
  );
  const codexProviderButtonClass = [
    "btn-secondary",
    "codex-provider-button",
    codexProviderBusy
      ? "is-busy"
      : codexGatewayMode === "external"
        ? "is-inactive"
        : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged && !externalModeTokenUpdating
        ? "is-active"
        : "is-inactive",
  ].join(" ");
  const codexProviderButtonLabel = codexProviderBusy
    ? (codexGatewayMode === "external" ? t("settings.providerButton.detecting") : t("settings.providerButton.processing"))
    : codexGatewayMode === "external"
      ? t("settings.providerButton.inspectAndTakeover")
      : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged && !externalModeTokenUpdating
        ? t("settings.providerButton.disconnect")
        : codexProviderActive
          ? t("settings.providerButton.update")
          : t("settings.providerButton.write");
  const codexProviderStatusLabel = codexProviderActive ? (currentAuthType === "bearer_token" ? t("settings.providerStatus.external") : currentProviderLabel) : t("settings.providerStatus.unmanaged");
  const codexProviderStatusClass = codexProviderActive ? "is-included" : "is-excluded";
  const currentProviderAuthLabel = !codexProviderActive
    ? t("settings.providerStatus.unconfigured")
    : currentAuthType === "bearer_token"
      ? t("settings.providerStatus.tokenSaved")
      : currentAuthType === "env_key"
        ? t("settings.providerStatus.envKey", { key: props.config?.codex.gatewayProvider?.envKey || "-" })
        : t("settings.providerStatus.codexLogin");
  const externalApiTokenPlaceholder = externalSavedTokenReusable ? t("settings.field.tokenPlaceholderSaved") : "sk-...";
  const externalReadyCount = externalInspection?.results.filter((item) => item.status === "ready").length || 0;
  const externalProviderFeedbackTone = codexProviderBusy
    ? "is-loading"
    : new RegExp(t("settings.takeover.errorTerms"), "i").test(props.status)
      ? "is-error"
      : "is-info";
  const displayedExternalModel = externalInspection
    ? externalSelectedModel
    : currentProviderIsExternal ? currentCodexProviderModel : "";

  return (
    <section className="settings-page">
      <div className="settings-page-head settings-page-head-actions-only">
        <div className="settings-page-actions">
          <button className="btn-secondary" type="button" onClick={refreshModels} disabled={props.busy === "models"}>
            {props.busy === "models" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            {props.busy === "models" ? t("settings.syncButton.busy") : t("settings.syncButton.label")}
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {externalInspectionRunning ? (
          <div className="external-inspection-overlay" role="dialog" aria-modal="true" aria-labelledby="external-inspection-progress-title">
            <div className="external-inspection-progress-card">
              <Loader2 className="spin" size={30} />
              <div>
                <h3 id="external-inspection-progress-title">{t("settings.externalInspect.progressTitle")}</h3>
                <p>{t("settings.externalInspect.progressBody")}</p>
                <p className="external-inspection-progress-cost">{t("settings.externalInspect.progressCost")}</p>
                <span>{t("settings.externalInspect.progressModels")}</span>
              </div>
            </div>
          </div>
        ) : null}
        <section className="settings-section codex-provider-section">
          <div className="codex-provider-head">
            <div>
              <h4>{t("settings.takeover.heading")}</h4>
              <p className="hint">{t("settings.takeover.description")}</p>
            </div>
            <span className={`count-pill ${codexProviderStatusClass}`}>{codexProviderStatusLabel}</span>
          </div>

          <div className="codex-provider-mode-row">
            <div className="codex-provider-mode-copy">
              <div className="codex-provider-mode-title">{t("settings.takeover.historyMode")}</div>
              <p className="hint">{codexProviderModeLabel(codexProviderMode, t)} · {codexProviderModeDescription(codexProviderMode, t)}</p>
            </div>
            <div className="codex-provider-mode-toggle" role="group" aria-label={t("settings.field.historyModeAria")}>
              <button
                className={`codex-provider-mode-option ${codexProviderMode === "openai" ? "is-active" : ""}`}
                type="button"
                onClick={() => selectCodexProviderMode("openai")}
                disabled={codexGatewayMode === "external" || codexProviderBusy}
                title={codexGatewayMode === "external" ? t("settings.field.externalTokenTitle") : undefined}
              >
                {t("settings.providerMode.openai.label")}
              </button>
              <button className={`codex-provider-mode-option ${codexProviderMode === "ai-zero-token" ? "is-active" : ""}`} type="button" onClick={() => selectCodexProviderMode("ai-zero-token")} disabled={codexProviderBusy}>
                {t("settings.providerMode.aiZeroToken.label")}
              </button>
            </div>
          </div>

          <div className="codex-provider-controls">
            <div className="codex-mode-toggle" role="group" aria-label={t("settings.field.codexGatewayModeAria")}>
              <button className={`codex-mode-option ${codexGatewayMode === "local" ? "is-active" : ""}`} type="button" onClick={() => selectCodexGatewayMode("local")} disabled={codexProviderBusy}>
                <MonitorCog size={16} />
                {t("settings.field.localGateway")}
              </button>
              <button className={`codex-mode-option ${codexGatewayMode === "remote" ? "is-active" : ""}`} type="button" onClick={() => selectCodexGatewayMode("remote")} disabled={codexProviderBusy}>
                <Globe2 size={16} />
                {t("settings.field.remoteGateway")}
              </button>
              <button className={`codex-mode-option ${codexGatewayMode === "external" ? "is-active" : ""}`} type="button" onClick={() => selectCodexGatewayMode("external")} disabled={codexProviderBusy}>
                <KeyRound size={16} />
                {t("settings.providerStatus.external")}
              </button>
            </div>

            <div className={`codex-provider-fields ${codexGatewayMode === "external" ? "has-token-field" : ""}`}>
              <label className="field codex-url-field">
                <span>{codexGatewayMode === "external" ? t("settings.field.codexUrl.external") : t("settings.field.codexUrl.codex")}</span>
                <input
                  className="input codex-url-input"
                  value={codexGatewayMode === "local" ? localCodexGatewayUrl : codexGatewayMode === "external" ? externalApiBaseUrl : codexGatewayUrl}
                  onChange={(event) => {
                    setCodexGatewayTouched(true);
                    if (codexGatewayMode === "external") {
                      setExternalApiBaseUrl(event.target.value);
                      clearExternalInspection();
                      setExternalCatalogModels([]);
                      setExternalCatalogBaseUrl("");
                      setExternalModelOverride("");
                    } else {
                      setCodexGatewayMode("remote");
                      setCodexGatewayUrl(event.target.value);
                    }
                  }}
                  placeholder={codexGatewayMode === "external" ? t("settings.field.codexUrlPlaceholderExternal") : t("settings.field.codexUrlPlaceholderRemote")}
                  readOnly={codexGatewayMode === "local"}
                  disabled={codexProviderBusy}
                />
              </label>

              {codexGatewayMode === "external" ? (
                <label className="field codex-token-field">
                  <span>{t("settings.field.externalToken")}</span>
                  <input
                    className="input codex-url-input"
                    type="password"
                    value={externalApiToken}
                    onChange={(event) => {
                      setExternalApiToken(event.target.value);
                      clearExternalInspection();
                    }}
                    placeholder={externalSavedTokenReusable ? t("settings.field.tokenPlaceholderSaved") : t("settings.field.tokenPlaceholderNew")}
                    autoComplete="off"
                    disabled={codexProviderBusy}
                  />
                </label>
              ) : null}
            </div>

            <div className="codex-provider-actions">
              {codexGatewayMode === "external" ? (
                <>
                  {currentProviderIsExternal ? (
                    <button className="btn-secondary codex-provider-button is-active" type="button" onClick={() => void toggleCodexProvider({ externalAction: "remove" })} disabled={codexProviderBusy}>
                      <Unplug size={16} />
                      {t("settings.providerButton.disconnectCurrent")}
                    </button>
                  ) : null}
                  <button className={codexProviderButtonClass} type="button" onClick={() => void toggleCodexProvider({ externalAction: "connect" })} disabled={codexProviderBusy || (!externalInspectionHistoryLoaded && selectedExternalCatalogModels.length === 0)}>
                    {codexProviderBusy
                      ? <Loader2 className="spin" size={16} />
                      : selectedExternalCatalogModels.length > 0
                        ? <PlugZap size={16} />
                        : <Search size={16} />}
                    {selectedExternalCatalogModels.length > 0 ? t("settings.externalInspect.useCached") : codexProviderButtonLabel}
                  </button>
                  {selectedExternalCatalogModels.length > 0 ? (
                    <button className="btn-secondary codex-provider-button is-inactive" type="button" onClick={() => void toggleCodexProvider({ externalAction: "rescan" })} disabled={codexProviderBusy}>
                      <Search size={16} />
                      {t("settings.externalInspect.rescan")}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button className="btn-secondary share-gateway-button" type="button" onClick={shareGateway} disabled={codexShareBusy || codexProviderBusy}>
                    {codexShareBusy ? <Loader2 className="spin" size={16} /> : <Share2 size={16} />}
                    {codexShareBusy ? t("settings.shareGateway.generating") : shareGatewayCopied ? t("settings.shareGateway.copySuccess") : t("settings.shareGateway.copyButton")}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => selectCodexGatewayMode("local")} disabled={codexProviderBusy}>
                    <MonitorCog size={16} />
                    {t("settings.providerButton.useLocal")}
                  </button>
                  <button className={codexProviderButtonClass} type="button" onClick={() => void toggleCodexProvider()} disabled={codexProviderBusy}>
                    {codexProviderBusy ? (
                      <Loader2 className="spin" size={16} />
                    ) : codexProviderActive && !codexProviderUrlChanged && !codexProviderModeChanged && !externalModeTokenUpdating ? (
                      <Unplug size={16} />
                    ) : (
                      <PlugZap size={16} />
                    )}
                    {codexProviderButtonLabel}
                  </button>
                </>
              )}
            </div>

            {codexGatewayMode === "external" && selectedExternalCatalogModels.length > 0 ? (
              <p className="hint">{t("settings.externalInspect.cachedHint", { count: selectedExternalCatalogModels.length })}</p>
            ) : null}

            {codexGatewayMode === "external" ? (
              <div className={`external-provider-feedback ${externalProviderFeedbackTone}`} role="status" aria-live="polite" aria-atomic="true">
                {codexProviderBusy ? <Loader2 className="spin" size={15} /> : null}
                <span>{props.status || t("settings.externalInspect.feedbackPlaceholder")}</span>
              </div>
            ) : null}
          </div>

          {codexGatewayMode === "external" ? (
            <details className="external-provider-advanced">
              <summary>{t("settings.externalInspect.advancedTitle")}</summary>
              <div className="external-provider-advanced-body">
                <label className="field">
                  <span>{t("settings.externalInspect.modelIdLabel")}</span>
                  <input
                    className="input codex-url-input"
                    value={externalModelOverride}
                    onChange={(event) => {
                      const value = event.target.value;
                      setExternalModelOverride(value);
                      const readyResults = externalInspection?.results.filter((item) => item.status === "ready") || [];
                      const modelId = value.trim();
                      setExternalSelectedModel(modelId
                        ? readyResults.find((item) => item.id === modelId)?.id || ""
                        : readyResults.find((item) => item.id === externalInspection?.recommendedModel)?.id || readyResults[0]?.id || "");
                    }}
                    placeholder={currentCodexProviderModel || t("settings.externalInspect.modelOverridePlaceholder")}
                    disabled={codexProviderBusy}
                  />
                </label>
                <p className="hint">{t("settings.externalInspect.modelOverrideHint")}</p>
              </div>
            </details>
          ) : null}

          {shareGatewayFeedback && codexGatewayMode !== "external" ? (
            <div className={`share-gateway-feedback ${shareGatewayFeedback.tone === "success" ? "is-success" : "is-warning"}`} role="status" aria-live="polite">
              <strong>{shareGatewayFeedback.title}</strong>
              <span>{shareGatewayFeedback.detail}</span>
              <div className="share-gateway-config-list">
                {shareGatewayFeedback.codexUrl ? (
                  <div>
                    <span>{t("settings.shareGateway.codexField")}</span>
                    <code>{shareGatewayFeedback.codexUrl}</code>
                  </div>
                ) : null}
                {shareGatewayFeedback.baseUrl ? (
                  <div>
                    <span>{t("settings.shareGateway.openaiField")}</span>
                    <code>{shareGatewayFeedback.baseUrl}</code>
                  </div>
                ) : null}
                {shareGatewayFeedback.apiKey ? (
                  <div>
                    <span>{t("settings.shareGateway.apiKeyLabel")}</span>
                    <code>{shareGatewayFeedback.apiKey}</code>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {codexGatewayMode === "external" && externalInspection ? (
            <details
              className="external-provider-inspection"
              open={externalInspectionExpanded}
              onToggle={(event) => setExternalInspectionExpanded(event.currentTarget.open)}
            >
              <summary>
                <span>
                  {t("settings.externalInspect.title", { count: externalInspection.modelCount, ready: externalReadyCount })}
                </span>
                {displayedExternalModel ? <code>{t("settings.externalInspect.selectedPrefix", { model: displayedExternalModel })}</code> : null}
              </summary>
              <div className="external-provider-inspection-body">
                {externalInspectionFromHistory ? (
                  <div className="external-provider-history-banner">
                    <strong>{t("settings.externalInspect.lastResult")}</strong>
                    <span>{t("settings.externalInspect.lastResultHint")}</span>
                  </div>
                ) : null}
                <div className="external-provider-inspection-meta">
                  <span>{t("settings.externalInspect.modelsEndpoint")}</span>
                  <code>{externalInspection.modelsUrl}</code>
                  <span>{t("settings.externalInspect.candidateCount", { count: externalInspection.candidateCount })}</span>
                </div>
                <div className="external-provider-model-list">
                  <div className="external-provider-model-list-title">{t("settings.externalInspect.candidateLabel")}</div>
                  {externalInspection.results.length > 0 ? externalInspection.results.map((item, index) => {
                    const status = externalModelStatusMeta(t)[item.status];
                    const selected = displayedExternalModel === item.id;
                    return (
                      <div className={`external-provider-model-row ${selected ? "is-selected" : ""}`} key={`${item.id}-${index}`}>
                        <div className="external-provider-model-copy">
                          <strong>{item.name || item.id}</strong>
                          {item.name && item.name !== item.id ? <code>{item.id}</code> : null}
                          {item.message ? <span>{item.message}</span> : null}
                        </div>
                        <div className="external-provider-model-state">
                          {selected ? <span className="external-provider-model-badge is-selected">{t("settings.externalInspect.selectedBadge")}</span> : null}
                          {item.status === "ready" && externalInspection.recommendedModel === item.id ? <span className="external-provider-model-badge is-recommended">{t("settings.externalInspect.recommendedBadge")}</span> : null}
                          <span className={`external-provider-model-badge ${status.className}`}>{status.label}</span>
                          <span className={`external-provider-model-badge ${item.capabilities?.responsesStreaming ? "is-ready" : "is-failed"}`}>{item.capabilities?.responsesStreaming ? t("settings.externalInspect.responsesPass") : t("settings.externalInspect.responsesFail")}</span>
                          <span className={`external-provider-model-badge ${item.capabilities?.functionCalling ? "is-ready" : "is-failed"}`}>{item.capabilities?.functionCalling ? t("settings.externalInspect.toolsPass") : t("settings.externalInspect.toolsFail")}</span>
                          <span className={`external-provider-model-badge ${item.capabilities?.functionCallOutput ? "is-ready" : "is-failed"}`}>{item.capabilities?.functionCallOutput ? t("settings.externalInspect.toolOutputPass") : t("settings.externalInspect.toolOutputFail")}</span>
                          <span className={`external-provider-model-badge ${item.capabilities?.reasoningEfforts?.length ? "is-ready" : "is-failed"}`}>{item.capabilities?.reasoningEfforts?.length ? t("settings.externalInspect.reasoningPass", { levels: item.capabilities.reasoningEfforts.join(", ") }) : t("settings.externalInspect.reasoningFail")}</span>
                          {typeof item.latencyMs === "number" ? <small>{item.latencyMs} ms</small> : null}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="external-provider-model-empty">{t("settings.externalInspect.empty")}</div>
                  )}
                </div>
              </div>
            </details>
          ) : null}

          <p className="hint">
            {codexGatewayMode === "external"
              ? t("settings.hint.codexModeExternal")
              : t("settings.hint.codexModeRemote")}
            {" "}{t("settings.hint.codexWriteTarget", { target: selectedProviderWriteTarget, url: normalizedSelectedCodexGatewayUrl || "-" })}
          </p>

          <div className="codex-provider-meta-strip">
            <div>
              <span>{t("settings.meta.configFile")}</span>
              <code>{props.config?.codex.gatewayProvider.path || t("settings.meta.configFileDefault")}</code>
            </div>
            <div>
              <span>{t("settings.meta.currentState")}</span>
              <code>{codexProviderActive ? `${currentAuthType === "bearer_token" ? t("settings.providerStatus.external") : currentProviderLabel} · ${codexProviderModeDescription(currentProviderMode, t)}` : t("settings.providerStatus.unmanaged")}</code>
            </div>
            <div>
              <span>{t("settings.meta.writeTarget")}</span>
              <code>{selectedProviderWriteTarget}</code>
            </div>
            <div>
              <span>{t("settings.meta.takeoverAddress")}</span>
              <code>{currentCodexProviderUrl || t("settings.meta.noTakeoverUrl")}</code>
            </div>
            <div>
              <span>{t("settings.meta.currentModel")}</span>
              <code>{currentCodexProviderModel || t("settings.meta.modelFromCodex")}</code>
            </div>
            <div>
              <span>{t("settings.meta.auth")}</span>
              <code>{currentProviderAuthLabel}</code>
            </div>
            <div className="is-warning">
              <span>{codexGatewayMode === "external" || currentAuthType === "bearer_token" ? t("settings.meta.externalHintTitle") : t("settings.meta.remoteHintTitle")}</span>
              <strong>{codexGatewayMode === "external" || currentAuthType === "bearer_token" ? t("settings.meta.externalHintBody") : t("settings.meta.remoteHintBody")}</strong>
            </div>
          </div>
        </section>

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

        <section className="settings-section">
          <h4>{t("settings.section.port.heading")}</h4>
          <label className="field">
            <span>{t("settings.section.port.label")}</span>
            <input className="input" inputMode="numeric" type="number" min={1} max={65535} value={settingsDraft.serverPort} onChange={(event) => markSettingsDirty({ serverPort: event.target.value })} />
          </label>
          <p className="hint">{t("settings.section.port.hint")}</p>
        </section>

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
          <p className="hint">{props.status}</p>
        </section>

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

        <section className="settings-section">
          <h4>{t("settings.section.display.heading")}</h4>
          <label className="switch-line">
            <input type="checkbox" checked={props.showEmails} onChange={(event) => props.setShowEmails(event.target.checked)} />
            <span>{t("settings.section.display.maskLabel")}</span>
          </label>
          <p className="hint">{t("settings.section.display.maskHint")}</p>
        </section>
      </div>

      <div className="settings-page-actions settings-page-footer-actions">
        <button className="btn-secondary" type="button" onClick={() => void saveSettings()} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty}>
          {t("settings.footer.save")}
        </button>
        <button className="btn-primary" type="button" onClick={() => void saveSettings({ restart: true })} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty || !props.config?.restartSupported}>
          {t("settings.footer.saveRestart")}
        </button>
      </div>
    </section>
  );
}
