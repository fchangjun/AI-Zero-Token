import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function StatCard(props: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail: string;
  tone?: "brand" | "blue" | "green" | "orange";
  compact?: boolean;
}) {
  const Icon = props.icon;
  return (
    <article className={`summary-card tone-${props.tone || "brand"} ${props.compact ? "compact-value" : ""}`}>
      <div className={`summary-icon ${props.tone || "brand"}`}>
        <Icon size={16} />
      </div>
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
        <p>{props.detail}</p>
      </div>
    </article>
  );
}
