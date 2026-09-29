import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ReviewerService } from "../tools/reviewer-service.js";

type StartCodexWithReviewerResult = { started: boolean; cancelled?: boolean };
type ToolRouteOptions = {
  onStartCodexWithReviewer?: (cdpPort: number) => Promise<StartCodexWithReviewerResult>;
};

// Tools stay below the existing local-only management boundary, not /v1.
// Additional tools can register their own service and routes here.
export function registerToolRoutes(app: FastifyInstance, options: ToolRouteOptions = {}): void {
  const reviewer = new ReviewerService();
  function captureOrigin(request: FastifyRequest): void {
    if (request.headers.origin) reviewer.allowFrameOrigin(request.headers.origin);
    reviewer.allowFrameOrigin(`${request.protocol}://${request.host}`);
  }
  app.addHook("onListen", async () => {
    const address = app.server.address();
    if (address && typeof address === "object") {
      reviewer.allowFrameOrigin(`http://127.0.0.1:${address.port}`);
      reviewer.allowFrameOrigin(`http://localhost:${address.port}`);
      reviewer.allowFrameOrigin(`http://[::1]:${address.port}`);
    }
    const dev = process.env.AZT_ADMIN_UI_DEV_URL;
    if (dev) { try { reviewer.allowFrameOrigin(dev); } catch { /* Invalid dev URL is not an allowed frame ancestor. */ } }
    await reviewer.restore();
  });
  app.addHook("onClose", async () => reviewer.close());
  app.get("/_gateway/tools", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return { tools: [{ id: "response-reviewer", name: "Response Reviewer", available: true }] };
  });
  app.get("/_gateway/tools/reviewer", async (request, reply) => {
    captureOrigin(request); reply.header("cache-control", "no-store");
    return reviewer.status();
  });
  app.put("/_gateway/tools/reviewer/settings", async (request, reply) => {
    captureOrigin(request); reply.header("cache-control", "no-store");
    try { await reviewer.configure(request.body); return await reviewer.status(); }
    catch (error) { return reply.code(400).send({ error: { message: error instanceof Error ? error.message : String(error) } }); }
  });
  app.post("/_gateway/tools/reviewer/start-codex", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    const status = await reviewer.status();
    if (!status.settings.enabled) {
      return reply.code(400).send({ error: { type: "reviewer_disabled", message: "请先启用 Reviewer 服务。" } });
    }
    if (!status.settings.codexButtonEnabled) {
      return reply.code(400).send({ error: { type: "codex_button_disabled", message: "请先启用“Codex 回复旁显示 Review 按钮”。" } });
    }
    if (!options.onStartCodexWithReviewer) {
      return reply.code(501).send({ error: { type: "not_supported", message: "当前环境不支持一键启动 Codex 接入。" } });
    }
    try {
      const result = await options.onStartCodexWithReviewer(status.settings.cdpPort);
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[gateway:reviewer:start-codex]", error);
      return reply.code(500).send({ error: { type: "start_codex_failed", message } });
    }
  });
  app.get("/_gateway/tools/reviewer/history", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return { responses: await reviewer.history() };
  });
  app.post("/_gateway/tools/reviewer/import", { bodyLimit: 8192 }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const body = z.object({ sourcePath: z.string().trim().min(1).max(4096) }).strict().parse(request.body);
      return await reviewer.importLegacy(body.sourcePath);
    } catch (error) { return reply.code(400).send({ error: { message: error instanceof Error ? error.message : String(error) } }); }
  });
}
