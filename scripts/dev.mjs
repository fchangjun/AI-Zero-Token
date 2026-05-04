import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] || "web";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewayPort = process.env.AZT_DEV_GATEWAY_PORT || (mode === "desktop" ? "8787" : "8799");
const uiPort = process.env.AZT_DEV_UI_PORT || "5173";
const gatewayUrl = process.env.AZT_DEV_GATEWAY_URL || `http://127.0.0.1:${gatewayPort}`;
const uiUrl = `http://127.0.0.1:${uiPort}`;
const children = new Set();

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function localBin(name) {
  return path.join(repoRoot, "node_modules", ".bin", commandName(name));
}

const viteCli = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const electronCli = path.join(repoRoot, "node_modules", "electron", "cli.js");

function spawnCommand(label, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      AZT_DEV_GATEWAY_URL: gatewayUrl,
      AZT_DEV_UI_PORT: uiPort,
      ...options.env,
    },
    shell: false,
    ...options,
  });

  children.add(child);
  child.on("error", (error) => {
    children.delete(child);
    console.error(`[dev] failed to start ${label}: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (signal) {
      return;
    }
    if (code && code !== 0) {
      console.error(`[dev] ${label} exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function runOnce(label, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...options.env,
      },
      shell: false,
      ...options,
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} was interrupted by ${signal}`));
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`${label} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    child.kill("SIGINT");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (mode === "desktop") {
  console.log(`[dev] building server once before launching Electron...`);
  await runOnce("build:server", commandName("npm"), ["run", "build:server"]);
  console.log(`[dev] starting Vite UI at ${uiUrl}, proxying API to ${gatewayUrl}`);
  spawnCommand("vite", process.execPath, [viteCli, "--config", "admin-ui/vite.config.ts", "--host", "127.0.0.1", "--port", uiPort], {
    env: {
      AZT_DEV_GATEWAY_URL: gatewayUrl,
      AZT_DEV_UI_PORT: uiPort,
    },
  });
  console.log(`[dev] launching Electron with dev UI ${uiUrl}`);
  spawnCommand("electron", process.execPath, [electronCli, "."], {
    env: {
      AZT_ADMIN_UI_DEV_URL: uiUrl,
      AZT_DEV_GATEWAY_URL: gatewayUrl,
      AZT_DEV_UI_PORT: uiPort,
    },
  });
} else {
  console.log(`[dev] starting gateway at ${gatewayUrl}`);
  spawnCommand("gateway", commandName("bun"), ["src/cli.ts", "serve", "--port", gatewayPort]);
  console.log(`[dev] starting Vite UI at ${uiUrl}, proxying API to ${gatewayUrl}`);
  const viteArgs = ["--config", "admin-ui/vite.config.ts", "--host", "127.0.0.1", "--port", uiPort];
  if (process.env.AZT_DEV_NO_OPEN !== "1") {
    viteArgs.push("--open");
  }
  spawnCommand("vite", process.execPath, [viteCli, ...viteArgs], {
    env: {
      AZT_DEV_GATEWAY_URL: gatewayUrl,
      AZT_DEV_UI_PORT: uiPort,
    },
  });
}
