import { createGatewayContext } from "../../core/context.js";
import { startServer } from "../../server/index.js";
import { parseServeArgs } from "../shared.js";
import { spawn } from "node:child_process";

function createBrowserUrl(host: string, port: number): string {
  if (host === "0.0.0.0" || host === "::") {
    return `http://127.0.0.1:${port}`;
  }

  return `http://${host}:${port}`;
}

function createListenUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

function tryOpenBrowser(url: string): boolean {
  try {
    if (process.platform === "darwin") {
      const child = spawn("open", [url], { stdio: "ignore", detached: true });
      child.unref();
      return true;
    }

    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
      child.unref();
      return true;
    }

    const child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function runServeCommand(
  args: string[],
  options?: { openBrowserByDefault?: boolean },
): Promise<void> {
  const { host, port, openBrowser } = parseServeArgs(args);
  const ctx = createGatewayContext();
  const status = await ctx.authService.getStatus();
  const server = await startServer({ host, port });
  const adminUrl = createBrowserUrl(server.host, server.port);
  const listenUrl = createListenUrl(server.host, server.port);
  const shouldOpenBrowser = openBrowser ?? options?.openBrowserByDefault ?? false;

  console.log("本地网关已启动。");
  console.log(`url: ${listenUrl}`);
  console.log(`admin: ${adminUrl}`);
  console.log(`apiBase: ${adminUrl}/v1`);
  console.log(`corsOrigin: ${server.corsOrigin}`);
  console.log(`bodyLimitMB: ${(server.bodyLimit / 1024 / 1024).toFixed(1)}`);
  console.log(`activeProvider: ${status.activeProvider ?? "none"}`);
  console.log(`defaultModel: ${status.defaultModel}`);

  if (shouldOpenBrowser) {
    const opened = tryOpenBrowser(adminUrl);
    console.log(opened ? "已尝试打开管理页面。" : "未能自动打开管理页面，请手动访问上面的 admin 地址。");
  }
}
