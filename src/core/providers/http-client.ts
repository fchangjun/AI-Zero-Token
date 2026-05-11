import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
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

type HttpStreamResponse = {
  body: ReadableStream<Uint8Array>;
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

type StreamRequestInit = TextRequestInit & {
  signal?: AbortSignal;
};

type NetworkProxySettings = GatewaySettings["networkProxy"];

type HttpTransportError = Error & {
  code?: string;
  elapsedMs?: number;
  isTransient?: boolean;
  method?: string;
  requestId?: string;
  statusCode?: number;
  transport?: "curl" | "fetch";
  upstreamConnectionError?: boolean;
  url?: string;
};

const CURL_STATUS_MARKER = "\n__CURL_STATUS__:";
const CURL_HEADERS_MARKER = "\n__CURL_HEADERS__:";
const DEFAULT_CURL_STREAM_HEADER_TIMEOUT_MS = 180_000;
const MIN_CURL_STREAM_HEADER_TIMEOUT_MS = 30_000;
const MAX_CURL_STREAM_HEADER_TIMEOUT_MS = 600_000;
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

function safeConsole(method: "info" | "warn", message: string, meta: Record<string, unknown>): void {
  try {
    console[method](message, meta);
  } catch {
    // Desktop apps may outlive their inherited stdout/stderr pipe. Logging must
    // never crash an active gateway request.
  }
}

function getCurlStreamHeaderTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.max(1000, timeoutMs);
  }

  const configured = process.env.AZT_CURL_STREAM_HEADER_TIMEOUT_MS?.trim();
  const parsed = configured ? Number.parseInt(configured, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(MAX_CURL_STREAM_HEADER_TIMEOUT_MS, Math.max(MIN_CURL_STREAM_HEADER_TIMEOUT_MS, parsed));
  }

  return DEFAULT_CURL_STREAM_HEADER_TIMEOUT_MS;
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
  safeConsole("info", "[http] request timing", {
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

function createHttpTransportError(
  message: string,
  params: {
    code: string;
    elapsedMs: number;
    method: TextRequestInit["method"];
    requestId: string;
    statusCode: number;
    transport: "curl" | "fetch";
    transient?: boolean;
    upstreamConnectionError?: boolean;
    url: string;
  },
): HttpTransportError {
  const error = new Error(message) as HttpTransportError;
  error.code = params.code;
  error.elapsedMs = roundMs(params.elapsedMs);
  error.isTransient = params.transient ?? true;
  error.method = params.method;
  error.requestId = params.requestId;
  error.statusCode = params.statusCode;
  error.transport = params.transport;
  error.upstreamConnectionError = params.upstreamConnectionError ?? true;
  error.url = params.url;
  return error;
}

function classifyCurlRequestError(stderr: string, exitCode: number): { code: string; statusCode: number } {
  const normalized = stderr.toLowerCase();
  if (exitCode === 35 || normalized.includes("ssl_connect") || normalized.includes("ssl_error_syscall")) {
    return {
      code: "curl_request_tls_failed",
      statusCode: 502,
    };
  }
  if (
    exitCode === 6 ||
    normalized.includes("could not resolve host") ||
    normalized.includes("name lookup timed out")
  ) {
    return {
      code: "curl_request_dns_failed",
      statusCode: 502,
    };
  }
  if (
    exitCode === 7 ||
    normalized.includes("failed to connect") ||
    normalized.includes("connection refused")
  ) {
    return {
      code: "curl_request_connect_failed",
      statusCode: 502,
    };
  }
  if (exitCode === 28 || normalized.includes("operation timed out") || normalized.includes("timed out")) {
    return {
      code: "curl_request_timeout",
      statusCode: 504,
    };
  }
  return {
    code: "curl_request_failed",
    statusCode: 502,
  };
}

export function isTransientHttpError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const details = error as {
    code?: unknown;
    isTransient?: unknown;
    upstreamConnectionError?: unknown;
  };
  if (details.isTransient === true || details.upstreamConnectionError === true) {
    return true;
  }

  return typeof details.code === "string" && (
    details.code === "curl_stream_closed_before_headers" ||
    details.code === "curl_stream_header_timeout" ||
    details.code === "curl_stream_body_failed" ||
    details.code === "curl_request_tls_failed" ||
    details.code === "curl_request_dns_failed" ||
    details.code === "curl_request_connect_failed" ||
    details.code === "curl_request_timeout" ||
    details.code === "curl_request_failed"
  );
}

function isElectronRuntime(): boolean {
  return typeof (process.versions as Record<string, string | undefined>).electron === "string";
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

function parseCurlHeaderBlock(block: string): { status: number; headers: Record<string, string> } | null {
  const lines = block.split("\n");
  const statusMatch = /^HTTP(?:\/\S+)?\s+(\d{3})/i.exec(lines[0]?.trim() ?? "");
  const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : NaN;
  if (!Number.isFinite(status)) {
    return null;
  }

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!key || !value) {
      continue;
    }
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }

  return { status, headers };
}

