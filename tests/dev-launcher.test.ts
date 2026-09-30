import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const launcher = fileURLToPath(new URL("../scripts/dev.mjs", import.meta.url));

// Run the actual launcher, recording child starts instead of opening real apps
// or building the project. This catches env being replaced by an options spread.
const probe = `
  import fs from 'node:fs/promises';
  import { EventEmitter } from 'node:events';
  import { pathToFileURL } from 'node:url';
  import { SourceTextModule, SyntheticModule } from 'node:vm';
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, env: Object.fromEntries(
      ['PATH', 'HOME', 'CODEX_HOME', 'AI_ZERO_TOKEN_HOME', 'AZT_ADMIN_UI_DEV_URL', 'AZT_DEV_GATEWAY_URL', 'AZT_DEV_UI_PORT']
        .map(key => [key, options.env[key]]).filter(([, value]) => value !== undefined)
    ) });
    const child = new EventEmitter();
    child.kill = () => true;
    setImmediate(() => child.emit('exit', 0, null));
    return child;
  };
  const filename = process.env.AZT_TEST_LAUNCHER;
  process.argv = [process.execPath, filename, process.env.AZT_TEST_MODE];
  const mod = new SourceTextModule(await fs.readFile(filename, 'utf8'), {
    identifier: filename,
    initializeImportMeta(meta) { meta.url = pathToFileURL(filename).href; },
  });
  await mod.link(async (name) => {
    const exports = name === 'node:child_process' ? { spawn } : await import(name);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    });
  });
  await mod.evaluate();
  console.log('AZT_LAUNCH_ENV=' + JSON.stringify(calls));
`;

describe("development launcher environment", () => {
  for (const mode of ["desktop", "web"]) test(`${mode} preserves inherited settings while supplying child overrides`, async () => {
    const { stdout } = await exec("node", ["--experimental-vm-modules", "--input-type=module", "-e", probe], {
      env: { ...process.env, AZT_TEST_LAUNCHER: launcher, AZT_TEST_MODE: mode },
      timeout: 10_000,
    });
    const line = stdout.split("\n").find((line) => line.startsWith("AZT_LAUNCH_ENV="));
    expect(line).toBeDefined();
    const calls = JSON.parse(line!.slice("AZT_LAUNCH_ENV=".length)) as { args: string[]; env: Record<string, string> }[];
    expect(calls.length).toBe(mode === "desktop" ? 3 : 2);
    for (const call of calls) {
      for (const key of ["PATH", "HOME", "CODEX_HOME", "AI_ZERO_TOKEN_HOME"]) {
        expect(call.env[key]).toBe(process.env[key]);
      }
    }
    const vite = calls.find((call) => call.args.some((arg) => arg.endsWith("vite.js")))!;
    expect(vite.env.AZT_DEV_GATEWAY_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(vite.env.AZT_DEV_UI_PORT).toMatch(/^\d+$/);
    if (mode === "desktop") {
      const electron = calls.find((call) => call.args.some((arg) => arg.endsWith("electron/cli.js")))!;
      expect(electron.env.AZT_ADMIN_UI_DEV_URL).toBe(`http://127.0.0.1:${vite.env.AZT_DEV_UI_PORT}`);
    }
  });
});
