import { app as electronApp, BrowserWindow, dialog, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/index.js";

type GatewayServer = Awaited<ReturnType<typeof startServer>>;

let gatewayServer: GatewayServer | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = path.resolve(desktopDir, "../../build/icon.png");

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

async function ensureGatewayServer(): Promise<GatewayServer> {
  if (gatewayServer) {
    return gatewayServer;
  }

  gatewayServer = await startServer();
  const adminUrl = createBrowserUrl(gatewayServer.host, gatewayServer.port);

  console.log("AI Zero Token desktop gateway started.");
  console.log(`admin: ${adminUrl}`);
  console.log(`apiBase: ${adminUrl}/v1`);
  console.log(`listen: http://${gatewayServer.host}:${gatewayServer.port}`);

  return gatewayServer;
}

async function createMainWindow(): Promise<void> {
  const server = await ensureGatewayServer();
  const gatewayUrl = createBrowserUrl(server.host, server.port);
  const adminUrl = resolveAdminUrl(gatewayUrl);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: "AI Zero Token",
    icon: appIconPath,
    backgroundColor: "#f8fafc",
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
    if (isGatewayUrl(url, adminUrl) || isGatewayUrl(url, gatewayUrl)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

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
