import { afterEach, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertInstallLocation, MacUpdateInstaller } from "../src/desktop/mac-update-installer.ts";

const roots: string[] = [];
const processes: ChildProcess[] = [];
const extraPids: number[] = [];
const token = "12345678-1234-1234-1234-123456789abc";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
async function waitFor(test: () => Promise<boolean>) {
  for (let i = 0; i < 100; i += 1) { if (await test()) return; await delay(50); }
  throw new Error("Fixture timed out");
}
async function exists(file: string) { return fs.stat(file).then(() => true, () => false); }
afterEach(async () => {
  for (const child of processes.splice(0)) if (child.exitCode === null) child.kill("SIGKILL");
  for (const pid of extraPids.splice(0)) { try { process.kill(pid, "SIGKILL"); } catch {} }
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function fixture(mode: "success" | "crash" | "no-ack" | "wrong-ack" = "success") {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "azt-helper-test-"))); roots.push(root);
  // Exercise spaces, single quotes and shell metacharacters as literal path components.
  const apps = path.join(root, "Applications ' $(literal)"); await fs.mkdir(apps);
  const target = path.join(apps, "AI Zero Token.app");
  const stage = await fs.mkdtemp(path.join(apps, ".azt-update-"));
  const updateRoot = path.join(root, "updates"); await fs.mkdir(updateRoot);
  const job = await fs.mkdtemp(path.join(updateRoot, "job-"));
  for (const bundle of [target, path.join(stage, "new.app")]) await fs.mkdir(path.join(bundle, "Contents/MacOS"), { recursive: true });
  await fs.writeFile(path.join(target, "version"), "old");
  await fs.writeFile(path.join(stage, "new.app/version"), "new");
  await fs.writeFile(path.join(target, "Contents/MacOS/AI Zero Token"), `#!/bin/bash\nprintf old > ${quote(path.join(job, "old-started"))}\n`, { mode: 0o700 });
  const acknowledgement = mode === "success" ? token : "wrong-token";
  const body = mode === "crash" ? "exit 7" : `printf '%s' $$ > ${quote(path.join(job, "new-pid"))}\n${mode === "no-ack" ? "" : `printf '%s' ${quote(acknowledgement)} > ${quote(path.join(job, "ack"))}`}\nexec /bin/sleep 60`;
  await fs.writeFile(path.join(stage, "new.app/Contents/MacOS/AI Zero Token"), `#!/bin/bash\n${body}\n`, { mode: 0o700 });
  const script = path.join(job, "install.sh");
  const source = await fs.readFile(new URL("../src/desktop/mac-update-helper.sh", import.meta.url), "utf8");
  // Shorten only deadlines for fixtures; production has no test-mode bypass.
  await fs.writeFile(script, source.replace("i<300", "i<3").replace("i<90", "i<3").replace("i<10", "i<2"));
  const parent = spawn("/bin/sleep", ["60"]); processes.push(parent); await once(parent, "spawn");
  const helper = spawn("/bin/bash", [script, String(parent.pid), target, stage, job, token], { stdio: "ignore" });
  processes.push(helper);
  const completion = once(helper, "exit");
  await waitFor(() => exists(path.join(job, "helper-ready")));
  return { root, target, stage, job, updateRoot, parent, helper, completion };
}

