import fs from "node:fs/promises";
import { getServers as getDnsServers } from "node:dns";
import { execFile } from "node:child_process";
import { isIP } from "node:net";
import { promisify } from "node:util";
import type { GatewaySettings } from "../types.js";
import { requestText } from "../providers/http-client.js";

const execFileAsync = promisify(execFile);

export type NetworkPlatformStatus = "可达" | "受限" | "不可用";

export type NetworkPlatformProbe = {
  key: string;
  label: string;
  url: string;
  status: NetworkPlatformStatus;
  detail: string;
  tone: "green" | "orange" | "red";
  httpStatus?: number;
  elapsedMs?: number;
};

export type NetworkDetectReport = {
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

type NetworkProxySettings = GatewaySettings["networkProxy"];

type CloudflareTrace = {
  ip?: string;
  loc?: string;
  colo?: string;
};

const PLATFORM_PROBE_HEADERS = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
};

const PUBLIC_IPV4_CANDIDATES = [
  "https://ifconfig.me/ip",
  "https://api.ipify.org/",
  "https://icanhazip.com/",
  "https://checkip.amazonaws.com/",
];

const PUBLIC_IPV6_CANDIDATES = [
  "https://ifconfig.me/ipv6",
  "https://api6.ipify.org/",
  "https://ipv6.icanhazip.com/",
  "https://ipv6.test-ipv6.com/",
];

function parseKeyValueText(input: string): Record<string, string> {
  return Object.fromEntries(
    input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        if (index <= 0) {
          return ["", ""];
        }
        return [line.slice(0, index), line.slice(index + 1)];
      })
      .filter(([key]) => key),
  );
}

function parseDnsServers(text: string): string[] {
  const servers = new Set<string>();
  for (const match of text.matchAll(/nameserver\[\d+\]\s*:\s*([0-9a-fA-F:.]+)/g)) {
    servers.add(match[1]);
  }
  return [...servers];
}

function parseResolvConfServers(text: string): string[] {
  const servers = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^nameserver\s+([0-9a-fA-F:.%]+)/i);
    if (match) {
      servers.add(match[1]);
    }
  }
  return [...servers];
}

function parseWindowsDnsServers(text: string): string[] {
  const servers = new Set<string>();
  let collecting = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      collecting = false;
      continue;
    }

    const match = trimmed.match(/^(DNS Servers?|DNS 服务器)[^:]*:\s*(.*)$/i);
    if (match) {
      const first = match[2].trim();
      if (first) {
        servers.add(first);
      }
      collecting = true;
      continue;
    }

    if (collecting && /^[0-9a-fA-F:.%]+$/.test(trimmed)) {
      servers.add(trimmed);
      continue;
    }

    collecting = false;
  }

  return [...servers];
}

function normalizeIpAddress(ip: string): string {
  return ip.trim().replace(/%[0-9A-Za-z._-]+$/, "");
}

