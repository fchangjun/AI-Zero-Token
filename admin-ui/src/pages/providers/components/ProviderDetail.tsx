import { ArrowLeft, Edit3, Loader2, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ApiProvider } from "../types";
import { CapabilityTags } from "./CapabilityTags";
import { ConnectionStatusBadge } from "./StatusBadge";
import { ModelInspectionDrawer } from "./ModelInspectionDrawer";
import { formatProviderDate } from "./ProvidersList";
import { ModelInspectionResult } from "./ModelInspectionResult";
import { matchesTakeoverFilter, takeoverAvailability, type TakeoverFilter } from "../takeover-availability";
import { groupModelsByVendor, matchesModelSearch, modelVendor, type ModelVendorId } from "../model-vendors";
import { ModelVendorFilter } from "./ModelVendorFilter";
import { ModelVendorSection } from "./ModelVendorSection";
import { TakeoverStatusFilter } from "./TakeoverStatusFilter";

export function ProviderDetail(props: {
  provider: ApiProvider;
  mixedActive?: boolean;
  action: string | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
  onInspect: (modelIds?: string[]) => void;
  onActivate: () => void;
  onContextWindow: (modelId: string, value: number | null) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [detailModelId, setDetailModelId] = useState<string>();
  const detailModel = props.provider.models.find((model) => model.id === detailModelId);
  const [statusFilter, setStatusFilter] = useState<TakeoverFilter>("all");
  const [vendorFilter, setVendorFilter] = useState<ModelVendorId | "all">("all");
  const filteredModels = useMemo(() => {
    return props.provider.models.filter((model) => {
      if (vendorFilter !== "all" && modelVendor(model).id !== vendorFilter) return false;
      if (!matchesTakeoverFilter(model, statusFilter)) return false;
      return matchesModelSearch(model, search);
    });
  }, [props.provider.models, search, statusFilter, vendorFilter]);
  const modelGroups = useMemo(() => groupModelsByVendor(filteredModels), [filteredModels]);
  const inspectionBatch = modelGroups.flatMap((group) => group.models).map((model) => model.id);
  const isFiltered = Boolean(search.trim()) || vendorFilter !== "all" || statusFilter !== "all";
  const directCount = props.provider.models.filter((model) => matchesTakeoverFilter(model, "direct")).length;
  const mixedCount = props.provider.models.filter((model) => matchesTakeoverFilter(model, "mixed")).length;
  const bothCount = props.provider.models.filter((model) => matchesTakeoverFilter(model, "both")).length;
  const isSyncing = props.action === `sync:${props.provider.id}`;
  const inspecting = props.action?.startsWith(`inspect:${props.provider.id}:`) ?? false;

  return (
    <div className="provider-detail-view">
      <button className="providers-back" type="button" onClick={props.onBack}><ArrowLeft size={15} />API 服务</button>
      <div className="provider-detail-head">
        <div>
          <div className="provider-detail-title"><h1>{props.provider.name}</h1><ConnectionStatusBadge status={props.provider.connectionStatus} title={props.provider.connectionMessage} />{props.mixedActive && <span className="provider-status-badge is-success">混合接管</span>}</div>
          <p>{props.provider.baseUrl} · 上次同步：{formatProviderDate(props.provider.lastSyncedAt)}</p>
        </div>
        <div className="provider-detail-actions">
          <button className="btn-secondary" type="button" onClick={props.onEdit} disabled={Boolean(props.action)}><Edit3 size={15} />编辑</button>
          <button className="btn-secondary" type="button" onClick={props.onSync} disabled={Boolean(props.action)}>
            {isSyncing ? <Loader2 className="provider-spin" size={15} /> : <RefreshCw size={15} />}同步模型
          </button>
          <button className="btn-primary" type="button" onClick={props.onActivate} disabled={Boolean(props.action)}>{props.provider.activeForCodex || props.mixedActive ? "管理接入" : "接入 Codex"}</button>
        </div>
      </div>

      {props.provider.activeForCodex && props.provider.codexNeedsApply && <div className="providers-notice">服务设置已变更。Codex 仍使用上次接入配置，请点击“管理接入”重新保存后生效。</div>}
      {props.provider.activeForCodex && <div className="providers-notice">{props.provider.codexCatalogMode === "local"
        ? "直接接管 · 本地模型列表：无需保持 AZT 运行，Codex 不显示动态模型状态。修改显示模型后需重新保存接入。"
        : "直接接管 · 显示模型状态：先启动 AZT，等待管理页加载完成后再打开 Codex，使用期间保持 AZT 运行。"}</div>}
      {props.provider.connectionMessage && <div className="provider-inline-error" role="alert">{props.provider.connectionMessage}</div>}
      <section className="provider-metrics">
        <div><span>已保存的模型</span><strong>{props.provider.modelCount}</strong></div>
        <div><span>兼容直接接管</span><strong>{directCount}</strong></div>
        <div><span>兼容混合接管</span><strong>{mixedCount}</strong></div>
        <div><span>两种方式均兼容</span><strong>{bothCount}</strong></div>
      </section>

      <section className="providers-surface provider-model-surface">
        <div className="provider-model-toolbar">
          <div className="provider-model-filters">
            <label className="providers-search is-wide"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模型或厂商" /></label>
            <ModelVendorFilter models={props.provider.models} value={vendorFilter} onChange={setVendorFilter} />
            <TakeoverStatusFilter models={props.provider.models} value={statusFilter} onChange={setStatusFilter} />
          </div>
          <button className="btn-secondary" type="button" onClick={() => props.onInspect(inspectionBatch)} disabled={Boolean(props.action) || !inspectionBatch.length} title="一次检查直接接管与混合接管；分批完成全部筛选结果">
            {inspecting ? <Loader2 className="provider-spin" size={15} /> : <ShieldCheck size={15} />}{isFiltered ? "检测筛选结果" : "检测全部"}（{inspectionBatch.length}）
          </button>
        </div>
        <p className="provider-batch-inspection-tip">一次检测两种接管方式，并自动识别混合接管接口。全部模型分批完成，可查看进度；模型越多，耗时与检测费用越高。</p>

        {!filteredModels.length ? (
          <div className="providers-empty is-compact"><h3>没有匹配的模型</h3><p>同步模型或调整搜索和筛选条件。</p></div>
        ) : (
          <div className="provider-model-table-scroll">
            <div className="provider-model-table-head"><span>模型</span><span>接管兼容性</span><span>已确认的能力</span><span>上次能力检测</span><span>操作</span></div>
            {modelGroups.map((group) => <ModelVendorSection key={JSON.stringify([group.id, search, vendorFilter, statusFilter])} vendor={group} count={group.models.length}>
            {group.models.map((model) => {
              const modelBusy = props.action === `inspect:${props.provider.id}:${model.id}`;
              const availability = takeoverAvailability(model);
              const lastCheckedAt = Math.max(...[model.lastInspectedAt, model.inspection.checkedAt, model.compatibility?.checkedAt, model.compatibility?.validation?.checkedAt].map((value) => value ? new Date(value).getTime() : 0));
              return (
                <div className="provider-model-row" key={model.id}>
                  <div><strong>{model.name || model.id}</strong>{model.name && model.name !== model.id && <small>{model.id}</small>}{model.description && <small>{model.description}</small>}{model.catalogStatus === "missing" && <small>本次列表未返回 · 已保留</small>}</div>
                  <ModelInspectionResult model={model} compact />
                  {availability.mode === "mixed" ? <div className="provider-capability-list">{["混合对话 ✓", "工具调用 ✓", "结果回传 ✓"].map((label) => <span key={label} className="provider-capability-tag is-success">{label}</span>)}</div> : <CapabilityTags model={model} />}
                  <div className="providers-date">{lastCheckedAt ? formatProviderDate(lastCheckedAt) : "—"}</div>
                  <div className="provider-model-actions"><button className="provider-link-button" type="button" onClick={() => setDetailModelId(model.id)}>详情</button>
                  <button className="provider-link-button" type="button" onClick={() => props.onInspect([model.id])} disabled={Boolean(props.action)}>
                    {modelBusy && <Loader2 className="provider-spin" size={13} />}
                    检测能力
                  </button></div>
                </div>
              );
            })}
            </ModelVendorSection>)}
          </div>
        )}
      </section>

      <div className="provider-detail-danger">
        <div><strong>移除这个服务</strong><span>服务及其模型检测记录会从本机删除。</span></div>
        <button className="btn-danger" type="button" onClick={props.onDelete} disabled={Boolean(props.action)}><Trash2 size={15} />删除服务</button>
      </div>

      {props.provider.inspectionJob?.status === "failed" && <div className="provider-inline-error" role="alert">检测未完成：{props.provider.inspectionJob.error}。已完成的结果已保存，可重新检测。</div>}
      {detailModel && <ModelInspectionDrawer key={detailModel.id} onContextWindow={(value) => props.onContextWindow(detailModel.id, value)} model={detailModel} busy={Boolean(props.action)} inspecting={inspecting} onClose={() => setDetailModelId(undefined)} onInspect={() => props.onInspect([detailModel.id])} />}
      {props.action?.startsWith(`inspect:${props.provider.id}:`) && (
        <div className="provider-progress-card">
          <Loader2 className="provider-spin" size={18} />
          <div><strong>正在检测直接接管与混合接管能力</strong><span>已完成 {props.provider.inspectionJob?.completed ?? 0} / {props.provider.inspectionJob?.total ?? props.provider.models.length} 个模型。每个模型完成两种方式的检测后更新进度，离开页面后检测会继续。</span></div>
        </div>
      )}
    </div>
  );
}
