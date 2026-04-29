import { spawn } from "node:child_process";
import { loadSettings } from "../store/settings-store.js";
import type { GatewaySettings } from "../types.js";

type HttpTiming = {
  phasesMs: Record<string, number>;
  totalMs: number;
};

type HttpTextResponse = {
  body: string;
  status: number;
  transport: "fetch" | "curl";
  timing: HttpTiming;
  requestId: string;
  headers: Record<string, string>;
};

type TextRequestInit = {
  body?: string;
  headers?: Record<string, string>;
  ignoreProxy?: boolean;
  method: "GET" | "POST";
  proxyOverride?: NetworkProxySettings;
  timeoutMs?: number;
  url: string;
};

type NetworkProxySettings = GatewaySettings["networkProxy"];

const CURL_STATUS_MARKER = "\n__CURL_STATUS__:";
const CURL_HEADERS_MARKER = "\n__CURL_HEADERS__:";
let requestSequence = 0;

function nextRequestId(): string {
  requestSequence += 1;
  return `http-${String(requestSequence).padStart(4, "0")}`;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function finalizeTiming(startedAt: number, phases: Record<string, number>): HttpTiming {
  return {
    phasesMs: Object.fromEntries(
      Object.entries(phases).map(([key, value]) => [key, roundMs(value)]),
    ),
    totalMs: roundMs(performance.now() - startedAt),
  };
}

function logHttpTiming(params: {
  requestId: string;
  method: TextRequestInit["method"];
  url: string;
  status?: number;
  transport: "fetch" | "curl";
  timing: HttpTiming;
  bodyLength?: number;
  fallbackFrom?: "fetch";
}): void {
  console.info("[http] request timing", {
    requestId: params.requestId,
    method: params.method,
    url: params.url,
    transport: params.transport,
    status: params.status,
    bodyLength: params.bodyLength,
    fallbackFrom: params.fallbackFrom,
    phasesMs: params.timing.phasesMs,
    totalMs: params.timing.totalMs,
  });
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const normalized: Record<string, string> = {};
  headers.forEach((value, key) => {
    normalized[key.toLowerCase()] = value;
  });
  return normalized;
}

function normalizeCurlHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, rawValue]) => {
      if (typeof rawValue === "string" && rawValue.trim()) {
        return [[key.toLowerCase(), rawValue.trim()]];
      }

      if (Array.isArray(rawValue)) {
        const joined = rawValue
          .filter((item) => typeof item === "string" && item.trim())
          .join(", ");
        return joined ? [[key.toLowerCase(), joined]] : [];
      }

      return [];
    }),
  );
}

async function runCurlRequest(
  init: TextRequestInit,
  params?: { requestId?: string; fallbackFrom?: "fetch"; proxy?: NetworkProxySettings },
): Promise<HttpTextResponse> {
  const requestId = params?.requestId ?? nextRequestId();
  const startedAt = performance.now();
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--request",
    init.method,
    init.url,
    "--write-out",
    `${CURL_STATUS_MARKER}%{http_code}${CURL_HEADERS_MARKER}%{header_json}`,
  ];

  if (params?.proxy?.enabled && params.proxy.url.trim()) {
    args.push("--proxy", params.proxy.url.trim());
    if (params.proxy.noProxy.trim()) {
      args.push("--noproxy", params.proxy.noProxy.trim());
    }
  }

  for (const [key, value] of Object.entries(init.headers ?? {})) {
    args.push("--header", `${key}: ${value}`);
  }

  if (typeof init.body === "string") {
    args.push("--data-raw", init.body);
  }

  const child = spawn("curl", args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const phases: Record<string, number> = {
    spawnCurlMs: performance.now() - startedAt,
  };

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  phases.waitForCurlMs = performance.now() - startedAt - phases.spawnCurlMs;

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `curl 请求失败，退出码 ${exitCode}`);
  }

  const parseStartedAt = performance.now();
  const statusMarkerIndex = stdout.lastIndexOf(CURL_STATUS_MARKER);
  const headersMarkerIndex = stdout.lastIndexOf(CURL_HEADERS_MARKER);
  if (statusMarkerIndex === -1) {
    throw new Error("curl 响应缺少状态码标记。");
  }
  if (headersMarkerIndex === -1 || headersMarkerIndex < statusMarkerIndex) {
    throw new Error("curl 响应缺少响应头标记。");
  }

  const body = stdout.slice(0, statusMarkerIndex);
  const statusText = stdout.slice(statusMarkerIndex + CURL_STATUS_MARKER.length, headersMarkerIndex).trim();
  const status = Number.parseInt(statusText, 10);
  if (!Number.isFinite(status)) {
    throw new Error(`无法解析 curl 状态码: ${statusText}`);
  }

  const headersText = stdout.slice(headersMarkerIndex + CURL_HEADERS_MARKER.length).trim();
  let headers: Record<string, string> = {};
  if (headersText) {
    try {
      headers = normalizeCurlHeaders(JSON.parse(headersText));
    } catch (error) {
      console.warn("[http] failed to parse curl response headers", {
        requestId,
        url: init.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  phases.parseResponseMs = performance.now() - parseStartedAt;
  const timing = finalizeTiming(startedAt, phases);
  logHttpTiming({
    requestId,
    method: init.method,
    url: init.url,
    status,
    transport: "curl",
    timing,
    bodyLength: body.length,
    fallbackFrom: params?.fallbackFrom,
  });

  return {
    body,
    status,
    transport: "curl",
    timing,
    requestId,
    headers,
  };
}

async function loadNetworkProxySettings(): Promise<NetworkProxySettings | undefined> {
  try {
    const settings = await loadSettings();
    return settings.networkProxy;
  } catch (error) {
    console.warn("[http] failed to load network proxy settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export async function requestText(init: TextRequestInit): Promise<HttpTextResponse> {
  const requestId = nextRequestId();
  const proxy = init.ignoreProxy ? undefined : init.proxyOverride ?? await loadNetworkProxySettings();
  const useCurlOnly = process.env.OAUTH_DEMO_USE_CURL === "1";
  const useConfiguredProxy = !!proxy?.enabled && !!proxy.url.trim();
  const timeoutMs = init.timeoutMs;
  const signal =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  if (!useCurlOnly && !useConfiguredProxy) {
    const startedAt = performance.now();
    const phases: Record<string, number> = {};
    try {
      const fetchStartedAt = performance.now();
      const response = await fetch(init.url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal,
      });
      phases.waitForHeadersMs = performance.now() - fetchStartedAt;

      const readBodyStartedAt = performance.now();
      const body = await response.text();
      phases.readBodyMs = performance.now() - readBodyStartedAt;
      const timing = finalizeTiming(startedAt, phases);
      logHttpTiming({
        requestId,
        method: init.method,
        url: init.url,
        status: response.status,
        transport: "fetch",
        timing,
        bodyLength: body.length,
      });
      return {
        body,
        status: response.status,
        transport: "fetch",
        timing,
        requestId,
        headers: normalizeHeaders(response.headers),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[http] fetch attempt failed", {
        requestId,
        method: init.method,
        url: init.url,
        elapsedMs: roundMs(performance.now() - startedAt),
        error: message,
      });
    }
  }

  return runCurlRequest(init, {
    requestId,
    fallbackFrom: useCurlOnly || useConfiguredProxy ? undefined : "fetch",
    proxy,
  });
}
