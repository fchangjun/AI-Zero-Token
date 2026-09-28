import { Loader2, PlugZap, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig } from "@/shared/types";
import { errorMessage } from "@/shared/lib/app-utils";
import { isAccountPoolGateway, sameGatewayUrl } from "../account-pool";

export function GatewayConnection(props: {
  config: AdminConfig;
  mode?: "local" | "remote";
  setConfig: (config: AdminConfig) => void;
  setStatus: (message: string) => void;
  onApplied: () => Promise<unknown>;
}) {
  const mode = props.mode ?? "local";
  const gateway = props.config.codex.gatewayProvider;
  const localUrl = props.config.codexBaseUrl;
  const activeNative = gateway.active && isAccountPoolGateway(gateway);
  const activeHere = activeNative && (mode === "local" ? sameGatewayUrl(gateway.baseUrl, localUrl) : !sameGatewayUrl(gateway.baseUrl, localUrl));
  const [url, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [providerId, setProviderId] = useState("openai");
  const [token, setToken] = useState("");
  const [useKey, setUseKey] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (dirty) return;
    setUrl(activeHere ? gateway.baseUrl || "" : "");
    setModel(activeHere ? gateway.model || "" : props.config.status.defaultModel);
    setProviderId(activeHere && gateway.providerId === "ai-zero-token" ? "ai-zero-token" : "openai");
    setUseKey(activeHere && gateway.authType === "bearer_token");
  }, [props.config, mode, dirty]);
  const keyed = mode === "local" ? Boolean(props.config.gatewayAccess?.enabled) : useKey;
  function showMessage(value: string) { setMessage(value); props.setStatus(value); }
  async function apply(disconnect = false) {
    setBusy(true);
    try {
      let baseUrl = mode === "local" ? localUrl : url.trim();
      if (!disconnect) {
        if (!baseUrl) throw new Error("请填写远程网关地址。");
        if (!/^[a-z][a-z\d+.-]*:\/\//i.test(baseUrl)) baseUrl = `http://${baseUrl}`;
        const parsed = new URL(baseUrl);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("请填写不含凭据、查询参数的 HTTP 或 HTTPS 地址。");
        if (["/", "/v1", "/codex"].includes(parsed.pathname.replace(/\/$/, "") || "/")) parsed.pathname = "/codex/v1";
        baseUrl = parsed.toString().replace(/\/+$/, "");
        if (mode === "remote" && sameGatewayUrl(baseUrl, localUrl)) throw new Error("这是本机服务，请到“对外提供 API”接入本机 Codex。");
      }
      const result = await fetchJson<{ config: AdminConfig }>(`/_gateway/admin/codex/${disconnect ? "remove-provider" : "configure-provider"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(disconnect ? { providerId: gateway.providerId } : {
          baseUrl, kind: "codex_gateway", providerId: keyed ? "azt_gateway" : providerId, model: model.trim() || undefined,
          ...(mode === "remote" ? { bearerToken: useKey ? token.trim() || undefined : "" } : {}),
        }),
      });
      props.setConfig(result.config);
      setDirty(false); setToken("");
      await props.onApplied();
      showMessage(disconnect ? "已解除本机 Codex 接入。API 服务继续运行。" : "接入配置已保存，重启 Codex 后生效。API 服务继续运行。");
    } catch (error) { showMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="settings-section gateway-client-card">
    <div className="gateway-section-head"><div><h3>{mode === "local" ? "本机 Codex 接入" : "接入远程 AI Zero Token"}</h3><p>{mode === "local" ? "让本机 Codex 使用这个 API 服务。" : "填写另一台设备提供的网关地址，使用其账号池。"}</p></div><span className={`provider-status-badge ${activeHere ? "is-success" : "is-neutral"}`}>{activeHere ? "已接入" : "未接入"}</span></div>
    <div className="gateway-client-fields">
      <label className="field"><span>Codex Base URL</span><input className="input" value={mode === "local" ? localUrl : url} readOnly={mode === "local"} onChange={e => { setUrl(e.target.value); setDirty(true); }} placeholder="http://192.168.1.10:8787/codex/v1" disabled={busy} /></label>
      <label className="field"><span>Codex 默认模型</span>{mode === "local" ? <select className="control" value={model} onChange={e => { setModel(e.target.value); setDirty(true); }} disabled={busy}>
        {!props.config.models.some(m => m.id === model) && model && <option value={model}>{model}</option>}
        {props.config.models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
      </select> : <input className="input" value={model} onChange={e => { setModel(e.target.value); setDirty(true); }} placeholder="远程网关支持的模型 ID" disabled={busy} />}</label>
    </div>
    {mode === "remote" && <div className="gateway-remote-key"><label className="switch-line"><input type="checkbox" checked={useKey} onChange={e => { setUseKey(e.target.checked); setDirty(true); }} disabled={busy} /><span>远程网关需要 API 访问密钥</span></label>{useKey && <label className="field"><span>API 访问密钥</span><input className="input" type="password" autoComplete="off" value={token} onChange={e => { setToken(e.target.value); setDirty(true); }} placeholder="同一地址留空可沿用已保存密钥" disabled={busy} /></label>}</div>}
    {!keyed && <details className="gateway-compatibility"><summary>高级设置 · 历史兼容</summary><label className="field"><span>Codex 接入方式</span><select className="control" value={providerId} onChange={e => { setProviderId(e.target.value); setDirty(true); }} disabled={busy}><option value="openai">原生 OpenAI（保留原生历史归属）</option><option value="ai-zero-token">AI Zero Token 独立服务</option></select></label></details>}
    {keyed && <p className="hint">使用带访问密钥的独立服务配置，沿用 Codex 模型目录。</p>}
    <div className="gateway-inline-actions"><button className="btn-primary" type="button" onClick={() => void apply()} disabled={busy || (mode === "remote" && (!url.trim() || (useKey && !token.trim() && !(activeHere && sameGatewayUrl(url, gateway.baseUrl) && gateway.authType === "bearer_token"))))}>{busy ? <Loader2 className="provider-spin" size={15} /> : <PlugZap size={15} />}{activeHere ? "更新接入" : "接入 Codex"}</button>{activeHere && <button className="btn-secondary" type="button" onClick={() => void apply(true)} disabled={busy}><Unplug size={15} />解除接入</button>}</div>
    {message && <p className="providers-notice" role="status">{message}</p>}
  </section>;
}
