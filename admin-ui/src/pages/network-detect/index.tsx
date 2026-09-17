import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  Wifi,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { fetchJson } from "@/shared/api";
import claudeIcon from "@/assets/platform-claude.svg";
import chatgptIcon from "@/assets/platform-chatgpt.svg";
import googleIcon from "@/assets/platform-google.svg";
import xIcon from "@/assets/platform-x.svg";
import { useT, useLocaleValue } from "@/i18n";
import type { Translator } from "@/shared/lib/profiles";
import youtubeIcon from "@/assets/platform-youtube.svg";

type Tone = "green" | "orange" | "red" | "blue" | "slate";

type NetworkPlatformProbe = {
  key: string;
  label: string;
  url: string;
  status: "reachable" | "limited" | "unavailable";
  detail: string;
  tone: Tone;
  httpStatus?: number;
  elapsedMs?: number;
};

type NetworkDetectReport = {
  checkedAt: number;
  publicIpv4: {
    available: boolean;
    ip: string;
    countryCode?: string;
    countryName?: string;
    colo?: string;
    source: string;
    detail: string;
    elapsedMs: number;
  };
  publicIpv6: {
    available: boolean;
    ip?: string;
    source: string;
    detail: string;
    elapsedMs?: number;
  };
  dns: {
    servers: string[];
    source: string;
    detail: string;
  };
  proxy: {
    enabled: boolean;
    url?: string;
  };
  platforms: NetworkPlatformProbe[];
};

type LocalEnvironment = {
  timezone: string;
  language: string;
  browser: string;
  webrtc: {
    status: string;
    detail: string;
    tone: Tone;
    candidates: string[];
  };
};

const platformIconMap: Record<string, string> = {
  claude: claudeIcon,
  chatgpt: chatgptIcon,
  google: googleIcon,
  x: xIcon,
  youtube: youtubeIcon,
};

function toneClass(tone: Tone) {
  return `tone-${tone}`;
}

function platformHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  return (
    /^(10|127|169\.254|172\.(1[6-9]|2\d|3[0-1])|192\.168)\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1\d\d|2[0-3]\d|24[0-7])\./.test(ip) ||
    /^198\.(18|19)\./.test(ip) ||
    /^192\.0\.2\./.test(ip) ||
    /^198\.51\.100\./.test(ip) ||
    /^203\.0\.113\./.test(ip) ||
    /^fc00:/i.test(ip) ||
    /^fd00:/i.test(ip) ||
    /^fe80:/i.test(ip) ||
    /^::1$/.test(ip)
  );
}

