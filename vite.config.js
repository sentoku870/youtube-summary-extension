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
    // logger.js の本番ビルド判定:
    // globalThis.__LOG_LEVEL__ を "production" に置換することで
    // log() 呼び出しを本番ビルドで完全に出力停止する。
    define: {
      "globalThis.__LOG_LEVEL__": JSON.stringify(
        process.env.NODE_ENV === "production" ? "production" : "development"
      )
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    hmr: {
      port: 5174,
    },
  },
});