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

function isPortInUseError(error: unknown): boolean {
  const normalized = error as { code?: unknown; message?: unknown };
  if (normalized.code === "EADDRINUSE") {
    return true;
  }

  return typeof normalized.message === "string" && normalized.message.includes("EADDRINUSE");
}

export async function startServer(params?: { host?: string; port?: number; onRestart?: () => void | Promise<void> }) {
  const bodyLimit = resolveBodyLimitBytes();
  const configService = new ConfigService();
  const defaults = await configService.getServerConfig();
  const host = params?.host ?? defaults.host;
  const port = params?.port ?? defaults.port;
  const maxPortAttempts = 20;
  let lastError: unknown;

  for (let offset = 0; offset <= maxPortAttempts; offset += 1) {
    const listenPort = port + offset;
    const app = createApp({
      corsOrigin: resolveCorsOrigin(),
      bodyLimit,
      onRestart: params?.onRestart,
    });

    try {
      await app.listen({
        host,
        port: listenPort,
      });

      if (offset > 0) {
        console.warn(`[server] port ${port} was busy, using ${listenPort} instead.`);
        await configService.setServerConfig({ port: listenPort });
      }

      return {
        app,
        host,
        port: listenPort,
        corsOrigin: process.env.AZT_CORS_ORIGIN?.trim() || "*",
        bodyLimit,
      };
    } catch (error) {
      await app.close().catch(() => undefined);
      if (!isPortInUseError(error) || offset === maxPortAttempts) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError ?? new Error("无法启动本地服务。");
}
