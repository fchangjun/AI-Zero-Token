import { useMemo } from "react";
import { groupModelsByVendor, type ModelVendorId } from "../model-vendors";
import type { ProviderModel } from "../types";

export function ModelVendorFilter({ models, value, onChange }: {
  models: ProviderModel[]; value: ModelVendorId | "all"; onChange: (value: ModelVendorId | "all") => void;
}) {
  const groups = useMemo(() => groupModelsByVendor(models), [models]);
  return <select className="provider-filter" aria-label="厂商筛选" value={value} onChange={(event) => onChange(event.target.value as ModelVendorId | "all")}>
    <option value="all">全部厂商（{models.length}）</option>
    {groups.map((group) => <option key={group.id} value={group.id}>{group.label}（{group.models.length}）</option>)}
  </select>;
}
