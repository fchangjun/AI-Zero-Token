import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { CROSS_VENDOR_NOTICE, MIXED_RUNTIME_NOTICE } from "../../../../../src/core/models/mixed-provider";
import type { CodexCatalogMode } from "../types";

export function CodexSwitchDialog(props: {
  title: string;
  detail: string;
  mode?: "direct" | "mixed";
  catalogMode?: CodexCatalogMode;
  onCatalogModeChange?: (mode: CodexCatalogMode) => void;
  autoModelCount?: number;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);

  return (
    <dialog ref={ref} className="codex-switch-dialog" aria-labelledby="codex-switch-title" aria-describedby="codex-switch-detail" aria-busy={props.busy}
      onCancel={(event) => { event.preventDefault(); if (!props.busy) props.onClose(); }}>
      <header>
        <h2 id="codex-switch-title">{props.title}</h2>
        <button className="provider-icon-button" type="button" aria-label="关闭确认框" disabled={props.busy} onClick={props.onClose}><X size={18} /></button>
      </header>
      <p id="codex-switch-detail">{props.detail}</p>
      {props.mode === "direct" && <fieldset className="codex-catalog-options" disabled={props.busy}>
        <legend>模型列表使用方式</legend>
        <label className={props.catalogMode !== "local" ? "is-selected" : ""}>
          <input type="radio" name="codex-catalog-mode" value="dynamic" checked={props.catalogMode !== "local"} onChange={() => props.onCatalogModeChange?.("dynamic")} />
          <span><strong>显示模型状态</strong><small>在 Codex 中显示并更新模型运行状态。每次使用前先启动 AZT，等待管理页加载完成后再打开 Codex；使用期间保持 AZT 运行。</small></span>
        </label>
        <label className={props.catalogMode === "local" ? "is-selected" : ""}>
          <input type="radio" name="codex-catalog-mode" value="local" checked={props.catalogMode === "local"} onChange={() => props.onCatalogModeChange?.("local")} />
          <span><strong>独立使用 · 本地模型列表</strong><small>不显示动态模型状态。所选模型和能力保存在本地，电脑重启后无需打开 AZT 即可使用 Codex。修改模型列表后需重新保存接入。</small></span>
        </label>
        <p>两种方式的对话请求都直接发送到本渠道。仅在确认接入后应用所选方式。</p>
      </fieldset>}
      {props.mode && <div className="codex-switch-risks"><p>{CROSS_VENDOR_NOTICE}</p>{props.mode === "mixed" && <p>{MIXED_RUNTIME_NOTICE}</p>}</div>}
      {Boolean(props.autoModelCount) && <p className="codex-switch-note">确认后将为 {props.autoModelCount} 个模型自动识别接口，优先复用已确认的结果。未确认的模型最多发送 3 次短请求，每次输出上限 32 token，服务商可能计费。识别未完成时会提示重试，当前接入配置会保留。</p>}
      <div className="codex-switch-steps">
        <strong>请先完全退出 Codex，再继续</strong>
        <ol>
          <li>等待所有任务结束，保存需要保留的内容。</li>
          <li>退出承载 Codex 的 ChatGPT / Codex 客户端（macOS 使用 ⌘Q），并结束其他 CLI / IDE 中的 Codex 会话。</li>
          <li>返回这里，点击“已关闭，继续”。操作完成后再打开 Codex。</li>
        </ol>
      </div>
      <p className="codex-switch-note">确认前不会修改设置，也不会开始计时。确认后，退出检查最多等待 15 秒；超时可处理后重试。macOS 桌面版会尝试正常退出仍打开的空闲客户端。</p>
      {props.busy && <div className="codex-switch-progress" role="status"><Loader2 className="provider-spin" size={18} /><span>{props.autoModelCount ? "正在识别接口并准备接管，请保持 Codex 关闭……" : "正在检查退出状态并切换，请保持 Codex 关闭……"}</span></div>}
      {props.error && <div className="codex-switch-error" role="alert"><AlertCircle size={18} /><span>{props.error}</span></div>}
      <footer>
        <button className="btn-secondary" type="button" disabled={props.busy} onClick={props.onClose}>取消</button>
        <button className="btn-primary" type="button" disabled={props.busy} onClick={props.onConfirm}>{props.busy ? "正在处理…" : props.error ? "重新检查并继续" : "已关闭，继续"}</button>
      </footer>
    </dialog>
  );
}
