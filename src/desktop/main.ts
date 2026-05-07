import { app as electronApp, BrowserWindow, dialog, shell } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/index.js";

type GatewayServer = Awaited<ReturnType<typeof startServer>>;

let gatewayServer: GatewayServer | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let isRestarting = false;
let currentGatewayUrl: string | null = null;
let currentAdminUrl: string | null = null;

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = path.resolve(desktopDir, "../../build/icon.png");
const startupPageUrl = buildStartupPageUrl("正在启动本地网关");

electronApp.setName("AI Zero Token");

function createBrowserUrl(host: string, port: number): string {
  if (host === "0.0.0.0" || host === "::") {
    return `http://127.0.0.1:${port}`;
  }

  return `http://${host}:${port}`;
}

function isGatewayUrl(targetUrl: string, gatewayUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const gateway = new URL(gatewayUrl);
    return target.origin === gateway.origin;
  } catch {
    return false;
  }
}

function resolveAdminUrl(gatewayUrl: string): string {
  const devUrl = process.env.AZT_ADMIN_UI_DEV_URL?.trim();
  return devUrl || gatewayUrl;
}

function resolvePreferredGatewayParams(): { host?: string; port?: number } | undefined {
  const devUrl = process.env.AZT_DEV_GATEWAY_URL?.trim();
  if (!devUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(devUrl);
    const host = parsed.hostname || undefined;
    const port = Number.parseInt(parsed.port, 10);
    return {
      host,
      port: Number.isFinite(port) ? port : undefined,
    };
  } catch {
    return undefined;
  }
}

function isAllowedAppUrl(targetUrl: string): boolean {
  return Boolean((currentAdminUrl && isGatewayUrl(targetUrl, currentAdminUrl)) || (currentGatewayUrl && isGatewayUrl(targetUrl, currentGatewayUrl)));
}

async function restartGateway(): Promise<void> {
  if (isRestarting) {
    return;
  }

  isRestarting = true;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(buildStartupPageUrl("正在重启本地网关"));
    }
    await closeGatewayServer().catch((error) => {
      console.error("[desktop:gateway:restart-close]", error);
    });

    const server = await ensureGatewayServer();
    const gatewayUrl = createBrowserUrl(server.host, server.port);
    const adminUrl = resolveAdminUrl(gatewayUrl);
    currentGatewayUrl = gatewayUrl;
    currentAdminUrl = adminUrl;

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(adminUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[desktop:gateway:restart]", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(buildStartupPageUrl(`网关重启失败：${message}`)).catch(() => undefined);
    }
    dialog.showErrorBox("AI Zero Token 网关重启失败", message);
  } finally {
    isRestarting = false;
  }
}

function buildStartupPageUrl(subtitle: string): string {
  const iconUrl = `data:image/png;base64,${readFileSync(appIconPath).toString("base64")}`;
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root { color-scheme: dark; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #050816;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        display: grid;
        place-items: center;
      }
      .wrap {
        display: grid;
        gap: 18px;
        justify-items: center;
      }
      .mark {
        width: 96px;
        height: 96px;
        border-radius: 24px;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
      }
      .title {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 0;
      }
      .sub {
        font-size: 14px;
        color: rgba(248, 250, 252, 0.66);
      }
      .bar {
        width: 220px;
        height: 4px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
      }
      .bar::after {
        content: "";
        display: block;
        width: 45%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #93c5fd 0%, #66f0c0 55%, #f97316 100%);
        animation: load 1.2s ease-in-out infinite;
      }
      @keyframes load {
        0% { transform: translateX(-30%); }
        50% { transform: translateX(80%); }
        100% { transform: translateX(-30%); }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <img class="mark" src="${iconUrl}" alt="" />
      <div class="title">AI Zero Token</div>
      <div class="sub">${escapeHtml(subtitle)}</div>
      <div class="bar" aria-hidden="true"></div>
    </div>
  </body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function ensureGatewayServer(): Promise<GatewayServer> {
  if (gatewayServer) {
    return gatewayServer;
  }

  gatewayServer = await startServer({
    ...resolvePreferredGatewayParams(),
    onRestart: restartGateway,
  });
  const adminUrl = createBrowserUrl(gatewayServer.host, gatewayServer.port);

  console.log("AI Zero Token desktop gateway started.");
  console.log(`admin: ${adminUrl}`);
  console.log(`apiBase: ${adminUrl}/v1`);
  console.log(`listen: http://${gatewayServer.host}:${gatewayServer.port}`);

  return gatewayServer;
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: "AI Zero Token",
    icon: appIconPath,
    backgroundColor: "#050816",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppUrl(url)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  await mainWindow.loadURL(startupPageUrl);
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }

  const server = await ensureGatewayServer();
  if (!mainWindow) {
    return;
  }

  const gatewayUrl = createBrowserUrl(server.host, server.port);
  const adminUrl = resolveAdminUrl(gatewayUrl);
  currentGatewayUrl = gatewayUrl;
  currentAdminUrl = adminUrl;
  await mainWindow.loadURL(adminUrl);
}

function focusMainWindow(): void {
  if (!mainWindow) {
    void createMainWindow().catch(handleStartupError);
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

async function closeGatewayServer(): Promise<void> {
  if (!gatewayServer) {
    return;
  }

  const server = gatewayServer;
  gatewayServer = null;
  await server.app.close();
}

function handleStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[desktop:error]", error);

  if (electronApp.isReady()) {
    dialog.showErrorBox("AI Zero Token 启动失败", message);
  }

  electronApp.quit();
}

const hasSingleInstanceLock = electronApp.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  electronApp.quit();
} else {
  electronApp.on("second-instance", () => {
    focusMainWindow();
  });

  electronApp.whenReady().then(() => {
    if (process.platform === "darwin") {
      electronApp.dock?.setIcon(appIconPath);
    }
    electronApp.setAboutPanelOptions({
      applicationName: "AI Zero Token",
      applicationVersion: electronApp.getVersion(),
      iconPath: appIconPath,
    });
    return createMainWindow();
  }).catch(handleStartupError);

  electronApp.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      focusMainWindow();
    }
  });

  electronApp.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      electronApp.quit();
    }
  });

  electronApp.on("before-quit", (event) => {
    if (!gatewayServer || isQuitting) {
      return;
    }

    event.preventDefault();
    isQuitting = true;
    void closeGatewayServer()
      .catch((error) => {
        console.error("[desktop:gateway:close]", error);
      })
      .finally(() => {
        electronApp.quit();
      });
  });
}
