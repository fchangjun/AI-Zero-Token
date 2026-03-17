import { ConfigService } from "../core/services/config-service.js";
import { createApp } from "./app.js";

export async function startServer(params?: { host?: string; port?: number }) {
  const app = createApp();
  const configService = new ConfigService();
  const defaults = await configService.getServerConfig();
  const host = params?.host ?? defaults.host;
  const port = params?.port ?? defaults.port;

  await app.listen({
    host,
    port,
  });

  return {
    app,
    host,
    port,
  };
}
