import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoActiveCodexTurns, assertNoRunningCodexClients, parseCodexOpenFiles, type CodexOpenFile } from "../src/core/services/codex-switch-runtime.ts";

let home: string;
let rollout: string;
beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "azt-tests-runtime-"));
  rollout = path.join(home, "sessions", "fixture.jsonl");
  await fs.mkdir(path.dirname(rollout), { recursive: true });
});
afterEach(async () => { await fs.rm(home, { recursive: true, force: true }); });

function owner(relativePath: string, command = "codex", pid = 123): CodexOpenFile {
  return { pid, command, file: path.join(home, relativePath), relativePath };
}
function event(type: string, timestamp = new Date().toISOString()): string {
  return JSON.stringify({ timestamp, type: "event_msg", payload: { type } }) + "\n";
}

describe("Codex switch runtime checks", () => {
  for (const limitedPath of [undefined, "/usr/bin:/bin"]) {
    test.skipIf(process.platform !== "darwin")(`inspects real macOS file handles with PATH ${limitedPath ?? "unset"}`, async () => {
      const handle = await fs.open(path.join(home, "state_5.sqlite"), "w+");
      try {
        const module = fileURLToPath(new URL("../src/core/services/codex-switch-runtime.ts", import.meta.url));
        const child = Bun.spawn([process.execPath, "-e", `
          const { getCodexOpenFiles } = await import(process.env.RUNTIME_MODULE);
          const files = await getCodexOpenFiles(process.env.FIXTURE_HOME);
          console.log(JSON.stringify(files.map(({pid, relativePath}) => ({pid, relativePath}))));
        `], {
          env: { RUNTIME_MODULE: module, FIXTURE_HOME: home, ...(limitedPath === undefined ? {} : { PATH: limitedPath }) },
          stdout: "pipe", stderr: "pipe",
        });
        const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
        expect(JSON.parse(stdout)).toContainEqual({ pid: process.pid, relativePath: "state_5.sqlite" });
      } finally { await handle.close(); }
    });
  }

  test("parses full process names and excludes own handles and adjacent home directories", () => {
    const files = parseCodexOpenFiles([
      "p10", "cDB Browser for SQLite", `n${home}/state_5.sqlite`,
      "p20", "ccodex", `n${home}/sessions/fixture.jsonl`,
      "p30", "cnode", `n${home}-other/state_5.sqlite`,
      "p40", `n${home}/plugins/plugin.js`,
      "p50", "cazt", `n${home}/state_5.sqlite`,
    ].join("\n"), [home], 50);
    expect(files.map((file) => [file.pid, file.command, file.relativePath])).toEqual([
      [10, "DB Browser for SQLite", "state_5.sqlite"], [20, "codex", "sessions/fixture.jsonl"], [40, "未知进程", "plugins/plugin.js"],
    ]);
  });

  test("open database files do not prove another program is blocking writes", () => {
    expect(() => assertNoRunningCodexClients([
      owner("state_5.sqlite", "DB Browser for SQLite"), owner("state_5.sqlite-wal", "DB Browser for SQLite"),
      owner("sessions/fixture.jsonl", "TextEdit"), owner("config.toml", "Code"), owner("state_5.sqlite", "python3"),
    ])).not.toThrow();
  });

  test("ignores plugin resources, working directories, computer-use and unrelated worktrees", () => {
    expect(() => assertNoRunningCodexClients([
      owner("", "node"), owner("plugins/plugin.js", "node"), owner("plugins/plugin.js", "ChatGPT for Chrome"),
      owner("computer-use/socket", "SkyComputerUseService"), owner("worktrees/code/config.toml", "codex"),
    ])).not.toThrow();
  });

  for (const relativePath of ["state_5.sqlite", "state_5.sqlite-wal", "sessions/fixture.jsonl", "archived_sessions/fixture.jsonl", "thread-writer-locks/123", "sqlite/desktop.db", "ipc/socket"]) {
    test(`a live Codex client using ${relativePath} still blocks with its name and PID`, () => {
      expect(() => assertNoRunningCodexClients([owner(relativePath, "codex", 789)]))
        .toThrow(`codex（PID 789，占用 ${relativePath}）`);
    });
  }

  test("ignores unopened historical unfinished or malformed sessions", async () => {
    await fs.writeFile(rollout, event("task_started", "2026-08-24T06:58:33Z") + "{broken");
    await assertNoActiveCodexTurns(home, []);
  });

  test("a currently open unfinished turn blocks; a database viewer cannot impersonate an active turn", async () => {
    await fs.writeFile(rollout, event("task_started"));
    await expect(assertNoActiveCodexTurns(home, [owner("sessions/fixture.jsonl")])).rejects.toThrow("正在回复");
    await assertNoActiveCodexTurns(home, [owner("sessions/fixture.jsonl", "DB Browser for SQLite")]);
  });

  test("an abandoned event from before the current backend started is not a live turn", async () => {
    await fs.writeFile(rollout, event("task_started", "2026-08-24T06:58:33Z"));
    await assertNoActiveCodexTurns(home, [{ ...owner("sessions/fixture.jsonl"), startedAt: Date.parse("2026-09-30T00:00:00Z") }]);
    await expect(assertNoActiveCodexTurns(home, [owner("sessions/fixture.jsonl")])).rejects.toThrow("正在回复");
  });

  for (const type of ["task_complete", "turn_aborted"]) test(`${type} permits a graceful restart`, async () => {
    await fs.writeFile(rollout, event("task_started") + event(type));
    await assertNoActiveCodexTurns(home, [owner("sessions/fixture.jsonl")]);
  });

  test("finds lifecycle events before large tool outputs instead of mistaking a truncated tail for activity", async () => {
    const output = JSON.stringify({ type: "response_item", payload: { output: "x".repeat(600 * 1024) } }) + "\n";
    await fs.writeFile(rollout, event("task_complete") + output);
    await assertNoActiveCodexTurns(home, [owner("sessions/fixture.jsonl")]);
    await fs.writeFile(rollout, event("task_started") + output);
    await expect(assertNoActiveCodexTurns(home, [owner("sessions/fixture.jsonl")])).rejects.toThrow("正在回复");
  });

  test("an incomplete live write produces an uncertainty message, without claiming the turn is active", async () => {
    await fs.writeFile(rollout, event("task_complete") + "{unfinished");
    await expect(assertNoActiveCodexTurns(home, [owner("sessions/fixture.jsonl")])).rejects.toThrow("无法确认");
  });
});
