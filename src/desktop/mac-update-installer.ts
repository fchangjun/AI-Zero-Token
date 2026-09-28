import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs, { constants } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { UpdateError } from "./update-types.js";

const exec = promisify(execFile);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const helperSource = fileURLToPath(new URL("./mac-update-helper.sh", import.meta.url));

type Transaction = {
  token: string;
  version: string;
  target: string;
  stage: string;
  job: string;
};

export async function assertInstallLocation(target: string): Promise<void> {
  const real = await fs.realpath(target);
  if (!path.isAbsolute(target) || real !== target || !target.endsWith(".app") || target.startsWith("/Volumes/") || target.includes("/AppTranslocation/")) {
    throw new UpdateError("install-location", "Install the app on a writable local volume before updating");
  }
  if (!(await fs.lstat(target)).isDirectory()) throw new UpdateError("install-location", "The installed app is not a directory");
  try {
    await fs.access(path.dirname(target), constants.W_OK);
    await fs.access(target, constants.W_OK);
  } catch {
    throw new UpdateError("install-permission", "The installed app and its parent must be writable");
  }
}

async function run(command: string, args: string[], timeout = 60_000) {
  return exec(command, args, { timeout, maxBuffer: 4 * 1024 ** 2 });
}

export async function verifyMacBundle(appPath: string, version: string, arch: string): Promise<void> {
  if (!(await fs.lstat(appPath)).isDirectory()) throw new UpdateError("invalid-app", "Update is not an app directory");
  const plist = path.join(appPath, "Contents/Info.plist");
  for (const [key, expected] of [["CFBundleIdentifier", "com.aizerotoken.desktop"], ["CFBundleShortVersionString", version], ["CFBundleExecutable", "AI Zero Token"]]) {
    const { stdout } = await run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist]);
    if (stdout.trim() !== expected) throw new UpdateError("invalid-app", `Unexpected ${key}`);
  }
  const executable = path.join(appPath, "Contents/MacOS/AI Zero Token");
  const framework = path.join(appPath, "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework");
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath]);
  for (const binary of [executable, framework]) {
    const { stdout } = await run("/usr/bin/lipo", ["-archs", binary]);
    if (!stdout.trim().split(/\s+/).includes(arch === "arm64" ? "arm64" : "x86_64")) throw new UpdateError("invalid-app", "Update has the wrong CPU architecture");
  }
  // Match the ad-hoc release policy. A future Developer ID migration needs an explicit updater migration.
  for (const signedPath of [appPath, framework]) {
    const { stderr } = await run("/usr/bin/codesign", ["-dv", "--verbose=4", signedPath]);
    if (!stderr.includes("Signature=adhoc") || /flags=0x[\da-f]+\([^)]*\bruntime\b[^)]*\)/i.test(stderr)) {
      throw new UpdateError("invalid-app", "Update must retain ad-hoc signing with Hardened Runtime disabled");
    }
  }
}

export class MacUpdateInstaller {
  private transaction?: Transaction;
  private acknowledgedTransaction?: Transaction;
  private handedOff = false;
  private recoveryBlocked = false;

  constructor(private readonly options: { target: string; root: string; arch: string; currentVersion: string }) {}

  private get pendingPath() { return path.join(this.options.root, "pending.json"); }

  async preflight(size: number): Promise<void> {
    if (this.recoveryBlocked) throw new UpdateError("recovery-required", "An interrupted transaction requires manual recovery; its backup has been preserved");
    await assertInstallLocation(this.options.target);
    await this.assertCurrentVersion();
    await fs.mkdir(this.options.root, { recursive: true, mode: 0o700 });
    const [cacheSpace, appSpace] = await Promise.all([fs.statfs(this.options.root), fs.statfs(path.dirname(this.options.target))]);
    // Includes the compressed DMG, expanded app and a margin for filesystem metadata.
    const required = size * 6 + 512 * 1024 ** 2;
    if (cacheSpace.bavail * cacheSpace.bsize < required || appSpace.bavail * appSpace.bsize < required) {
      throw new UpdateError("disk-space", "Not enough free space to stage and safely replace the app");
    }
  }

  async createJob(): Promise<string> {
    await fs.mkdir(this.options.root, { recursive: true, mode: 0o700 });
    return fs.mkdtemp(path.join(this.options.root, "job-"));
  }

