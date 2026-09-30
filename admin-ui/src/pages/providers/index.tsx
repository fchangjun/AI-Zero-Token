import { AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/shared/api";
import {
  activateProvider,
  createProvider,
  deactivateProvider,
  deleteProvider,
  inspectProvider,
  listProviders,
  syncProvider,
  updateProvider,
} from "./api";
import { CodexActivation } from "./components/CodexActivation";
import { ProviderDetail } from "./components/ProviderDetail";
import { ProviderDrawer } from "./components/ProviderDrawer";
import { ProvidersList } from "./components/ProvidersList";
import { GatewayConnection } from "./components/GatewayConnection";
import { accountPoolProvider } from "./account-pool";
import type { AdminConfig } from "@/shared/types";
import type { ApiProvider, ProviderDraft } from "./types";
import "./providers.css";

type ProviderView = { name: "list" } | { name: "remote" } | { name: "detail"; providerId: string } | { name: "codex"; providerId: string };

function replaceProvider(providers: ApiProvider[], provider: ApiProvider): ApiProvider[] {
  const found = providers.some((item) => item.id === provider.id);
  return found ? providers.map((item) => item.id === provider.id ? provider : item) : [...providers, provider];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ProvidersPage({ config, onConfigUpdate, onStatus, onConfigChange }: { config: AdminConfig | null; onConfigUpdate: (config: AdminConfig) => void; onStatus?: (message: string) => void; onConfigChange?: () => Promise<unknown> }) {
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>();
  const [view, setView] = useState<ProviderView>({ name: "list" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProvider, setDrawerProvider] = useState<ApiProvider | null>(null);
  const [drawerError, setDrawerError] = useState("");

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const snapshot = await listProviders();
      setProviders(snapshot.providers);
      setActiveProviderId(snapshot.activeProviderId);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const inspecting = providers.some((provider) => provider.inspectionJob?.status === "running");
  useEffect(() => {
    if (!inspecting) return;
    const timer = window.setInterval(() => { void refresh(true); }, 1500);
    return () => window.clearInterval(timer);
  }, [inspecting, refresh]);

  useEffect(() => {
    if (!feedback || feedback.tone === "error") return;
    const timer = window.setTimeout(() => setFeedback(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const services = useMemo(() => config ? [accountPoolProvider(config), ...providers] : providers, [config, providers]);
  const activeProvider = useMemo(() => services.find((provider) => provider.activeForCodex || provider.id === activeProviderId) ?? null, [activeProviderId, services]);
  const selectedProvider = view.name === "detail" || view.name === "codex" ? providers.find((provider) => provider.id === view.providerId) ?? null : null;

  useEffect(() => {
    if ((view.name === "detail" || view.name === "codex") && !selectedProvider && !loading) setView({ name: "list" });
  }, [loading, selectedProvider, view.name]);

  function showSuccess(text: string) { setFeedback({ tone: "success", text }); onStatus?.(text); }
  function showError(error: unknown) { const text = errorMessage(error); setFeedback({ tone: "error", text }); onStatus?.(text); }
  function openCreate() { setDrawerProvider(null); setDrawerError(""); setDrawerOpen(true); }
  function openEdit(provider: ApiProvider) { setDrawerProvider(provider); setDrawerError(""); setDrawerOpen(true); }

  async function saveProvider(draft: ProviderDraft) {
    setAction("save");
    setDrawerError("");
    try {
      const provider = drawerProvider ? await updateProvider(drawerProvider.id, draft) : await createProvider(draft);
      if (provider) {
        setProviders((current) => replaceProvider(current, provider));
        setView({ name: "detail", providerId: provider.id });
      } else {
        await refresh(true);
      }
      setDrawerOpen(false);
      showSuccess(drawerProvider ? "服务设置已保存；接入中的服务需重新保存 Codex 配置后生效。" : "服务已添加，模型列表已保存。");
    } catch (error) {
      setDrawerError(errorMessage(error));
    } finally {
      setAction(null);
    }
  }

  async function runProviderAction(kind: "sync" | "inspect", provider: ApiProvider, modelIds?: string[]) {
    const actionId = kind === "sync" ? `sync:${provider.id}` : `inspect:${provider.id}:${modelIds?.[0] ?? "all"}`;
    setAction(actionId);
    try {
      const next = kind === "sync" ? await syncProvider(provider.id) : await inspectProvider(provider.id, modelIds);
      if (next) setProviders((current) => replaceProvider(current, next));
      else await refresh(true);
      showSuccess(kind === "sync" ? "模型列表已同步。" : "已开始后台检测，可以离开此页面；完成后会自动更新。");
    } catch (error) {
      await refresh(true);
      showError(error);
    } finally {
      setAction(null);
    }
  }

  async function removeProvider(provider: ApiProvider) {
    const message = provider.activeForCodex
      ? `“${provider.name}”当前已接入 Codex。删除后也会移除该接入，确定继续吗？`
      : `确定删除“${provider.name}”及其模型记录吗？`;
    if (!window.confirm(message)) return;
    setAction(`delete:${provider.id}`);
    try {
      await deleteProvider(provider.id);
      setProviders((current) => current.filter((item) => item.id !== provider.id));
      if (provider.activeForCodex) setActiveProviderId(undefined);
      setView({ name: "list" });
      await refresh(true);
      await onConfigChange?.();
      showSuccess("服务已删除。");
    } catch (error) {
      showError(error);
    } finally {
      setAction(null);
    }
  }

  async function applyCodex(provider: ApiProvider, modelIds: string[], defaultModelId: string) {
    setFeedback(null);
    setAction(`activate:${provider.id}`);
    try {
      const updated = await activateProvider(provider.id, modelIds, defaultModelId);
      setProviders((current) => current.map((item) => {
        if (updated && item.id === updated.id) return { ...updated, activeForCodex: true };
        if (item.id === provider.id) {
          return {
            ...item,
            activeForCodex: true,
            defaultModelId,
            models: item.models.map((model) => ({ ...model, selectedForCodex: modelIds.includes(model.id) })),
          };
        }
        return { ...item, activeForCodex: false };
      }));
      setActiveProviderId(provider.id);
      await refresh(true);
      await onConfigChange?.();
      setView({ name: "detail", providerId: provider.id });
      showSuccess(updated?.codexSwitchWarning ?? `${provider.name} 已接管。打开 Codex 后，本地新旧对话都使用该服务；不支持的模型已切换为该服务的默认模型。`);
    } catch (error) {
      showError(error);
    } finally {
      setAction(null);
    }
  }

  async function removeCodex(provider: ApiProvider) {
    const accountPool = provider.kind === "account_pool";
    const detail = accountPool
      ? "账号池 API 服务会继续运行，只有 Codex 接入会被解除。重启 Codex 后恢复原本的配置。"
      : "本地新旧对话将恢复原生 Codex 服务。请先等待当前回复完成；桌面版会尝试关闭并重新打开 Codex。第三方服务、Key 和模型选择仍保存在 AZT。";
    if (!window.confirm(`确定解除“${provider.name}”的 Codex 接入吗？\n\n${detail}`)) return;
    setFeedback(null);
    setAction(`deactivate:${provider.id}`);
    try {
      let restartSupported = config?.codexRestartSupported;
      let switchWarning: string | undefined;
      if (accountPool) {
        const result = await fetchJson<{ config: AdminConfig }>("/_gateway/admin/codex/remove-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId: config?.codex.gatewayProvider.providerId }),
        });
        onConfigUpdate(result.config);
        restartSupported = result.config.codexRestartSupported;
      } else {
        const updated = await deactivateProvider(provider.id);
        switchWarning = updated?.codexSwitchWarning;
        setProviders((current) => current.map((item) => item.id === provider.id
          ? { ...(updated ?? item), activeForCodex: false }
          : item));
      }
      setActiveProviderId(undefined);
      await refresh(true);
      await onConfigChange?.();
      setView(accountPool ? { name: "list" } : { name: "detail", providerId: provider.id });
      showSuccess(accountPool
        ? "已解除账号池的 Codex 接入。账号池 API 服务继续运行，重启 Codex 后恢复原配置。"
        : switchWarning ?? `${provider.name} 已解除接管。本地新旧对话已恢复原生 Codex 设置，打开 Codex 即可继续。`);
      if (accountPool && restartSupported && window.confirm("Codex 接入已解除，是否现在重启 Codex 客户端？")) {
        try {
          await fetchJson<{ ok: boolean; restarted?: boolean }>("/_gateway/admin/desktop/restart-codex", { method: "POST" });
          showSuccess(`${provider.name} 已解除 Codex 接入，并已重启 Codex。`);
        } catch (error) {
          showError(new Error(`接入已解除，但 Codex 重启失败：${errorMessage(error)}`));
        }
      }
    } catch (error) {
      showError(error);
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return <section className="providers-loading"><Loader2 className="provider-spin" size={22} /><div><strong>正在加载模型与服务</strong><span>读取本机保存的 API 服务和模型状态。</span></div></section>;
  }

  if (loadError) {
    return (
      <section className="providers-load-error"><AlertCircle size={22} /><div><strong>无法加载模型与服务</strong><span>{loadError}</span></div><button className="btn-secondary" type="button" onClick={() => void refresh()}><RefreshCw size={15} />重试</button></section>
    );
  }

  return (
    <section className="providers-page">
      {view.name === "list" && (
        <ProvidersList
          providers={providers}
          activeProvider={activeProvider}
          onAdd={openCreate}
          onOpen={(provider) => setView({ name: "detail", providerId: provider.id })}
          onOpenCodex={(provider) => { if (provider.kind === "account_pool") { if (provider.remoteGateway) setView({ name: "remote" }); else window.location.hash = "providers/gateway/overview"; } else setView({ name: "codex", providerId: provider.id }); }}
          onDeactivate={(provider) => void removeCodex(provider)}
          disconnecting={Boolean(activeProvider && action === `deactivate:${activeProvider.id}`)}
          onOpenRemote={() => setView({ name: "remote" })}
        />
      )}
      {view.name === "remote" && config && <div className="provider-detail-view"><button className="providers-back" type="button" onClick={() => setView({ name: "list" })}>← 外部 API 服务</button><GatewayConnection mode="remote" config={config} setConfig={onConfigUpdate} setStatus={message => onStatus?.(message)} onApplied={() => refresh(true)} /></div>}
      {view.name === "detail" && selectedProvider && (
        <ProviderDetail
          provider={selectedProvider}
          action={action ?? (selectedProvider.inspectionJob?.status === "running" ? `inspect:${selectedProvider.id}:all` : null)}
          onBack={() => setView({ name: "list" })}
          onEdit={() => openEdit(selectedProvider)}
          onDelete={() => void removeProvider(selectedProvider)}
          onSync={() => void runProviderAction("sync", selectedProvider)}
          onInspect={(modelIds) => void runProviderAction("inspect", selectedProvider, modelIds)}
          onActivate={() => setView({ name: "codex", providerId: selectedProvider.id })}
        />
      )}
      {view.name === "codex" && selectedProvider && (
        <CodexActivation
          provider={selectedProvider}
          activeProvider={activeProvider}
          saving={action === `activate:${selectedProvider.id}`}
          disconnecting={action === `deactivate:${selectedProvider.id}`}
          onBack={() => setView({ name: "detail", providerId: selectedProvider.id })}
          onActivate={(modelIds, defaultModelId) => void applyCodex(selectedProvider, modelIds, defaultModelId)}
          onDeactivate={() => void removeCodex(selectedProvider)}
        />
      )}
      <ProviderDrawer
        open={drawerOpen}
        provider={drawerProvider}
        saving={action === "save"}
        error={drawerError}
        onClose={() => { if (action !== "save") setDrawerOpen(false); }}
        onSave={saveProvider}
      />
      {feedback && <div className={`provider-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
        {feedback.tone === "error" && <AlertCircle size={16} />}
        <span>{feedback.text}</span>
        {feedback.tone === "error" && <button className="provider-icon-button" type="button" aria-label="关闭错误提示" onClick={() => setFeedback(null)}><X size={16} /></button>}
      </div>}
    </section>
  );
}

export type { ApiProvider, ProviderDraft, ProviderModel, ProvidersSnapshot } from "./types";
