import { useEffect, useMemo, useState } from "react";
import { Clock3, Globe2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
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
    ip: string;
    countryCode?: string;
    countryName?: string;
    colo?: string;
    source: string;
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
      status: "疑似泄漏",
      detail: `收集到 ${lines.length} 个候选地址，存在公网回显风险。`,
      tone: "red",
      candidates: lines,
    };
  }

  if (hasHostCandidate || complete) {
    return {
      status: "局域网可见",
      detail: `收集到 ${lines.length} 个候选地址，主要是本地网段。`,
      tone: "orange",
      candidates: lines,
    };
  }

  return {
    status: "未发现异常",
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

function buildOverallStatus(report: NetworkDetectReport | null, local: LocalEnvironment | null): { label: string; detail: string; tone: Tone } {
  if (!report || !local) {
    return {
      label: "检测中",
      detail: "正在采集公网出口、DNS、WebRTC 和平台可达性。",
      tone: "blue",
    };
  }

  const redFlags = [
    report.platforms.some((item) => item.tone === "red"),
    local.webrtc.tone === "red",
    !report.publicIpv4.ip,
  ];
  const orangeFlags = [
    report.platforms.some((item) => item.tone === "orange"),
    local.webrtc.tone === "orange",
    summarizeDnsTone(report.dns.servers) !== "green",
    !report.publicIpv6.available,
  ];

  if (redFlags.some(Boolean)) {
    return {
      label: "风险偏高",
      detail: "部分关键项存在明显异常，建议先处理网络环境。",
      tone: "red",
    };
  }

  if (orangeFlags.some(Boolean)) {
    return {
      label: "需要复核",
      detail: "当前环境可用，但有几项状态不够干净。",
      tone: "orange",
    };
  }

  return {
    label: "环境正常",
    detail: "出口、DNS、WebRTC 和常用平台状态都比较稳定。",
    tone: "green",
  };
}

function StatusChip(props: { tone: Tone; children: string }) {
  return <span className={`network-chip ${props.tone}`}>{props.children}</span>;
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

function NetworkBlock(props: { label: string; value: string; detail: string; tone: Tone }) {
  return (
    <div className={`network-block ${toneClass(props.tone)}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.detail}</p>
    </div>
  );
}

function parseLatency(value?: number): string {
  return typeof value === "number" ? `${value} ms` : "-";
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
    try {
      const [nextReport, nextLocal] = await Promise.all([
        fetchJson<NetworkDetectReport>("/_gateway/admin/network-detect"),
        detectLocalEnvironment(),
      ]);
      setReport(nextReport);
      setLocal(nextLocal);
      setStatus("检测完成。");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus("检测失败。");
    } finally {
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
  const ipv4Tone = report ? "green" : "blue";
  const ipv6Tone = report?.publicIpv6.available ? "green" : "orange";
  const riskTitle = overall.label;
  const riskTone = overall.tone;

  return (
    <section className="network-page">
      <div className="network-toolbar">
        <div className="network-updated">
          <Clock3 size={14} />
          <span>最后检测 {checkedAt}</span>
          <span className="network-toolbar-status">{status}</span>
        </div>
        <button className="btn-secondary" type="button" onClick={() => refresh().catch(() => undefined)} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? "检测中" : "重新检测"}
        </button>
      </div>
      {error ? <p className="network-error">检测失败: {error}</p> : null}

      <section className="summary-grid network-summary-grid">
        <div className={`summary-card compact-value ${toneClass(overall.tone)}`}>
          <div className="summary-icon">
            <ShieldCheck size={14} />
          </div>
          <div>
            <span>总状态</span>
            <strong>{overall.label}</strong>
            <p>{overall.detail}</p>
          </div>
        </div>
        <div className={`summary-card compact-value ${toneClass(ipv4Tone)}`}>
          <div className="summary-icon blue">
            <Globe2 size={14} />
          </div>
          <div>
            <span>IPv4</span>
            <strong>{report?.publicIpv4.ip || (loading ? "检测中" : "未读取")}</strong>
            <p>{report?.publicIpv4.countryName ? `${report.publicIpv4.countryName} · ${report.publicIpv4.colo || "-"}` : report?.publicIpv4.source || "公网出口"}</p>
          </div>
        </div>
        <div className={`summary-card compact-value ${toneClass(ipv6Tone)}`}>
          <div className="summary-icon green">
            <Globe2 size={14} />
          </div>
          <div>
            <span>IPv6</span>
            <strong>{report?.publicIpv6.available ? report.publicIpv6.ip : "未检测到"}</strong>
            <p>{report?.publicIpv6.detail || "未检测到独立 IPv6 出口。"}</p>
          </div>
        </div>
        <div className={`summary-card compact-value ${toneClass(riskTone)}`}>
          <div className="summary-icon orange">
            <TriangleAlert size={14} />
          </div>
          <div>
            <span>风险提示</span>
            <strong>{riskTitle}</strong>
            <p>{local ? `${local.webrtc.status} · ${dnsLabel}` : "正在评估 WebRTC 和 DNS 状态。"}</p>
          </div>
        </div>
      </section>

      <section className="network-grid">
        <div className="network-stack">
          <section className="card network-section">
            <div className="section-head compact">
              <div>
                <h3>公网 IP</h3>
                <p>真实出口和出口区域。</p>
              </div>
            </div>
            <div className="network-dual">
              <NetworkBlock
                label="IPv4 出口"
                value={report?.publicIpv4.ip || (loading ? "检测中" : "-")}
                detail={
                  report
                    ? `${report.publicIpv4.countryName || report.publicIpv4.countryCode || "未知地区"} · ${report.publicIpv4.colo || "未知节点"} · ${parseLatency(report.publicIpv4.elapsedMs)}`
                    : "正在采集公网出口信息。"
                }
                tone={report ? "green" : "blue"}
              />
              <NetworkBlock
                label="IPv6 出口"
                value={report?.publicIpv6.available ? report.publicIpv6.ip || "-" : "未检测到"}
                detail={report?.publicIpv6.detail || "未检测到独立 IPv6 出口。"}
                tone={ipv6Tone}
              />
            </div>
          </section>

          <section className="card network-section">
            <div className="section-head compact">
              <div>
                <h3>DNS</h3>
                <p>系统解析器和解析路径。</p>
              </div>
            </div>
            <div className="network-dual network-dns-grid">
              <NetworkBlock label="系统 DNS" value={dnsValue} detail={dnsDetail} tone={dnsTone} />
              <NetworkBlock label="DNS 结论" value={dnsLabel} detail={report?.dns.source || "尚未获取"} tone={dnsTone} />
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

          <section className="card network-section">
            <div className="section-head compact">
              <div>
                <h3>WebRTC / 时区 / 语言</h3>
                <p>本地浏览器环境和潜在泄漏。</p>
              </div>
            </div>
            <div className="network-three-up">
              <NetworkMetric
                label="WebRTC"
                value={local?.webrtc.status || (loading ? "检测中" : "-")}
                detail={local?.webrtc.detail}
                tone={local?.webrtc.tone || "blue"}
              />
              <NetworkMetric label="时区" value={local?.timezone || "-"} detail="与出口地区交叉校验" tone={local?.webrtc.tone || "blue"} />
              <NetworkMetric label="语言" value={local?.language || "-"} detail={local?.browser || "-"} tone={local?.webrtc.tone || "blue"} />
            </div>
          </section>

          <section className="card network-section network-glass-panel">
            <div className="section-head compact">
              <div>
                <h3>海外平台可达性</h3>
                <p>连通性测试和原始 HTTP 结果放在同一块里看。</p>
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
                  <span>不可用</span>
                </div>
                <div className="platform-summary-chip slate">
                  <strong>{platformCounts.total}</strong>
                  <span>总数</span>
                </div>
              </div>
            </div>
            <div className="platform-grid">
              {(report?.platforms || []).map((item) => (
                <div className={`platform-card ${item.tone}`} key={item.key}>
                  <div className="platform-card-head">
                    <div className="platform-card-left">
                      <PlatformIcon icon={item.label.slice(0, 1)} tone={item.tone} platformKey={item.key} />
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                    </div>
                    <div className="platform-state">
                      <span className={`platform-state-dot ${item.tone}`} />
                      <div className={`platform-state-copy ${item.tone}`}>
                        <strong>{item.status}</strong>
                        <span>{item.httpStatus ? `HTTP ${item.httpStatus}` : "连接结果"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="platform-card-foot">
                    <span className="platform-url-chip">{platformHost(item.url)}</span>
                    {typeof item.elapsedMs === "number" ? <span className="platform-latency-chip">{item.elapsedMs} ms</span> : null}
                    <span className="platform-detail-copy">{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="network-side">
          <section className="card network-section">
            <div className="section-head compact">
              <div>
                <h3>风险提示</h3>
                <p>把最影响使用的异常拎出来。</p>
              </div>
            </div>
            <div className="network-list">
              <div className="network-list-item">
                <StatusChip tone={overall.tone}>{overall.label}</StatusChip>
                <p>{overall.detail}</p>
              </div>
              <div className="network-list-item">
                <StatusChip tone={local?.webrtc.tone || "blue"}>{local?.webrtc.status || "检测中"}</StatusChip>
                <p>{local?.webrtc.detail || "正在采集 WebRTC 候选。"}</p>
              </div>
              <div className="network-list-item">
                <StatusChip tone={dnsTone}>{dnsLabel}</StatusChip>
                <p>{dnsDetail}</p>
              </div>
            </div>
          </section>

        </aside>
      </section>
    </section>
  );
}