describe.skipIf(process.platform !== "darwin")("macOS app replacement transaction", () => {
  test("waits for the old process, then commits only after a matching acknowledgement", async () => {
    const f = await fixture();
    expect(await fs.readFile(path.join(f.target, "version"), "utf8")).toBe("old");
    expect(await exists(path.join(f.stage, "previous.app"))).toBe(false);
    f.parent.kill("SIGTERM");
    const [code] = await f.completion;
    extraPids.push(Number(await fs.readFile(path.join(f.job, "new-pid"), "utf8")));
    expect(code).toBe(0);
    expect(await fs.readFile(path.join(f.target, "version"), "utf8")).toBe("new");
    expect(await fs.readFile(path.join(f.job, "result"), "utf8")).toBe("success\n");
    expect(await exists(f.stage)).toBe(false);
  }, 10_000);
  test("keeps the old app when its process has not exited", async () => {
    const f = await fixture(); await f.completion;
    expect(await fs.readFile(path.join(f.target, "version"), "utf8")).toBe("old");
    expect(await exists(path.join(f.stage, "previous.app"))).toBe(false);
    expect(await fs.readFile(path.join(f.job, "result"), "utf8")).toBe("failed\n");
  }, 10_000);
  for (const mode of ["crash", "no-ack", "wrong-ack"] as const) {
    test(`restores and relaunches the old app after ${mode}`, async () => {
      const f = await fixture(mode); f.parent.kill("SIGTERM"); await f.completion;
      expect(await fs.readFile(path.join(f.target, "version"), "utf8")).toBe("old");
      expect(await fs.readFile(path.join(f.job, "result"), "utf8")).toBe("rolled-back\n");
      await waitFor(() => exists(path.join(f.job, "old-started")));
      expect(await exists(f.stage)).toBe(false);
    }, 15_000);
  }
  test("restores the backup when moving the new app fails", async () => {
    const f = await fixture(); await fs.rm(path.join(f.stage, "new.app"), { recursive: true });
    f.parent.kill("SIGTERM"); await f.completion;
    expect(await fs.readFile(path.join(f.target, "version"), "utf8")).toBe("old");
    expect(await fs.readFile(path.join(f.job, "result"), "utf8")).toBe("rolled-back\n");
  }, 10_000);
  test("refuses a symlink installation and a mounted/translocated app", async () => {
    const f = await fixture(); const link = path.join(f.root, "alias.app"); await fs.symlink(f.target, link);
    await expect(assertInstallLocation(link)).rejects.toMatchObject({ code: "install-location" });
    const translocated = path.join(f.root, "AppTranslocation", "AI Zero Token.app"); await fs.mkdir(translocated, { recursive: true });
    await expect(assertInstallLocation(translocated)).rejects.toMatchObject({ code: "install-location" });
    await assertInstallLocation(f.target);
  }, 10_000);
  test("acknowledges startup only for the expected version, path and token", async () => {
    const f = await fixture(); f.helper.kill("SIGTERM"); await f.completion;
    await fs.rm(path.join(f.job, "result"), { force: true });
    await fs.writeFile(path.join(f.updateRoot, "pending.json"), JSON.stringify({ token, target: f.target, stage: f.stage, job: f.job, version: "2.0.17" }));
    const installer = new MacUpdateInstaller({ target: f.target, root: f.updateRoot, currentVersion: "2.0.17", arch: "arm64" });
    expect(await installer.recover([`--azt-update-token=${token}`])).toBe(false);
    expect(await exists(path.join(f.job, "ack"))).toBe(false);
    await installer.acknowledgeStartup();
    expect(await fs.readFile(path.join(f.job, "ack"), "utf8")).toBe(token);
  }, 10_000);
  test("does not clean arbitrary paths from a malformed pending record", async () => {
    const f = await fixture(); f.helper.kill("SIGTERM"); await f.completion;
    const protectedDir = path.join(f.root, "user-data"); await fs.mkdir(protectedDir);
    await fs.writeFile(path.join(f.updateRoot, "pending.json"), JSON.stringify({ token, target: f.target, stage: protectedDir, job: f.job, version: "2.0.17" }));
    const installer = new MacUpdateInstaller({ target: f.target, root: f.updateRoot, currentVersion: "2.0.17", arch: "arm64" });
    expect(await installer.recover([])).toBe(true);
    expect(await exists(protectedDir)).toBe(true);
  }, 10_000);
  test("preserves files behind a symlinked job and blocks further installation", async () => {
    const f = await fixture(); f.helper.kill("SIGTERM"); await f.completion;
    const external = path.join(f.root, "unrelated"); await fs.mkdir(external);
    await fs.writeFile(path.join(external, "update.dmg"), "user file");
    await fs.rm(f.job, { recursive: true }); await fs.symlink(external, f.job);
    await fs.writeFile(path.join(f.updateRoot, "pending.json"), JSON.stringify({ token, target: f.target, stage: f.stage, job: f.job, version: "2.0.17" }));
    const installer = new MacUpdateInstaller({ target: f.target, root: f.updateRoot, currentVersion: "2.0.17", arch: "arm64" });
    expect(await installer.recover([])).toBe(true);
    await expect(installer.preflight(1)).rejects.toMatchObject({ code: "recovery-required" });
    expect(await fs.readFile(path.join(external, "update.dmg"), "utf8")).toBe("user file");
  }, 10_000);
});