function detectBrowserLabel(ua: string): string {
  const electron = ua.match(/Electron\/([\d.]+)/i);
  if (electron) {
    return `Electron ${electron[1]}`;
  }

  const chrome = ua.match(/Chrome\/([\d.]+)/i);
  if (chrome && /Safari\//i.test(ua)) {
    return `Chrome ${chrome[1].split(".")[0]}`;
  }

  const safari = ua.match(/Version\/([\d.]+).*Safari\//i);
  if (safari && !/Chrome\//i.test(ua)) {
    return `Safari ${safari[1].split(".")[0]}`;
  }

  const firefox = ua.match(/Firefox\/([\d.]+)/i);
  if (firefox) {
    return `Firefox ${firefox[1].split(".")[0]}`;
  }

  return ua.slice(0, 40);
}

async function detectWebRtc(t: Translator): Promise<LocalEnvironment["webrtc"]> {
  if (typeof RTCPeerConnection === "undefined") {
    return {
      status: t("network.webrtc.unsupported"),
      detail: t("network.webrtc.unsupportedDetail"),
      tone: "orange",
      candidates: [],
    };
  }

  const candidates = new Set<string>();
  const peer = new RTCPeerConnection({
    iceServers: [],
  });
  let complete = false;

  const done = new Promise<void>((resolve) => {
    peer.onicecandidate = (event) => {
      if (event.candidate?.candidate) {
        candidates.add(event.candidate.candidate);
      }
      if (!event.candidate) {
        complete = true;
        resolve();
      }
    };
  });

  try {
    peer.createDataChannel("probe");
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    await Promise.race([
      done,
      new Promise<void>((resolve) => window.setTimeout(resolve, 2400)),
    ]);
  } catch {
    // ignore
  } finally {
    peer.close();
  }

  const lines = [...candidates];
  const hasPublicCandidate = lines.some((line) => /\btyp srflx\b/.test(line) || /\btyp relay\b/.test(line));
  const hasHostCandidate = lines.some((line) => /\btyp host\b/.test(line));

  if (hasPublicCandidate) {
    return {
      status: t("network.webrtc.needsAttention"),
      detail: t("network.webrtc.publicCandidates", { count: lines.length }),
      tone: "red",
      candidates: lines,
    };
  }

  if (hasHostCandidate || complete) {
    return {
      status: t("network.webrtc.localFirst"),
      detail: t("network.webrtc.localCandidates", { count: lines.length }),
      tone: "orange",
      candidates: lines,
    };
  }

  return {
    status: t("network.webrtc.noAnomaly"),
    detail: t("network.webrtc.noAnomalyDetail"),
    tone: "green",
    candidates: lines,
  };
}

async function detectLocalEnvironment(t: Translator): Promise<LocalEnvironment> {
  const [webrtc] = await Promise.all([detectWebRtc(t)]);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "-";
  const language = navigator.language || "-";
  const browser = detectBrowserLabel(navigator.userAgent || "");
  return {
    timezone,
    language,
    browser,
    webrtc,
  };
}

function summarizeDnsTone(servers: string[]): Tone {
  if (servers.length === 0) {
    return "slate";
  }

  if (servers.some((item) => isPrivateOrReservedIp(item))) {
    return "orange";
  }

  return "green";
}

function summarizeDnsLabel(servers: string[], t: Translator): string {
  if (servers.length === 0) {
    return t("network.dns.notRead");
  }

  if (servers.some((item) => isPrivateOrReservedIp(item))) {
    return t("network.dns.internal");
  }

  return t("network.dns.public");
}

function summarizePlatformCounts(platforms: NetworkPlatformProbe[], t: Translator) {
  const total = platforms.length;
  const reachable = platforms.filter((item) => item.status === "reachable").length;
  const limited = platforms.filter((item) => item.status === "limited").length;
  const unavailable = platforms.filter((item) => item.status === "unavailable").length;
  return { total, reachable, limited, unavailable };
}

function buildAccessVerdict(report: NetworkDetectReport | null, counts: ReturnType<typeof summarizePlatformCounts>, t: Translator): { label: string; detail: string; tone: Tone } {
  if (!report || counts.total === 0) {
    return {
      label: t("network.verdict.checkingLabel"),
      detail: t("network.verdict.checkingDetail"),
      tone: "blue",
    };
  }

  if (counts.unavailable > 0) {
    return {
      label: t("network.verdict.blockedLabel"),
      detail: t("network.verdict.blockedCountDetail", { count: counts.unavailable }),
      tone: "red",
    };
  }

  if (counts.limited > 0) {
    return {
      label: t("network.verdict.partialLabel"),
      detail: t("network.verdict.partialCountDetail", { reachable: counts.reachable, total: counts.total }),
      tone: "orange",
    };
  }

  return {
    label: t("network.verdict.okLabel"),
    detail: t("network.verdict.okCountDetail", { count: counts.total }),
    tone: "green",
  };
}

function buildOverallStatus(report: NetworkDetectReport | null, local: LocalEnvironment | null, t: Translator): { label: string; detail: string; tone: Tone } {
  if (!report && !local) {
    return {
      label: t("network.overall.checkingLabel"),
      detail: t("network.overall.checkingDetail"),
      tone: "blue",
    };
  }

  if (!report || !local) {
    return {
      label: t("network.overall.partialLabel"),
      detail: t("network.overall.partialDetail"),
      tone: "orange",
    };
  }

  const hasIpv4 = report.publicIpv4.available && Boolean(report.publicIpv4.ip);
  const hasIpv6 = report.publicIpv6.available && Boolean(report.publicIpv6.ip);
  const redFlags = [
    report.platforms.some((item) => item.tone === "red"),
    local.webrtc.tone === "red",
    !hasIpv4 && !hasIpv6,
  ];
  const orangeFlags = [
    report.platforms.some((item) => item.tone === "orange"),
    local.webrtc.tone === "orange",
    summarizeDnsTone(report.dns.servers) !== "green",
    !hasIpv4,
    !report.publicIpv6.available,
  ];

  if (redFlags.some(Boolean)) {
    return {
      label: t("network.overall.blockedLabel"),
      detail: t("network.overall.blockedDetail"),
      tone: "red",
    };
  }

  if (orangeFlags.some(Boolean)) {
    return {
      label: t("network.overall.attentionLabel"),
      detail: t("network.overall.attentionDetail"),
      tone: "orange",
    };
  }

  return {
    label: t("network.overall.okLabel"),
    detail: t("network.overall.okDetail"),
    tone: "green",
  };
}

function StatusChip(props: { tone: Tone; children: string }) {
  return <span className={`network-chip ${props.tone}`}>{props.children}</span>;
}

function AccessBadge(props: { tone: Tone; children: string }) {
  return (
    <span className={`access-badge ${props.tone}`}>
      {props.tone === "green" ? <CheckCircle2 size={13} /> : props.tone === "red" ? <XCircle size={13} /> : <TriangleAlert size={13} />}
      {props.children}
    </span>
  );
}

function PlatformIcon(props: { icon: string; tone: Tone; platformKey: string }) {
  const key = props.platformKey.toLowerCase();
  const src = platformIconMap[key];
  return <span className={`platform-icon ${props.tone} platform-${key}`}>{src ? <img alt="" src={src} /> : props.icon}</span>;
}

function NetworkMetric(props: { label: string; value: string; detail?: string; tone: Tone }) {
  return (
    <div className={`network-metric ${toneClass(props.tone)}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail ? <p>{props.detail}</p> : null}
    </div>
  );
}

function SignalCard(props: { icon: LucideIcon; label: string; value: string; detail: string; tone: Tone }) {
  const Icon = props.icon;
  return (
    <div className={`signal-card ${toneClass(props.tone)}`}>
      <div className="signal-card-icon">
        <Icon size={17} />
      </div>
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
        <p>{props.detail}</p>
      </div>
    </div>
  );
}

function NetworkBlock(props: { label: string; value: string; detail: string; tone: Tone }) {
  return (
    <div className={`network-block ${toneClass(props.tone)}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.detail}</p>
    </div>
  );
}

function PlatformAccessRow(props: { item: NetworkPlatformProbe; t: Translator }) {
  const { item, t } = props;
  return (
    <div className={`platform-access-row ${item.tone}`}>
      <div className="platform-access-main">
        <PlatformIcon icon={item.label.slice(0, 1)} tone={item.tone} platformKey={item.key} />
        <div>
          <strong>{item.label}</strong>
          <span>{platformHost(item.url)}</span>
        </div>
      </div>
      <div className="platform-access-result">
        <AccessBadge tone={item.tone}>{item.status}</AccessBadge>
        <span>{item.httpStatus ? t("network.accessScore.httpStatus", { status: item.httpStatus }) : t("network.accessScore.connectResult")}</span>
      </div>
      <div className="platform-access-latency">
        <strong>{parseLatency(item.elapsedMs)}</strong>
        <span>{item.httpStatus ? t("network.accessScore.statusResponse", { status: item.httpStatus }) : t("network.accessScore.waiting")}</span>
      </div>
      <div className="platform-access-detail">
        <span>{item.detail}</span>
      </div>
    </div>
  );
}

function parseLatency(value?: number): string {
  return typeof value === "number" ? `${value} ms` : "-";
}

function normalizeDetectError(error: unknown, t: Translator): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return t("network.status.timeout");
  }

  return error instanceof Error ? error.message : String(error);
}

