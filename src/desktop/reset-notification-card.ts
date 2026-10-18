import { BrowserWindow, screen } from "electron";
import type { ResetCalendarNotification } from "../core/reset-calendar-types.js";
import { dismissAction, openAction, renderResetNotificationCard, resetCardHeight, resetCardWidth } from "./reset-notification-card-view.js";

async function createResetNotificationCard(event: ResetCalendarNotification, onOpen: () => void, onCreated?: (window: BrowserWindow) => void): Promise<BrowserWindow> {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = Math.min(resetCardWidth, workArea.width - 24);
  const window = new BrowserWindow({
    width, height: resetCardHeight(event), x: workArea.x + workArea.width - width - 12, y: workArea.y + 8,
    title: "AI Zero Token · 重置日历", show: false, frame: false, transparent: true,
    backgroundColor: "#00000000", hasShadow: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false },
  });
  onCreated?.(window);
  window.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-redirect", (navigation) => navigation.preventDefault());
  window.webContents.on("will-navigate", (navigation, url) => {
    navigation.preventDefault();
    if (url === dismissAction) window.close();
    else if (url === openAction) { onOpen(); if (!window.isDestroyed()) window.close(); }
  });
  window.webContents.on("render-process-gone", () => { if (!window.isDestroyed()) window.destroy(); });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderResetNotificationCard(event))}`),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Reset card load timed out")), 5_000); }),
    ]);
    return window;
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Used by the isolated design preview as well as the desktop host. */
export async function showResetNotificationCard(event: ResetCalendarNotification, onOpen: () => void): Promise<BrowserWindow> {
  const window = await createResetNotificationCard(event, onOpen);
  window.showInactive();
  return window;
}

/** Persistent cards, capped at three and stacked inside the current display's work area. */
export class ResetNotificationCards {
  private windows: BrowserWindow[] = [];
  private pending: BrowserWindow | null = null;
  private delivery: Promise<boolean> = Promise.resolve(true);
  private stopped = false;
  private listening = false;

  constructor(private readonly options: { onOpen(): void; onError(error: unknown): void }) {}

  notify(event: ResetCalendarNotification): Promise<boolean> {
    // Serialize simultaneous test/monitor deliveries so they cannot overlap or escape the cap.
    this.delivery = this.delivery.catch(() => false).then(async () => {
      if (this.stopped) return false;
      let window: BrowserWindow | undefined;
      try {
        window = await createResetNotificationCard(event, this.options.onOpen, (created) => { this.pending = created; });
        if (this.stopped || window.isDestroyed()) { if (!window.isDestroyed()) window.destroy(); return false; }
        if (!this.listening) {
          screen.on("display-removed", this.reposition);
          screen.on("display-metrics-changed", this.reposition);
          this.listening = true;
        }
        this.windows.unshift(window);
        window.once("closed", () => {
          this.windows = this.windows.filter((item) => item !== window);
          queueMicrotask(this.reposition);
        });
        this.reposition();
        if (window.isDestroyed()) return false;
        window.showInactive();
        return window.isVisible();
      } catch (error) {
        if (window && !window.isDestroyed()) window.destroy();
        if (!this.stopped) this.options.onError(error);
        return false;
      } finally { this.pending = null; }
    });
    return this.delivery;
  }

  private reposition = (): void => {
    if (this.stopped) return;
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    let y = workArea.y + 8;
    let kept = 0;
    for (const window of [...this.windows]) {
      if (window.isDestroyed()) continue;
      const height = window.getBounds().height;
      if (kept >= 3 || y + height > workArea.y + workArea.height - 8) { window.destroy(); continue; }
      const width = Math.min(resetCardWidth, workArea.width - 24);
      window.setBounds({ x: workArea.x + workArea.width - width - 12, y, width, height });
      y += height - 16; // Transparent shadow margins can overlap; the cards cannot.
      kept += 1;
    }
  };

  dispose(): void {
    this.stopped = true;
    if (this.listening) {
      screen.removeListener("display-removed", this.reposition);
      screen.removeListener("display-metrics-changed", this.reposition);
      this.listening = false;
    }
    for (const window of this.windows) if (!window.isDestroyed()) window.destroy();
    this.windows = [];
    if (this.pending && !this.pending.isDestroyed()) this.pending.destroy();
  }
}
