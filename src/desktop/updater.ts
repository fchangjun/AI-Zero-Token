import fs from "node:fs/promises";
import path from "node:path";
import { downloadRelease, fetchMacRelease, type UpdateFetch, type UpdateRelease } from "./update-release.js";
import { UpdateError, type DesktopUpdateState, type UpdateErrorCode } from "./update-types.js";

export interface UpdateInstaller {
  preflight(size: number): Promise<void>;
  createJob(): Promise<string>;
  prepare(job: string, version: string): Promise<void>;
  handOff(): Promise<void>;
  cleanup(): Promise<void>;
}

export class DesktopUpdater {
  private state: DesktopUpdateState;
  private release: UpdateRelease | null = null;
  private operation: Promise<DesktopUpdateState> | null = null;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private lastNotified?: string;
  private stopping = false;
  private job?: string;

  constructor(private readonly options: {
    currentVersion: string;
    arch: string;
    supported: boolean;
    recovered?: boolean;
    fetcher: UpdateFetch;
    installer: UpdateInstaller;
    onState: (state: DesktopUpdateState) => void;
    onAvailable: (release: UpdateRelease) => void;
    quit: () => void;
  }) {
    this.state = { phase: options.supported ? "idle" : "unsupported", currentVersion: options.currentVersion, recovered: options.recovered };
  }

  getState(): DesktopUpdateState { return { ...this.state }; }

  private setState(patch: Partial<DesktopUpdateState>) {
    this.state = { ...this.state, ...patch };
    this.options.onState(this.getState());
  }

  start(): void {
    if (!this.options.supported || this.timer) return;
    this.startupTimer = setTimeout(() => { void this.check(); }, 10_000);
    this.timer = setInterval(() => { void this.check(); }, 30 * 60_000);
    this.startupTimer.unref();
    this.timer.unref();
  }

  private run(action: () => Promise<void>, fallback: UpdateErrorCode): Promise<DesktopUpdateState> {
    if (this.operation) return this.operation;
    if (this.stopping || !this.options.supported) return Promise.resolve(this.getState());
    this.operation = action().catch((error: unknown) => {
      console.error("[desktop:update]", error);
      this.setState({ phase: "error", errorCode: error instanceof UpdateError ? error.code : fallback, percent: undefined });
    }).then(() => this.getState()).finally(() => { this.operation = null; });
    return this.operation;
  }

  check(): Promise<DesktopUpdateState> {
    if (["ready", "installing"].includes(this.state.phase)) return Promise.resolve(this.getState());
    return this.run(async () => {
      this.setState({ phase: "checking", errorCode: undefined });
      const release = await fetchMacRelease(this.options.fetcher, this.options.currentVersion, this.options.arch, AbortSignal.timeout(20_000));
      this.release = release;
      this.setState({
        phase: release ? "available" : "up-to-date", version: release?.version,
        releaseNotes: release?.notes, releaseUrl: release?.releaseUrl, checkedAt: Date.now(), percent: undefined,
        errorCode: release && !release.sha256 ? "missing-digest" : undefined,
      });
      if (release && this.lastNotified !== release.version) {
        this.lastNotified = release.version;
        this.options.onAvailable(release);
      }
    }, "check-failed");
  }

  download(): Promise<DesktopUpdateState> {
    if (["ready", "installing"].includes(this.state.phase) || !this.release) return Promise.resolve(this.getState());
    return this.run(async () => {
      const release = this.release!;
      if (!release.sha256) throw new UpdateError("missing-digest", "Missing GitHub asset checksum");
      this.abort = new AbortController();
      this.setState({ phase: "downloading", errorCode: undefined, percent: 0 });
      try {
        await this.options.installer.preflight(release.size);
        this.abort.signal.throwIfAborted();
        this.job = await this.options.installer.createJob();
        await downloadRelease({
          release, destination: path.join(this.job, "update.dmg"), fetcher: this.options.fetcher,
          signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(30 * 60_000)]),
          onProgress: (percent) => this.setState({ percent }),
        });
        this.abort.signal.throwIfAborted();
        this.setState({ phase: "preparing", percent: undefined });
        await this.options.installer.prepare(this.job, release.version);
        this.setState({ phase: "ready" });
      } catch (error) {
        await this.options.installer.cleanup();
        await this.cleanupJob();
        if (this.abort.signal.aborted) {
          this.setState({ phase: "available", percent: undefined });
        } else {
          if (!(error instanceof UpdateError) && this.state.phase === "preparing") throw new UpdateError("prepare-failed", String(error));
          throw error;
        }
      } finally { this.abort = undefined; }
    }, "download-failed");
  }

  async cancel(): Promise<DesktopUpdateState> {
    if (this.state.phase === "downloading") this.abort?.abort();
    return this.operation ?? this.getState();
  }

  install(): Promise<DesktopUpdateState> {
    if (this.state.phase !== "ready") return this.operation ?? Promise.resolve(this.getState());
    return this.run(async () => {
      this.setState({ phase: "installing", errorCode: undefined });
      try {
        await this.options.installer.handOff();
      } catch (error) {
        await this.options.installer.cleanup();
        await this.cleanupJob();
        throw error;
      }
      // The detached helper waits for this process to finish its normal gateway shutdown.
      this.options.quit();
    }, "install-failed");
  }

  private async cleanupJob(): Promise<void> {
    if (!this.job) return;
    const job = this.job;
    this.job = undefined;
    await fs.rm(path.join(job, "update.dmg"), { force: true }).catch(() => undefined);
    // Never recursively remove a job: an unsuccessful detach could leave a mounted DMG here.
    await fs.rmdir(path.join(job, "mount")).catch(() => undefined);
    await fs.rmdir(job).catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    clearTimeout(this.startupTimer);
    this.abort?.abort();
    await this.operation;
    if (this.state.phase !== "installing") {
      await this.options.installer.cleanup();
      await this.cleanupJob();
    }
  }
}
