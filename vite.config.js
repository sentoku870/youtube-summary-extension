import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// manifest.json を読み込み（vite-pluginがパス解決を自動処理）
const manifest = JSON.parse(
  readFileSync(new URL("./manifest.json", import.meta.url), "utf-8")
);

const __dirname = dirname(fileURLToPath(import.meta.url));

// scripts/sync-version.cjs が生成した build-info.json を dist/ にも
// コピーするプラグイン。Vite は JSON import をバンドルにインライン化
// するため dist/ にはファイルが残らないが、確認用・拡張機能レビュー
// 時の検証用に別途コピーする。
function copyBuildInfoPlugin() {
  return {
    name: "copy-build-info",
    apply: "build",
    closeBundle() {
      const src = resolve(__dirname, "src/shared/build-info.json");
      const dest = resolve(__dirname, "dist/src/shared/build-info.json");
      if (!existsSync(src)) {
        console.warn(
          "[copy-build-info] src/shared/build-info.json が見つかりません。" +
            "prebuild フックで scripts/sync-version.cjs が走るか確認してください。"
        );
        return;
      }
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      console.log("[copy-build-info] copied to " + dest);
    }
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), copyBuildInfoPlugin()],
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