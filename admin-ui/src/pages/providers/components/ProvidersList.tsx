import { ArrowRight, Boxes, Plus, Search, ServerCog } from "lucide-react";
import { useMemo, useState } from "react";
import type { ApiProvider } from "../types";
import { CodexStatusBadge, ConnectionStatusBadge } from "./StatusBadge";

function compactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function providerInitial(provider: ApiProvider): string {
  return [...provider.name.trim()][0]?.toUpperCase() ?? "A";
}

export function formatProviderDate(value?: string | number): string {
  if (value === undefined) return "尚未同步";
  const rawDate = typeof value === "number" && value < 10_000_000_000 ? value * 1_000 : value;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return String(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function ProvidersList(props: {
  providers: ApiProvider[];
  activeProvider: ApiProvider | null;
  onAdd: () => void;
  onOpenRemote: () => void;
  onOpen: (provider: ApiProvider) => void;
  onOpenCodex: (provider: ApiProvider) => void;
}) {
  const [search, setSearch] = useState("");
  const activeProvider = props.activeProvider;
  const filteredProviders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return props.providers;
    return props.providers.filter((provider) => `${provider.name} ${provider.baseUrl}`.toLowerCase().includes(query));
  }, [props.providers, search]);

  return (
    <div className="providers-list-view">
      <div className="providers-page-head">
        <div>
          <span className="providers-page-kicker">模型服务</span>
          <h1>模型与服务</h1>
          <p>管理外部模型服务，选择模型接入 Codex。</p>
        </div>
        <div className="provider-detail-actions"><button className="btn-secondary" type="button" onClick={props.onOpenRemote}>接入远程 AI Zero Token</button><button className="btn-primary" type="button" onClick={props.onAdd}><Plus size={16} />添加外部 API</button></div>
      </div>

      {activeProvider && (
        <section className="provider-active-card">
          <div className="provider-active-icon"><Boxes size={21} /></div>
          <div className="provider-active-copy">
            <span>当前接入 Codex</span>
            <div><strong>{activeProvider.name}</strong><span className="provider-status-badge is-success">已接入</span></div>
            <p>默认模型 {activeProvider.defaultModelId || "尚未设置"} · {activeProvider.kind === "account_pool" ? activeProvider.remoteGateway ? "通过远程网关调用" : `${activeProvider.accountCount} 个本机账号 · 使用 Codex 模型目录` : `${activeProvider.models.filter((model) => model.selectedForCodex).length} 个模型显示在 Codex 中`}</p>
          </div>
          <button className="btn-secondary" type="button" onClick={() => props.onOpenCodex(activeProvider)}>管理接入</button>
        </section>
      )}

      <section className="providers-surface">
        <div className="providers-surface-head">
          <div>
            <h2>外部 API 服务</h2>
            <p>配置 API 地址、密钥和模型能力</p>
          </div>
          <label className="providers-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索服务名称或地址" />
          </label>
        </div>

        {!filteredProviders.length ? (
          <div className="providers-empty">
            <div><ServerCog size={25} /></div>
            <h3>{props.providers.length ? "没有匹配的服务" : "还没有 API 服务"}</h3>
            <p>{props.providers.length ? "换一个名称或地址搜索。" : "添加 OneAPI、OpenRouter 或自建 OpenAI 兼容服务。"}</p>
            {!props.providers.length && <button className="btn-primary" type="button" onClick={props.onAdd}><Plus size={16} />添加第一个服务</button>}
          </div>
        ) : (
          <div className="providers-table-scroller">
            <div className="providers-table-head">
              <span>服务</span><span>连接状态</span><span>模型</span><span>最近同步</span><span>Codex</span><span>操作</span>
            </div>
            {filteredProviders.map((provider) => (
              <button className="providers-service-row" type="button" key={provider.id} onClick={() => props.onOpen(provider)}>
                <span className="providers-service-identity">
                  <span className="providers-service-avatar">{providerInitial(provider)}</span>
                  <span><strong>{provider.name}</strong><small>{provider.kind === "account_pool" ? `内置服务 · ${provider.accountCount} 个本机账号` : compactUrl(provider.baseUrl)}</small></span>
                </span>
                <span>{provider.kind === "account_pool" ? <span className={`provider-status-badge ${provider.connectionStatus === "connected" ? "is-success" : "is-neutral"}`}>{provider.remoteGateway ? "远程网关" : provider.connectionStatus === "connected" ? "账号池就绪" : provider.accountCount ? "待选择账号" : "待添加账号"}</span> : provider.inspectionJob?.status === "running" ? <span className="provider-status-badge is-info">检测中 {provider.inspectionJob.completed}/{provider.inspectionJob.total}</span> : <ConnectionStatusBadge status={provider.connectionStatus} title={provider.connectionMessage} />}</span>
                <span className="providers-model-count"><strong>{provider.modelCount} 个</strong><small>{provider.kind === "account_pool" ? "本机 Codex 模型目录" : provider.modelSource === "manual" ? "手动添加" : "API 返回的全部模型"}</small></span>
                <span className="providers-date">{formatProviderDate(provider.lastSyncedAt)}</span>
                <span><CodexStatusBadge active={provider.activeForCodex} />{provider.activeForCodex && provider.codexNeedsApply && <small className="providers-pending">有更改待应用</small>}</span>
                <span className="providers-row-action">{provider.kind === "account_pool" ? "模型与接入" : "查看模型"} <ArrowRight size={14} /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="providers-guidance">
        <span>i</span>
        显示接口返回的全部模型，检测状态仅作提示。切换本机 Codex 接入时，账号池 API 服务继续运行。
      </div>
    </div>
  );
}
