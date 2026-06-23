// ============================================================
//  logger.js — console ログのカテゴリ別ラッパー
//  [YouTube 要約][<category>] プレフィックスを統一付与。
//  開発時のデバッグを支援。本番ビルド時は log() の出力を抑止。
// ============================================================

// 本番ビルド判定: vite.config.js の `define` で
// "globalThis.__LOG_LEVEL__" を "production" に置換する。
// - 開発時: globalThis.__LOG_LEVEL__ は undefined → isDev = true
// - 本番:   globalThis.__LOG_LEVEL__ = "production"   → isDev = false
// Jest 環境: import.meta を使わず globalThis 経由なのでパースエラーなし
const isDev = (typeof globalThis !== "undefined" && globalThis.__LOG_LEVEL__) !== "production";

function toArgs(prefix, args) {
  const out = [prefix];
  for (let i = 0; i < args.length; i++) out.push(args[i]);
  return out;
}

/**
 * カテゴリ別ロガーを生成
 * @param {string} category - 機能名（"ai", "api", "popup" 等）
 * @returns {{ log, warn, error }}
 */
export function createLogger(category) {
  const prefix = "[YouTube 要約][" + category + "]";
  return {
    log: function () {
      if (isDev) console.log.apply(console, toArgs(prefix, arguments));
    },
    warn: function () {
      console.warn.apply(console, toArgs(prefix, arguments));
    },
    error: function () {
      console.error.apply(console, toArgs(prefix, arguments));
    }
  };
}
