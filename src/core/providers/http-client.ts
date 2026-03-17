import { spawn } from "node:child_process";

type HttpTextResponse = {
  body: string;
  status: number;
  transport: "fetch" | "curl";
};

type TextRequestInit = {
  body?: string;
  headers?: Record<string, string>;
  method: "GET" | "POST";
  timeoutMs?: number;
  url: string;
};

const CURL_STATUS_MARKER = "\n__CURL_STATUS__:";

async function runCurlRequest(init: TextRequestInit): Promise<HttpTextResponse> {
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

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `curl 请求失败，退出码 ${exitCode}`);
  }

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

  return {
    body,
    status,
    transport: "curl",
  };
}

export async function requestText(init: TextRequestInit): Promise<HttpTextResponse> {
  const useCurlOnly = process.env.OAUTH_DEMO_USE_CURL === "1";
  const timeoutMs = init.timeoutMs ?? 20000;

  if (!useCurlOnly) {
    try {
      const response = await fetch(init.url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      return {
        body: await response.text(),
        status: response.status,
        transport: "fetch",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`fetch 请求失败，准备回退到 curl: ${message}`);
    }
  }

  return runCurlRequest(init);
}
