import { AlertCircle, Boxes, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/shared/api";
import {
  activateProvider,
  activateMixed,
  deactivateMixed,
  createProvider,
  deactivateProvider,
  deleteProvider,
  inspectProvider,
  listProviders,
  syncProvider,
  setProviderContextWindow,
  updateProvider,
  updateModelStatusInterval,
  checkModelStatus,
} from "./api";
import { CodexActivation } from "./components/CodexActivation";
import { CodexSwitchDialog } from "./components/CodexSwitchDialog";
import { ModelStatusControls } from "./components/ModelStatusControls";
import type { MixedActivationRequest, PublicMixedConfig } from "../../../../src/core/models/mixed-provider";
import { ProviderDetail } from "./components/ProviderDetail";
import { ProviderDrawer } from "./components/ProviderDrawer";
import { ProvidersList } from "./components/ProvidersList";
import { GatewayConnection } from "./components/GatewayConnection";
import { accountPoolProvider } from "./account-pool";
import { mixedActivationForProvider, mixedActivationWithoutProvider } from "./takeover-selection";
import type { AdminConfig } from "@/shared/types";
import type { ApiProvider, ProviderDraft, ModelStatusSettings } from "./types";
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
  const [mixed, setMixed] = useState<PublicMixedConfig>();
  const [modelStatus, setModelStatus] = useState<ModelStatusSettings>();
  const [statusSaving, setStatusSaving] = useState(false);
  const [view, setView] = useState<ProviderView>({ name: "list" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProvider, setDrawerProvider] = useState<ApiProvider | null>(null);
  const [drawerError, setDrawerError] = useState("");
  const [switchDialog, setSwitchDialog] = useState<{ title: string; detail: string; mode?: "direct" | "mixed"; autoModelCount?: number; run: () => Promise<boolean> } | null>(null);
  const confirmingSwitch = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const snapshot = await listProviders();
      setProviders(snapshot.providers);
      setActiveProviderId(snapshot.activeProviderId);
      setMixed(snapshot.mixed);
      setModelStatus(snapshot.modelStatus);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const inspecting = providers.some((provider) => provider.inspectionJob?.status === "running") || modelStatus?.job.running;
  useEffect(() => {
    if (!inspecting) return;
    const timer = window.setInterval(() => { void refresh(true); }, 1500);
    return () => window.clearInterval(timer);
  }, [inspecting, refresh]);

  useEffect(() => {
    const onFocus = () => { if (!document.hidden) void refresh(true); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { if (modelStatus?.enabled && !document.hidden && !inspecting) void refresh(true); }, 30_000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [modelStatus?.enabled, inspecting, refresh]);

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
  async function changeStatus(intervalMinutes?: ModelStatusSettings["intervalMinutes"]) {
    setStatusSaving(true);
    try {
      setModelStatus(intervalMinutes === undefined ? await checkModelStatus() : await updateModelStatusInterval(intervalMinutes));
      if (intervalMinutes === undefined) await refresh(true);
    }
    catch (error) { showError(error); }
    finally { setStatusSaving(false); }
  }
  function openCreate() { setDrawerProvider(null); setDrawerError(""); setDrawerOpen(true); }
  function openEdit(provider: ApiProvider) { setDrawerProvider(provider); setDrawerError(""); setDrawerOpen(true); }

  function requestSwitch(title: string, detail: string, run: () => Promise<boolean>, mode?: "direct" | "mixed", autoModelCount?: number) {
    if (action || confirmingSwitch.current) return;
    setFeedback(null);
    setSwitchDialog({ title, detail, run, mode, autoModelCount });
  }

  async function confirmSwitch() {
    if (!switchDialog || confirmingSwitch.current) return;
    confirmingSwitch.current = true;
    setFeedback(null);
    try { if (await switchDialog.run()) setSwitchDialog(null); }
    finally { confirmingSwitch.current = false; }
  }

  async function saveProvider(draft: ProviderDraft) {
    setAction("save");
    setDrawerError("");
    try {
      const provider = drawerProvider ? await updateProvider(drawerProvider.id, draft) : await createProvider(draft);
      if (provider) {
        setProviders((current) => replaceProvider(current, provider));
        setView({ name: "detail", providerId: provider.id });
        if (mixed) await refresh(true);
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
      if (next && mixed) await refresh(true);
      showSuccess(kind === "sync" ? "模型列表已同步。" : "已开始检测两种接管方式，完成后自动显示可用方式及检测结果。可以离开此页面，检测会继续。");
    } catch (error) {
      await refresh(true);
      showError(error);
    } finally {
      setAction(null);
    }
  }

  async function removeProvider(provider: ApiProvider, confirmed = false): Promise<boolean> {
    if (!confirmed) {
      if (provider.activeForCodex) {
        requestSwitch("删除服务并解除接管", `将删除“${provider.name}”及其模型记录，并将本地新旧对话恢复为原生 Codex 服务。`, () => removeProvider(provider, true));
        return false;
      }
      if (!window.confirm(`确定删除“${provider.name}”及其模型记录吗？`)) return false;
    }
    setAction(`delete:${provider.id}`);
    try {
      await deleteProvider(provider.id);
      setProviders((current) => current.filter((item) => item.id !== provider.id));
      if (provider.activeForCodex) setActiveProviderId(undefined);
      setView({ name: "list" });
      await refresh(true);
      await onConfigChange?.();
      showSuccess("服务已删除。");
      return true;
    } catch (error) {
      showError(error);
      return false;
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
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setAction(null);
    }
  }

  async function applyMixed(input?: MixedActivationRequest, provider?: ApiProvider, successMessage?: string): Promise<boolean> {
    setAction(input ? "mixed:activate" : "mixed:deactivate");
    setFeedback(null);
    try {
      const result = input ? await activateMixed(input) : await deactivateMixed();
      setMixed(result.mixed);
      await refresh(true);
      await onConfigChange?.();
      setView(provider ? { name: "detail", providerId: provider.id } : { name: "list" });
      showSuccess(result.codexSwitchWarning ?? successMessage ?? (input ? "混合接管已启用。打开 Codex 后可选择所选模型，使用期间请保持 AZT 运行。" : "混合接管已解除，Codex 已恢复原生设置。模型选择仍保留在 AZT。"));
      return true;
    } catch (error) { await refresh(true); showError(error); return false; }
    finally { setAction(null); }
  }

  function removeMixed() {
    requestSwitch("解除混合接管", "本地新旧对话将恢复原生 Codex 设置，服务资料和混合模型选择仍保存在 AZT。", () => applyMixed());
  }

  function removeMixedProvider(provider: ApiProvider) {
    if (!mixed?.active) return;
    const input = mixedActivationWithoutProvider(provider.id, mixed);
    requestSwitch(`解除“${provider.name}”的接入`, input
      ? `将从混合接管中移除本渠道的模型，其他渠道的 ${input.routes.length} 个模型继续通过 AZT 接入。服务资料和直接接管的模型选择仍保留。`
      : "这是混合接管中的最后一个渠道。解除后 Codex 将恢复原生设置，服务资料和模型选择仍保留在 AZT。",
    () => applyMixed(input, provider, input ? `${provider.name} 已解除接入，其他渠道的混合接管保持启用。` : undefined));
  }

  async function removeCodex(provider: ApiProvider, confirmed = false): Promise<boolean> {
    const accountPool = provider.kind === "account_pool";
    if (!confirmed) {
      if (!accountPool) {
        requestSwitch(`解除“${provider.name}”的接管`, "本地新旧对话将恢复原生 Codex 服务。第三方服务、Key 和模型选择仍保存在 AZT。", () => removeCodex(provider, true));
        return false;
      }
      if (!window.confirm(`确定解除“${provider.name}”的 Codex 接入吗？\n\n账号池 API 服务会继续运行，只有 Codex 接入会被解除。重启 Codex 后恢复原本的配置。`)) return false;
    }
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
      return true;
    } catch (error) {
      showError(error);
      return false;
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
          activeProvider={mixed?.active ? null : activeProvider}
          onAdd={openCreate}
          onOpen={(provider) => setView({ name: "detail", providerId: provider.id })}
          onOpenCodex={(provider) => { if (provider.kind === "account_pool") { if (provider.remoteGateway) setView({ name: "remote" }); else window.location.hash = "providers/gateway/overview"; } else setView({ name: "codex", providerId: provider.id }); }}
          onDeactivate={(provider) => void removeCodex(provider)}
          disconnecting={Boolean(activeProvider && action === `deactivate:${activeProvider.id}`)}
          onOpenRemote={() => setView({ name: "remote" })}
          mixedProviderIds={mixed?.active ? mixed.routes.map((route) => route.providerId) : []}
          statusContent={<>
            <ModelStatusControls settings={modelStatus} busy={statusSaving || Boolean(action)} onInterval={(value) => void changeStatus(value)} onCheck={() => void changeStatus()} />
            {mixed?.active && <section className="provider-active-card">
              <div className="provider-active-icon"><Boxes size={21} /></div>
              <div className="provider-active-copy"><span>当前接入 Codex</span><div><strong>{new Set(mixed.routes.map((route) => route.providerId)).size} 个渠道 · {mixed.routes.length} 个模型</strong><span className="provider-status-badge is-success">混合接管</span></div><p>进入对应渠道的“管理接入”调整模型 · 使用期间需保持 AZT 运行</p>
                {mixed.gatewayError && <p className="provider-inline-error">{mixed.gatewayError}</p>}{mixed.needsApply && <p>服务配置已更改，请重新保存混合接管。</p>}</div>
              <div className="provider-active-actions"><button className="btn-danger" type="button" onClick={removeMixed} disabled={Boolean(action)}>解除全部接入</button></div>
            </section>}
          </>}
        />
      )}
      {view.name === "remote" && config && <div className="provider-detail-view"><button className="providers-back" type="button" onClick={() => setView({ name: "list" })}>← 外部 API 服务</button><GatewayConnection mode="remote" config={config} setConfig={onConfigUpdate} setStatus={message => onStatus?.(message)} onApplied={() => refresh(true)} /></div>}
      {view.name === "detail" && selectedProvider && (
        <ProviderDetail
          provider={selectedProvider}
          mixedActive={Boolean(mixed?.active && mixed.routes.some((route) => route.providerId === selectedProvider.id))}
          action={action ?? (selectedProvider.inspectionJob?.status === "running" ? `inspect:${selectedProvider.id}:all` : null)}
          onBack={() => setView({ name: "list" })}
          onEdit={() => openEdit(selectedProvider)}
          onDelete={() => void removeProvider(selectedProvider)}
          onSync={() => void runProviderAction("sync", selectedProvider)}
          onInspect={(modelIds) => void runProviderAction("inspect", selectedProvider, modelIds)}
          onContextWindow={async (modelId, value) => {
            setAction(`context:${selectedProvider.id}`);
            try {
              const updated = await setProviderContextWindow(selectedProvider.id, modelId, value);
              if (!updated) throw new Error("服务未返回保存结果，请重试。");
              setProviders((previous) => replaceProvider(previous, updated));
              if (mixed) await refresh(true);
              showSuccess("上下文窗口已保存，下次接入 Codex 时生效。");
            } finally { setAction(null); }
          }}
          onActivate={() => setView({ name: "codex", providerId: selectedProvider.id })}
        />
      )}
      {view.name === "codex" && selectedProvider && (
        <CodexActivation
          key={selectedProvider.id}
          healthIntervalMinutes={modelStatus?.intervalMinutes}
          provider={selectedProvider}
          activeProvider={mixed?.active ? null : activeProvider}
          mixed={mixed}
          saving={action === `activate:${selectedProvider.id}` ? "direct" : action === "mixed:activate" ? "mixed" : false}
          disconnecting={action === `deactivate:${selectedProvider.id}` || action === "mixed:deactivate"}
          onBack={() => setView({ name: "detail", providerId: selectedProvider.id })}
          onActivateMixed={(selection) => {
            const input = mixedActivationForProvider(selectedProvider.id, selection, mixed);
            const retained = input.routes.length - selection.modelIds.length;
            requestSwitch(`确认混合接管 · ${selectedProvider.name}`,
              `Codex 将通过本机 AZT 调用本渠道所选的 ${selection.modelIds.length} 个模型，默认模型为“${selection.defaultModelId}”。${retained ? `保留其他渠道已接入的 ${retained} 个模型。` : ""}本地新旧对话将使用混合接管配置，历史内容不会自动迁移。`,
              () => applyMixed(input, selectedProvider), "mixed", input.routes.filter((route) => route.protocol === "auto").length);
          }}
          onActivate={(modelIds, defaultModelId) => requestSwitch(
            selectedProvider.activeForCodex ? "保存直接接管模型" : `确认直接接管 · ${selectedProvider.name}`,
            `Codex 将直接访问“${selectedProvider.name}”。${mixed?.active ? "当前混合接管将停止，改为仅使用本渠道所选模型。" : ""}本地新旧对话将使用该服务及所选模型，不支持的模型将调整为默认模型“${defaultModelId}”。`,
            () => applyCodex(selectedProvider, modelIds, defaultModelId),
            "direct",
          )}
          onDeactivate={() => mixed?.active ? removeMixedProvider(selectedProvider) : void removeCodex(selectedProvider)}
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
      {switchDialog && <CodexSwitchDialog
        title={switchDialog.title}
        detail={switchDialog.detail}
        mode={switchDialog.mode}
        autoModelCount={switchDialog.autoModelCount}
        busy={Boolean(action)}
        error={feedback?.tone === "error" ? feedback.text : undefined}
        onClose={() => { if (!confirmingSwitch.current) { setSwitchDialog(null); setFeedback(null); } }}
        onConfirm={() => void confirmSwitch()}
      />}
      {feedback && !switchDialog && <div className={`provider-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
        {feedback.tone === "error" && <AlertCircle size={16} />}
        <span>{feedback.text}</span>
        {feedback.tone === "error" && <button className="provider-icon-button" type="button" aria-label="关闭错误提示" onClick={() => setFeedback(null)}><X size={16} /></button>}
      </div>}
    </section>
  );
}

export type { ApiProvider, ProviderDraft, ProviderModel, ProvidersSnapshot } from "./types";
