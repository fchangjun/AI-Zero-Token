import { expect, test } from "bun:test";
import { announcementStage, beijingDay, buildMonthDays, calendarRecords, currentWatch, filterRecords, formatBeijing, recordsByDay, safeSourceUrl, scheduledIsPast, shiftMonth } from "../admin-ui/src/pages/reset-calendar/calendar";
import type { ResetAnnouncement, ResetStatus } from "../admin-ui/src/pages/reset-calendar/types";

const regular: ResetAnnouncement = {
  id: "regular-1", reset_type: "regular", announced_at: "2026-10-10T16:01:00Z", text: "Announcement", source: { type: "x_post", author: "@example", url: "https://x.com/example/status/1" },
};
const banked: ResetAnnouncement = {
  id: "banked-1", reset_type: "banked", announced_at: "2026-10-10T15:59:00Z", text: "Banked announcement", source: { type: "observed" },
};
function status(overrides: Partial<ResetStatus> = {}): ResetStatus {
  return { latest_reset: null, scheduled_reset: null, active_watch: null, stats: { total: 0, last_reset_at: null, days_since_last: null, avg_interval_days: null }, ...overrides };
}

test("reset records use Beijing dates across UTC day and year boundaries", () => {
  expect(beijingDay("2026-10-10T16:01:00Z")).toBe("2026-10-11");
  expect(beijingDay("2026-12-31T16:00:00Z")).toBe("2027-01-01");
  expect(beijingDay("invalid")).toBeNull();
  const grouped = recordsByDay([regular, banked]);
  expect(grouped.get("2026-10-11")).toEqual([regular]);
  expect(grouped.get("2026-10-10")).toEqual([banked]);
  expect(formatBeijing(regular.announced_at, "en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe("00:01");
});

test("calendar grids start on Monday and provide five or six complete weeks", () => {
  const october = buildMonthDays("2026-10");
  expect(october.length).toBe(35);
  expect(october[0]).toEqual({ key: "2026-09-28", day: 28, inMonth: false });
  expect(october[34].key).toBe("2026-11-01");
  const november = buildMonthDays("2026-11");
  expect(november.length).toBe(42);
  expect(november[0].key).toBe("2026-10-26");
  expect(november[41].key).toBe("2026-12-06");
  expect(buildMonthDays("2028-02").filter((day) => day.inMonth).length).toBe(29);
  expect(buildMonthDays("2027-02").length).toBe(35);
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
});

test("only the matching latest_reset is publicly confirmed; elapsed schedules remain unconfirmed", () => {
  const next = status({ latest_reset: regular, scheduled_reset: { ...banked, status: "scheduled", scheduled_for: "2026-10-10T17:00:00Z" } });
  expect(announcementStage(regular, next)).toBe("confirmed");
  expect(announcementStage(banked, next)).toBe("scheduled");
  expect(announcementStage({ ...regular, id: "historical" }, next)).toBe("record");
  expect(announcementStage(regular, null)).toBe("record");
  expect(scheduledIsPast(next, Date.parse("2026-10-11T00:00:00Z"))).toBe(true);
  expect(announcementStage(banked, next)).toBe("scheduled");
});

test("month records merge status announcements without duplicates and filter by reset type", () => {
  const updated = { ...regular, text: "Updated original" };
  const records = calendarRecords([regular], status({ latest_reset: updated, scheduled_reset: { ...banked, status: "scheduled", scheduled_for: null } }));
  expect(records.length).toBe(2);
  expect(records[0].text).toBe("Updated original");
  expect(filterRecords(records, "banked").map((record) => record.id)).toEqual(["banked-1"]);
  expect(filterRecords(records, "regular").map((record) => record.id)).toEqual(["regular-1"]);
  expect(filterRecords(records, "all")).toEqual(records);
});

test("expired and malformed watches are hidden without promoting them to completed resets", () => {
  const watch = { level: "strong" as const, reset_chance_percent: 80, forecast_window: "Soon", observed_at: "2026-10-10T16:00:00Z", expires_at: "2026-10-11T16:00:00Z", text: "Signal", source: { type: "observed" as const } };
  expect(currentWatch(status({ active_watch: watch }), Date.parse("2026-10-11T15:59:00Z"))).toEqual(watch);
  expect(currentWatch(status({ active_watch: watch }), Date.parse(watch.expires_at))).toBeNull();
  expect(currentWatch(status({ active_watch: { ...watch, expires_at: "invalid" } }), Date.now())).toBeNull();
  expect(currentWatch(null, Date.now())).toBeNull();
});

test("source links only allow explicit http(s) URLs without credentials", () => {
  expect(safeSourceUrl("https://x.com/example/status/1")).toBe("https://x.com/example/status/1");
  for (const value of ["javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "https://user:secret@example.com/", "/relative", "not a url", undefined]) {
    expect(safeSourceUrl(value)).toBeNull();
  }
});
