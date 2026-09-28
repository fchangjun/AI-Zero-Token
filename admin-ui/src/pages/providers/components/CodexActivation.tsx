import { ArrowLeft, Check, Info, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiProvider, ProviderModel } from "../types";
import { CapabilityTags } from "./CapabilityTags";
import { InspectionStatusBadge } from "./StatusBadge";

type ModelFilter = "all" | "checked" | "ready" | "unchecked" | "incompatible";

function matchesFilter(model: ProviderModel, filter: ModelFilter): boolean {
  const inspected = Boolean(model.inspection.checkedAt || model.lastInspectedAt)
    || !["unknown", "pending", "skipped"].includes(model.inspection.status);
  if (filter === "checked") return inspected;
  if (filter === "unchecked") return !inspected;
  return filter === "all" || model.inspection.status === filter;
}

export function CodexActivation(props: {
  provider: ApiProvider;
  activeProvider: ApiProvider | null;
  saving: boolean;
  onBack: () => void;
  onActivate: (modelIds: string[], defaultModelId: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [defaultModelId, setDefaultModelId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ModelFilter>("all");

  useEffect(() => {
    const saved = props.provider.models.filter((model) => model.selectedForCodex).map((model) => model.id);
    const initial = saved.length ? saved : props.provider.models.length === 1 ? [props.provider.models[0].id] : [];
    setSelectedIds(new Set(initial));
    const nextDefault = props.provider.defaultModelId && initial.includes(props.provider.defaultModelId)
      ? props.provider.defaultModelId
      : initial[0] ?? "";
    setDefaultModelId(nextDefault);
    setSearch("");
    setStatusFilter("all");
  }, [props.provider.id]);

  const visibleModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return props.provider.models.filter((model) => matchesFilter(model, statusFilter)
      && (!query || `${model.id} ${model.name ?? ""}`.toLowerCase().includes(query)));
  }, [props.provider.models, search, statusFilter]);
  const selectedModels = props.provider.models.filter((model) => selectedIds.has(model.id));
  const allVisibleSelected = visibleModels.length > 0 && visibleModels.every((model) => selectedIds.has(model.id));
  const hiddenSelectedCount = selectedModels.length - visibleModels.filter((model) => selectedIds.has(model.id)).length;

  function toggleModel(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const nextIds = props.provider.models.filter((model) => next.has(model.id)).map((model) => model.id);
      setDefaultModelId((currentDefault) => next.has(currentDefault) ? currentDefault : nextIds[0] ?? "");
      return next;
    });
  }

  function toggleVisible() {
    const next = new Set(selectedIds);
    for (const model of visibleModels) {
      if (allVisibleSelected) next.delete(model.id);
      else next.add(model.id);
    }
    setSelectedIds(next);
    setDefaultModelId((current) => next.has(current) ? current : props.provider.models.find((model) => next.has(model.id))?.id ?? "");
  }

  const switching = props.activeProvider && props.activeProvider.id !== props.provider.id;
  return (
    <div className="provider-codex-view">
      <button className="providers-back" type="button" onClick={props.onBack} disabled={props.saving}><ArrowLeft size={15} />返回 {props.provider.name}</button>
      <div className="providers-page-head is-codex">
        <div><span className="providers-page-kicker">Codex 接入</span><h1>将 {props.provider.name} 接入 Codex</h1><p>从该服务返回的全部模型中勾选。同一时间只接入一个模型服务。</p></div>
      </div>

      {switching && (
        <section className="provider-switch-card">
          <div><span>当前接入</span><strong>{props.activeProvider?.name}</strong></div>
          <span className="provider-switch-arrow">→</span>
          <div className="is-target"><span>准备切换至</span><strong>{props.provider.name}</strong></div>
        </section>
      )}
      {switching && <div className="providers-notice"><Info size={16} />切换后会保留 {props.activeProvider?.name} 服务及模型记录。新的接入配置在重启 Codex 后生效。</div>}

      <section className="providers-surface provider-codex-surface">
        <div className="provider-codex-head">
          <div><h2>选择要显示在 Codex 中的模型</h2><p>颜色标签只提示检测状态，未检测或本次失败的模型同样可以勾选。</p></div>
          <span className="provider-status-badge is-info">{props.provider.name} · {props.provider.modelCount} 个模型</span>
        </div>
        <div className="provider-codex-toolbar">
          <div className="provider-codex-filters">
            <label className="providers-search is-wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模型 ID" /></label>
            <select className="provider-filter" aria-label="检测状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ModelFilter)}>
              <option value="all">全部（{props.provider.models.length}）</option>
              <option value="checked">已检测（{props.provider.models.filter((model) => matchesFilter(model, "checked")).length}）</option>
              <option value="ready">检测通过（{props.provider.models.filter((model) => matchesFilter(model, "ready")).length}）</option>
              <option value="unchecked">未检测（{props.provider.models.filter((model) => matchesFilter(model, "unchecked")).length}）</option>
              <option value="incompatible">不兼容（{props.provider.models.filter((model) => matchesFilter(model, "incompatible")).length}）</option>
            </select>
          </div>
          <button className="btn-secondary" type="button" onClick={toggleVisible} disabled={props.saving || !visibleModels.length}>{allVisibleSelected ? "取消选择筛选结果" : "全选筛选结果"}</button>
        </div>
        <div className="provider-codex-filter-summary" role="status">
          当前显示 {visibleModels.length} 个模型{hiddenSelectedCount > 0 && ` · 另有 ${hiddenSelectedCount} 个已选模型被筛选隐藏，保存时会保留`}
          {statusFilter === "checked" && <span>已检测包含检测通过、暂时失败和不兼容的模型。</span>}
        </div>

        {!props.provider.models.length ? (
          <div className="providers-empty is-compact"><h3>这个服务还没有模型</h3><p>请返回服务详情，同步或手动添加模型。</p></div>
        ) : (
          <div className="provider-codex-table-scroll">
            <div className="provider-codex-table-head"><span></span><span>模型</span><span>检测状态</span><span>已确认的能力</span></div>
            {visibleModels.map((model) => {
              const checked = selectedIds.has(model.id);
              return (
                <label className={`provider-codex-row ${checked ? "is-selected" : ""}`} key={model.id}>
                  <input type="checkbox" checked={checked} disabled={props.saving} onChange={() => toggleModel(model.id)} />
                  <span className="provider-checkbox">{checked && <Check size={13} />}</span>
                  <span className="provider-codex-model"><strong>{model.name || model.id}</strong>{model.name && model.name !== model.id && <small>{model.id}</small>}</span>
                  <span><InspectionStatusBadge status={model.inspection.status} title={model.inspection.message} /></span>
                  <CapabilityTags model={model} compact />
                </label>
              );
            })}
            {!visibleModels.length && <div className="providers-empty is-compact">没有匹配的模型，请调整搜索或筛选条件。</div>}
          </div>
        )}

        <div className="provider-default-row">
          <div><strong>默认模型</strong><span>Codex 切换到这个服务后优先使用</span></div>
          <select aria-label="默认模型" value={defaultModelId} onChange={(event) => setDefaultModelId(event.target.value)} disabled={!selectedModels.length || props.saving}>
            {!selectedModels.length && <option value="">请先选择模型</option>}
            {selectedModels.map((model) => <option value={model.id} key={model.id}>{model.name || model.id}</option>)}
          </select>
        </div>
      </section>

      <div className="providers-selection-note"><Info size={15} />勾选只控制模型是否显示在 Codex 中；实际调用结果取决于上游服务。</div>
      <div className="provider-codex-footer">
        <span>已选择 {selectedIds.size} 个模型 · 需要重启 Codex 才会更新模型选择器</span>
        <div><button className="btn-secondary" type="button" onClick={props.onBack} disabled={props.saving}>返回模型列表</button><button className="btn-primary" type="button" disabled={!selectedIds.size || !defaultModelId || props.saving} onClick={() => props.onActivate([...selectedIds], defaultModelId)}>{props.saving && <Loader2 className="provider-spin" size={15} />}{switching ? `确认切换到 ${props.provider.name}` : props.provider.activeForCodex ? "保存 Codex 模型" : `接入 ${props.provider.name}`}</button></div>
      </div>
    </div>
  );
}
