import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node22",
  splitting: false,
  sourcemap: true,
  bundle: false,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
