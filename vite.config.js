import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { readFileSync } from "fs";

// manifest.json を読み込み（vite-pluginがパス解決を自動処理）
const manifest = JSON.parse(
  readFileSync(new URL("./manifest.json", import.meta.url), "utf-8")
);

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
    hmr: {
      port: 5174,
    },
  },
});