function collectDnsServer(servers: Set<string>, value: string): void {
  const normalized = normalizeIpAddress(value);
  if (isIP(normalized) > 0) {
    servers.add(normalized);
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  const normalizedIp = normalizeIpAddress(ip);
  return (
    /^(10|127|169\.254|172\.(1[6-9]|2\d|3[0-1])|192\.168)\./.test(normalizedIp) ||
    /^0\./.test(normalizedIp) ||
    /^100\.(6[4-9]|[7-9]\d|1\d\d|2[0-3]\d|24[0-7])\./.test(normalizedIp) ||
    /^198\.(18|19)\./.test(normalizedIp) ||
    /^203\.0\.113\./.test(normalizedIp) ||
    /^192\.0\.2\./.test(normalizedIp) ||
    /^198\.51\.100\./.test(normalizedIp) ||
    /^fc00:/i.test(normalizedIp) ||
    /^fd00:/i.test(normalizedIp) ||
    /^fe80:/i.test(normalizedIp) ||
    /^::1$/.test(normalizedIp)
  );
}

function toCountryName(code?: string): string | undefined {
  if (!code) {
    return undefined;
  }

  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function normalizeProbeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeSourceUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

async function probePublicIpCandidate(
  url: string,
  family: 4 | 6,
  proxy?: NetworkProxySettings,
  timeoutMs = 4000,
): Promise<{ url: string; label: string; ip?: string; error?: string }> {
  const label = describeSourceUrl(url);
  try {
    const response = await requestText({
      method: "GET",
      url,
      timeoutMs,
      proxyOverride: proxy,
    });

    if (response.status < 200 || response.status >= 300) {
      return { url, label, error: `HTTP ${response.status}` };
    }

    const ip = normalizeIpAddress(response.body);
    if (isIP(ip) !== family) {
      return { url, label, error: `未返回 IPv${family} 地址` };
    }

    return { url, label, ip };
  } catch (error) {
    return { url, label, error: normalizeProbeError(error) };
  }
}

async function runCommand(command: string, args: string[], timeoutMs = 2500): Promise<string> {
  const result = await execFileAsync(command, args, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 128,
  });
  return String(result.stdout || "");
}

async function readDnsServers(): Promise<{ servers: string[]; source: string }> {
  const servers = new Set<string>();
  const sources = new Set<string>();

  for (const server of getDnsServers()) {
    collectDnsServer(servers, server);
  }
  if (servers.size > 0) {
    sources.add("node:dns");
  }

  if (process.platform === "darwin") {
    try {
      const scutil = await runCommand("scutil", ["--dns"], 2500);
      parseDnsServers(scutil).forEach((item) => collectDnsServer(servers, item));
      if (servers.size > 0) {
        sources.add("scutil --dns");
      }
    } catch {
      // ignored
    }

    try {
      const wifiDns = await runCommand("networksetup", ["-getdnsservers", "Wi-Fi"], 2500);
      for (const line of wifiDns.split(/\r?\n/)) {
        const value = line.trim();
        if (value && /^[0-9a-fA-F:.%]+$/.test(value)) {
          collectDnsServer(servers, value);
        }
      }
      if (servers.size > 0) {
        sources.add("networksetup");
      }
    } catch {
      // ignored
    }
  } else if (process.platform === "linux") {
    try {
      const resolvConf = await fs.readFile("/etc/resolv.conf", "utf8");
      parseResolvConfServers(resolvConf).forEach((item) => collectDnsServer(servers, item));
      if (servers.size > 0) {
        sources.add("/etc/resolv.conf");
      }
    } catch {
      // ignored
    }
  } else if (process.platform === "win32") {
    try {
      const ipconfig = await runCommand("ipconfig", ["/all"], 3000);
      parseWindowsDnsServers(ipconfig).forEach((item) => collectDnsServer(servers, item));
      if (servers.size > 0) {
        sources.add("ipconfig /all");
      }
    } catch {
      // ignored
    }
  }

  return {
    servers: [...servers],
    source: sources.size > 0 ? [...sources].join(" + ") : "系统 DNS",
  };
}

async function probePublicIpv4(proxy?: NetworkProxySettings): Promise<NetworkDetectReport["publicIpv4"]> {
  const startedAt = performance.now();
  const sourceLabels = PUBLIC_IPV4_CANDIDATES.map(describeSourceUrl);
  const results = await Promise.all(
    PUBLIC_IPV4_CANDIDATES.map((url) => probePublicIpCandidate(url, 4, proxy, 3500)),
  );
  const matched = results.find((item) => item.ip);

  if (matched?.ip) {
    let trace: CloudflareTrace = {};
    try {
      const traceResponse = await requestText({
        method: "GET",
        url: "https://www.cloudflare.com/cdn-cgi/trace",
        timeoutMs: 5000,
        proxyOverride: proxy,
      });
      trace = parseKeyValueText(traceResponse.body) as CloudflareTrace;
    } catch {
      trace = {};
    }
    const countryCode = trace.loc;
    const countryName = toCountryName(countryCode);

    return {
      available: true,
      ip: matched.ip,
      countryCode,
      countryName,
      colo: trace.colo,
      source: `${matched.label}${trace.loc || trace.colo ? " + cloudflare trace" : ""}`,
      detail: countryName
        ? `出口位于 ${countryName}${trace.colo ? ` · ${trace.colo}` : ""}`
        : "检测到公网 IPv4 出口。",
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const attemptedSources = results.map((item) => `${item.label}: ${item.error || "未返回结果"}`);
  return {
    available: false,
    ip: "",
    source: sourceLabels.join(" / "),
    detail: attemptedSources.length > 0
      ? `未获得公网 IPv4。${attemptedSources.slice(0, 2).join("；")}`
      : "未获得公网 IPv4。",
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

async function probePublicIpv6(proxy?: NetworkProxySettings): Promise<NetworkDetectReport["publicIpv6"]> {
  const startedAt = performance.now();
  const results = await Promise.all(
    PUBLIC_IPV6_CANDIDATES.map((url) => probePublicIpCandidate(url, 6, proxy, 3000)),
  );
  const matched = results.find((item) => item.ip);

  if (matched?.ip) {
    return {
      available: true,
      ip: matched.ip,
      source: matched.label,
      detail: "检测到独立 IPv6 出口。",
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const attemptedSources = results.map((item) => `${item.label}: ${item.error || "未返回结果"}`);
  return {
    available: false,
    source: PUBLIC_IPV6_CANDIDATES.map(describeSourceUrl).join(" / "),
    detail: attemptedSources.length > 0
      ? `未检测到独立 IPv6 出口。${attemptedSources.slice(0, 2).join("；")}`
      : "未检测到独立 IPv6 出口，当前连接可能只走 IPv4。",
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

async function probePlatform(url: string, label: string, proxy?: NetworkProxySettings): Promise<NetworkPlatformProbe> {
  const startedAt = performance.now();
  try {
    const response = await requestText({
      method: "GET",
      url,
      headers: PLATFORM_PROBE_HEADERS,
      timeoutMs: 8000,
      proxyOverride: proxy,
    });
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (response.status >= 200 && response.status < 400) {
      return {
        key: label,
        label,
        url,
        status: "可达",
        detail: `HTTP ${response.status} 可正常访问`,
        tone: "green",
        httpStatus: response.status,
        elapsedMs,
      };
    }
    if (response.status >= 400 && response.status < 500) {
      return {
        key: label,
        label,
        url,
        status: "受限",
        detail: `HTTP ${response.status}，网络可达但站点返回限制`,
        tone: "orange",
        httpStatus: response.status,
        elapsedMs,
      };
    }
    return {
      key: label,
      label,
      url,
      status: "不可用",
      detail: `HTTP ${response.status}，站点不可用`,
      tone: "red",
      httpStatus: response.status,
      elapsedMs,
    };
  } catch (error) {
    return {
      key: label,
      label,
      url,
      status: "不可用",
      detail: error instanceof Error ? error.message : String(error),
      tone: "red",
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }
}

export class NetworkDetectService {
  async collectReport(proxy?: NetworkProxySettings): Promise<NetworkDetectReport> {
    const [publicIpv4, publicIpv6, dns, platforms] = await Promise.all([
      probePublicIpv4(proxy),
      probePublicIpv6(proxy),
      readDnsServers(),
      Promise.all([
        probePlatform("https://www.google.com/generate_204", "Google", proxy),
        probePlatform("https://chatgpt.com/", "ChatGPT", proxy),
        probePlatform("https://claude.ai/", "Claude", proxy),
        probePlatform("https://www.youtube.com/", "YouTube", proxy),
        probePlatform("https://x.com/", "X", proxy),
      ]),
    ]);

    const dnsDetail =
      dns.servers.length > 0
        ? `系统 DNS: ${dns.servers.join(" / ")}`
        : `${dns.source} 未读取到系统 DNS。`;

    return {
      checkedAt: Date.now(),
      publicIpv4,
      publicIpv6,
      dns: {
        servers: dns.servers,
        source: dns.source,
        detail: dnsDetail,
      },
      proxy: {
        enabled: Boolean(proxy?.enabled && proxy.url.trim()),
        url: proxy?.url?.trim() || undefined,
      },
      platforms,
    };
  }
}
