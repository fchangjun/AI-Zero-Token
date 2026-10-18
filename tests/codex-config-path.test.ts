import { expect, test } from "bun:test";
import { normalizeCodexConfigPath } from "../src/core/services/codex-config-path.ts";

test("Windows global config identity ignores namespace prefixes, casing and path separators", () => {
  const expected = normalizeCodexConfigPath(String.raw`C:\Users\laotingyu\.codex\config.toml`, "win32");
  for (const file of [
    String.raw`\\?\C:\Users\laotingyu\.codex\config.toml`,
    String.raw`c:\USERS\Laotingyu\.CODEX\config.toml`,
    "C:/Users/laotingyu/.codex/config.toml",
    String.raw`C:\Users\laotingyu\project\..\.codex\config.toml`,
  ]) expect(normalizeCodexConfigPath(file, "win32")).toBe(expected);
});

test("Windows UNC config identity recognizes the extended network path", () => {
  expect(normalizeCodexConfigPath(String.raw`\\?\UNC\server\share\user\.codex\config.toml`, "win32"))
    .toBe(normalizeCodexConfigPath(String.raw`\\SERVER\share\user\.codex\config.toml`, "win32"));
});

test("different project configs stay distinct, and POSIX paths retain case sensitivity", () => {
  expect(normalizeCodexConfigPath(String.raw`C:\Users\user\project\.codex\config.toml`, "win32"))
    .not.toBe(normalizeCodexConfigPath(String.raw`C:\Users\user\.codex\config.toml`, "win32"));
  expect(normalizeCodexConfigPath("/home/User/.codex/config.toml", "linux"))
    .not.toBe(normalizeCodexConfigPath("/home/user/.codex/config.toml", "linux"));
});
