import { ArrowLeft, Edit3, Loader2, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ApiProvider, ProviderInspectionStatus, ProviderModel } from "../types";
import { CapabilityTags } from "./CapabilityTags";
import { ConnectionStatusBadge, InspectionStatusBadge } from "./StatusBadge";
import { ModelInspectionDrawer } from "./ModelInspectionDrawer";
import { formatProviderDate } from "./ProvidersList";

type ModelStatusFilter = "all" | ProviderInspectionStatus;
const MAX_INSPECTION_BATCH = 20;

function isChecked(model: ProviderModel): boolean {
  return model.inspection.status === "ready";
}

export function ProviderDetail(props: {
  provider: ApiProvider;
  action: string | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
  onInspect: (modelIds?: string[]) => void;
  onActivate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [detailModelId, setDetailModelId] = useState<string>();
  const detailModel = props.provider.models.find((model) => model.id === detailModelId);
  const [statusFilter, setStatusFilter] = useState<ModelStatusFilter>("all");
  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return props.provider.models.filter((model) => {
      if (statusFilter !== "all" && model.inspection.status !== statusFilter) return false;
      return !query || `${model.id} ${model.name ?? ""} ${model.description ?? ""}`.toLowerCase().includes(query);
    });
  }, [props.provider.models, search, statusFilter]);
  const inspectionBatch = filteredModels.slice(0, MAX_INSPECTION_BATCH).map((model) => model.id);
  const readyCount = props.provider.models.filter(isChecked).length;
  const isSyncing = props.action === `sync:${props.provider.id}`;
  const inspectingAll = props.action === `inspect:${props.provider.id}:all`;

  return (
    <div className="provider-detail-view">
      <button className="providers-back" type="button" onClick={props.onBack}><ArrowLeft size={15} />API 服务</button>
      <div className="provider-detail-head">
        <div>
          <div className="provider-detail-title"><h1>{props.provider.name}</h1><ConnectionStatusBadge status={props.provider.connectionStatus} title={props.provider.connectionMessage} /></div>
          <p>{props.provider.baseUrl} · 上次同步：{formatProviderDate(props.provider.lastSyncedAt)}</p>
        </div>
        <div className="provider-detail-actions">
          <button className="btn-secondary" type="button" onClick={props.onEdit} disabled={Boolean(props.action)}><Edit3 size={15} />编辑</button>
          <button className="btn-secondary" type="button" onClick={props.onSync} disabled={Boolean(props.action)}>
            {isSyncing ? <Loader2 className="provider-spin" size={15} /> : <RefreshCw size={15} />}同步模型
          </button>
          <button className="btn-primary" type="button" onClick={props.onActivate} disabled={Boolean(props.action)}>接入 Codex</button>
        </div>
      </div>

      {props.provider.activeForCodex && props.provider.codexNeedsApply && <div className="providers-notice">服务设置已变更。Codex 仍使用上次接入配置，请点击“接入 Codex”重新保存后生效。</div>}
      {props.provider.connectionMessage && <div className="provider-inline-error" role="alert">{props.provider.connectionMessage}</div>}
      <section className="provider-metrics">
        <div><span>已保存的模型</span><strong>{props.provider.modelCount}</strong></div>
        <div><span>检测通过</span><strong>{readyCount}</strong></div>
        <div><span>其他检测状态</span><strong>{Math.max(0, props.provider.models.length - readyCount)}</strong></div>
        <div><span>服务状态</span><ConnectionStatusBadge status={props.provider.connectionStatus} /></div>
      </section>

      <section className="providers-surface provider-model-surface">
        <div className="provider-model-toolbar">
          <div className="provider-model-filters">
            <label className="providers-search is-wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模型 ID" /></label>
            <select className="provider-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ModelStatusFilter)}>
              <option value="all">全部状态</option>
              <option value="ready">检测通过</option>
              <option value="unknown">未检测</option>
              <option value="busy">服务繁忙</option>
              <option value="unavailable">暂时不可用</option>
              <option value="timeout">检测超时</option>
              <option value="transport_error">网络异常</option>
              <option value="incompatible">不兼容</option>
              <option value="auth_error">凭据失效</option>
            </select>
          </div>
          <button className="btn-secondary" type="button" onClick={() => props.onInspect(inspectionBatch)} disabled={Boolean(props.action) || !inspectionBatch.length} title="按当前搜索和状态筛选分批检测，单次最多 20 个模型">
            {inspectingAll ? <Loader2 className="provider-spin" size={15} /> : <ShieldCheck size={15} />}验证当前筛选{filteredModels.length > MAX_INSPECTION_BATCH ? "（前 20）" : ""}
          </button>
        </div>

        {!filteredModels.length ? (
          <div className="providers-empty is-compact"><h3>没有匹配的模型</h3><p>同步模型或调整搜索和筛选条件。</p></div>
        ) : (
          <div className="provider-model-table-scroll">
            <div className="provider-model-table-head"><span>模型</span><span>检测状态</span><span>已确认的能力</span><span>上次检测</span><span>操作</span></div>
            {filteredModels.map((model) => {
              const modelBusy = props.action === `inspect:${props.provider.id}:${model.id}`;
              return (
                <div className="provider-model-row" key={model.id}>
                  <div><strong>{model.name || model.id}</strong>{model.name && model.name !== model.id && <small>{model.id}</small>}{model.description && <small>{model.description}</small>}{model.catalogStatus === "missing" && <small>本次列表未返回 · 已保留</small>}</div>
                  <div><InspectionStatusBadge status={model.inspection.status} title={model.inspection.message} /></div>
                  <CapabilityTags model={model} />
                  <div className="providers-date">{model.lastInspectedAt || model.inspection.checkedAt ? formatProviderDate(model.lastInspectedAt ?? model.inspection.checkedAt) : "—"}</div>
                  <div className="provider-model-actions"><button className="provider-link-button" type="button" onClick={() => setDetailModelId(model.id)}>详情</button>
                  <button className="provider-link-button" type="button" onClick={() => props.onInspect([model.id])} disabled={Boolean(props.action)}>
                    {modelBusy && <Loader2 className="provider-spin" size={13} />}
                    {model.inspection.status === "unknown" || model.inspection.status === "pending" ? "检测能力" : "重新验证"}
                  </button></div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="provider-detail-danger">
        <div><strong>移除这个服务</strong><span>服务及其模型检测记录会从本机删除。</span></div>
        <button className="btn-danger" type="button" onClick={props.onDelete} disabled={Boolean(props.action)}><Trash2 size={15} />删除服务</button>
      </div>

      {props.provider.inspectionJob?.status === "failed" && <div className="provider-inline-error" role="alert">检测未完成：{props.provider.inspectionJob.error}。已完成的结果已保存，可重新检测。</div>}
      {detailModel && <ModelInspectionDrawer model={detailModel} busy={Boolean(props.action)} onClose={() => setDetailModelId(undefined)} onInspect={() => props.onInspect([detailModel.id])} />}
      {props.action?.startsWith(`inspect:${props.provider.id}:`) && (
        <div className="provider-progress-card">
          <Loader2 className="provider-spin" size={18} />
          <div><strong>正在后台验证模型能力</strong><span>已完成 {props.provider.inspectionJob?.completed ?? 0} / {props.provider.inspectionJob?.total ?? props.provider.models.length} 个模型。离开页面后检测会继续，返回时自动更新。</span></div>
        </div>
      )}
    </div>
  );
}
