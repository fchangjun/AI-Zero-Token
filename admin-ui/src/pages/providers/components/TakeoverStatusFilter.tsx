import { matchesTakeoverFilter, type TakeoverFilter } from "../takeover-availability";
import type { ProviderModel } from "../types";
import type { MixedProtocolChoice } from "../../../../../src/core/models/mixed-provider";

const OPTIONS = [
  ["all", "全部兼容结果"], ["direct", "兼容直接接管"], ["mixed", "兼容混合接管"], ["both", "两种方式均兼容"],
  ["unconfirmed", "尚无兼容结果"], ["checked", "已检测"], ["unchecked", "未检测"],
] as const;

export function TakeoverStatusFilter({ models, value, onChange, protocols }: {
  models: ProviderModel[]; value: TakeoverFilter; onChange: (value: TakeoverFilter) => void;
  protocols?: Record<string, MixedProtocolChoice>;
}) {
  return <select className="provider-filter" aria-label="检测状态筛选" value={value} onChange={(event) => onChange(event.target.value as TakeoverFilter)}>
    {OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}（{models.filter((model) => matchesTakeoverFilter(model, id, protocols?.[model.id])).length}）</option>)}
  </select>;
}
