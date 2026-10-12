import { expect, test } from "bun:test";
import { externalHttpUrl, openExternalHttpUrl } from "../src/desktop/external-links.ts";

test("external links allow explicit web URLs and reject native schemes and credentials", () => {
  expect(externalHttpUrl("https://x.com/thsottiaux/status/123")).toBe("https://x.com/thsottiaux/status/123");
  expect(externalHttpUrl("http://example.com")).toBe("http://example.com/");
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "codex://threads/123", "https://user:pass@example.com", "//x.com/a", {}, null]) {
    expect(externalHttpUrl(url)).toBeNull();
  }
});

test("external link failures return usable feedback without an unhandled rejection", async () => {
  const calls: string[] = [];
  expect(await openExternalHttpUrl("https://x.com/thsottiaux/status/123", async (url) => { calls.push(url); })).toBe(true);
  expect(calls).toEqual(["https://x.com/thsottiaux/status/123"]);
  expect(await openExternalHttpUrl("https://x.com/a", async () => { throw new Error("No default browser"); })).toBe(false);
  expect(await openExternalHttpUrl("file:///etc/passwd", async () => { throw new Error("must not run"); })).toBe(false);
});
