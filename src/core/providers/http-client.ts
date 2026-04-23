import { spawn } from "node:child_process";

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
  method: "GET" | "POST";
  timeoutMs?: number;
  url: string;
};

const CURL_STATUS_MARKER = "\n__CURL_STATUS__:";
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

async function runCurlRequest(
  init: TextRequestInit,
  params?: { requestId?: string; fallbackFrom?: "fetch" },
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
    `${CURL_STATUS_MARKER}%{http_code}`,
  ];

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
  const markerIndex = stdout.lastIndexOf(CURL_STATUS_MARKER);
  if (markerIndex === -1) {
    throw new Error("curl 响应缺少状态码标记。");
  }

  const body = stdout.slice(0, markerIndex);
  const statusText = stdout.slice(markerIndex + CURL_STATUS_MARKER.length).trim();
  const status = Number.parseInt(statusText, 10);
  if (!Number.isFinite(status)) {
    throw new Error(`无法解析 curl 状态码: ${statusText}`);
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
    headers: {},
  };
}

export async function requestText(init: TextRequestInit): Promise<HttpTextResponse> {
  const requestId = nextRequestId();
  const useCurlOnly = process.env.OAUTH_DEMO_USE_CURL === "1";
  const timeoutMs = init.timeoutMs;
  const signal =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  if (!useCurlOnly) {
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
    fallbackFrom: useCurlOnly ? undefined : "fetch",
  });
}
