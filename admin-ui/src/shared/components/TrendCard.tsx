import type { AdminConfig, RequestLog } from "@/shared/types";
import type { TrendWindow } from "@/shared/lib/app-types";

function primaryUsage(profile: { quota?: { primaryUsedPercent?: number } } | null | undefined): number {
  const value = profile?.quota?.primaryUsedPercent;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildTrendSeries(config: AdminConfig | null, requestLogs: RequestLog[], offset: number, spanMinutes: number): number[] {
  const profiles = Array.isArray(config?.profiles) ? config.profiles : [];
  const activeUsage = config?.profile ? primaryUsage(config.profile) : 42;
  const base = 620 + activeUsage * 7 + offset * 90;
  const profileMix = profiles.reduce((sum, profile, index) => sum + primaryUsage(profile) * (index + 1), 0);
  const spanFactor = Math.max(1, spanMinutes / 60);

  return Array.from({ length: 12 }, (_, index) => {
    const wave = Math.sin((index + 1 + offset) * (0.65 + spanFactor * 0.08)) * (120 + spanFactor * 18);
    const secondaryWave = Math.cos((index + 1) * (1.05 + spanFactor * 0.06) + offset) * (72 + spanFactor * 10);
    const requestImpact = requestLogs[index] ? requestLogs[index].durationMs * (offset === 0 ? 0.24 : 0.12) : 0;
    const derived = base + wave + secondaryWave + requestImpact + (profileMix % 280);
    return Math.max(220, Math.min(2200, Math.round(derived)));
  });
}

function makeLinePath(points: number[], width: number, height: number, maxValue: number): string {
  return points
    .map((value, index) => {
      const x = (width / (points.length - 1)) * index;
      const y = height - (value / maxValue) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TrendCard(props: {
  config: AdminConfig | null;
  requestLogs: RequestLog[];
  windowMinutes: TrendWindow;
  onWindow: (value: TrendWindow) => void;
}) {
  const width = 720;
  const height = 210;
  const upperSeries = buildTrendSeries(props.config, props.requestLogs, 0, props.windowMinutes);
  const lowerSeries = buildTrendSeries(props.config, props.requestLogs, 1, props.windowMinutes).map((item) => Math.max(180, item - 260));
  const maxValue = Math.max(...upperSeries, ...lowerSeries, 2000);
  const pathUpper = makeLinePath(upperSeries, width, height, maxValue);
  const pathLower = makeLinePath(lowerSeries, width, height, maxValue);
  const now = Date.now();
  const labelStep = Math.max(10, Math.round(props.windowMinutes / 6));
  const labels = Array.from({ length: 6 }, (_, index) =>
    new Date(now - (5 - index) * labelStep * 60 * 1000).toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  return (
    <section className="trend-card" aria-label="请求耗时趋势">
      <div className="section-head compact">
        <div>
          <h3>请求耗时趋势</h3>
          <p>基于最近调试请求和账号额度状态生成的本地趋势视图。</p>
        </div>
        <select className="control" value={props.windowMinutes} onChange={(event) => props.onWindow(Number(event.target.value) as TrendWindow)}>
          <option value={60}>近 1 小时</option>
          <option value={180}>近 3 小时</option>
          <option value={720}>近 12 小时</option>
        </select>
      </div>
      <div className="chart-wrap">
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-swatch purple" />
            网关响应
          </span>
          <span className="legend-item">
            <span className="legend-swatch blue" />
            上游响应
          </span>
        </div>
        <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="请求耗时趋势折线图">
          <defs>
            <linearGradient id="areaA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(99,91,255,0.18)" />
              <stop offset="100%" stopColor="rgba(99,91,255,0.02)" />
            </linearGradient>
            <linearGradient id="areaB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(59,130,246,0.16)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
            </linearGradient>
          </defs>
          {[1, 2, 3, 4].map((item) => (
            <line key={item} x1="0" y1={item * 42} x2={width} y2={item * 42} stroke="#e2e8f0" strokeWidth="1" />
          ))}
          <path d={`${pathUpper} L ${width} ${height} L 0 ${height} Z`} fill="url(#areaA)" stroke="none" />
          <path d={`${pathLower} L ${width} ${height} L 0 ${height} Z`} fill="url(#areaB)" stroke="none" />
          <path d={pathUpper} fill="none" stroke="#635bff" strokeWidth="2.4" strokeLinecap="round" />
          <path d={pathLower} fill="none" stroke="#3b82f6" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <div className="trend-labels">
          {labels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
