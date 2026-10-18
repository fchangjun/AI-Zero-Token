import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const run = promisify(execFile);

export async function prepareElectron() {
  // Electron 42 downloads its runtime on first access, including on fresh installs.
  const executable = require("electron");
  if (process.platform !== "darwin") return executable;
  const bundle = path.resolve(executable, "../../..");
  const npmBundle = path.join(path.dirname(require.resolve("electron/package.json")), "dist", "Electron.app");
  if (bundle === npmBundle) {
    // Match the installed app's icon at the bundle level. Notification.icon on
    // macOS is a media attachment, not the app icon shown by Notification Center.
    const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../build/icon.icns");
    const target = path.join(bundle, "Contents", "Resources", "azt-development.icns");
    const desired = await fs.readFile(source);
    const current = await fs.readFile(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!current?.equals(desired)) await fs.writeFile(target, desired);
    const plist = path.join(bundle, "Contents", "Info.plist");
    const { stdout } = await run("plutil", ["-extract", "CFBundleIconFile", "raw", plist]);
    if (stdout.trim() !== "azt-development.icns") {
      await run("plutil", ["-replace", "CFBundleIconFile", "-string", "azt-development.icns", plist]);
    }
  }
  try {
    await run("codesign", ["--verify", "--deep", "--strict", bundle]);
    return executable;
  } catch {
    // A linker-only signature cannot authorize UNUserNotificationCenter requests.
    // Only prepare the project's disposable npm runtime, never an installed app.
    if (bundle !== npmBundle) throw new Error("Electron's macOS runtime needs a valid app signature; the external runtime was not modified.");
    console.log("[desktop] preparing macOS development notification signature...");
    await run("codesign", ["--force", "--deep", "--sign", "-", "--options=0", bundle]);
    await run("codesign", ["--verify", "--deep", "--strict", bundle]);
    const { stderr } = await run("codesign", ["-dvv", bundle]);
    if (/flags=0x[0-9a-f]+\([^)]*\bruntime\b/i.test(stderr)) {
      throw new Error("Hardened Runtime must remain disabled for the ad-hoc development runtime.");
    }
    return executable;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareElectron();
}
