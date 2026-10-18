import { useEffect, useState } from "react";
import { MAX_CONTEXT_WINDOW } from "../../../../../src/core/models/context-window";
import { Loader2, ShieldCheck, X } from "lucide-react";
import type { ProviderModel } from "../types";
import { CapabilityTags } from "./CapabilityTags";
import { InspectionStatusBadge } from "./StatusBadge";
import { formatProviderDate } from "./ProvidersList";
import { useDialogFocus } from "./useDialogFocus";
import { ModelInspectionResult } from "./ModelInspectionResult";
import { TakeoverContextWindow } from "./TakeoverContextWindow";
import { sharesResponsesInspection } from "../takeover-availability";

export function ModelInspectionDrawer({ model, busy, inspecting, onClose, onInspect, onContextWindow }: {
  onContextWindow: (value: number | null) => Promise<void>;
  inspecting?: boolean;
  model: ProviderModel; busy: boolean; onClose: () => void; onInspect: () => void;
}) {
  const ref = useDialogFocus(true, onClose);
  const storedWindow = model.contextWindowOverride ?? model.contextWindow;
  const [windowValue, setWindowValue] = useState(storedWindow === undefined ? "" : String(storedWindow));
  const [windowError, setWindowError] = useState("");
  const [savingWindow, setSavingWindow] = useState(false);
  useEffect(() => { setWindowValue(storedWindow === undefined ? "" : String(storedWindow)); }, [storedWindow, model.id]);
  async function saveWindow(value: number | null) {
    setWindowError("");
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > MAX_CONTEXT_WINDOW)) {
      setWindowError("请输入 1 到 4,000,000 之间的整数。");
      return;
    }
    setSavingWindow(true);
    try {
      await onContextWindow(value);
      if (value === null) setWindowValue(model.contextWindow === undefined ? "" : String(model.contextWindow));
    } catch (error) {
      setWindowError(error instanceof Error ? error.message : String(error));
    } finally { setSavingWindow(false); }
  }
  return <div className="provider-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={ref} className="provider-drawer" role="dialog" aria-modal="true" aria-labelledby="model-detail-title">
      <div className="provider-drawer-head"><div><h2 id="model-detail-title">{model.name || model.id}</h2><p>{model.id}</p></div><button className="provider-icon-button" type="button" aria-label="关闭模型详情" onClick={onClose}><X size={19} /></button></div>
      <div className="provider-drawer-body provider-model-detail-body">
        <section className="provider-inspection-section">
          <h3>接管能力检测</h3>
          <ModelInspectionResult model={model} inspecting={inspecting} />
          <p className="provider-model-message">一次检测覆盖两种接管方式；Responses 共用检测结果，只有 Chat / Claude 接口转换才追加对话、工具调用和结果回传验证。接入时会复用识别结果。</p>
          <p className="provider-model-message">检测会发送少量测试请求，服务商可能计费；使用模拟工具验证，不执行真实工具，不更改当前接入。</p>
          <details className="provider-inspection-details"><summary>查看能力详情与检测记录</summary>
            <h4>直接接管</h4><p className="provider-model-message">{model.inspection.message || (model.inspection.status === "unknown" ? "尚未检测。" : "本次直接接管检测已完成。")}</p><CapabilityTags model={model} />
            <h4>混合接管</h4><p className="provider-model-message">{sharesResponsesInspection(model) ? model.inspection.message ?? "共用 Responses 能力检测结果，无需重复请求。" : model.compatibility?.validation?.message ?? model.compatibility?.message ?? "尚未检测。"}</p>
            {!!model.inspection.history?.length && <><h4>直接接管历史记录</h4><p className="provider-model-message">保留最近 12 次检测。</p>{model.inspection.history.map((entry, index) => <div className="provider-inspection-history" key={`${entry.checkedAt}-${index}`}><div><InspectionStatusBadge status={entry.status} /><span>{formatProviderDate(entry.checkedAt)}</span></div><p>{entry.message || "能力检测完成"}</p>{entry.latencyMs !== undefined && <small>检测耗时 {Math.round(entry.latencyMs)} ms</small>}</div>)}</>}
          </details>
        </section>
        <section>
          <h3>上下文窗口</h3>
          <div className="provider-context-modes">
            <div><strong>直接接管</strong><TakeoverContextWindow model={model} mode="direct" activeWindow={model.activeDirectContextWindow} /></div>
            <div><strong>混合接管</strong><TakeoverContextWindow model={model} mode="mixed" protocol={model.compatibility?.status === "identified" ? model.compatibility.protocol : sharesResponsesInspection(model) ? "responses" : undefined} /></div>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void saveWindow(Number(windowValue)); }}>
            <label className="provider-form-field"><span>手动窗口大小（tokens，两种方式共用）</span><input className="input" type="number" min={1} max={MAX_CONTEXT_WINDOW} step={1} required placeholder="填写后覆盖自动值" value={windowValue} onChange={(event) => setWindowValue(event.target.value)} disabled={busy || savingWindow} /></label>
            <p className="provider-model-message">优先使用手动设置，其次使用渠道返回值；未提供时，Chat / Claude 兼容转换默认 128,000，直接接管 / Responses 沿用 272,000。默认值未验证模型实际上限；保存后需重新接入 Codex，已有接入配置会保留。</p>
            <div className="provider-detail-actions"><button className="btn-primary" type="submit" disabled={busy || savingWindow}>保存窗口</button><button className="btn-secondary" type="button" disabled={busy || savingWindow || model.contextWindowOverride === undefined} onClick={() => void saveWindow(null)}>恢复自动</button></div>
            {windowError && <p className="provider-inline-error" role="alert">{windowError}</p>}
          </form>
        </section>
      </div>
      <div className="provider-drawer-footer"><button className="btn-secondary" type="button" onClick={onClose}>关闭</button><button className="btn-primary" type="button" onClick={onInspect} disabled={busy}>{inspecting ? <Loader2 className="provider-spin" size={16} /> : <ShieldCheck size={16} />}{inspecting ? "正在检测…" : "检测能力"}</button></div>
    </aside>
  </div>;
}
