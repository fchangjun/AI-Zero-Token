export type ResetType = "regular" | "banked";
export type ResetFilter = "all" | ResetType;

export type ResetSource = {
  type: "x_post" | "observed";
  author?: string;
  url?: string;
};

export type ResetTranslation = {
  zhCN: string;
  source: "ai-resets.com" | "ai-zero-token";
  sourceUrl: string;
  originalText: string;
};

export type ResetAnnouncement = {
  id: string;
  reset_type: ResetType;
  announced_at: string;
  text: string;
  source: ResetSource;
  translation?: ResetTranslation;
};

export type ScheduledReset = ResetAnnouncement & {
  status: "scheduled";
  scheduled_for: string | null;
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

export type ResetNotificationSettings = {
  signalNotifications: boolean;
  confirmedNotifications: boolean;
};

export type ResetCalendarState = {
  records: ResetAnnouncement[];
  status: ResetStatus | null;
  settings: ResetNotificationSettings;
  sync: {
    phase: "idle" | "syncing" | "ready" | "error";
    lastSyncedAt: string | null;
    generatedAt: string | null;
    error: string | null;
    nextSyncAt: string | null;
    historyComplete: boolean;
  };
  notificationsSupported: boolean;
};
