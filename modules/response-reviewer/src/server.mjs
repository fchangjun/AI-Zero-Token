import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { openCodexComposer } from "./codex-composer.mjs";
import {
  acknowledgeOutboxItem,
  addAnnotation,
  compileReviewPrompt,
  deleteAnnotation,
  enqueuePrompt,
  getResponse,
  getWorkspaceBinding,
  listResponses,
  nextOutboxItem,
  readResponseFile,
  registerProject,
  saveResponse,
  setResponseWorkspace,
} from "./store.mjs";
import { clearRuntime, newRuntimeIdentity, writeRuntime } from "./runtime.mjs";
import { pluginRoot, dataRoot, withDataRoot } from "./paths.mjs";
import {
  APP_VERSION,
  SERVER_NAME,
  SERVER_PROTOCOL_VERSION,
} from "./version.mjs";

const publicRoot = path.join(pluginRoot, "public");
const maxBodyBytes = 5 * 1024 * 1024;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
]);

export async function createServer({
  host = "127.0.0.1",
  port = 43127,
  openComposer = openCodexComposer,
  root = dataRoot(),
  frameOrigins = [],
} = {}) {
  if (!isLoopbackHostname(host)) {
    throw new Error("Response Reviewer may only listen on a loopback address.");
  }

  const identity = newRuntimeIdentity();
  let baseUrl = null;
  let shuttingDown = false;
  const sockets = new Set();
  const requests = new Set();

  const server = http.createServer((request, response) => {
    const task = withDataRoot(root, () => handleRequest(request, response)).catch((error) => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      sendJson(response, error.statusCode || 500, {
        error: error.message || "Unexpected server error.",
      });
    });
    requests.add(task);
    task.finally(() => requests.delete(task)).catch(() => {});
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  async function handleRequest(request, response) {
    applySecurityHeaders(response, frameOrigins);
    applyCors(request, response, frameOrigins);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (!validHostHeader(request.headers.host)) {
      sendJson(response, 403, { error: "Loopback host required." });
      return;
    }

    const url = new URL(request.url || "/", baseUrl || "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        name: SERVER_NAME,
        version: APP_VERSION,
        protocolVersion: SERVER_PROTOCOL_VERSION,
        instanceId: identity.instanceId,
      });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (!hasValidToken(request, url, identity.token)) {
        sendJson(response, 401, { error: "Invalid Response Reviewer token." });
        return;
      }
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  }

  async function handleApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/runtime") {
      sendJson(response, 200, {
        name: SERVER_NAME,
        version: APP_VERSION,
        protocolVersion: SERVER_PROTOCOL_VERSION,
        instanceId: identity.instanceId,
        baseUrl,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/projects") {
      const body = await readJsonBody(request);
      const project = await registerProject({
        projectDir: body.projectDir,
        threadKey: body.threadKey || null,
      });
      sendJson(response, 200, {
        ...project,
        url: reviewUrl({ scopeId: project.scopeId }),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/workspaces") {
      const binding = await getWorkspaceBinding(url.searchParams.get("threadKey"));
      sendJson(response, 200, { binding });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/responses") {
      const responses = await listResponses({
        scopeId: url.searchParams.get("scopeId"),
        limit: url.searchParams.get("limit"),
      });
      sendJson(response, 200, { responses });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/responses") {
      const body = await readJsonBody(request);
      const saved = await saveResponse(body);
      sendJson(response, 201, {
        response: saved,
        reviewUrl: reviewUrl({
          responseId: saved.id,
          scopeId: saved.scopeId,
        }),
      });
      return;
    }

    const responseMatch = url.pathname.match(/^\/api\/responses\/([^/]+)$/);
    if (request.method === "GET" && responseMatch) {
      const saved = await getResponse(decodeURIComponent(responseMatch[1]));
      if (!saved) {
        sendJson(response, 404, { error: "Response was not found." });
        return;
      }
      sendJson(response, 200, { response: saved });
      return;
    }

    const responseWorkspaceMatch = url.pathname.match(
      /^\/api\/responses\/([^/]+)\/workspace$/,
    );
    if (request.method === "PATCH" && responseWorkspaceMatch) {
      const saved = await setResponseWorkspace(
        decodeURIComponent(responseWorkspaceMatch[1]),
        await readJsonBody(request),
      );
      sendJson(response, 200, { response: saved });
      return;
    }

    const annotationMatch = url.pathname.match(
      /^\/api\/responses\/([^/]+)\/annotations$/,
    );
    if (request.method === "POST" && annotationMatch) {
      const annotation = await addAnnotation(
        decodeURIComponent(annotationMatch[1]),
        await readJsonBody(request),
      );
      sendJson(response, 201, { annotation });
      return;
    }

    const responseFileMatch = url.pathname.match(
      /^\/api\/responses\/([^/]+)\/files\/([^/]+)$/,
    );
    if (request.method === "GET" && responseFileMatch) {
      const file = await readResponseFile(
        decodeURIComponent(responseFileMatch[1]),
        decodeURIComponent(responseFileMatch[2]),
      );
      sendJson(response, 200, { file });
      return;
    }

    const deleteAnnotationMatch = url.pathname.match(
      /^\/api\/responses\/([^/]+)\/annotations\/([^/]+)$/,
    );
    if (request.method === "DELETE" && deleteAnnotationMatch) {
      const deleted = await deleteAnnotation(
        decodeURIComponent(deleteAnnotationMatch[1]),
        decodeURIComponent(deleteAnnotationMatch[2]),
      );
      sendJson(response, deleted ? 200 : 404, { deleted });
      return;
    }

    const promptMatch = url.pathname.match(
      /^\/api\/responses\/([^/]+)\/prompt$/,
    );
    if (request.method === "GET" && promptMatch) {
      const saved = await getResponse(decodeURIComponent(promptMatch[1]));
      if (!saved) {
        sendJson(response, 404, { error: "Response was not found." });
        return;
      }
      sendJson(response, 200, { prompt: compileReviewPrompt(saved) });
      return;
    }

    const composerMatch = url.pathname.match(
      /^\/api\/responses\/([^/]+)\/composer$/,
    );
    if (request.method === "POST" && composerMatch) {
      await readJsonBody(request);
      const saved = await getResponse(decodeURIComponent(composerMatch[1]));
      if (!saved) {
        sendJson(response, 404, { error: "Response was not found." });
        return;
      }
      if (!saved.threadKey) {
        sendJson(response, 409, { error: "当前审阅没有绑定 Codex 任务。" });
        return;
      }
      const composer = await openComposer({
        threadKey: saved.threadKey,
        prompt: compileReviewPrompt(saved),
      });
      sendJson(response, 200, { composer });
      return;
    }

    const enqueueMatch = url.pathname.match(
      /^\/api\/responses\/([^/]+)\/outbox$/,
    );
    if (request.method === "POST" && enqueueMatch) {
      await readJsonBody(request);
      const item = await enqueuePrompt(decodeURIComponent(enqueueMatch[1]));
      sendJson(response, 201, { item });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/outbox/next") {
      const item = await nextOutboxItem(url.searchParams.get("threadKey"));
      sendJson(response, 200, { item });
      return;
    }

    const acknowledgeMatch = url.pathname.match(/^\/api\/outbox\/([^/]+)\/ack$/);
    if (request.method === "POST" && acknowledgeMatch) {
      await readJsonBody(request);
      const acknowledged = await acknowledgeOutboxItem(
        decodeURIComponent(acknowledgeMatch[1]),
      );
      sendJson(response, acknowledged ? 200 : 404, { acknowledged });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/shutdown") {
      await readJsonBody(request);
      sendJson(response, 403, { error: "Reviewer lifecycle is managed by AI Zero Token." });
      return;
    }

    sendJson(response, 404, { error: "API route was not found." });
  }

  function reviewUrl({ responseId = null, scopeId = null } = {}) {
    const url = new URL(baseUrl);
    url.searchParams.set("token", identity.token);
    if (responseId) url.searchParams.set("response", responseId);
    if (scopeId) url.searchParams.set("scope", scopeId);
    return url.toString();
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  baseUrl = `http://${host}:${actualPort}/`;
  const runtime = {
    name: SERVER_NAME,
    version: APP_VERSION,
    protocolVersion: SERVER_PROTOCOL_VERSION,
    instanceId: identity.instanceId,
    token: identity.token,
    baseUrl,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  try {
    await withDataRoot(root, () => writeRuntime(runtime));
  } catch (error) {
    server.close();
    throw error;
  }

  return {
    server,
    runtime,
    reviewUrl,
    async close() {
      if (shuttingDown) return;
      shuttingDown = true;
      await new Promise((resolve) => {
        server.close(resolve);
        // Explicitly destroy keep-alive sockets: Bun's node:http adapter can
        // retain these after closeAllConnections(), unlike production Node.
        for (const socket of sockets) socket.destroy();
      });
      // A disconnected client must not outlive the service's data ownership.
      await Promise.allSettled([...requests]);
      await withDataRoot(root, () => clearRuntime(identity.instanceId));
    },
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("JSON object required.");
    return value;
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalized = path.normalize(requested);
  const filePath = path.resolve(publicRoot, normalized);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`) && filePath !== publicRoot) {
    sendJson(response, 403, { error: "Invalid asset path." });
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(content);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const index = await fs.readFile(path.join(publicRoot, "index.html"));
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(index);
  }
}

function hasValidToken(request, url, expectedToken) {
  const header = request.headers["x-response-reviewer-token"];
  return header === expectedToken || url.searchParams.get("token") === expectedToken;
}

function applySecurityHeaders(response, frameOrigins) {
  const ancestors = frameOrigins.map((value) => {
    if (value === "app://-") return value;
    const url = new URL(value);
    if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname)) {
      throw new Error("Reviewer frame origin must be local HTTP.");
    }
    return url.origin;
  });
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("cache-control", "no-store");
  response.setHeader(
    "content-security-policy",
    `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors ${ancestors.join(" ") || "'none'"}; form-action 'self'`,
  );
}

function applyCors(request, response, frameOrigins) {
  const origin = request.headers.origin;
  if (origin && frameOrigins.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
  }
  response.setHeader(
    "access-control-allow-headers",
    "content-type, x-response-reviewer-token",
  );
  response.setHeader(
    "access-control-allow-methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function validHostHeader(hostHeader) {
  if (!hostHeader) return false;
  const hostname = hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : hostHeader.split(":")[0];
  return isLoopbackHostname(hostname);
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.(?:\d{1,2}|1\d\d|2[0-4]\d|25[0-5])){3}$/.test(normalized)
  );
}
