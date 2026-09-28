import { CheckCircle2, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useDialogFocus } from "./useDialogFocus";
import type { ApiProvider, ProviderDraft, ProviderModelSource } from "../types";

function splitModelIds(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

export function ProviderDrawer(props: {
  open: boolean;
  provider: ApiProvider | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (draft: ProviderDraft) => Promise<void>;
}) {
  const dialogRef = useDialogFocus(props.open, props.onClose, props.saving);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [modelSource, setModelSource] = useState<ProviderModelSource>("auto");
  const [manualModels, setManualModels] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName(props.provider?.name ?? "");
    setBaseUrl(props.provider?.baseUrl ?? "");
    setApiToken("");
    setModelSource(props.provider?.modelSource ?? "auto");
    setManualModels(props.provider?.modelSource === "manual" ? props.provider.models.map((model) => model.id).join("\n") : "");
    setShowToken(false);
    setLocalError("");
  }, [props.open, props.provider]);

  const manualModelIds = useMemo(() => splitModelIds(manualModels), [manualModels]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim();
    if (!trimmedName || !trimmedBaseUrl) {
      setLocalError("请填写服务名称和 API Base URL。");
      return;
    }
    if (!props.provider && !apiToken.trim()) {
      setLocalError("请填写 API Token。");
      return;
    }
    if (modelSource === "manual" && !manualModelIds.length) {
      setLocalError("请至少填写一个模型 ID。");
      return;
    }
    setLocalError("");
    await props.onSave({
      name: trimmedName,
      baseUrl: trimmedBaseUrl,
      apiToken: apiToken.trim(),
      modelSource,
      manualModelIds,
    });
  }

  if (!props.open) return null;
  return (
    <div className="provider-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !props.saving) props.onClose(); }}>
      <aside ref={dialogRef} className="provider-drawer" role="dialog" aria-modal="true" aria-labelledby="provider-drawer-title">
        <div className="provider-drawer-head">
          <div>
            <h2 id="provider-drawer-title">{props.provider ? "编辑 API 服务" : "添加 API 服务"}</h2>
            <p>输入服务地址并获取 API 返回的全部模型，能力检测稍后进行。</p>
          </div>
          <button className="provider-icon-button" type="button" onClick={props.onClose} disabled={props.saving} aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        <form className="provider-drawer-form" onSubmit={submit}>
          <div className="provider-drawer-body">
            <label className="provider-form-field">
              <span>服务名称 <b>*</b></span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：公司 OneAPI" maxLength={120} />
              <small>给这个连接起一个容易辨认的名字。</small>
            </label>
            <label className="provider-form-field">
              <span>API Base URL <b>*</b></span>
              <input className="input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://oneapi.example.com/v1" inputMode="url" maxLength={2048} />
              <small>填写服务提供的 OpenAI 兼容 API 地址。</small>
            </label>
            <label className="provider-form-field">
              <span>API Token {props.provider ? "" : "*"}</span>
              <div className="provider-token-field">
                <input
                  className="input"
                  value={apiToken}
                  onChange={(event) => setApiToken(event.target.value)}
                  placeholder={props.provider?.tokenConfigured ? "留空则保留当前 Token" : "sk-..."}
                  type={showToken ? "text" : "password"}
                  autoComplete="off" maxLength={16384}
                />
                <button type="button" onClick={() => setShowToken((value) => !value)} aria-label={showToken ? "隐藏 Token" : "显示 Token"}>
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <small>凭据只保存在本机。编辑时留空会继续使用现有 Token。</small>
            </label>

            <fieldset className="provider-source-fieldset">
              <legend>模型获取方式</legend>
              <label className={modelSource === "auto" ? "is-selected" : ""}>
                <input type="radio" name="model-source" checked={modelSource === "auto"} onChange={() => setModelSource("auto")} />
                <span><strong>自动获取模型列表</strong><small>保存后从 API 的模型接口同步</small></span>
                <em>推荐</em>
              </label>
              <label className={modelSource === "manual" ? "is-selected" : ""}>
                <input type="radio" name="model-source" checked={modelSource === "manual"} onChange={() => setModelSource("manual")} />
                <span><strong>手动填写模型 ID</strong><small>适用于没有模型列表接口的服务</small></span>
              </label>
            </fieldset>

            {modelSource === "manual" && (
              <label className="provider-form-field">
                <span>模型 ID <b>*</b></span>
                <textarea className="provider-model-id-input" value={manualModels} onChange={(event) => setManualModels(event.target.value)} placeholder={"deepseek-chat\nqwen-coder"} />
                <small>每行一个模型 ID，也可以使用逗号分隔。当前识别 {manualModelIds.length} 个。</small>
              </label>
            )}

            <div className="provider-drawer-note">
              <CheckCircle2 size={17} />
              <span>获取模型不会改变当前 Codex 接入。所有返回的模型都会显示，检测状态只作提示。</span>
            </div>
            {(localError || props.error) && <div className="provider-inline-error">{localError || props.error}</div>}
          </div>

          <div className="provider-drawer-footer">
            <button className="btn-secondary" type="button" onClick={props.onClose} disabled={props.saving}>取消</button>
            <button className="btn-primary" type="submit" disabled={props.saving}>
              {props.saving && <Loader2 className="provider-spin" size={16} />}
              {props.provider ? "保存更改" : modelSource === "auto" ? "保存并获取模型" : "保存服务"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
