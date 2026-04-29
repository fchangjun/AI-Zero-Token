import { ConfigService } from "../core/services/config-service.js";
import { createApp } from "./app.js";

const DEFAULT_BODY_LIMIT_MB = 32;

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

function resolveBodyLimitBytes(): number {
  const raw = process.env.AZT_BODY_LIMIT_MB?.trim();
  if (!raw) {
    return DEFAULT_BODY_LIMIT_MB * 1024 * 1024;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_BODY_LIMIT_MB * 1024 * 1024;
  }

  return Math.floor(value * 1024 * 1024);
}

export async function startServer(params?: { host?: string; port?: number }) {
  const bodyLimit = resolveBodyLimitBytes();
  const app = createApp({
    corsOrigin: resolveCorsOrigin(),
    bodyLimit,
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
    bodyLimit,
  };
}
