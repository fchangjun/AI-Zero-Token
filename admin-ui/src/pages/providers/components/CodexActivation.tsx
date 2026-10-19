import { ArrowLeft, Check, Info, Loader2, Search, Unplug } from "lucide-react";
import { useMemo, useState } from "react";
import type { MixedProtocolChoice, PublicMixedConfig } from "../../../../../src/core/models/mixed-provider";
import type { ApiProvider, ProviderInspectionStatus, ProviderModel } from "../types";
import { initialTakeoverSelection, type TakeoverSelection } from "../takeover-selection";
import { ModelAvailabilityBadge, modelAvailability } from "./ModelAvailabilityBadge";
import { TakeoverModeTips } from "./TakeoverModeTips";
import { TakeoverModeInspection } from "./ModelInspectionResult";
import { matchesTakeoverFilter, sharesResponsesInspection, takeoverAvailability, type TakeoverFilter } from "../takeover-availability";
import { TakeoverStatusFilter } from "./TakeoverStatusFilter";
import { MIXED_PROTOCOL_LABELS } from "../../../../../src/core/models/model-compatibility";
import { modelHealthProtocol } from "../../../../../src/core/models/model-availability";
import { groupModelsByVendor, matchesModelSearch, modelVendor, type ModelVendorId } from "../model-vendors";
import { ModelVendorFilter } from "./ModelVendorFilter";
import { ModelVendorSection } from "./ModelVendorSection";
import { TakeoverContextWindow } from "./TakeoverContextWindow";
import { TakeoverInspectionDetails } from "./TakeoverInspectionDetails";

const availabilityRank: Record<ProviderInspectionStatus, number> = {
  ready: 0,
  unknown: 1,
  pending: 1,
  busy: 2,
  unavailable: 3,
  timeout: 3,
  transport_error: 3,
  incompatible: 4,
  auth_error: 5,
  skipped: 6,
};

function sortByAvailability(models: ProviderModel[], intervalMinutes = 30, protocols: Record<string, MixedProtocolChoice> = {}): ProviderModel[] {
  return models
    .map((model, index) => ({ model, index }))
    .sort((left, right) => {
      const rank = (model: ProviderModel) => {
        const available = takeoverAvailability(model, protocols[model.id]);
        if (available.directReady || available.mixedReady) return 0;
        if (!model.health && !model.inspection.checkedAt) return 1 + availabilityRank[model.inspection.status];
        return 1 + { available: 0, unknown: 1, blocked: 2, unavailable: 3 }[modelAvailability(model, "responses", intervalMinutes).status];
      };
      const rankDifference = rank(left.model) - rank(right.model);
      return rankDifference || left.index - right.index;
    })
    .map(({ model }) => model);
}

