import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { ModelVendor } from "../model-vendors";

export function ModelVendorSection({ vendor, count, selectedCount, onToggleSelection, disabled, children }: {
  vendor: ModelVendor; count: number; selectedCount?: number; onToggleSelection?: () => void;
  disabled?: boolean; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const headingId = useId();
  return <section className="provider-vendor-section" aria-labelledby={headingId} data-vendor={vendor.id}>
    <div className="provider-vendor-heading">
      <h3 id={headingId}><button type="button" aria-expanded={!collapsed} aria-controls={contentId} onClick={() => setCollapsed((current) => !current)}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        <span>{vendor.label}</span><small>{count} 个模型</small>
        {vendor.id === "other" && <small className="provider-vendor-unclassified">暂未识别厂商</small>}
      </button></h3>
      {onToggleSelection && <div className="provider-vendor-selection"><span>已选 {selectedCount ?? 0} / {count}</span><button type="button" disabled={disabled} aria-label={`${selectedCount === count ? "取消选择" : "全选"} ${vendor.label} 当前筛选模型`} onClick={onToggleSelection}>{selectedCount === count ? "取消此组" : "全选此组"}</button></div>}
    </div>
    <div id={contentId} hidden={collapsed}>{children}</div>
  </section>;
}
