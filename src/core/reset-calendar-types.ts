/** Public announcements keep the data source's field names and date semantics. */
export type ResetSource =
  | { type: "x_post"; author: "thsottiaux"; url: string }
  | { type: "observed"; url?: string };

export type ResetTranslation = {
  zhCN: string;
  source: "ai-resets.com" | "ai-zero-token" | "codex-intel";
  machine?: boolean;
  provider?: string;
  modelRevision?: string;
  translatedAt?: string;
  sourceUrl: string;
  /** Exact API text this translation matched, for rejecting stale translations. */
  originalText: string;
};

export type ResetAnnouncement = {
  id: string;
  reset_type: "regular" | "banked";
  /** Announcement/observation time, not an account's quota recovery time. */
  announced_at: string;
  text: string;
  source: ResetSource;
  translation?: ResetTranslation;
};

export type ResetWatch = {
  level: "elevated" | "strong";
  reset_chance_percent: number | null;
  forecast_window: string;
  observed_at: string;
  expires_at: string;
  text: string;
  source: ResetSource;
  translation?: ResetTranslation;
};

export type ScheduledReset = ResetAnnouncement & {
  status: "scheduled";
  scheduled_for: string | null;
};

export type ResetStatus = {
  latest_reset: ResetAnnouncement | null;
  scheduled_reset: ScheduledReset | null;
  active_watch: ResetWatch | null;
  stats: {
    total: number;
    last_reset_at: string | null;
    days_since_last: number | null;
    avg_interval_days: number | null;
  };
};

export type ResetCalendarSettings = {
  signalNotifications: boolean;
  confirmedNotifications: boolean;
};

export type ResetCalendarState = {
  records: ResetAnnouncement[];
  status: ResetStatus | null;
  settings: ResetCalendarSettings;
  sync: {
    phase: "idle" | "syncing" | "ready" | "error";
    lastSyncedAt: string | null;
    generatedAt: string | null;
    error: string | null;
    nextSyncAt: string | null;
    /** Manual retry cooldown; absent in older backends. */
    manualRetryAt?: string | null;
    historyComplete: boolean;
    /** Actual origin of the displayed status, separate from successful live synchronization. */
    source?: "live" | "snapshot";
    snapshotCapturedAt?: string | null;
  };
  /** Whether the desktop host can display reset-calendar cards. */
  notificationsSupported: boolean;
};

export type ResetCalendarNotification = {
  kind: "signal" | "confirmed" | "test";
  stage?: "watch" | "scheduled" | "confirmed";
  title: string;
  body: string;
  detail?: string;
  eventId: string;
};