export function CodexActivation(props: {
  healthIntervalMinutes?: number;
  provider: ApiProvider;
  activeProvider: ApiProvider | null;
  mixed?: PublicMixedConfig;
  saving: false | "direct" | "mixed";
  disconnecting: boolean;
  onBack: () => void;
  onActivate: (modelIds: string[], defaultModelId: string) => void;
  onActivateMixed: (selection: TakeoverSelection) => void;
  onDeactivate: () => void;
}) {
  const [selection, setSelection] = useState(() => initialTakeoverSelection(props.provider, props.mixed));
  const { defaultModelId, protocols } = selection;
  const selectedIds = new Set(selection.modelIds);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TakeoverFilter>("all");
  const [vendorFilter, setVendorFilter] = useState<ModelVendorId | "all">("all");
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);

  const busy = Boolean(props.saving) || props.disconnecting;
  const mixedRoutes = props.mixed?.active ? props.mixed.routes.filter((route) => route.providerId === props.provider.id) : [];
  const otherMixedCount = props.mixed?.active ? props.mixed.routes.length - mixedRoutes.length : 0;

  const visibleModels = useMemo(() => {
    const filtered = props.provider.models.filter((model) => matchesTakeoverFilter(model, statusFilter, protocols[model.id])
      && (vendorFilter === "all" || modelVendor(model).id === vendorFilter)
      && matchesModelSearch(model, search));
    return sortByAvailability(filtered, props.healthIntervalMinutes, protocols);
  }, [props.provider.models, search, statusFilter, vendorFilter, props.healthIntervalMinutes, protocols]);
  const modelGroups = useMemo(() => groupModelsByVendor(visibleModels), [visibleModels]);
  const selectedModels = props.provider.models.filter((model) => selectedIds.has(model.id));
  const allVisibleSelected = visibleModels.length > 0 && visibleModels.every((model) => selectedIds.has(model.id));
  const hiddenSelectedCount = selectedModels.length - visibleModels.filter((model) => selectedIds.has(model.id)).length;

  function toggleModel(id: string) {
    setSelection((current) => {
      const next = new Set(current.modelIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const modelIds = props.provider.models.filter((model) => next.has(model.id)).map((model) => model.id);
      return { ...current, modelIds, defaultModelId: next.has(current.defaultModelId) ? current.defaultModelId : modelIds[0] ?? "" };
    });
  }

  function toggleModels(models: ProviderModel[]) {
    setSelection((current) => {
      const next = new Set(current.modelIds);
      const allSelected = models.every((model) => next.has(model.id));
      for (const model of models) {
        if (allSelected) next.delete(model.id);
        else next.add(model.id);
      }
      const modelIds = props.provider.models.filter((model) => next.has(model.id)).map((model) => model.id);
      return { ...current, modelIds, defaultModelId: next.has(current.defaultModelId) ? current.defaultModelId : modelIds[0] ?? "" };
    });
  }

  const switching = props.activeProvider && props.activeProvider.id !== props.provider.id;
  return (
    <div className="provider-codex-view">
      <button className="providers-back" type="button" onClick={props.onBack} disabled={busy}><ArrowLeft size={15} />返回 {props.provider.name}</button>
      <div className="providers-page-head is-codex">
        <div><span className="providers-page-kicker">Codex 接入</span><h1>选择模型 · {props.provider.name}</h1><p>选好模型和默认模型，再选择直接接管或混合接管。</p></div>
      </div>

      <section className="provider-codex-actions" aria-label="Codex 接入操作">
        <div className="provider-codex-action-summary">
          <strong>{props.provider.name} · 已选择 {selectedModels.length} 个模型</strong>
          <span>{props.provider.activeForCodex ? `当前直接接管 · ${props.provider.codexCatalogMode === "local" ? "本地模型列表" : "显示模型状态"}` : mixedRoutes.length ? "当前混合接管" : "选好模型后，选择接管方式"}</span>
        </div>
        <div className="provider-codex-controls">
          <label className="provider-codex-default">
            <span>默认模型</span>
            <select aria-label="默认模型" value={defaultModelId} onChange={(event) => setSelection((current) => ({ ...current, defaultModelId: event.target.value }))} disabled={!selectedModels.length || busy}>
              {!selectedModels.length && <option value="">请先选择模型</option>}
              {groupModelsByVendor(selectedModels).map((group) => <optgroup key={group.id} label={group.label}>{group.models.map((model) => <option value={model.id} key={model.id}>{model.name || model.id}</option>)}</optgroup>)}
            </select>
          </label>
          <div className="provider-codex-action-buttons">
            {(props.provider.activeForCodex || mixedRoutes.length > 0) && <button className="btn-danger" type="button" disabled={busy} onClick={props.onDeactivate}>{props.disconnecting ? <Loader2 className="provider-spin" size={15} /> : <Unplug size={15} />}{mixedRoutes.length ? "解除本渠道接入" : "解除接入"}</button>}
            <button className="btn-secondary" type="button" title="由 AZT 做兼容转换，接入 Claude、DeepSeek、Gemini 等模型；以渠道兼容性检测结果为准，需保持 AZT 运行" disabled={!selectedModels.length || !defaultModelId || busy} onClick={() => props.onActivateMixed({ ...selection, modelIds: selectedModels.map((model) => model.id) })}>{props.saving === "mixed" && <Loader2 className="provider-spin" size={15} />}混合接管</button>
            <button className="btn-primary" type="button" title="直接使用本身兼容 Codex 的模型，无需 AZT 做兼容转换" disabled={!selectedModels.length || !defaultModelId || busy} onClick={() => props.onActivate(selectedModels.map((model) => model.id), defaultModelId)}>{props.saving === "direct" && <Loader2 className="provider-spin" size={15} />}直接接管</button>
          </div>
        </div>
      </section>

      <TakeoverModeTips />
      {switching && <div className="providers-notice"><Info size={16} />当前接入 {props.activeProvider?.name}。点击接管按钮并确认后，将应用本渠道所选模型，原服务资料仍保留。</div>}
      {props.mixed?.active && <div className="providers-notice"><Info size={16} />{otherMixedCount ? `混合接管会保留其他渠道已接入的 ${otherMixedCount} 个模型，并以本页选择更新当前渠道。` : "混合接管会按本页选择更新当前渠道。"}直接接管会改为仅使用本渠道所选模型。</div>}
      {props.mixed?.active && props.mixed.gatewayError && <div className="provider-inline-error" role="alert">{props.mixed.gatewayError}</div>}
      {props.mixed?.active && props.mixed.needsApply && <div className="providers-notice">服务资料或上下文配置已变更，请重新保存混合接管。</div>}
      <section className="providers-surface provider-codex-surface">
        <div className="provider-codex-head">
          <div><h2>选择要显示在 Codex 中的模型</h2><p>运行状态显示近期连通情况，兼容性用于选择接管方式；临时连接异常不改变兼容结论。</p></div>
          <span className="provider-status-badge is-info">{props.provider.name} · {props.provider.modelCount} 个模型</span>
        </div>
        <div className="provider-codex-toolbar">
          <div className="provider-codex-filters">
            <label className="providers-search is-wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模型或厂商" /></label>
            <ModelVendorFilter models={props.provider.models} value={vendorFilter} onChange={setVendorFilter} />
            <TakeoverStatusFilter models={props.provider.models} value={statusFilter} onChange={setStatusFilter} protocols={protocols} />
          </div>
          <button className="btn-secondary" type="button" onClick={() => toggleModels(visibleModels)} disabled={busy || !visibleModels.length}>{allVisibleSelected ? "取消选择筛选结果" : "全选筛选结果"}</button>
        </div>
        <div className="provider-codex-filter-summary" role="status">
          当前筛选 {modelGroups.length} 个厂商 · {visibleModels.length} 个模型{hiddenSelectedCount > 0 && ` · 另有 ${hiddenSelectedCount} 个已选模型被筛选隐藏，保存时会保留`}
          {statusFilter === "checked" && <span>已检测包含检测通过、暂时失败和不兼容的模型。</span>}
        </div>

        {!props.provider.models.length ? (
          <div className="providers-empty is-compact"><h3>这个服务还没有模型</h3><p>请返回服务详情，同步或手动添加模型。</p></div>
        ) : (
          <div className="provider-codex-table-scroll">
            <div className="provider-codex-table-head"><span></span><span>模型</span><span>直接接管<small>兼容性与上下文</small></span><span>混合接管<small>兼容性与上下文</small></span><span>混合接管接口<small>默认自动识别</small></span></div>
            {modelGroups.map((group) => <ModelVendorSection key={JSON.stringify([group.id, search, vendorFilter, statusFilter])} vendor={group} count={group.models.length}
              selectedCount={group.models.filter((model) => selectedIds.has(model.id)).length} onToggleSelection={() => toggleModels(group.models)} disabled={busy}>
            {group.models.map((model) => {
              const checked = selectedIds.has(model.id);
              const protocol = protocols[model.id] ?? "auto";
              const savedRoute = props.mixed?.routes.find((route) => route.providerId === props.provider.id && route.modelId === model.id);
              const resolvedProtocol = protocol === "auto" ? model.compatibility?.status === "identified" ? model.compatibility.protocol
                : !model.compatibility && savedRoute?.autoDetected ? savedRoute.protocol
                : sharesResponsesInspection(model) ? "responses" : undefined : protocol;
              // Unsaved interface choices must not replace the current connection's health.
              const activeRoute = mixedRoutes.find((route) => route.modelId === model.id);
              const directActive = props.provider.activeForCodex && model.selectedForCodex;
              const runtimeProtocol = modelHealthProtocol(model, { directActive: props.provider.activeForCodex, mixedActive: props.mixed?.active, route: savedRoute });
              const runtimeContext = `${activeRoute ? "当前混合接管" : directActive ? "当前直接接管" : "接口检测结果"} · ${MIXED_PROTOCOL_LABELS[runtimeProtocol]}`;
              const refreshHint = props.healthIntervalMinutes === 0 ? "自动检测已关闭，可手动检测模型状态。"
                : "保持 AZT 运行后，将按检测周期自动刷新，无需先接入 Codex。";
              const protocolName = protocol === "auto" ? "自动识别" : protocol === "responses" ? "Responses" : protocol === "chat_completions" ? "OpenAI Chat" : "Claude Messages";
              return (
                <div className={`provider-codex-row ${checked ? "is-selected" : ""}`} key={model.id}>
                  <label className="provider-codex-model-choice">
                    <input type="checkbox" aria-label={`选择 ${model.name || model.id}`} checked={checked} disabled={busy} onChange={() => toggleModel(model.id)} />
                    <span className="provider-checkbox">{checked && <Check size={13} />}</span>
                    <span className="provider-codex-model">
                      <strong>{model.name || model.id}</strong>
                      {model.name && model.name !== model.id && <small>{model.id}</small>}
                      <span className="provider-codex-runtime-status" aria-label={`${model.name || model.id} 的运行状态`}>
                        <span>运行状态</span>
                        <ModelAvailabilityBadge model={model} protocol={runtimeProtocol} intervalMinutes={props.healthIntervalMinutes} compact context={runtimeContext} refreshHint={refreshHint} />
                      </span>
                    </span>
                  </label>
                  <div className="provider-codex-mode-status">
                    <TakeoverModeInspection model={model} mode="direct" compact />
                    <TakeoverContextWindow model={model} mode="direct" compact activeWindow={props.provider.activeForCodex ? model.activeDirectContextWindow : undefined} />
                  </div>
                  <div className="provider-codex-mode-status">
                    <TakeoverModeInspection model={model} mode="mixed" protocol={protocol} compact />
                    <TakeoverContextWindow model={model} mode="mixed" compact protocol={resolvedProtocol} activeWindow={props.mixed?.active ? savedRoute?.contextWindow : undefined} />
                  </div>
                  <div className="provider-codex-protocol">
                    <div className="provider-codex-protocol-summary"><span>{protocolName}</span><button type="button" disabled={busy || !checked} aria-label={`调整 ${model.name || model.id} 的混合接管接口`} aria-expanded={editingProtocolId === model.id} onClick={() => setEditingProtocolId((current) => current === model.id ? null : model.id)}>{editingProtocolId === model.id ? "收起" : "调整"}</button></div>
                    {editingProtocolId === model.id && <select aria-label={`${model.name || model.id} 的混合接管接口`} value={protocol} disabled={busy || !checked}
                      title="仅混合接管使用；通常保持自动识别即可"
                      onChange={(event) => { setSelection((current) => ({ ...current, protocols: { ...current.protocols, [model.id]: event.target.value as MixedProtocolChoice } })); setEditingProtocolId(null); }}>
                      <option value="auto">自动识别（推荐）</option>
                      <option value="responses">Responses · 原样转发</option>
                      <option value="chat_completions">OpenAI Chat · 兼容转换</option>
                      <option value="anthropic">Claude Messages · 兼容转换</option>
                    </select>}
                    {protocol === "auto" && <small>{resolvedProtocol ? `已识别：${MIXED_PROTOCOL_LABELS[resolvedProtocol]}` : "接入时自动识别"}</small>}
                  </div>
                  <TakeoverInspectionDetails model={model} protocol={protocol} resolvedProtocol={resolvedProtocol} intervalMinutes={props.healthIntervalMinutes} />
                </div>
              );
            })}
            </ModelVendorSection>)}
            {!visibleModels.length && <div className="providers-empty is-compact">没有匹配的模型，请调整搜索或筛选条件。</div>}
          </div>
        )}
        <p className="provider-codex-protocol-note"><Info size={14} />上下文优先使用手动设置，其次使用渠道返回值；未提供时，兼容转换默认 128K，直接接管 / Responses 沿用 272K。默认值不代表已验证上限，可在模型详情调整；已有接入值在重新接入后才更新。</p>
        <p className="provider-codex-protocol-note"><Info size={14} />混合接管会自动识别接口，特殊服务可在模型行点击“调整”。Chat / Claude 兼容转换暂不支持 Codex 内置联网搜索。</p>
      </section>

      <div className="providers-selection-note"><Info size={15} />勾选只控制模型是否显示在 Codex 中；实际调用结果取决于上游服务。</div>
    </div>
  );
}
