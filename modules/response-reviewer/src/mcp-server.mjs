import readline from "node:readline";
import {
  healthyRuntime,
  openReviewer,
  submitResponse,
  ensureReviewer,
  apiRequest,
} from "./runtime-client.mjs";
import { readRuntime } from "./runtime.mjs";
import { APP_VERSION } from "./version.mjs";

const input = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

input.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.method?.startsWith("notifications/")) return;

  try {
    const result = await handle(message.method, message.params || {});
    respond(message.id, result);
  } catch (error) {
    respondError(message.id, error);
  }
});

async function handle(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: params.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "response-reviewer", version: APP_VERSION },
    };
  }

  if (method === "tools/list") {
    return {
      tools: [
        {
          name: "open_reviewer",
          description: "Connect to the Reviewer managed by AI Zero Token and return its browser URL. Enable Reviewer in AZT first.",
          inputSchema: {
            type: "object",
            required: ["projectDir"],
            properties: {
              projectDir: {
                type: "string",
                description: "Absolute path to the active Codex project.",
              },
              threadId: {
                type: "string",
                description: "Optional Codex thread id for a thread-scoped review workspace.",
              },
            },
          },
        },
        {
          name: "review_response",
          description: "Store a response in Response Reviewer and return a direct review URL.",
          inputSchema: {
            type: "object",
            required: ["projectDir", "content"],
            properties: {
              projectDir: { type: "string" },
              content: { type: "string", description: "Complete response text to review." },
              contentHtml: {
                type: "string",
                description: "Optional semantic HTML for preserving headings, lists, tables, and code blocks.",
              },
              files: {
                type: "array",
                description: "Optional local project files referenced by the response.",
                items: {
                  oneOf: [
                    { type: "string" },
                    {
                      type: "object",
                      required: ["path"],
                      properties: {
                        id: { type: "string" },
                        path: { type: "string" },
                        name: { type: "string" },
                        lineStart: { type: "integer", minimum: 1 },
                        lineEnd: { type: "integer", minimum: 1 },
                      },
                    },
                  ],
                },
              },
              title: { type: "string" },
              threadId: { type: "string" },
              turnId: { type: "string" },
            },
          },
        },
        {
          name: "get_review_prompt",
          description: "Compile the unresolved annotations for one stored response.",
          inputSchema: {
            type: "object",
            required: ["responseId"],
            properties: {
              responseId: { type: "string" },
            },
          },
        },
        {
          name: "reviewer_status",
          description: "Check whether the local Response Reviewer server is running.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
  }

  if (method === "tools/call") {
    const args = params.arguments || {};
    if (params.name === "open_reviewer") {
      requireProjectDir(args);
      const result = await openReviewer({
        projectDir: args.projectDir,
        threadKey: args.threadId || environmentThreadId(),
      });
      return textResult(
        `Response Reviewer is available: [Open Response Reviewer](${result.url})`,
        publicRuntime(result),
      );
    }

    if (params.name === "review_response") {
      requireProjectDir(args);
      if (!String(args.content || "").trim()) {
        throw new Error("content is required.");
      }
      const runtime = await openReviewer({
        projectDir: args.projectDir,
        threadKey: args.threadId || environmentThreadId(),
      });
      const saved = await submitResponse(runtime, {
        projectDir: args.projectDir,
        threadKey: args.threadId || environmentThreadId(),
        turnKey: args.turnId || null,
        title: args.title || "Codex response",
        content: args.content,
        contentHtml: args.contentHtml || "",
        files: Array.isArray(args.files) ? args.files : [],
      });
      return textResult(
        `Response is ready to review: [Open Response Reviewer](${saved.reviewUrl})`,
        {
          responseId: saved.response.id,
          reviewUrl: saved.reviewUrl,
          scopeId: saved.response.scopeId,
        },
      );
    }

    if (params.name === "get_review_prompt") {
      const runtime = await ensureReviewer();
      const { prompt } = await apiRequest(runtime, `/api/responses/${encodeURIComponent(args.responseId)}/prompt`);
      return textResult(prompt, { responseId: args.responseId, prompt });
    }

    if (params.name === "reviewer_status") {
      const runtime = await healthyRuntime(await readRuntime());
      return textResult(
        runtime ? "Response Reviewer is running." : "Response Reviewer is stopped.",
        { running: Boolean(runtime), runtime: runtime ? publicRuntime(runtime) : null },
      );
    }

    throw new Error(`Unknown tool: ${params.name}`);
  }

  if (method === "ping") return {};
  throw new Error(`Unsupported MCP method: ${method}`);
}

function requireProjectDir(args) {
  if (!String(args.projectDir || "").trim()) {
    throw new Error("projectDir is required.");
  }
}

function environmentThreadId() {
  return process.env.CODEX_THREAD_ID || null;
}

function publicRuntime(runtime) {
  return {
    url: runtime.url || runtime.baseUrl,
    baseUrl: runtime.baseUrl,
    scopeId: runtime.scopeId || null,
    projectDir: runtime.projectDir || null,
    threadKey: runtime.threadKey || null,
    instanceId: runtime.instanceId,
    version: runtime.version,
  };
}

function textResult(text, structuredContent = {}) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function respond(id, result) {
  if (id == null) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id, error) {
  if (id == null) return;
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: error.message || "MCP error" },
    })}\n`,
  );
}
