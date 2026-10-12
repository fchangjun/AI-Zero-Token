import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function CodexSwitchDialog(props: {
  title: string;
  detail: string;
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
      <div className="codex-switch-steps">
        <strong>请先完全退出 Codex，再继续</strong>
        <ol>
          <li>等待所有任务结束，保存需要保留的内容。</li>
          <li>退出承载 Codex 的 ChatGPT / Codex 客户端（macOS 使用 ⌘Q），并结束其他 CLI / IDE 中的 Codex 会话。</li>
          <li>返回这里，点击“已关闭，继续”。操作完成后再打开 Codex。</li>
        </ol>
      </div>
      <p className="codex-switch-note">确认前不会修改设置，也不会开始计时。确认后，退出检查最多等待 15 秒；超时可处理后重试。macOS 桌面版会尝试正常退出仍打开的空闲客户端。</p>
      {props.busy && <div className="codex-switch-progress" role="status"><Loader2 className="provider-spin" size={18} /><span>正在检查退出状态并切换，请保持 Codex 关闭……</span></div>}
      {props.error && <div className="codex-switch-error" role="alert"><AlertCircle size={18} /><span>{props.error}</span></div>}
      <footer>
        <button className="btn-secondary" type="button" disabled={props.busy} onClick={props.onClose}>取消</button>
        <button className="btn-primary" type="button" disabled={props.busy} onClick={props.onConfirm}>{props.busy ? "正在处理…" : props.error ? "重新检查并继续" : "已关闭，继续"}</button>
      </footer>
    </dialog>
  );
}
