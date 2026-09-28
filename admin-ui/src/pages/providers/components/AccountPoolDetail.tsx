import { Search } from "lucide-react";
import { useState } from "react";
import type { AdminConfig } from "@/shared/types";

export function AccountPoolDetail({ config }: { config: AdminConfig }) {
  const [search, setSearch] = useState("");
  const models = config.models.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="providers-surface">
    <div className="providers-surface-head"><div><h2>账号池模型</h2><p>实际可用性由账号套餐和剩余额度决定。</p></div><label className="providers-search"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索账号池模型" aria-label="搜索账号池模型" /></label></div>
    <div className="account-pool-models">{models.map(model => <div className="account-pool-model" key={model.id}><div><strong>{model.name || model.id}</strong>{model.name !== model.id && <small>{model.id}</small>}</div><div className="provider-capability-list"><span className="provider-capability-tag is-neutral">Codex 模型</span>{model.input.includes("image") && <span className="provider-capability-tag is-neutral">图片输入</span>}{config.status.defaultModel === model.id && <span className="provider-capability-tag is-success">API 默认模型</span>}</div></div>)}{!models.length && <div className="providers-empty is-compact">没有匹配的模型。</div>}</div>
  </section>;
}
