import { useEffect, useState } from "react";
import { DEFAULT_CONTEXT_WINDOW, MAX_CONTEXT_WINDOW } from "../../../../../src/core/models/context-window";
import { ShieldCheck, X } from "lucide-react";
import type { ProviderModel } from "../types";
import { CapabilityTags } from "./CapabilityTags";
import { InspectionStatusBadge } from "./StatusBadge";
import { formatProviderDate } from "./ProvidersList";
import { useDialogFocus } from "./useDialogFocus";

export function ModelInspectionDrawer({ model, busy, onClose, onInspect, onContextWindow }: {
  onContextWindow: (value: number | null) => Promise<void>;
  model: ProviderModel; busy: boolean; onClose: () => void; onInspect: () => void;
}) {
  const ref = useDialogFocus(true, onClose);
  const effectiveWindow = model.effectiveContextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const [windowValue, setWindowValue] = useState(String(effectiveWindow));
  const [windowError, setWindowError] = useState("");
  const [savingWindow, setSavingWindow] = useState(false);
  useEffect(() => { setWindowValue(String(effectiveWindow)); }, [effectiveWindow, model.id]);
  async function saveWindow(value: number | null) {
    setWindowError("");
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > MAX_CONTEXT_WINDOW)) {
      setWindowError("请输入 1 到 4,000,000 之间的整数。");
      return;
    }
    setSavingWindow(true);
    try {
      await onContextWindow(value);
      if (value === null) setWindowValue(String(model.contextWindow ?? DEFAULT_CONTEXT_WINDOW));
    } catch (error) {
      setWindowError(error instanceof Error ? error.message : String(error));
    } finally { setSavingWindow(false); }
  }
  return <div className="provider-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={ref} className="provider-drawer" role="dialog" aria-modal="true" aria-labelledby="model-detail-title">
      <div className="provider-drawer-head"><div><h2 id="model-detail-title">{model.name || model.id}</h2><p>{model.id}</p></div><button className="provider-icon-button" type="button" aria-label="关闭模型详情" onClick={onClose}><X size={19} /></button></div>
      <div className="provider-drawer-body provider-model-detail-body">
        <section>
          <h3>上下文窗口</h3>
          <p className="provider-model-message">当前设置：{effectiveWindow.toLocaleString()} tokens · {model.contextWindowSource === "manual" ? "手动设置" : model.contextWindowSource === "api" ? "接口返回" : "默认值"}</p>
          <form onSubmit={(event) => { event.preventDefault(); void saveWindow(Number(windowValue)); }}>
            <label className="provider-form-field"><span>窗口大小（tokens）</span><input className="input" type="number" min={1} max={MAX_CONTEXT_WINDOW} step={1} required value={windowValue} onChange={(event) => setWindowValue(event.target.value)} disabled={busy || savingWindow} /></label>
            <p className="provider-model-message">自动使用接口返回值；接口未提供时默认 272,000。手动设置会保留，保存后需重新接入 Codex 生效。</p>
            <div className="provider-detail-actions"><button className="btn-primary" type="submit" disabled={busy || savingWindow}>保存窗口</button><button className="btn-secondary" type="button" disabled={busy || savingWindow || model.contextWindowOverride === undefined} onClick={() => void saveWindow(null)}>恢复自动</button></div>
            {windowError && <p className="provider-inline-error" role="alert">{windowError}</p>}
          </form>
        </section>
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