  async prepare(job: string, version: string): Promise<void> {
    await assertInstallLocation(this.options.target);
    const stage = await fs.mkdtemp(path.join(path.dirname(this.options.target), ".azt-update-"));
    this.transaction = { job, stage, version, token: randomUUID(), target: this.options.target };
    await fs.writeFile(`${this.pendingPath}.tmp`, JSON.stringify(this.transaction), { mode: 0o600 });
    await fs.rename(`${this.pendingPath}.tmp`, this.pendingPath);
    const mount = path.join(job, "mount");
    await fs.mkdir(mount, { mode: 0o700 });
    let attached = false;
    try {
      await run("/usr/bin/hdiutil", ["verify", path.join(job, "update.dmg")], 120_000);
      await run("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount, path.join(job, "update.dmg")], 120_000);
      attached = true;
      const source = path.join(mount, "AI Zero Token.app");
      if (!(await fs.lstat(source)).isDirectory()) throw new UpdateError("invalid-app", "DMG does not contain AI Zero Token.app");
      await run("/usr/bin/ditto", ["--rsrc", "--extattr", source, path.join(stage, "new.app")], 180_000);
      await verifyMacBundle(path.join(stage, "new.app"), version, this.options.arch);
    } finally {
      if (attached) {
        await run("/usr/bin/hdiutil", ["detach", mount]).catch(() => run("/usr/bin/hdiutil", ["detach", "-force", mount]));
      }
    }
  }

  async handOff(): Promise<void> {
    const transaction = this.transaction;
    if (!transaction || this.handedOff) throw new Error("No prepared update");
    await assertInstallLocation(transaction.target);
    await this.assertCurrentVersion();
    await verifyMacBundle(path.join(transaction.stage, "new.app"), transaction.version, this.options.arch);
    const helper = path.join(transaction.job, "install.sh");
    await fs.copyFile(helperSource, helper);
    await fs.chmod(helper, 0o700);
    const log = await fs.open(path.join(transaction.job, "install.log"), "a", 0o600);
    try {
      const child = spawn("/bin/bash", [helper, String(process.pid), transaction.target, transaction.stage, transaction.job, transaction.token], {
        detached: true, stdio: ["ignore", log.fd, log.fd], cwd: transaction.job,
      });
      let failed: Error | undefined;
      child.on("error", (error) => { failed = error; });
      child.unref();
      for (let i = 0; i < 50; i += 1) {
        if (failed || child.exitCode !== null || child.signalCode !== null) throw failed ?? new Error("Update helper exited before it was ready");
        const ready = await fs.readFile(path.join(transaction.job, "helper-ready"), "utf8").catch(() => "");
        if (ready.trim() === transaction.token) { this.handedOff = true; return; }
        await delay(100);
      }
      child.kill("SIGTERM");
      throw new Error("Update helper did not become ready");
    } finally { await log.close(); }
  }

  async cleanup(): Promise<void> {
    if (this.handedOff) return;
    const transaction = this.transaction;
    this.transaction = undefined;
    if (transaction) {
      await fs.rm(transaction.stage, { recursive: true, force: true });
      await fs.rm(this.pendingPath, { force: true });
    }
  }

  // Only an app started by our helper, with the expected version and location, may acknowledge.
  async recover(args: string[]): Promise<boolean> {
    try {
      return await this.recoverPending(args);
    } catch (error) {
      // A broken update cache must never prevent the existing gateway from starting.
      console.error("[desktop:update:recovery]", error);
      this.recoveryBlocked = true;
      return true;
    }
  }

  private async recoverPending(args: string[]): Promise<boolean> {
    const raw = await fs.readFile(this.pendingPath, "utf8").catch(() => null);
    if (!raw) return false;
    let transaction: Transaction;
    try { transaction = JSON.parse(raw) as Transaction; } catch { this.recoveryBlocked = true; return true; }
    if (!this.validTransaction(transaction)) { this.recoveryBlocked = true; return true; }
    // Do not follow a local symlink when reading acknowledgements or cleaning update files.
    const job = await fs.lstat(transaction.job);
    const stage = await fs.lstat(transaction.stage).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!job.isDirectory() || job.isSymbolicLink() || (stage && (!stage.isDirectory() || stage.isSymbolicLink()))) {
      this.recoveryBlocked = true;
      return true;
    }
    const result = await fs.readFile(path.join(transaction.job, "result"), "utf8").catch(() => "");
    if (!result && args.includes(`--azt-update-token=${transaction.token}`) && this.options.currentVersion === transaction.version) {
      this.acknowledgedTransaction = transaction;
      return false;
    }
    if (result.trim() === "recovery-required") { this.recoveryBlocked = true; return true; }
    const backupExists = await fs.stat(path.join(transaction.stage, "previous.app")).then(() => true, () => false);
    if (backupExists) { this.recoveryBlocked = true; return true; } // A live helper or interrupted replacement owns this directory.
    await fs.rm(transaction.stage, { recursive: true, force: true });
    await fs.rm(path.join(transaction.job, "update.dmg"), { force: true });
    await fs.rm(this.pendingPath, { force: true });
    return Boolean(result && result.trim() !== "success");
  }

  private validTransaction(value: Transaction): boolean {
    return value && typeof value.token === "string" && /^[a-f\d-]{36}$/.test(value.token)
      && value.target === this.options.target
      && typeof value.job === "string" && path.dirname(value.job) === this.options.root && /^job-[a-zA-Z0-9]+$/.test(path.basename(value.job))
      && typeof value.stage === "string" && path.dirname(value.stage) === path.dirname(this.options.target) && /^\.azt-update-[a-zA-Z0-9]+$/.test(path.basename(value.stage));
  }

  private async assertCurrentVersion(): Promise<void> {
    const { stdout } = await run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(this.options.target, "Contents/Info.plist")]);
    if (stdout.trim() !== this.options.currentVersion) throw new UpdateError("invalid-app", "The installed app changed while this process was running; restart before updating");
  }

  async acknowledgeStartup(): Promise<void> {
    const transaction = this.acknowledgedTransaction;
    if (!transaction) return;
    await fs.writeFile(path.join(transaction.job, "ack.tmp"), transaction.token, { mode: 0o600 });
    await fs.rename(path.join(transaction.job, "ack.tmp"), path.join(transaction.job, "ack"));
    this.acknowledgedTransaction = undefined;
  }
}
