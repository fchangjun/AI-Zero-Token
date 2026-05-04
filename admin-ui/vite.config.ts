import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const gatewayTarget = process.env.AZT_DEV_GATEWAY_URL || "http://127.0.0.1:8799";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    fs: {
      allow: [fileURLToPath(new URL("..", import.meta.url))],
    },
    host: "127.0.0.1",
    port: Number(process.env.AZT_DEV_UI_PORT || 5173),
    proxy: {
      "/_gateway": gatewayTarget,
      "/v1": gatewayTarget,
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
