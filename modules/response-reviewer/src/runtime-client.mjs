import { readRuntime } from "./runtime.mjs";
import { resolveProjectDir } from "./paths.mjs";
import { SERVER_NAME, SERVER_PROTOCOL_VERSION } from "./version.mjs";

export function localRuntimeUrl(runtime) {
  const url = new URL(runtime.baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password) {
    throw new Error("Reviewer runtime must use loopback HTTP.");
  }
  return url;
}

export async function healthyRuntime(runtime) {
  if (!runtime?.baseUrl || !runtime?.token) return null;
  try {
    const response = await fetch(new URL("/api/health", localRuntimeUrl(runtime)), {
      signal: AbortSignal.timeout(1000), redirect: "error",
    });
    if (!response.ok) return null;
    const health = await response.json();
    return health.name === SERVER_NAME && health.protocolVersion === SERVER_PROTOCOL_VERSION &&
      health.instanceId === runtime.instanceId ? runtime : null;
  } catch { return null; }
}

export async function ensureReviewer() {
  const runtime = await healthyRuntime(await readRuntime());
  if (!runtime) throw new Error("请先在 AI Zero Token → 工具 → Reviewer 中启用服务；此插件不会启动独立服务。");
  const url = localRuntimeUrl(runtime);
  url.searchParams.set("token", runtime.token);
  return { ...runtime, url: url.toString(), started: false };
}

export async function openReviewer({ projectDir, threadKey = null } = {}) {
  if (!projectDir) throw new Error("Project directory is required.");
  const runtime = await ensureReviewer();
  const project = await apiRequest(runtime, "/api/projects", {
    method: "POST", body: {
      projectDir: resolveProjectDir(projectDir),
      threadKey: threadKey || process.env.CODEX_THREAD_ID || null,
    },
  });
  return { ...runtime, ...project };
}

export async function submitResponse(runtime, input) {
  return apiRequest(runtime, "/api/responses", { method: "POST", body: input });
}

export async function apiRequest(runtime, pathname, { method = "GET", body } = {}) {
  const base = localRuntimeUrl(runtime);
  const url = new URL(pathname, base);
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/")) throw new Error("Invalid Reviewer API path.");
  const response = await fetch(url, {
    method, redirect: "error", signal: AbortSignal.timeout(6000),
    headers: { "x-response-reviewer-token": runtime.token, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Reviewer HTTP ${response.status}`);
  return payload;
}
