import { app as electronApp, BrowserWindow, Menu, Tray, clipboard, dialog, nativeImage, screen, shell, type MessageBoxOptions } from "electron";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { ProfileSummary } from "../core/types.js";
import { startServer } from "../server/index.js";

type GatewayServer = Awaited<ReturnType<typeof startServer>>;
type AccountPanelTab = "recommended" | "recent" | "all";
type AccountPanelAction = "gateway" | "codex" | "both";

type AdminConfig = {
  status: {
    loggedIn: boolean;
    profileCount: number;
    serverHost: string;
    serverPort: number;
  };
  profile: ProfileSummary | null;
  profiles: ProfileSummary[];
  codex: {
    exists: boolean;
    path: string;
    accountId?: string;
    email?: string;
  };
  adminUrl: string;
  baseUrl: string;
};

let gatewayServer: GatewayServer | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let accountPanelWindow: BrowserWindow | null = null;
let isQuitting = false;
let isRestarting = false;
let isAccountPanelBusy = false;
let currentGatewayUrl: string | null = null;
let currentAdminUrl: string | null = null;

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = path.resolve(desktopDir, "../../build/icon.png");
const trayIconPath = path.resolve(desktopDir, "../../build/tray-icon-template.png");
const startupPageUrl = buildStartupPageUrl("正在启动本地网关");
const accountPanelWidth = 420;
const accountPanelHeight = 640;
const execFileAsync = promisify(execFile);
const codexAppPath = "/Applications/Codex.app";

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

function updateDesktopUrls(server: GatewayServer): void {
  const gatewayUrl = createBrowserUrl(server.host, server.port);
  currentGatewayUrl = gatewayUrl;
  currentAdminUrl = resolveAdminUrl(gatewayUrl);
}

async function restartGateway(): Promise<void> {
  if (isRestarting) {
    return;
  }

  isRestarting = true;
  void renderAccountPanel("正在重启本地网关...");
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(buildStartupPageUrl("正在重启本地网关"));
    }
    await closeGatewayServer().catch((error) => {
      console.error("[desktop:gateway:restart-close]", error);
    });

    const server = await ensureGatewayServer();
    updateDesktopUrls(server);

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(currentAdminUrl ?? createBrowserUrl(server.host, server.port));
    }
    void renderAccountPanel();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[desktop:gateway:restart]", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(buildStartupPageUrl(`网关重启失败：${message}`)).catch(() => undefined);
    }
    dialog.showErrorBox("AI Zero Token 网关重启失败", message);
    void renderAccountPanel(`网关重启失败：${message}`);
  } finally {
    isRestarting = false;
  }
}

async function restartCodexApp(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("当前仅支持在 macOS 上重启 Codex。");
  }

  await execFileAsync("osascript", ["-e", 'tell application "Codex" to quit']).catch(() => undefined);
  const gracefullyExited = await waitForCodexMainProcess(false, 6000);
  if (!gracefullyExited) {
    await execFileAsync("pkill", ["-TERM", "-x", "Codex"]).catch(() => undefined);
    await waitForCodexMainProcess(false, 3000);
  }

  await execFileAsync("open", [codexAppPath]).catch(async () => {
    await execFileAsync("open", ["-a", "Codex"]);
  });

  const started = await waitForCodexMainProcess(true, 8000);
  if (!started) {
    throw new Error("Codex 已退出，但未能确认重新启动。");
  }
}

async function isCodexMainProcessRunning(): Promise<boolean> {
  try {
    await execFileAsync("pgrep", ["-x", "Codex"]);
    return true;
  } catch {
    return false;
  }
}

async function waitForCodexMainProcess(expectedRunning: boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await isCodexMainProcessRunning()) === expectedRunning) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function confirmRestartCodexApp(): Promise<boolean> {
  const options: MessageBoxOptions = {
    type: "question",
    buttons: ["重启 Codex", "稍后手动重启"],
    defaultId: 0,
    cancelId: 1,
    title: "重启 Codex 以生效",
    message: "Codex 账号已切换，是否现在重启 Codex 客户端？",
    detail: "Codex 通常在启动时读取本机 auth.json。重启后新账号会立即生效。",
  };
  const parent = accountPanelWindow ?? mainWindow;
  const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);

  return result.response === 0;
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

