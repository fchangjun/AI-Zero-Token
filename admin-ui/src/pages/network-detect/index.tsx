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
import youtubeIcon from "@/assets/platform-youtube.svg";

type Tone = "green" | "orange" | "red" | "blue" | "slate";

type NetworkPlatformProbe = {
  key: string;
  label: string;
  url: string;
  status: "可达" | "受限" | "不可用";
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

async function detectWebRtc(): Promise<LocalEnvironment["webrtc"]> {
  if (typeof RTCPeerConnection === "undefined") {
    return {
      status: "不支持",
      detail: "当前环境不支持 WebRTC。",
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
      status: "需要留意",
      detail: `收集到 ${lines.length} 个候选地址，其中包含公网回显特征。`,
      tone: "red",
      candidates: lines,
    };
  }

  if (hasHostCandidate || complete) {
    return {
      status: "本地候选为主",
      detail: `收集到 ${lines.length} 个候选地址，主要来自本地网段。`,
      tone: "orange",
      candidates: lines,
    };
  }

  return {
    status: "暂未发现异常",
    detail: "未收集到可识别的候选地址。",
    tone: "green",
    candidates: lines,
  };
}

async function detectLocalEnvironment(): Promise<LocalEnvironment> {
  const [webrtc] = await Promise.all([detectWebRtc()]);
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

function summarizeDnsLabel(servers: string[]): string {
  if (servers.length === 0) {
    return "未读取";
  }

  if (servers.some((item) => isPrivateOrReservedIp(item))) {
    return "内网 / 企业 DNS";
  }

  return "公网 DNS";
}

function summarizePlatformCounts(platforms: NetworkPlatformProbe[]) {
  const total = platforms.length;
  const reachable = platforms.filter((item) => item.status === "可达").length;
  const limited = platforms.filter((item) => item.status === "受限").length;
  const unavailable = platforms.filter((item) => item.status === "不可用").length;
  return { total, reachable, limited, unavailable };
}

function buildAccessVerdict(report: NetworkDetectReport | null, counts: ReturnType<typeof summarizePlatformCounts>): { label: string; detail: string; tone: Tone } {
  if (!report || counts.total === 0) {
    return {
      label: "正在判断海外访问",
      detail: "正在检查 ChatGPT、Claude、Google、YouTube 和 X 的连通性。",
      tone: "blue",
    };
  }

  if (counts.unavailable > 0) {
    return {
      label: "海外访问受阻",
      detail: `${counts.unavailable} 个海外应用不可用，优先检查代理出口、DNS 或上游链路。`,
      tone: "red",
    };
  }

  if (counts.limited > 0) {
    return {
      label: "部分应用受限",
      detail: `${counts.reachable}/${counts.total} 个海外应用可达，其余应用返回限制状态。`,
      tone: "orange",
    };
  }

  return {
    label: "海外应用可访问",
    detail: `${counts.total} 个目标应用均已连通，当前出口可用于海外反向代理场景。`,
    tone: "green",
  };
}

function buildOverallStatus(report: NetworkDetectReport | null, local: LocalEnvironment | null): { label: string; detail: string; tone: Tone } {
  if (!report && !local) {
    return {
      label: "检测中",
      detail: "正在采集公网出口、DNS、WebRTC、代理和平台可达性。",
      tone: "blue",
    };
  }

  if (!report || !local) {
    return {
      label: "部分结果",
      detail: "已有项目返回，剩余项目会保留失败原因，方便继续排查。",
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
      label: "建议先处理",
      detail: "有明显阻塞项，先把出口或浏览器回显风险排掉。",
      tone: "red",
    };
  }

  if (orangeFlags.some(Boolean)) {
    return {
      label: "需要留意",
      detail: "结果可用，但有几项信息值得再看一眼。",
      tone: "orange",
    };
  }

  return {
    label: "状态正常",
    detail: "出口、DNS、WebRTC 和常用平台状态都比较稳定。",
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

function PlatformAccessRow(props: { item: NetworkPlatformProbe }) {
  const { item } = props;
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
        <span>{item.httpStatus ? `HTTP ${item.httpStatus}` : "连接结果"}</span>
      </div>
      <div className="platform-access-latency">
        <strong>{parseLatency(item.elapsedMs)}</strong>
        <span>{item.httpStatus ? `${item.httpStatus} 响应` : "等待结果"}</span>
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

function normalizeDetectError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "网络探测超过 18 秒，已停止等待。";
  }

  return error instanceof Error ? error.message : String(error);
}

export function NetworkDetectPage() {
  const [report, setReport] = useState<NetworkDetectReport | null>(null);
  const [local, setLocal] = useState<LocalEnvironment | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("正在采集真实网络状态...");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    setStatus("正在采集真实网络状态...");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 18000);
    try {
      const [reportResult, localResult] = await Promise.allSettled([
        fetchJson<NetworkDetectReport>("/_gateway/admin/network-detect", { signal: controller.signal }),
        detectLocalEnvironment(),
      ]);

      if (reportResult.status === "fulfilled") {
        setReport(reportResult.value);
      }
      if (localResult.status === "fulfilled") {
        setLocal(localResult.value);
      }

      const messages: string[] = [];
      if (reportResult.status === "rejected") {
        messages.push(`网络探测: ${normalizeDetectError(reportResult.reason)}`);
      }
      if (localResult.status === "rejected") {
        messages.push(`本地环境: ${normalizeDetectError(localResult.reason)}`);
      }

      const nextStatus =
        reportResult.status === "fulfilled" && localResult.status === "fulfilled"
          ? "检测完成。"
          : reportResult.status === "fulfilled" || localResult.status === "fulfilled"
            ? "部分结果已更新。"
            : "检测失败。";
      setError(messages.length > 0 ? messages.join(" · ") : null);
      setStatus(nextStatus);
    } catch (nextError) {
      setError(normalizeDetectError(nextError));
      setStatus("检测失败。");
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

  const overall = buildOverallStatus(report, local);
  const dnsTone = summarizeDnsTone(report?.dns.servers || []);
  const dnsLabel = summarizeDnsLabel(report?.dns.servers || []);
  const dnsValue = report?.dns.servers?.length ? report.dns.servers.slice(0, 2).join(" / ") : "-";
  const dnsDetail = report?.dns.detail || "尚未检测到系统 DNS。";
  const platformCounts = summarizePlatformCounts(report?.platforms || []);
  const ipv4Tone = report ? (report.publicIpv4.available && report.publicIpv4.ip ? "green" : "orange") : "blue";
  const ipv6Tone = report ? (report.publicIpv6.available ? "green" : "orange") : "blue";
  const ipv4Value = report ? (report.publicIpv4.available && report.publicIpv4.ip ? report.publicIpv4.ip : "未获取到") : loading ? "检测中" : "未读取";
  const ipv4Detail = report?.publicIpv4.detail || "正在采集公网 IPv4 出口。";
  const proxyLabel = report?.proxy.enabled ? "代理已启用" : report ? "直连" : "待检测";
  const proxyDetail = report?.proxy.enabled ? report.proxy.url || "代理地址未读取" : "检测请求按当前网关配置发起。";
  const proxyTone = report ? (report.proxy.enabled ? "orange" : "green") : "blue";
  const accessVerdict = buildAccessVerdict(report, platformCounts);
  const accessPercent = platformCounts.total > 0 ? Math.round((platformCounts.reachable / platformCounts.total) * 100) : 0;
  const accessScore = report ? `${accessPercent}%` : "--";
  const platformTotalLabel = platformCounts.total > 0 ? String(platformCounts.total) : "5";
  const exitLocation = report?.publicIpv4.countryName
    ? `${report.publicIpv4.countryName}${report.publicIpv4.colo ? ` · ${report.publicIpv4.colo}` : ""}`
    : report?.publicIpv4.countryCode || "未知出口";
  const exitDetail = report?.publicIpv4.available
    ? `${report.publicIpv4.source} · ${parseLatency(report.publicIpv4.elapsedMs)}`
    : ipv4Detail;
  const firstBlockedPlatform = report?.platforms.find((item) => item.tone === "red") ?? report?.platforms.find((item) => item.tone === "orange");
  const routeSummary = firstBlockedPlatform
    ? `${firstBlockedPlatform.label}: ${firstBlockedPlatform.detail}`
    : report
      ? "海外目标应用均有响应。"
      : "等待海外目标应用响应。";
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
            <span>海外应用访问诊断</span>
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
          <span>海外可达率</span>
          <strong>{accessScore}</strong>
          <div className="access-score-bar" aria-hidden="true">
            <i style={{ width: `${accessPercent}%` }} />
          </div>
          <p>
            {platformCounts.reachable}/{platformTotalLabel} 个目标应用可达
          </p>
          <button className="btn-secondary" type="button" onClick={() => refresh().catch(() => undefined)} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "检测中" : "重新检测"}
          </button>
        </div>
      </section>

      {error ? <p className="network-error">检测提示: {error}</p> : null}

      <section className="signal-grid">
        <SignalCard icon={Activity} label="海外连通性" value={`${platformCounts.reachable}/${platformTotalLabel}`} detail={routeSummary} tone={accessVerdict.tone} />
        <SignalCard icon={MapPin} label="当前出口" value={report?.publicIpv4.available ? exitLocation : ipv4Value} detail={exitDetail} tone={ipv4Tone} />
        <SignalCard icon={Server} label="代理路径" value={proxyLabel} detail={proxyDetail} tone={proxyTone} />
        <SignalCard
          icon={ShieldCheck}
          label="解析与浏览器"
          value={local ? `${dnsLabel} · ${local.webrtc.status}` : "检测中"}
          detail={local?.webrtc.detail || dnsDetail}
          tone={environmentTone}
        />
      </section>

      <section className="network-workspace">
        <section className="card network-section network-platform-panel">
          <div className="section-head compact">
            <div>
              <h3>海外应用矩阵</h3>
              <p>反代链路最常用目标的实时可达性。</p>
            </div>
            <div className="platform-summary-strip">
              <div className="platform-summary-chip green">
                <strong>{platformCounts.reachable}</strong>
                <span>可达</span>
              </div>
              <div className="platform-summary-chip orange">
                <strong>{platformCounts.limited}</strong>
                <span>受限</span>
              </div>
              <div className="platform-summary-chip red">
                <strong>{platformCounts.unavailable}</strong>
                <span>阻断</span>
              </div>
            </div>
          </div>

          {report?.platforms.length ? (
            <>
              <div className="platform-access-header" aria-hidden="true">
                <span>应用</span>
                <span>状态</span>
                <span>耗时</span>
                <span>说明</span>
              </div>
              <div className="platform-access-list">
                {report.platforms.map((item) => (
                  <PlatformAccessRow item={item} key={item.key} />
                ))}
              </div>
            </>
          ) : (
            <div className="network-empty-state">平台探测结果还没有返回。</div>
          )}
        </section>

        <aside className="network-side">
          <section className="card network-section network-diagnosis-panel">
            <div className="section-head compact">
              <div>
                <h3>访问结论</h3>
                <p>用于判断当前环境是否适合海外反向代理。</p>
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
                <StatusChip tone={local?.webrtc.tone || "blue"}>{local?.webrtc.status || "检测中"}</StatusChip>
                <p>{local?.webrtc.detail || "正在采集 WebRTC 候选。"}</p>
              </div>
            </div>
          </section>

          <section className="card network-section">
            <div className="section-head compact">
              <div>
                <h3>出口与代理</h3>
                <p>反代请求实际经过的公网出口。</p>
              </div>
            </div>
            <div className="network-dual">
              <NetworkBlock
                label="IPv4 出口"
                value={ipv4Value}
                detail={
                  report
                    ? report.publicIpv4.available
                      ? `${exitLocation} · ${parseLatency(report.publicIpv4.elapsedMs)}`
                      : `${report.publicIpv4.detail} · ${parseLatency(report.publicIpv4.elapsedMs)}`
                    : "正在采集公网出口信息。"
                }
                tone={ipv4Tone}
              />
              <NetworkBlock
                label="IPv6 出口"
                value={report?.publicIpv6.available ? report.publicIpv6.ip || "-" : "未检测到"}
                detail={report?.publicIpv6.detail || "未检测到独立 IPv6 出口。"}
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
            <h3>解析与本地指纹</h3>
            <p>DNS、WebRTC、时区和语言会影响海外应用的风控判断。</p>
          </div>
        </div>
        <div className="network-three-up">
          <NetworkMetric label="DNS" value={dnsValue} detail={`${dnsLabel} · ${report?.dns.source || "尚未获取"}`} tone={dnsTone} />
          <NetworkMetric
            label="WebRTC"
            value={local?.webrtc.status || (loading ? "检测中" : "-")}
            detail={local?.webrtc.detail || "正在采集 WebRTC 候选。"}
            tone={local?.webrtc.tone || "blue"}
          />
          <NetworkMetric label="本地环境" value={local?.timezone || "-"} detail={`${local?.language || "-"} · ${local?.browser || "-"}`} tone={environmentTone} />
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
