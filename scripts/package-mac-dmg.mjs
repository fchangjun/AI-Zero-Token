import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectDir = process.cwd();
const releaseDir = path.join(projectDir, "release");
const arch = process.argv[2];
const supportedArchs = new Set(["arm64", "x64"]);

if (!supportedArchs.has(arch)) {
  throw new Error("Usage: node scripts/package-mac-dmg.mjs <arm64|x64>");
}

const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
const productName = packageJson.build?.productName || packageJson.name;
const version = packageJson.version;
const appOutDir = path.join(releaseDir, arch === "arm64" ? "mac-arm64" : "mac");
const appPath = path.join(appOutDir, `${productName}.app`);
const dmgPath = path.join(releaseDir, `${productName}-${version}-mac-${arch}.dmg`);
const installGuidePath = path.join(projectDir, "build", "mac-install-guide.txt");

async function run(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: projectDir,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  return { stdout, stderr };
}

async function loadSignAsync() {
  const module = await import("@electron/osx-sign");
  const signAsync = module.signAsync || module.default?.signAsync;
  if (typeof signAsync !== "function") {
    throw new Error("Cannot load @electron/osx-sign signAsync.");
  }
  return signAsync;
}

async function signAdhocRuntime() {
  const signAsync = await loadSignAsync();
  await signAsync({
    app: appPath,
    identity: "-",
    identityValidation: false,
    platform: "darwin",
    type: "distribution",
    hardenedRuntime: true,
    strictVerify: true,
  });
}

async function verifyRuntimeSignature(targetPath) {
  const { stderr } = await run("codesign", ["-dv", "--verbose=4", targetPath]);
  const details = stderr.toString();
  if (!/Signature=adhoc/.test(details)) {
    throw new Error(`Expected ad-hoc signature for ${targetPath}.`);
  }
  if (!/flags=0x[0-9a-f]+\(.*runtime.*\)/i.test(details)) {
    throw new Error(`Expected hardened runtime signature for ${targetPath}.`);
  }
  await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", targetPath]);
}

async function createHfsDmg() {
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), "azt-dmg-"));
  try {
    await run("ditto", ["--rsrc", "--extattr", appPath, path.join(stageDir, `${productName}.app`)]);
    await fs.symlink("/Applications", path.join(stageDir, "Applications"));
    await fs.copyFile(installGuidePath, path.join(stageDir, "mac-install-guide.txt"));
    await fs.rm(dmgPath, { force: true });
    await run(
      "hdiutil",
      [
        "create",
        "-volname",
        `${productName} ${version} ${arch}`,
        "-srcfolder",
        stageDir,
        "-fs",
        "HFS+",
        "-format",
        "UDZO",
        "-ov",
        dmgPath,
      ],
      { timeout: 180_000 },
    );
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true });
  }
}

async function verifyHfsDmg() {
  await run("hdiutil", ["verify", dmgPath], { timeout: 180_000 });
  const { stdout } = await run("hdiutil", ["imageinfo", dmgPath], { timeout: 60_000 });
  if (!stdout.includes("partition-hint: Apple_HFS")) {
    throw new Error(`Expected HFS+ DMG, but ${dmgPath} is not Apple_HFS.`);
  }
}

await fs.access(appPath);
await signAdhocRuntime();
await verifyRuntimeSignature(appPath);
await createHfsDmg();
await verifyHfsDmg();

console.log(`Created HFS+ DMG with ad-hoc hardened runtime signature: ${path.relative(projectDir, dmgPath)}`);