function normalizeLabel(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function maskAccountLabel(value: string): string {
  const [name, domain] = value.split("@");
  if (!domain) {
    return value.length <= 10 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  const maskedName = name.length <= 4 ? `${name.slice(0, 1)}***` : `${name.slice(0, 3)}***${name.slice(-2)}`;
  return `${maskedName}@${domain}`;
}

function profileLabel(profile: ProfileSummary | null | undefined): string {
  if (!profile) {
    return "未选择";
  }

  return normalizeLabel(profile.email, profile.accountId);
}

function maskedProfileLabel(profile: ProfileSummary | null | undefined): string {
  return maskAccountLabel(profileLabel(profile));
}

function codexLabel(config: AdminConfig | null): string {
  if (!config?.codex.accountId && !config?.codex.email) {
    return "未应用";
  }

  const codexProfile = config.profiles.find((profile) => profile.accountId === config.codex.accountId);
  return maskedProfileLabel(codexProfile) || maskAccountLabel(normalizeLabel(config.codex.email, config.codex.accountId ?? "未知账号"));
}

function primaryUsage(profile: ProfileSummary): number {
  return Math.max(0, Math.min(100, profile.quota?.primaryUsedPercent ?? 0));
}

function secondaryUsage(profile: ProfileSummary): number {
  return Math.max(0, Math.min(100, profile.quota?.secondaryUsedPercent ?? 0));
}

function isQuotaExhausted(profile: ProfileSummary): boolean {
  return primaryUsage(profile) >= 100 || secondaryUsage(profile) >= 100;
}

function isProfileInvalid(profile: ProfileSummary): boolean {
  return Boolean(
    profile.authStatus?.state === "token_invalidated" ||
      profile.authStatus?.state === "auth_error" ||
      (profile.expiresAt && profile.expiresAt <= Date.now()),
  );
}

function profileHealth(profile: ProfileSummary): { key: "healthy" | "warning" | "expired" | "exhausted" | "invalid"; label: string } {
  if (profile.authStatus?.state === "token_invalidated") return { key: "invalid", label: "登录失效" };
  if (profile.authStatus?.state === "auth_error") return { key: "invalid", label: "认证异常" };
  if (profile.expiresAt && profile.expiresAt <= Date.now()) return { key: "expired", label: "已过期" };
  if (isQuotaExhausted(profile)) return { key: "exhausted", label: "额度耗尽" };
  if (primaryUsage(profile) >= 75 || secondaryUsage(profile) >= 75) return { key: "warning", label: "偏低" };
  return { key: "healthy", label: "健康" };
}

function timestampToMillis(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function compactDateTime(value: number | undefined): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function resetWindowLabel(profile: ProfileSummary, slot: "primary" | "secondary"): string {
  const minutes = slot === "primary" ? profile.quota?.primaryWindowMinutes : profile.quota?.secondaryWindowMinutes;
  if (!minutes) {
    return slot === "primary" ? "主额度" : "周额度";
  }
  if (minutes < 60) return `${minutes} 分钟重置`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时重置`;
  return `${Math.round(minutes / 60 / 24)} 天重置`;
}

function resetTimeLabel(profile: ProfileSummary, slot: "primary" | "secondary"): string {
  const direct = slot === "primary" ? profile.quota?.primaryResetAt : profile.quota?.secondaryResetAt;
  const after = slot === "primary" ? profile.quota?.primaryResetAfterSeconds : profile.quota?.secondaryResetAfterSeconds;
  const directMillis = timestampToMillis(direct);
  if (directMillis) {
    return compactDateTime(directMillis);
  }
  if (typeof after === "number" && after > 0) {
    const capturedAt = timestampToMillis(profile.quota?.capturedAt) || Date.now();
    return compactDateTime(capturedAt + after * 1000);
  }
  return "-";
}

function accountPanelProfiles(config: AdminConfig, tab: AccountPanelTab): ProfileSummary[] {
  const codexAccountId = config.codex.accountId;
  const profiles = [...config.profiles].sort((left, right) => {
    const leftCurrent = Number(left.isActive || left.accountId === codexAccountId);
    const rightCurrent = Number(right.isActive || right.accountId === codexAccountId);
    if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;

    const leftInvalid = Number(isProfileInvalid(left) || isQuotaExhausted(left));
    const rightInvalid = Number(isProfileInvalid(right) || isQuotaExhausted(right));
    if (leftInvalid !== rightInvalid) return leftInvalid - rightInvalid;

    return primaryUsage(left) - primaryUsage(right);
  });

  if (tab === "all") {
    return profiles;
  }

  if (tab === "recent") {
    return profiles.slice(0, 12);
  }

  return profiles.filter((profile) => !isProfileInvalid(profile) && !isQuotaExhausted(profile)).slice(0, 12);
}

function createTrayIcon(): Electron.NativeImage {
  if (process.platform !== "darwin") {
    return nativeImage.createFromPath(appIconPath).resize({ width: 18, height: 18 });
  }

  const icon = nativeImage.createFromPath(trayIconPath).resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);
  return icon;
}

function ensureTray(): void {
  if (tray) {
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("AI Zero Token");
  tray.on("click", () => {
    void toggleAccountPanel();
  });
  tray.on("right-click", () => {
    tray?.popUpContextMenu(Menu.buildFromTemplate([
      { label: "打开快速切换", click: () => void showAccountPanel() },
      { label: "打开控制台", click: () => focusMainWindow() },
      { type: "separator" },
      { label: "退出", role: "quit" },
    ]));
  });
}

function getAccountPanelPosition(): { x: number; y: number } {
  const trayBounds = tray?.getBounds();
  const display = trayBounds ? screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }) : screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const x = Math.min(
    Math.max(Math.round((trayBounds?.x ?? workArea.x + workArea.width - accountPanelWidth) + (trayBounds?.width ?? 0) / 2 - accountPanelWidth / 2), workArea.x + 12),
    workArea.x + workArea.width - accountPanelWidth - 12,
  );
  const y =
    process.platform === "darwin"
      ? Math.max((trayBounds?.y ?? workArea.y) + (trayBounds?.height ?? 0) + 8, workArea.y + 12)
      : Math.min((trayBounds?.y ?? workArea.y) - accountPanelHeight - 8, workArea.y + workArea.height - accountPanelHeight - 12);

  return { x, y: Math.max(y, workArea.y + 12) };
}

function ensureAccountPanelWindow(): BrowserWindow {
  if (accountPanelWindow && !accountPanelWindow.isDestroyed()) {
    return accountPanelWindow;
  }

  accountPanelWindow = new BrowserWindow({
    width: accountPanelWidth,
    height: accountPanelHeight,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    transparent: process.platform === "darwin",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  accountPanelWindow.webContents.setWindowOpenHandler(({ url }) => {
    void handleAccountPanelUrl(url);
    return { action: "deny" };
  });
  accountPanelWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("data:")) {
      return;
    }

    event.preventDefault();
    void handleAccountPanelUrl(url);
  });
  accountPanelWindow.on("blur", () => {
    if (!isAccountPanelBusy) {
      accountPanelWindow?.hide();
    }
  });
  accountPanelWindow.on("closed", () => {
    accountPanelWindow = null;
  });

  return accountPanelWindow;
}

async function showAccountPanel(): Promise<void> {
  ensureTray();
  const panel = ensureAccountPanelWindow();
  panel.setBounds({ ...getAccountPanelPosition(), width: accountPanelWidth, height: accountPanelHeight });
  await renderAccountPanel();
  panel.show();
  panel.focus();
}

async function toggleAccountPanel(): Promise<void> {
  if (accountPanelWindow?.isVisible()) {
    accountPanelWindow.hide();
    return;
  }

  await showAccountPanel();
}

async function fetchAdminConfig(): Promise<AdminConfig> {
  const server = await ensureGatewayServer();
  updateDesktopUrls(server);
  const response = await fetch(`${currentGatewayUrl}/_gateway/admin/config`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as AdminConfig;
}

async function postGatewayAction(pathname: string, body?: Record<string, unknown>): Promise<AdminConfig> {
  const server = await ensureGatewayServer();
  updateDesktopUrls(server);
  const response = await fetch(`${currentGatewayUrl}${pathname}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as AdminConfig | { config: AdminConfig; error?: { message?: string } } | { error?: { message?: string } };
  if (!response.ok) {
    const message = "error" in data ? data.error?.message : undefined;
    throw new Error(message || `HTTP ${response.status}`);
  }

  return "config" in data ? data.config : (data as AdminConfig);
}

async function applyAccountPanelProfile(profileId: string, action: AccountPanelAction): Promise<void> {
  if (isAccountPanelBusy) {
    return;
  }

  isAccountPanelBusy = true;
  await renderAccountPanel("正在应用账号...");
  try {
    if (action === "gateway" || action === "both") {
      await postGatewayAction("/_gateway/admin/profiles/activate", { profileId });
    }
    if (action === "codex" || action === "both") {
      await postGatewayAction("/_gateway/admin/codex/apply", { profileId });
    }
    await renderAccountPanel(action === "both" ? "已同时应用到网关和 Codex。" : action === "gateway" ? "已应用到网关。" : "已应用到本机 Codex。");
    if (action === "codex" || action === "both") {
      const shouldRestart = await confirmRestartCodexApp();
      if (shouldRestart) {
        await renderAccountPanel("正在重启 Codex...");
        await restartCodexApp();
        await renderAccountPanel("Codex 已重启。");
      } else {
        await renderAccountPanel("已应用到 Codex，重启客户端后生效。");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await renderAccountPanel(message);
  } finally {
    isAccountPanelBusy = false;
  }
}

async function handleAccountPanelUrl(url: string): Promise<void> {
  if (url === "azt-action://refresh") {
    isAccountPanelBusy = true;
    await renderAccountPanel("正在同步额度...");
    try {
      await postGatewayAction("/_gateway/admin/runtime-refresh", { staleOnly: false });
      await renderAccountPanel("额度已同步。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await renderAccountPanel(`同步失败：${message}`);
    } finally {
      isAccountPanelBusy = false;
    }
    return;
  }
  if (url === "azt-action://open-console") {
    accountPanelWindow?.hide();
    focusMainWindow();
    return;
  }
  if (url === "azt-action://copy-base-url") {
    const config = await fetchAdminConfig();
    clipboard.writeText(config.baseUrl);
    await renderAccountPanel("Base URL 已复制。");
    return;
  }
  if (url === "azt-action://restart-gateway") {
    await restartGateway();
    return;
  }

  if (!url.startsWith("azt-action://apply")) {
    return;
  }

  const parsed = new URL(url);
  const profileId = parsed.searchParams.get("profileId");
  const action = parsed.searchParams.get("target") as AccountPanelAction | null;
  if (!profileId || (action !== "gateway" && action !== "codex" && action !== "both")) {
    return;
  }

  await applyAccountPanelProfile(profileId, action);
}

async function renderAccountPanel(message = ""): Promise<void> {
  if (!accountPanelWindow || accountPanelWindow.isDestroyed()) {
    return;
  }

  try {
    const config = await fetchAdminConfig();
    await accountPanelWindow.loadURL(buildAccountPanelPage(config, message));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await accountPanelWindow.loadURL(buildAccountPanelPage(null, message || `状态读取失败：${detail}`));
  }
}

function buildAccountPanelPage(config: AdminConfig | null, message: string): string {
  const iconUrl = `data:image/png;base64,${readFileSync(appIconPath).toString("base64")}`;
  const activeLabel = maskedProfileLabel(config?.profile);
  const activeCodexLabel = codexLabel(config);
  const totalCount = config?.profiles.length ?? 0;
  const usableCount = config?.profiles.filter((profile) => !isProfileInvalid(profile) && !isQuotaExhausted(profile)).length ?? 0;
  const problemCount = Math.max(0, totalCount - usableCount);
  const profiles = config ? accountPanelProfiles(config, "all") : [];
  const codexAccountId = config?.codex.accountId;
  const boot = JSON.stringify({
    message,
    profiles: profiles.map((profile) => {
      const health = profileHealth(profile);
      const quotaRemaining = Math.max(0, Math.round(100 - primaryUsage(profile)));
      const isGateway = profile.isActive;
      const isCodex = codexAccountId === profile.accountId;
      return {
        profileId: profile.profileId,
        accountId: profile.accountId,
        label: maskedProfileLabel(profile),
        searchLabel: profileLabel(profile),
        plan: profile.quota?.planType ?? "unknown",
        quotaRemaining,
        meta: [profile.quota?.planType ?? "unknown", `${quotaRemaining}%`, isGateway ? "网关" : "", isCodex ? "Codex" : ""].filter(Boolean).join(" · "),
        initial: profileLabel(profile).slice(0, 1).toUpperCase(),
        primaryResetLabel: `${resetWindowLabel(profile, "primary")} ${resetTimeLabel(profile, "primary")}`,
        secondaryResetLabel: `${resetWindowLabel(profile, "secondary")} ${resetTimeLabel(profile, "secondary")}`,
        healthKey: health.key,
        healthLabel: health.label,
        isGateway,
        isCodex,
        isUsable: !isProfileInvalid(profile) && !isQuotaExhausted(profile),
      };
    }),
  }).replaceAll("</", "<\\/");

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; background: transparent; color: #101828; overflow: hidden; }
      body { padding: 7px; }
      a { color: inherit; text-decoration: none; }
      .panel { height: 100%; border: 1px solid rgba(208, 213, 221, 0.7); border-radius: 18px; background: rgba(252, 252, 253, 0.97); box-shadow: 0 10px 24px rgba(16, 24, 40, 0.08); overflow: hidden; }
      .inner { height: 100%; padding: 12px; display: grid; grid-template-rows: auto auto auto auto 1fr auto auto auto; gap: 8px; }
      .hero { position: relative; display: flex; align-items: center; gap: 8px; min-height: 46px; padding: 9px 10px; border: 1px solid #e6f0f4; border-radius: 13px; background: linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,249,255,0.88)); color: #101828; overflow: hidden; }
      .hero::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #14b8a6, #3b82f6, #f59e0b); }
      .mark { position: relative; width: 26px; height: 26px; border-radius: 7px; background: #fff; box-shadow: 0 1px 4px rgba(16, 24, 40, 0.08); }
      .hero-title { position: relative; font-size: 13px; font-weight: 800; line-height: 1.1; }
      .hero-sub { position: relative; margin-top: 2px; color: #667085; font-size: 10px; font-weight: 650; }
      .run { position: relative; margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border-radius: 999px; background: #dcfce7; color: #15803d; font-size: 10.5px; font-weight: 800; }
      .dot { width: 6px; height: 6px; border-radius: 999px; background: #22c55e; }
      .current { display: grid; gap: 5px; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 12px; background: linear-gradient(180deg, #fff, #f8fafc); }
      .status-card { min-width: 0; display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 8px; padding: 0; border: 0; border-radius: 0; background: transparent; }
      .label { color: #667085; font-size: 10.5px; font-weight: 800; }
      .value { margin-top: 0; overflow: hidden; color: #101828; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
      .subvalue { margin-top: 0; overflow: hidden; color: #667085; font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .search { height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; }
      .search svg { flex: 0 0 auto; color: #0ea5e9; }
      .search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #101828; font: inherit; font-size: 12px; font-weight: 700; }
      .search input::placeholder { color: #667085; }
      .kbd { padding: 3px 8px; border: 1px solid #d0d5dd; border-radius: 7px; background: #f8fafc; color: #667085; font-size: 10px; font-weight: 800; }
      .tabs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px; padding: 3px; border-radius: 11px; background: #f2f4f7; }
      .tab { height: 26px; border: 0; display: grid; place-items: center; border-radius: 8px; color: #667085; font-size: 10.5px; font-weight: 800; cursor: pointer; }
      .tab.active { background: #e0f2fe; color: #0369a1; box-shadow: inset 0 0 0 1px #bae6fd; }
      .section-title { display: none; }
      .list { min-height: 0; display: grid; align-content: start; gap: 7px; overflow-y: auto; padding-right: 4px; }
      .list::-webkit-scrollbar { width: 5px; }
      .list::-webkit-scrollbar-thumb { border-radius: 999px; background: #98a2b3; }
      .account { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto auto; row-gap: 7px; padding: 10px 10px 9px; border: 1px solid #e5e7eb; border-radius: 13px; background: linear-gradient(180deg, #ffffff, #fbfdff); box-shadow: inset 3px 0 0 var(--accent, #3b82f6); }
      .account-head { min-width: 0; display: flex; align-items: center; gap: 7px; padding-right: 72px; }
      .account-title { overflow: hidden; color: #111827; font-size: 12px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
      .plan-chip { flex: 0 0 auto; padding: 2px 6px; border-radius: 999px; background: color-mix(in srgb, var(--accent, #3b82f6) 10%, white); color: var(--accent, #2563eb); font-size: 9px; font-weight: 850; text-transform: lowercase; }
      .status-row { grid-column: 1 / 3; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; }
      .quota-text { color: #475467; font-size: 10px; font-weight: 850; }
      .quota { min-width: 92px; height: 5px; border-radius: 999px; background: #eef2f6; overflow: hidden; }
      .quota span { display: block; height: 100%; border-radius: inherit; background: var(--accent, #3b82f6); }
      .health { width: max-content; min-width: 40px; padding: 3px 8px; border-radius: 999px; text-align: center; font-size: 9.5px; font-weight: 850; }
      .health.healthy { background: #dcfce7; color: #15803d; }
      .health.warning, .health.exhausted { background: #fef3c7; color: #b45309; }
      .health.invalid, .health.expired { background: #fee2e2; color: #b42318; }
      .badges { position: absolute; top: 9px; right: 10px; display: flex; justify-content: flex-end; gap: 4px; }
      .corner-badge { height: 18px; min-width: 34px; display: grid; place-items: center; padding: 0 7px; border-radius: 999px; font-size: 9px; font-weight: 850; }
      .corner-badge.api { background: #dcfce7; color: #15803d; }
      .corner-badge.codex { background: #e0e7ff; color: #3730a3; }
      .account-foot { grid-column: 1 / 3; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .reset-times { min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; color: #667085; font-size: 9.6px; font-weight: 750; white-space: nowrap; }
      .reset-pill { padding: 3px 6px; border-radius: 8px; background: #f8fafc; }
      .actions { flex: 0 0 auto; display: flex; gap: 4px; justify-content: flex-end; }
      .btn { height: 21px; min-width: 42px; display: grid; place-items: center; padding: 0 8px; border-radius: 999px; background: #f2f4f7; color: #667085; font-size: 9.5px; font-weight: 850; }
      .btn.gateway { background: #ecfdf3; color: #15803d; }
      .btn.codex { background: #eef4ff; color: #3538cd; }
      .btn.disabled { pointer-events: none; opacity: 0.48; }
      .summary, .problems { display: flex; align-items: center; justify-content: space-between; height: 28px; padding: 0 10px; border: 1px solid #eaecf0; border-radius: 10px; background: #f8fafc; color: #344054; font-size: 10.5px; font-weight: 800; }
      .problems { background: #fff; }
      .message { min-height: 14px; color: #667085; font-size: 10px; font-weight: 800; }
      .footer { display: grid; grid-template-columns: 1fr 1.12fr 1fr 1fr; gap: 6px; padding-top: 1px; border-top: 1px solid #eaecf0; }
      .footer a { height: 32px; display: grid; place-items: center; border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; color: #344054; font-size: 10.5px; font-weight: 800; }
      .footer a.primary { border-color: #0ea5e9; background: #0ea5e9; color: #fff; }
      .empty { padding: 24px; border: 1px dashed #d0d5dd; border-radius: 13px; color: #667085; text-align: center; font-size: 12px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="panel">
      <div class="inner">
        <header class="hero">
          <img class="mark" src="${iconUrl}" alt="" />
          <div>
            <div class="hero-title">AI Zero Token</div>
            <div class="hero-sub">快速切换账号</div>
          </div>
          <div class="run"><span class="dot"></span>${config?.status.loggedIn ? "运行中" : "待登录"}</div>
        </header>

        <section class="current">
          <div class="status-card">
            <div class="label">网关</div>
            <div class="value">${escapeHtml(activeLabel)}</div>
            <div class="subvalue">${escapeHtml(config?.baseUrl ? "API" : "启动中")}</div>
          </div>
          <div class="status-card">
            <div class="label">Codex</div>
            <div class="value">${escapeHtml(activeCodexLabel)}</div>
            <div class="subvalue">${escapeHtml(config?.codex.exists ? "已应用" : "未应用")}</div>
          </div>
        </section>

        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input id="query" type="search" placeholder="搜索邮箱、标签、套餐..." autofocus />
          <span class="kbd">⌘ K</span>
        </label>

        <nav class="tabs">
          <button class="tab active" type="button" data-tab="recommended">推荐可用</button>
          <button class="tab" type="button" data-tab="recent">最近使用</button>
          <button class="tab" type="button" data-tab="all">全部 ${totalCount}</button>
        </nav>

        <div class="section-title" id="sectionTitle">推荐可用 · 按健康和最近使用排序</div>
        <main class="list" id="list"></main>
        <div class="summary"><span><span id="shownCount">0</span> / ${usableCount} 可用</span><span>总数 ${totalCount}</span></div>
        <div class="problems"><span>${problemCount} 个需处理</span><span>已折叠</span></div>
        <div class="message">${escapeHtml(message)}</div>
        <footer class="footer">
          <a class="primary" href="azt-action://refresh">刷新状态</a>
          <a href="azt-action://open-console">打开控制台</a>
          <a href="azt-action://copy-base-url">复制 URL</a>
          <a href="azt-action://restart-gateway">重启网关</a>
        </footer>
      </div>
    </div>
    <script>
      const boot = ${boot};
      let tab = "recommended";
      const list = document.getElementById("list");
      const query = document.getElementById("query");
      const shownCount = document.getElementById("shownCount");
      const sectionTitle = document.getElementById("sectionTitle");
      const tabs = Array.from(document.querySelectorAll(".tab"));
      const html = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
      const actionUrl = (profileId, target) => "azt-action://apply?target=" + encodeURIComponent(target) + "&profileId=" + encodeURIComponent(profileId);
      const accent = (item) => item.healthKey === "healthy" ? "#16a34a" : item.healthKey === "warning" ? "#f59e0b" : item.healthKey === "exhausted" ? "#ef4444" : item.healthKey === "invalid" || item.healthKey === "expired" ? "#dc2626" : "#3b82f6";
      function baseRows() {
        const rows = boot.profiles.slice();
        if (tab === "recommended") return rows.filter((item) => item.isUsable).slice(0, 12);
        if (tab === "recent") return rows.slice(0, 12);
        return rows;
      }
      function render() {
        const q = query.value.trim().toLowerCase();
        let rows = baseRows().filter((item) => !q || [item.searchLabel, item.accountId, item.meta, item.healthLabel].join(" ").toLowerCase().includes(q));
        if (q) rows = boot.profiles.filter((item) => [item.searchLabel, item.accountId, item.meta, item.healthLabel].join(" ").toLowerCase().includes(q));
        sectionTitle.textContent = q ? "搜索结果" : tab === "recommended" ? "推荐可用 · 按健康和最近使用排序" : tab === "recent" ? "最近使用" : "全部账号";
        shownCount.textContent = String(rows.length);
        list.innerHTML = rows.length ? rows.map((item) => {
          const disabled = item.isUsable ? "" : " disabled";
          return \`
            <article class="account" style="--accent:\${accent(item)}">
              <div class="account-head">
                <div class="account-title">\${html(item.label)}</div>
                <span class="plan-chip">\${html(item.plan)}</span>
              </div>
              <div class="badges">\${item.isGateway ? '<span class="corner-badge api">API</span>' : ''}\${item.isCodex ? '<span class="corner-badge codex">Codex</span>' : ''}</div>
              <div class="status-row">
                <span class="quota-text">\${html(item.quotaRemaining)}%</span>
                <span class="quota"><span style="width:\${Math.max(0, Math.min(100, item.quotaRemaining))}%"></span></span>
                <span class="health \${html(item.healthKey)}">\${html(item.healthLabel)}</span>
              </div>
              <div class="account-foot">
                <div class="reset-times">
                  <span class="reset-pill">\${html(item.primaryResetLabel)}</span>
                  <span class="reset-pill">\${html(item.secondaryResetLabel)}</span>
                </div>
                <div class="actions">
                  <a class="btn gateway\${item.isGateway ? " disabled" : disabled}" href="\${actionUrl(item.profileId, "gateway")}">网关</a>
                  <a class="btn codex\${item.isCodex ? " disabled" : disabled}" href="\${actionUrl(item.profileId, "codex")}">Codex</a>
                </div>
              </div>
            </article>\`;
        }).join("") : '<div class="empty">没有匹配的账号</div>';
      }
      tabs.forEach((button) => {
        button.addEventListener("click", () => {
          tab = button.dataset.tab;
          tabs.forEach((item) => item.classList.toggle("active", item === button));
          render();
        });
      });
      query.addEventListener("input", render);
      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          query.focus();
        }
      });
      render();
    </script>
  </body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function ensureGatewayServer(): Promise<GatewayServer> {
  if (gatewayServer) {
    return gatewayServer;
  }

  gatewayServer = await startServer({
    ...resolvePreferredGatewayParams(),
    onRestart: restartGateway,
    onRestartCodex: restartCodexApp,
  });
  updateDesktopUrls(gatewayServer);

  console.log("AI Zero Token desktop gateway started.");
  console.log(`admin: ${currentGatewayUrl}`);
  console.log(`apiBase: ${currentGatewayUrl}/v1`);
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

  updateDesktopUrls(server);
  await mainWindow.loadURL(currentAdminUrl ?? createBrowserUrl(server.host, server.port));
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
  currentGatewayUrl = null;
  currentAdminUrl = null;
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
    ensureTray();
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
