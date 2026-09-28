import { ShieldCheck, X } from "lucide-react";
import type { ProviderModel } from "../types";
import { CapabilityTags } from "./CapabilityTags";
import { InspectionStatusBadge } from "./StatusBadge";
import { formatProviderDate } from "./ProvidersList";
import { useDialogFocus } from "./useDialogFocus";

export function ModelInspectionDrawer({ model, busy, onClose, onInspect }: {
  model: ProviderModel; busy: boolean; onClose: () => void; onInspect: () => void;
}) {
  const ref = useDialogFocus(true, onClose);
  return <div className="provider-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={ref} className="provider-drawer" role="dialog" aria-modal="true" aria-labelledby="model-detail-title">
      <div className="provider-drawer-head"><div><h2 id="model-detail-title">{model.name || model.id}</h2><p>{model.id}</p></div><button className="provider-icon-button" type="button" aria-label="关闭模型详情" onClick={onClose}><X size={19} /></button></div>
      <div className="provider-drawer-body provider-model-detail-body">
        <section><h3>本次检测</h3><InspectionStatusBadge status={model.inspection.status} /><p className="provider-model-message">{model.inspection.message || (model.inspection.status === "unknown" ? "尚未检测。可以直接勾选接入 Codex，也可以先验证能力。" : "本次检测已完成。")}</p><CapabilityTags model={model} /></section>
        <section><h3>检测记录</h3><p className="provider-model-message">保留最近 12 次检测，失败时可查看具体原因。</p>
          {!model.inspection.history?.length && <p className="provider-model-message">暂无检测记录。</p>}
          {model.inspection.history?.map((entry, index) => <div className="provider-inspection-history" key={`${entry.checkedAt}-${index}`}><div><InspectionStatusBadge status={entry.status} /><span>{formatProviderDate(entry.checkedAt)}</span></div><p>{entry.message || "能力检测完成"}</p>{entry.latencyMs !== undefined && <small>检测耗时 {Math.round(entry.latencyMs)} ms</small>}</div>)}
        </section>
      </div>
      <div className="provider-drawer-footer"><button className="btn-secondary" type="button" onClick={onClose}>关闭</button><button className="btn-primary" type="button" onClick={onInspect} disabled={busy}><ShieldCheck size={16} />重新检测</button></div>
    </aside>
  </div>;
}