function parseCurlHeaderDump(raw: string): { status: number; headers: Record<string, string> } | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  const blocks: string[] = [];
  let blockStart = 0;

  while (blockStart < normalized.length) {
    const separatorIndex = normalized.indexOf("\n\n", blockStart);
    if (separatorIndex === -1) {
      break;
    }

    const block = normalized.slice(blockStart, separatorIndex).trim();
    if (/^HTTP\//i.test(block)) {
      blocks.push(block);
    }

    blockStart = separatorIndex + 2;
    while (normalized[blockStart] === "\n") {
      blockStart += 1;
    }
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const parsed = parseCurlHeaderBlock(blocks[index]);
    if (!parsed || (parsed.status >= 100 && parsed.status < 200)) {
      continue;
    }
    return parsed;
  }

  return null;
}

async function runCurlRequest(
  init: TextRequestInit,
  params?: { requestId?: string; fallbackFrom?: "fetch"; proxy?: NetworkProxySettings; timeoutMs?: number },
): Promise<HttpTextResponse> {
  const requestId = params?.requestId ?? nextRequestId();
  const startedAt = performance.now();
  const timeoutSeconds =
    typeof params?.timeoutMs === "number" && Number.isFinite(params.timeoutMs) && params.timeoutMs > 0
      ? Math.max(1, Math.ceil(params.timeoutMs / 1000))
      : undefined;
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

  if (typeof timeoutSeconds === "number") {
    args.push("--connect-timeout", String(Math.min(timeoutSeconds, 10)));
    args.push("--max-time", String(timeoutSeconds));
  }

  if (params?.proxy?.enabled && params.proxy.url.trim()) {
    args.push("--proxy", params.proxy.url.trim());
    if (params.proxy.noProxy.trim()) {
      args.push("--noproxy", params.proxy.noProxy.trim());
    }
  }

  for (const [key, value] of Object.entries(init.headers ?? {})) {
    args.push("--header", `${key}: ${value}`);
  }

  const hasBody = typeof init.body === "string";
  if (hasBody) {
    args.push("--data-binary", "@-");
  }

  const child = spawn("curl", args, {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.on("error", () => undefined);
  child.stdin.end(hasBody ? init.body : undefined);
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
    const stderrText = stderr.trim();
    const classification = classifyCurlRequestError(stderrText, exitCode);
    throw createHttpTransportError(
      stderrText || `curl 请求失败，退出码 ${exitCode}（requestId=${requestId}）。`,
      {
        code: classification.code,
        elapsedMs: performance.now() - startedAt,
        method: init.method,
        requestId,
        statusCode: classification.statusCode,
        transport: "curl",
        url: init.url,
      },
    );
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
      safeConsole("warn", "[http] failed to parse curl response headers", {
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

async function waitForCurlHeaders(params: {
  headerPath: string;
  method: TextRequestInit["method"];
  isClosed: () => boolean;
  exitCode: () => number;
  stderr: () => string;
  requestId: string;
  timeoutMs: number;
  url: string;
}): Promise<{ status: number; headers: Record<string, string> }> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < params.timeoutMs) {
    try {
      const raw = await fs.readFile(params.headerPath, "utf8");
      const parsed = parseCurlHeaderDump(raw);
      if (parsed) {
        if (parsed.status >= 300 && parsed.status < 400 && !params.isClosed()) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          continue;
        }
        return parsed;
      }
    } catch {
      // Header file is created by curl after the connection is established.
    }

    if (params.isClosed()) {
      const stderr = params.stderr().trim();
      const exitCode = params.exitCode();
      throw createHttpTransportError(
        stderr || `curl stream 请求在返回响应头前结束（requestId=${params.requestId}${exitCode ? `, exitCode=${exitCode}` : ""}）。`,
        {
          code: "curl_stream_closed_before_headers",
          elapsedMs: performance.now() - startedAt,
          method: params.method,
          requestId: params.requestId,
          statusCode: 502,
          transport: "curl",
          url: params.url,
        },
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const stderr = params.stderr().trim();
  throw createHttpTransportError(
    `等待 curl stream 响应头超时（${Math.round(params.timeoutMs / 1000)} 秒，requestId=${params.requestId}）。${stderr ? ` ${stderr}` : ""}`,
    {
      code: "curl_stream_header_timeout",
      elapsedMs: performance.now() - startedAt,
      method: params.method,
      requestId: params.requestId,
      statusCode: 504,
      transport: "curl",
      url: params.url,
    },
  );
}

async function runCurlStream(
  init: StreamRequestInit,
  params?: { requestId?: string; fallbackFrom?: "fetch"; proxy?: NetworkProxySettings; timeoutMs?: number },
): Promise<HttpStreamResponse> {
  if (init.signal?.aborted) {
    throw new Error("stream 请求已取消。");
  }

  const requestId = params?.requestId ?? nextRequestId();
  const startedAt = performance.now();
  const timeoutSeconds =
    typeof params?.timeoutMs === "number" && Number.isFinite(params.timeoutMs) && params.timeoutMs > 0
      ? Math.max(1, Math.ceil(params.timeoutMs / 1000))
      : undefined;
  const headerPath = path.join(os.tmpdir(), `azt-curl-headers-${process.pid}-${requestId}.txt`);
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--no-buffer",
    "--request",
    init.method,
    init.url,
    "--dump-header",
    headerPath,
  ];

  if (typeof timeoutSeconds === "number") {
    args.push("--connect-timeout", String(Math.min(timeoutSeconds, 10)));
    args.push("--max-time", String(timeoutSeconds));
  } else {
    args.push("--connect-timeout", "10");
  }

  if (params?.proxy?.enabled && params.proxy.url.trim()) {
    args.push("--proxy", params.proxy.url.trim());
    if (params.proxy.noProxy.trim()) {
      args.push("--noproxy", params.proxy.noProxy.trim());
    }
  }

  for (const [key, value] of Object.entries(init.headers ?? {})) {
    args.push("--header", `${key}: ${value}`);
  }

  const hasBody = typeof init.body === "string";
  if (hasBody) {
    args.push("--data-binary", "@-");
  }

  const child = spawn("curl", args, {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.on("error", () => undefined);
  child.stdin.end(hasBody ? init.body : undefined);
  const body = new PassThrough();
  body.on("error", () => undefined);
  const phases: Record<string, number> = {
    spawnCurlMs: performance.now() - startedAt,
  };

  let stderr = "";
  let closed = false;
  let exitCode = 0;

  const abort = () => {
    child.kill("SIGTERM");
  };
  init.signal?.addEventListener("abort", abort, { once: true });

  child.stdout.pipe(body);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.on("error", (error) => {
    closed = true;
    stderr = stderr || error.message;
    body.destroy(error);
  });
  child.on("close", (code) => {
    closed = true;
    exitCode = code ?? 1;
    init.signal?.removeEventListener("abort", abort);
    void fs.unlink(headerPath).catch(() => undefined);
    if (exitCode !== 0 && !init.signal?.aborted) {
      body.destroy(createHttpTransportError(
        stderr.trim() || `curl stream 请求失败，退出码 ${exitCode}（requestId=${requestId}）。`,
        {
          code: "curl_stream_body_failed",
          elapsedMs: performance.now() - startedAt,
          method: init.method,
          requestId,
          statusCode: 502,
          transport: "curl",
          url: init.url,
        },
      ));
    }
  });

  let parsed: { status: number; headers: Record<string, string> };
  try {
    parsed = await waitForCurlHeaders({
      headerPath,
      method: init.method,
      isClosed: () => closed,
      exitCode: () => exitCode,
      stderr: () => stderr,
      requestId,
      timeoutMs: getCurlStreamHeaderTimeoutMs(params?.timeoutMs),
      url: init.url,
    });
  } catch (error) {
    child.kill("SIGTERM");
    init.signal?.removeEventListener("abort", abort);
    void fs.unlink(headerPath).catch(() => undefined);
    body.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
  phases.waitForHeadersMs = performance.now() - startedAt - phases.spawnCurlMs;
  const timing = finalizeTiming(startedAt, phases);
  logHttpTiming({
    requestId,
    method: init.method,
    url: init.url,
    status: parsed.status,
    transport: "curl",
    timing,
    fallbackFrom: params?.fallbackFrom,
  });

  return {
    body: Readable.toWeb(body) as ReadableStream<Uint8Array>,
    status: parsed.status,
    transport: "curl",
    timing,
    requestId,
    headers: parsed.headers,
  };
}

async function loadNetworkProxySettings(): Promise<NetworkProxySettings | undefined> {
  try {
    const settings = await loadSettings();
    return settings.networkProxy;
  } catch (error) {
    safeConsole("warn", "[http] failed to load network proxy settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export async function requestText(init: TextRequestInit): Promise<HttpTextResponse> {
  const requestId = nextRequestId();
  const requestStartedAt = performance.now();
  const proxy = init.ignoreProxy ? undefined : init.proxyOverride ?? await loadNetworkProxySettings();
  const useCurlOnly = process.env.OAUTH_DEMO_USE_CURL === "1";
  const useConfiguredProxy = !!proxy?.enabled && !!proxy.url.trim();
  const timeoutMs = init.timeoutMs;
  const signal =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  if (!useCurlOnly && !useConfiguredProxy) {
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
      const timing = finalizeTiming(requestStartedAt, phases);
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
      safeConsole("warn", "[http] fetch attempt failed", {
        requestId,
        method: init.method,
        url: init.url,
        elapsedMs: roundMs(performance.now() - requestStartedAt),
        error: message,
      });
    }
  }

  const remainingTimeoutMs =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.max(1000, timeoutMs - (performance.now() - requestStartedAt))
      : undefined;

  return runCurlRequest(init, {
    requestId,
    fallbackFrom: useCurlOnly || useConfiguredProxy ? undefined : "fetch",
    proxy,
    timeoutMs: remainingTimeoutMs,
  });
}

export async function requestStream(init: StreamRequestInit): Promise<HttpStreamResponse> {
  const requestId = nextRequestId();
  const requestStartedAt = performance.now();
  const proxy = init.ignoreProxy ? undefined : init.proxyOverride ?? await loadNetworkProxySettings();
  const useCurlOnly = process.env.OAUTH_DEMO_USE_CURL === "1" || isElectronRuntime();
  const useConfiguredProxy = !!proxy?.enabled && !!proxy.url.trim();
  const timeoutMs = init.timeoutMs;

  if (!useCurlOnly && !useConfiguredProxy) {
    const phases: Record<string, number> = {};
    try {
      const fetchStartedAt = performance.now();
      const response = await fetch(init.url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: init.signal,
      });
      phases.waitForHeadersMs = performance.now() - fetchStartedAt;
      const timing = finalizeTiming(requestStartedAt, phases);
      logHttpTiming({
        requestId,
        method: init.method,
        url: init.url,
        status: response.status,
        transport: "fetch",
        timing,
      });

      if (!response.body) {
        throw new Error("fetch stream 响应缺少 body。");
      }

      return {
        body: response.body,
        status: response.status,
        transport: "fetch",
        timing,
        requestId,
        headers: normalizeHeaders(response.headers),
      };
    } catch (error) {
      if (init.signal?.aborted) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      safeConsole("warn", "[http] fetch stream attempt failed", {
        requestId,
        method: init.method,
        url: init.url,
        elapsedMs: roundMs(performance.now() - requestStartedAt),
        error: message,
      });
    }
  }

  const remainingTimeoutMs =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.max(1000, timeoutMs - (performance.now() - requestStartedAt))
      : undefined;

  return runCurlStream(init, {
    requestId,
    fallbackFrom: useCurlOnly || useConfiguredProxy ? undefined : "fetch",
    proxy,
    timeoutMs: remainingTimeoutMs,
  });
}
