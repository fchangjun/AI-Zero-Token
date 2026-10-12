type CalendarWindow = {
  isDestroyed(): boolean;
  webContents: {
    getURL(): string;
    isLoading(): boolean;
    executeJavaScript(code: string): Promise<unknown>;
  };
};

/** Wait for the management page instead of interrupting startup or gateway reload. */
export class ResetCalendarNavigator {
  private pending = false;

  constructor(private readonly options: {
    getWindow(): CalendarWindow | null;
    focusWindow(): void;
    isAllowedUrl(url: string): boolean;
    isQuitting(): boolean;
    onError(error: unknown): void;
  }) {}

  request(): void {
    if (this.options.isQuitting()) return;
    this.pending = true;
    this.options.focusWindow();
    this.consume();
  }

  consume(): void {
    if (!this.pending || this.options.isQuitting()) return;
    const window = this.options.getWindow();
    if (!window || window.isDestroyed() || window.webContents.isLoading()
      || !this.options.isAllowedUrl(window.webContents.getURL())) return;
    this.pending = false;
    // A hash change keeps the current document and cannot abort an awaited loadURL.
    void window.webContents.executeJavaScript("window.location.hash = 'reset-calendar';").catch((error) => {
      if (this.options.getWindow() === window && !this.options.isQuitting()) this.pending = true;
      this.options.onError(error);
    });
  }
}
