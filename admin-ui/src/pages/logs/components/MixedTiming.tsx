import { useT } from "@/i18n";
import { formatDuration } from "@/shared/lib/format";

export function MixedTiming({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const t = useT();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const timing = value as Record<string, unknown>;
  const duration = (key: string) => typeof timing[key] === "number" ? formatDuration(timing[key] as number) : "—";
  if (compact) return <small className="muted" style={{ display: "block", whiteSpace: "nowrap" }}>{t("logs.firstText")} {duration("firstTextMs")}</small>;
  const fields = [
    [t("logs.firstText"), duration("firstTextMs")], [t("logs.firstOutput"), duration("firstOutputMs")],
    [t("logs.upstreamWait"), duration("upstreamWaitMs")], [t("logs.conversionTime"), duration("conversionMs")],
    [t("logs.outputSpeed"), typeof timing.tokensPerSecond === "number" ? `${timing.tokensPerSecond} tokens/s` : "—"],
    [t("logs.inputTokens"), timing.inputTokens ?? "—"], [t("logs.outputTokens"), timing.outputTokens ?? "—"],
    [t("logs.cachedTokens"), timing.cachedTokens ?? "—"],
    [t("logs.connectionReuse"), typeof timing.reusedConnection === "boolean" ? t(timing.reusedConnection ? "logs.reused" : "logs.newConnection") : "—"],
    [t("logs.compactionRequest"), timing.compaction === "none" ? t("logs.notCompaction") : t(timing.compaction === "client_summary" ? "logs.clientCompaction" : "logs.gatewayCompaction")],
  ];
  return <div className="log-detail-meta" style={{ marginTop: 20 }} aria-label={t("logs.mixedTiming")}>
    <strong>{t("logs.mixedTiming")}</strong>
    {fields.map(([label, data]) => <div key={String(label)}><span>{String(label)}</span><strong>{String(data)}</strong></div>)}
    <small className="muted">{t("logs.mixedTimingHint")}</small>
  </div>;
}
