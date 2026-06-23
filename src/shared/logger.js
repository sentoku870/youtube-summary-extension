// ============================================================
//  logger.js — console ログのカテゴリ別ラッパー
//  [YouTube 要約][<category>] プレフィックスを統一付与。
//  開発時のデバッグを支援。本番ビルド時は isDev = false で
//  log() の出力を抑止可能（将来 vite 置換予定）。
// ============================================================

// ビルドモードで切替可能なフラグ。
// 開発時は true、本番ビルド時は false にすれば log() 呼び出しが完全に出力されない。
const isDev = true;

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
