import { expect, test } from "bun:test";
import { resetNotificationContent } from "../src/core/reset-notification-content.ts";
import { renderResetNotificationCard } from "../src/desktop/reset-notification-card-view.ts";

test("forecasts include Beijing dates across UTC midnight and never imply execution", () => {
  const now = Date.parse("2026-10-15T15:00:00Z");
  const upcoming = resetNotificationContent("scheduled", "regular", "2026-10-15T16:30:00Z", now);
  expect(upcoming.detail).toContain("10/16 00:30");
  expect(upcoming.detail).toStartWith("预计");
  expect(upcoming.body).toContain("重置还待确认");
  const passed = resetNotificationContent("scheduled", "regular", "2026-10-15T16:30:00Z", now + 86_400_000);
  expect(passed.detail).toStartWith("原预计");
  expect(passed.stage).toBe("scheduled");
  expect(passed.body).toBe(upcoming.body);
  expect(resetNotificationContent("scheduled").detail).toBe("补给在路上，具体几点还得再等等。");
});

test("humorous copy preserves signal uncertainty and both quota disclaimers", () => {
  expect(resetNotificationContent("watch").body).toContain("重置还未确认");
  expect(resetNotificationContent("confirmed").body).toContain("请以账号实际额度为准");
  expect(resetNotificationContent("confirmed", "banked").body).toContain("不代表账号额度已恢复");
});

test("card content is escaped, network/scripts blocked, and only fixed actions are linked", () => {
  const html = renderResetNotificationCard({
    kind: "signal", eventId: "unsafe", title: '<script>alert("x")</script>',
    body: '<img src="https://evil.example">', detail: '<a href="https://evil.example">',
  });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img src=');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain("default-src 'none'");
  expect([...html.matchAll(/ href="([^"]+)"/g)].map((match) => match[1])).toEqual(["azt-card://open", "azt-card://dismiss"]);
});

test("test cards preserve the real title and forecast badge, adding only a test marker", () => {
  const content = resetNotificationContent("scheduled");
  const testHtml = renderResetNotificationCard({ ...content, kind: "test", eventId: "test", title: `${content.title} · 测试` });
  const realHtml = renderResetNotificationCard({ ...content, kind: "signal", eventId: "real" });
  expect(testHtml.match(/<h1>(.*?)<\/h1>/)?.[1]).toBe(realHtml.match(/<h1>(.*?)<\/h1>/)?.[1]);
  expect(testHtml).toContain('<span class="test">测试</span>');
  expect(realHtml).not.toContain('<span class="test">');
  expect(testHtml).toContain('重置预告</span>');
});
