import { Info, Loader2, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import type { ModelStatusSettings } from "../types";

export function ModelStatusControls({ settings, busy, onInterval, onCheck }: {
  settings?: ModelStatusSettings; busy: boolean;
  onInterval: (minutes: ModelStatusSettings["intervalMinutes"]) => void; onCheck: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();
  if (!settings) return null;
  return <section className="model-status-controls" aria-label="模型运行状态">
    <div className="model-status-controls-head">
      <div className="model-status-heading"><strong>模型运行状态</strong><span>{settings.intervalMinutes ? "AZT 运行期间自动检测" : "自动检测已关闭"} · 检测可能产生费用</span></div>
      <div className="model-status-actions">
        <label>自动检测<select aria-label="模型状态检测周期" value={settings.intervalMinutes} disabled={busy} onChange={(event) => onInterval(Number(event.target.value) as ModelStatusSettings["intervalMinutes"])}>
          <option value={0}>关闭</option><option value={15}>每 15 分钟</option><option value={30}>每 30 分钟（推荐）</option><option value={60}>每 60 分钟</option>
        </select></label>
        <button type="button" className="btn-secondary" disabled={busy || settings.job.running || !settings.enabled} onClick={onCheck}>
          {settings.job.running ? <Loader2 size={14} className="provider-spin" /> : <RefreshCw size={14} />}{settings.job.running ? `检测中 ${settings.job.completed}/${settings.job.total}` : "检测全部模型"}
        </button>
        <button type="button" className="model-status-help" aria-label="模型状态检测说明" aria-expanded={showDetails} aria-controls={detailsId} onClick={() => setShowDetails((value) => !value)}>
          <Info size={14} />{showDetails ? "收起" : "说明"}
        </button>
      </div>
    </div>
    <div id={detailsId} className="model-status-details" hidden={!showDetails}>
      <p>绿 · 畅通　黄 · 拥堵　红 · 不可用。灰色表示未检测、待确认或待刷新；悬停可查看上次检测时间与原因。</p>
      <p>自动检测开启时，AZT 启动后即检查已保存渠道中未检测或到期的模型，无需先接入或打开 Codex。之后按所选周期刷新，未到期的结果会复用；退出 AZT 后停止检测。</p>
      <p>手动检测覆盖全部已保存模型；自动检测每批最多 20 个，剩余到期模型在后续轮询中继续检测。每个模型按当前接入、已保存或已识别的接口发送一次短请求，尚未识别时检查 Responses。输出上限 32 token，服务商可能计费；不重复检测兼容性、工具、图片或推理档位。</p>
      <p>{settings.enabled ? "完成 Codex 接入后，动态目录会使用这些状态。Codex 按自身缓存刷新，可能延迟数分钟；读取目录不消耗模型 token。" : "请先添加渠道并同步或保存模型。"}</p>
    </div>
    {settings.job.error && <div className="provider-inline-error" role="alert">{settings.job.error}</div>}
  </section>;
}
