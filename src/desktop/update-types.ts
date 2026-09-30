export type UpdatePhase = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "preparing" | "ready" | "installing" | "error" | "unsupported";

export type UpdateErrorCode = "check-failed" | "download-failed" | "download-network" | "download-write" | "integrity" | "missing-digest" | "install-location" | "install-permission" | "disk-space" | "invalid-app" | "prepare-failed" | "install-failed" | "recovery-required";

export type DesktopUpdateState = {
  phase: UpdatePhase;
  currentVersion: string;
  version?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
  downloadSize?: number;
  detailsOpen?: boolean;
  noticeDismissed?: boolean;
  checkedAt?: number;
  percent?: number;
  errorCode?: UpdateErrorCode;
  recovered?: boolean;
};

export type DesktopUpdateBridge = {
  getState(): Promise<DesktopUpdateState>;
  ready(): Promise<void>;
  check(): Promise<DesktopUpdateState>;
  download(): Promise<DesktopUpdateState>;
  cancel(): Promise<DesktopUpdateState>;
  install(): Promise<DesktopUpdateState>;
  openDetails(): Promise<DesktopUpdateState>;
  closeDetails(): Promise<DesktopUpdateState>;
  dismissNotice(): Promise<DesktopUpdateState>;
  onState(callback: (state: DesktopUpdateState) => void): () => void;
};

export class UpdateError extends Error {
  constructor(public readonly code: UpdateErrorCode, message: string) {
    super(message);
    this.name = "UpdateError";
  }
}
