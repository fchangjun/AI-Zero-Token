import { execFile } from "node:child_process";
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

function isPrivateOrReservedIp(ip: string): boolean {
  return (
    /^(10|127|169\.254|172\.(1[6-9]|2\d|3[0-1])|192\.168)\./.test(ip) ||
    /^0\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1\d\d|2[0-3]\d|24[0-7])\./.test(ip) ||
    /^198\.(18|19)\./.test(ip) ||
    /^203\.0\.113\./.test(ip) ||
    /^192\.0\.2\./.test(ip) ||
    /^198\.51\.100\./.test(ip) ||
    /^fc00:/i.test(ip) ||
    /^fd00:/i.test(ip) ||
    /^fe80:/i.test(ip) ||
    /^::1$/.test(ip)
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

async function runCommand(command: string, args: string[], timeoutMs = 2500): Promise<string> {
  const result = await execFileAsync(command, args, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 128,
  });
  return String(result.stdout || "");
}

async function readDnsServers(): Promise<{ servers: string[]; source: string }> {
  const servers = new Set<string>();
  let source = "系统 DNS";

  try {
    const scutil = await runCommand("scutil", ["--dns"], 2500);
    parseDnsServers(scutil).forEach((item) => servers.add(item));
    source = "scutil --dns";
  } catch {
    // ignored
  }

  try {
    const wifiDns = await runCommand("networksetup", ["-getdnsservers", "Wi-Fi"], 2500);
    for (const line of wifiDns.split(/\r?\n/)) {
      const value = line.trim();
      if (value && /^[0-9a-fA-F:.]+$/.test(value)) {
        servers.add(value);
      }
    }
    if (servers.size > 0) {
      source = `${source} + networksetup`;
    }
  } catch {
    // ignored
  }

  return {
    servers: [...servers],
    source,
  };
}

async function probePublicIpv4(proxy?: NetworkProxySettings): Promise<NetworkDetectReport["publicIpv4"]> {
  const startedAt = performance.now();
  const response = await requestText({
    method: "GET",
    url: "https://ifconfig.me/ip",
    timeoutMs: 8000,
    proxyOverride: proxy,
  });

  if (response.status < 200 || response.status >= 500) {
    throw new Error(`公网 IPv4 探测失败: HTTP ${response.status}`);
  }

  const ip = response.body.trim();
  let trace: CloudflareTrace = {};
  try {
    const traceResponse = await requestText({
      method: "GET",
      url: "https://www.cloudflare.com/cdn-cgi/trace",
      timeoutMs: 8000,
      proxyOverride: proxy,
    });
    trace = parseKeyValueText(traceResponse.body) as CloudflareTrace;
  } catch {
    trace = {};
  }
  const countryCode = trace.loc;

  return {
    ip,
    countryCode,
    countryName: toCountryName(countryCode),
    colo: trace.colo,
    source: "ifconfig.me + cloudflare trace",
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

async function probePublicIpv6(proxy?: NetworkProxySettings): Promise<NetworkDetectReport["publicIpv6"]> {
  const startedAt = performance.now();
  const ipv6Candidates = [
    "https://ifconfig.me/ipv6",
    "https://ipv6.test-ipv6.com/",
  ];

  for (const url of ipv6Candidates) {
    try {
      const response = await requestText({
        method: "GET",
        url,
        timeoutMs: 6000,
        proxyOverride: proxy,
      });
      const body = response.body.trim();
      if (!body) {
        continue;
      }
      if (/^[0-9a-fA-F:]+$/.test(body) && body.includes(":")) {
        return {
          available: true,
          ip: body,
          source: url,
          detail: "检测到独立 IPv6 出口。",
          elapsedMs: Math.round(performance.now() - startedAt),
        };
      }
    } catch {
      // try next candidate
    }
  }

  return {
    available: false,
    source: "ifconfig.me / test-ipv6.com",
    detail: "未检测到独立 IPv6 出口，当前连接可能只走 IPv4。",
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
        : "未读取到系统 DNS。";

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
