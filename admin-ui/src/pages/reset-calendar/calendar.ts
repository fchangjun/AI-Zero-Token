import type { ResetAnnouncement, ResetFilter, ResetStatus, ResetWatch } from "./types";

export const RESET_TIME_ZONE = "Asia/Shanghai";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESET_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function beijingDay(value: string | number | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = dayFormatter.formatToParts(date);
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type CalendarDay = { key: string; day: number; inMonth: boolean };

/** Use UTC for the grid arithmetic and Beijing time only for event bucketing. */
export function buildMonthDays(month: string): CalendarDay[] {
  const [year, index] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, index - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const cells = Math.max(35, Math.ceil((mondayOffset + count) / 7) * 7);
  return Array.from({ length: cells }, (_, position) => {
    const date = new Date(Date.UTC(year, index - 1, position - mondayOffset + 1));
    const key = date.toISOString().slice(0, 10);
    return { key, day: date.getUTCDate(), inMonth: key.startsWith(`${month}-`) };
  });
}

export function formatBeijing(value: string | number | Date | null | undefined, locale: string, options: Intl.DateTimeFormatOptions): string {
  if (value === null || value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: RESET_TIME_ZONE }).format(date);
}

export function dayDate(day: string): Date {
  // Noon in Beijing avoids day-boundary ambiguity for all displayed date labels.
  return new Date(`${day}T12:00:00+08:00`);
}

export function safeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function announcementStage(record: ResetAnnouncement, status: ResetStatus | null): "confirmed" | "scheduled" | "record" {
  if (status?.latest_reset?.id === record.id) return "confirmed";
  if (status?.scheduled_reset?.id === record.id) return "scheduled";
  return "record";
}

export function calendarRecords(records: ResetAnnouncement[], status: ResetStatus | null): ResetAnnouncement[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const record of [status?.latest_reset, status?.scheduled_reset]) {
    if (record) byId.set(record.id, record);
  }
  return Array.from(byId.values()).sort((left, right) => Date.parse(right.announced_at) - Date.parse(left.announced_at));
}

export function filterRecords(records: ResetAnnouncement[], filter: ResetFilter): ResetAnnouncement[] {
  return filter === "all" ? records : records.filter((record) => record.reset_type === filter);
}

export function recordsByDay(records: ResetAnnouncement[]): Map<string, ResetAnnouncement[]> {
  const days = new Map<string, ResetAnnouncement[]>();
  for (const record of records) {
    const day = beijingDay(record.announced_at);
    if (!day) continue;
    days.set(day, [...(days.get(day) ?? []), record]);
  }
  return days;
}

export function currentWatch(status: ResetStatus | null, now: number): ResetWatch | null {
  const watch = status?.active_watch;
  if (!watch || !Number.isFinite(Date.parse(watch.expires_at)) || Date.parse(watch.expires_at) <= now) return null;
  return watch;
}

export function scheduledIsPast(status: ResetStatus | null, now: number): boolean {
  const expected = status?.scheduled_reset?.scheduled_for;
  return Boolean(expected && Number.isFinite(Date.parse(expected)) && Date.parse(expected) <= now);
}
