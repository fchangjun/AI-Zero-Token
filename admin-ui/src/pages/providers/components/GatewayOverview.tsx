import { Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchJson } from "@/shared/api";
import { copyText, errorMessage } from "@/shared/lib/app-utils";
import type { AdminConfig, GatewayShareInfo } from "@/shared/types";
import { GatewayConnection } from "./GatewayConnection";

type Access = { enabled: boolean; apiKey: string | null; invalid?: boolean };
export function GatewayOverview(props: { config: AdminConfig; setConfig: (config: AdminConfig) => void; setStatus: (message: string) => void; refresh: () => Promise<unknown> }) {
  const [share, setShare] = useState<GatewayShareInfo | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    setError("");
    try {
      const [nextShare, nextAccess] = await Promise.all([fetchJson<GatewayShareInfo>("/_gateway/admin/share"), fetchJson<Access>("/_gateway/admin/api-access")]);
      setShare(nextShare); setAccess(nextAccess);
    } catch (error) { setError(errorMessage(error)); }
  }
  useEffect(() => { void load(); }, [props.config.gatewayAccess?.enabled, props.config.status.serverPort]);
  function status(value: string) { setMessage(value); props.setStatus(value); }
  async function copy(value: string, label: string) {
    status(await copyText(value) ? `${label}已复制。` : "复制失败，请检查剪贴板权限。");
  }
  async function update(action: "enable" | "rotate" | "disable") {
    if (action === "rotate" && !window.confirm("更换后旧密钥立即失效，其他客户端需要更新密钥。确定更换吗？")) return;
    if (action === "disable" && !window.confirm("关闭后 API 调用不再校验访问密钥。确定关闭吗？")) return;
    setBusy(true);
    try {
      const result = await fetchJson<Access & { config: AdminConfig; codexUpdated: boolean }>("/_gateway/admin/api-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      setAccess(result); props.setConfig(result.config);
      status(`${action === "disable" ? "已关闭 API 访问密钥校验" : "API 访问密钥已生效"}。${result.codexUpdated ? "本机 Codex 接入配置已同步更新，重启 Codex 后生效。" : ""}${action === "disable" ? "" : "请复制密钥用于客户端配置。"}`);
    } catch (error) { status(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const local = share?.local;
  const remote = share?.primary;
  const configuration = (target: NonNullable<typeof local>) => `AI Zero Token API\nOpenAI Base URL: ${target.baseUrl}\nCodex Base URL: ${target.codexBaseUrl}\nAPI Key: ${access?.apiKey || "local"}\n默认模型: ${props.config.status.defaultModel}`;
  return <>
    {error && <div className="provider-inline-error" role="alert">{error}<button className="btn-secondary" type="button" onClick={() => void load()}><RefreshCw size={14} />重试</button></div>}
    <section className="settings-section gateway-endpoints">
      <div className="gateway-section-head"><div><h3>API 调用地址</h3><p>选择调用方所在位置，复制对应配置。</p></div><div className="gateway-inline-actions"><a className="btn-secondary" href="#tester">接口测试</a><a className="btn-secondary" href="#usage">调用统计</a><a className="btn-secondary" href="#logs">请求日志</a></div></div>
      <div className="gateway-address-grid">
        <div><h4>本机调用</h4><span>OpenAI 兼容接口</span><code>{local?.baseUrl || props.config.baseUrl}</code><span>Codex Responses</span><code>{local?.codexBaseUrl || props.config.codexBaseUrl}</code><button className="btn-secondary" type="button" disabled={!local || !access} onClick={() => local && void copy(configuration(local), "本机调用配置")}><Copy size={14} />复制本机配置</button></div>
        <div><h4>局域网调用</h4>{remote ? <><span>OpenAI 兼容接口</span><code>{remote.baseUrl}</code><span>Codex Responses</span><code>{remote.codexBaseUrl}</code><button className="btn-secondary" type="button" disabled={!access} onClick={() => void copy(configuration(remote), "局域网调用配置")}><Copy size={14} />复制局域网配置</button></> : <p className="hint">{share?.lanReachable ? "当前未发现可用的局域网地址。" : "当前服务仅监听本机地址。"}</p>}</div>
      </div>
      <details className="gateway-call-example"><summary>调用示例</summary><pre>{`curl ${local?.baseUrl || props.config.baseUrl}/chat/completions \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer ${access?.enabled ? "<你的 API 访问密钥>" : "local"}' \\\n  -d '${JSON.stringify({model: props.config.status.defaultModel, messages: [{role: "user", content: "你好"}]})}'`}</pre></details>
    </section>
    <section className="settings-section gateway-access-card">
      <div className="gateway-section-head"><div><h3><KeyRound size={17} /> API 访问密钥</h3><p>{access?.enabled ? "模型调用需要携带 Bearer 密钥。密钥用于 API 调用，管理操作在本机进行。" : "当前沿用免密调用，客户端 API Key 可填写 local。启用后所有模型接口都会校验密钥。"}</p></div><span className={`provider-status-badge ${access?.enabled ? "is-success" : "is-neutral"}`}>{access === null ? "正在读取" : access.enabled ? "已启用" : "未启用"}</span></div>
      {access?.invalid && <div className="provider-inline-error" role="alert">访问密钥配置已损坏，模型接口已安全停用。请重新生成密钥，或关闭密钥校验以修复配置。</div>}
      {access?.apiKey && <div className="gateway-key-value"><code>{access.apiKey.slice(0, 8)}••••••••••••••••{access.apiKey.slice(-4)}</code><button className="btn-secondary" type="button" onClick={() => void copy(access.apiKey!, "访问密钥")} disabled={busy}><Copy size={14} />复制密钥</button></div>}
      <div className="gateway-inline-actions">{!access?.enabled ? <button className="btn-primary" type="button" onClick={() => void update("enable")} disabled={busy || !access}>{busy && <Loader2 className="provider-spin" size={14} />}生成并启用密钥</button> : <><button className="btn-secondary" type="button" onClick={() => void update("rotate")} disabled={busy}>更换密钥</button><button className="btn-secondary" type="button" onClick={() => void update("disable")} disabled={busy}>关闭密钥校验</button></>}</div>
    </section>
    {message && <div className="providers-notice" role="status">{message}</div>}
    <GatewayConnection config={props.config} setConfig={props.setConfig} setStatus={props.setStatus} onApplied={props.refresh} />
  </>;
}
