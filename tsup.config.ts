import { defineConfig } from "tsup";
import { copyFile } from "node:fs/promises";

export default defineConfig({
  entry: ["src/**/*.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node22",
  splitting: false,
  sourcemap: false,
  bundle: false,
  clean: true,
  async onSuccess() {
    // Sandboxed Electron preloads must be CommonJS; the detached installer must live outside ASAR at runtime.
    await Promise.all(["preload.cjs", "mac-update-helper.sh"].map((name) => copyFile(`src/desktop/${name}`, `dist/desktop/${name}`)));
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
