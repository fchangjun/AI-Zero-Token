import { ConfigService } from "../core/services/config-service.js";
import { createApp } from "./app.js";

function resolveCorsOrigin(): true | string | RegExp | Array<string | RegExp> {
  const raw = process.env.AZT_CORS_ORIGIN?.trim();
  if (!raw || raw === "*") {
    return true;
  }

  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length <= 1 ? values[0] ?? true : values;
}

export async function startServer(params?: { host?: string; port?: number }) {
  const app = createApp({
    corsOrigin: resolveCorsOrigin(),
  });
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
    corsOrigin: process.env.AZT_CORS_ORIGIN?.trim() || "*",
  };
}