export function NetworkDetectPage() {
  const [report, setReport] = useState<NetworkDetectReport | null>(null);
  const [local, setLocal] = useState<LocalEnvironment | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const t = useT();
  const locale = useLocaleValue();
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    setStatus(t("network.status.running"));
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 18000);
    try {
      const [reportResult, localResult] = await Promise.allSettled([
        fetchJson<NetworkDetectReport>("/_gateway/admin/network-detect", { signal: controller.signal }),
        detectLocalEnvironment(t),
      ]);

      if (reportResult.status === "fulfilled") {
        setReport(reportResult.value);
      }
      if (localResult.status === "fulfilled") {
        setLocal(localResult.value);
      }

      const messages: string[] = [];
      if (reportResult.status === "rejected") {
        messages.push(`${t("network.status.probePrefix")}${normalizeDetectError(reportResult.reason, t)}`);
      }
      if (localResult.status === "rejected") {
        messages.push(`${t("network.status.environmentPrefix")}${normalizeDetectError(localResult.reason, t)}`);
      }

      const nextStatus =
        reportResult.status === "fulfilled" && localResult.status === "fulfilled"
          ? t("network.status.complete")
          : reportResult.status === "fulfilled" || localResult.status === "fulfilled"
            ? t("network.status.partial")
            : t("network.status.failed");
      setError(messages.length > 0 ? messages.join(" · ") : null);
      setStatus(nextStatus);
    } catch (nextError) {
      setError(normalizeDetectError(nextError, t));
      setStatus(t("network.status.failed"));
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  const checkedAt = useMemo(() => {
    if (!report) {
      return "--:--:--";
    }

    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(report.checkedAt));
  }, [report]);

  const overall = buildOverallStatus(report, local, t);
  const dnsTone = summarizeDnsTone(report?.dns.servers || []);
  const dnsLabel = summarizeDnsLabel(report?.dns.servers || [], t);
  const dnsValue = report?.dns.servers?.length ? report.dns.servers.slice(0, 2).join(" / ") : "-";
  const dnsDetail = report?.dns.detail || t("network.environment.notDetected");
  const platformCounts = summarizePlatformCounts(report?.platforms || [], t);
  const ipv4Tone = report ? (report.publicIpv4.available && report.publicIpv4.ip ? "green" : "orange") : "blue";
  const ipv6Tone = report ? (report.publicIpv6.available ? "green" : "orange") : "blue";
  const ipv4Value = report
    ? (report.publicIpv4.available && report.publicIpv4.ip
      ? report.publicIpv4.ip
      : t("network.environment.notAcquired"))
    : loading
      ? t("network.environment.proxyPending")
      : t("network.dns.notRead");
  const ipv4Detail = report?.publicIpv4.detail || t("network.environment.ipv4Detail");
  const proxyLabel = report?.proxy.enabled
    ? t("network.environment.proxyEnabled")
    : report
      ? t("network.environment.proxyDirect")
      : t("network.environment.proxyPending");
  const proxyDetail = report?.proxy.enabled
    ? report.proxy.url || t("network.environment.proxyUrlUnknown")
    : t("network.environment.proxyDirectDetail");
  const proxyTone = report ? (report.proxy.enabled ? "orange" : "green") : "blue";
  const accessVerdict = buildAccessVerdict(report, platformCounts, t);
  const accessPercent = platformCounts.total > 0 ? Math.round((platformCounts.reachable / platformCounts.total) * 100) : 0;
  const accessScore = report ? `${accessPercent}%` : "--";
  const platformTotalLabel = platformCounts.total > 0 ? String(platformCounts.total) : "5";
  const exitLocation = report?.publicIpv4.countryName
    ? `${report.publicIpv4.countryName}${report.publicIpv4.colo ? ` · ${report.publicIpv4.colo}` : ""}`
    : report?.publicIpv4.countryCode || t("network.environment.unknownExit");
  const exitDetail = report?.publicIpv4.available
    ? `${report.publicIpv4.source} · ${parseLatency(report.publicIpv4.elapsedMs)}`
    : ipv4Detail;
  const firstBlockedPlatform = report?.platforms.find((item) => item.tone === "red") ?? report?.platforms.find((item) => item.tone === "orange");
  const routeSummary = firstBlockedPlatform
    ? `${firstBlockedPlatform.label}: ${firstBlockedPlatform.detail}`
    : report
      ? t("network.accessScore.allResponded")
      : t("network.accessScore.waitingForResponse");
  const environmentTone: Tone =
    local?.webrtc.tone === "red"
      ? "red"
      : local?.webrtc.tone === "orange" || dnsTone === "orange"
        ? "orange"
        : dnsTone === "slate" || !local
          ? "blue"
          : "green";

  return (
    <section className="network-page">
      <section className={`network-command-center ${accessVerdict.tone}`}>
        <div className="network-command-copy">
          <div className="network-eyebrow">
            <Wifi size={14} />
            <span>{t("network.commandCopy.title")}</span>
          </div>
          <h2>{accessVerdict.label}</h2>
          <p>{accessVerdict.detail}</p>
          <div className="network-command-status">
            <StatusChip tone={overall.tone}>{overall.label}</StatusChip>
            <span>
              <Clock3 size={13} />
              {checkedAt}
            </span>
            <span className="network-toolbar-status">{status}</span>
          </div>
        </div>

        <div className="access-score-card">
          <span>{t("network.accessScore.cardLabel")}</span>
          <strong>{accessScore}</strong>
          <div className="access-score-bar" aria-hidden="true">
            <i style={{ width: `${accessPercent}%` }} />
          </div>
          <p>
            {t("network.accessScore.platformCount", { count: `${platformCounts.reachable}/${platformTotalLabel}` })}
          </p>
          <button className="btn-secondary" type="button" onClick={() => refresh().catch(() => undefined)} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? t("network.accessScore.checking") : t("network.accessScore.redetect")}
          </button>
        </div>
      </section>

      {error ? <p className="network-error">{t("network.errorHint", { error })}</p> : null}

      <section className="signal-grid">
        <SignalCard icon={Activity} label={t("network.signals.connectivityLabel")} value={`${platformCounts.reachable}/${platformTotalLabel}`} detail={routeSummary} tone={accessVerdict.tone} />
        <SignalCard icon={MapPin} label={t("network.signals.exitLabel")} value={report?.publicIpv4.available ? exitLocation : ipv4Value} detail={exitDetail} tone={ipv4Tone} />
        <SignalCard icon={Server} label={t("network.signals.proxyLabel")} value={proxyLabel} detail={proxyDetail} tone={proxyTone} />
        <SignalCard
          icon={ShieldCheck}
          label={t("network.signals.environmentLabel")}
          value={local ? `${dnsLabel} · ${local.webrtc.status}` : t("network.environment.proxyPending")}
          detail={local?.webrtc.detail || dnsDetail}
          tone={environmentTone}
        />
      </section>

      <section className="network-workspace">
        <section className="card network-section network-platform-panel">
          <div className="section-head compact">
            <div>
              <h3>{t("network.accessScore.rowTitle")}</h3>
              <p>{t("network.accessScore.rowDescription")}</p>
            </div>
            <div className="platform-summary-strip">
              <div className="platform-summary-chip green">
                <strong>{platformCounts.reachable}</strong>
                <span>{t("network.accessScore.reachable")}</span>
              </div>
              <div className="platform-summary-chip orange">
                <strong>{platformCounts.limited}</strong>
                <span>{t("network.accessScore.limited")}</span>
              </div>
              <div className="platform-summary-chip red">
                <strong>{platformCounts.unavailable}</strong>
                <span>{t("network.accessScore.blocked")}</span>
              </div>
            </div>
          </div>

          {report?.platforms.length ? (
            <>
              <div className="platform-access-header" aria-hidden="true">
                <span>{t("network.accessScore.platformColumn")}</span>
                <span>{t("network.accessScore.statusColumn")}</span>
                <span>{t("network.accessScore.elapsedColumn")}</span>
                <span>{t("network.accessScore.detailColumn")}</span>
              </div>
              <div className="platform-access-list">
                {report.platforms.map((item) => (
                  <PlatformAccessRow item={item} key={item.key} t={t} />
                ))}
              </div>
            </>
          ) : (
            <div className="network-empty-state">{t("network.accessScore.empty")}</div>
          )}
        </section>

        <aside className="network-side">
          <section className="card network-section network-diagnosis-panel">
            <div className="section-head compact">
              <div>
                <h3>{t("network.diagnosis.title")}</h3>
                <p>{t("network.diagnosis.description")}</p>
              </div>
            </div>
            <div className="network-list">
              <div className="network-list-item">
                <StatusChip tone={accessVerdict.tone}>{accessVerdict.label}</StatusChip>
                <p>{accessVerdict.detail}</p>
              </div>
              <div className="network-list-item">
                <StatusChip tone={overall.tone}>{overall.label}</StatusChip>
                <p>{overall.detail}</p>
              </div>
              <div className="network-list-item">
                <StatusChip tone={local?.webrtc.tone || "blue"}>{local?.webrtc.status || t("network.environment.proxyPending")}</StatusChip>
                <p>{local?.webrtc.detail || t("network.environment.webrtcCollecting")}</p>
              </div>
            </div>
          </section>

          <section className="card network-section">
            <div className="section-head compact">
              <div>
                <h3>{t("network.environment.exitTitle")}</h3>
                <p>{t("network.environment.exitDescription")}</p>
              </div>
            </div>
            <div className="network-dual">
              <NetworkBlock
                label={t("network.environment.ipv4Label")}
                value={ipv4Value}
                detail={
                  report
                    ? report.publicIpv4.available
                      ? `${exitLocation} · ${parseLatency(report.publicIpv4.elapsedMs)}`
                      : `${report.publicIpv4.detail} · ${parseLatency(report.publicIpv4.elapsedMs)}`
                    : t("network.environment.ipv4Detail")
                }
                tone={ipv4Tone}
              />
              <NetworkBlock
                label={t("network.environment.ipv6Label")}
                value={report?.publicIpv6.available ? report.publicIpv6.ip || "-" : t("network.environment.ipv6Unavailable")}
                detail={report?.publicIpv6.detail || t("network.environment.ipv6Detail")}
                tone={ipv6Tone}
              />
            </div>
            <div className="network-list compact-list">
              <div className="network-list-item">
                <StatusChip tone={proxyTone}>{proxyLabel}</StatusChip>
                <p>{proxyDetail}</p>
              </div>
            </div>
          </section>
        </aside>
      </section>

      <section className="card network-section network-environment-panel">
        <div className="section-head compact">
          <div>
            <h3>{t("network.environment.title")}</h3>
            <p>{t("network.environment.riskDescription")}</p>
          </div>
        </div>
        <div className="network-three-up">
          <NetworkMetric label={t("network.environment.dnsLabel")} value={dnsValue} detail={`${dnsLabel} · ${report?.dns.source || t("network.environment.notCollected")}`} tone={dnsTone} />
          <NetworkMetric
            label="WebRTC"
            value={local?.webrtc.status || (loading ? t("network.environment.proxyPending") : "-")}
            detail={local?.webrtc.detail || t("network.environment.webrtcCollecting")}
            tone={local?.webrtc.tone || "blue"}
          />
          <NetworkMetric label={t("network.environment.environmentMetricLabel")} value={local?.timezone || "-"} detail={`${local?.language || "-"} · ${local?.browser || "-"}`} tone={environmentTone} />
        </div>
        {report?.dns.servers.length ? (
          <div className="dns-chip-row">
            {report.dns.servers.map((item) => (
              <span className={`dns-chip ${isPrivateOrReservedIp(item) ? "orange" : "green"}`} key={item}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}
