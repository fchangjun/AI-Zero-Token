import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ResetCalendarService } from "../core/services/reset-calendar-service.js";

const settingsSchema = z.object({
  signalNotifications: z.boolean(),
  confirmedNotifications: z.boolean(),
}).strict();

export function registerResetCalendarRoutes(app: FastifyInstance, service: ResetCalendarService): void {
  // Start only after a real listener is ready. app.inject() must not poll the public internet.
  app.addHook("onListen", async () => { service.start(); });
  // Cancel a sync handler before Fastify waits for active HTTP requests to drain.
  app.addHook("preClose", async () => { await service.stop(); });
  app.addHook("onClose", async () => { await service.stop(); });

  app.get("/_gateway/admin/reset-calendar", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return service.getState();
  });
  app.post("/_gateway/admin/reset-calendar/sync", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return service.sync();
  });
  app.put("/_gateway/admin/reset-calendar/settings", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { type: "validation_error", message: "请提供两类重置提醒的开关状态。" } });
    }
    return service.updateSettings(parsed.data);
  });
  app.post("/_gateway/admin/reset-calendar/test-notification", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return service.testNotification();
  });
}
