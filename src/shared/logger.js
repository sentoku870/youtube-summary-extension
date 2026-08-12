// ============================================================
//  logger.js — console ログのカテゴリ別ラッパー
//  [YouTube 要約][<category>] プレフィックスを統一付与。
//  開発時のデバッグを支援。本番ビルド時は log() の出力を抑止。
//  機密情報（API キー / Authorization ヘッダ等）は自動で [REDACTED] に置換。
// ============================================================

// 本番ビルド判定: vite.config.js の `define` で
// "globalThis.__LOG_LEVEL__" を "production" に置換する。
// - 開発時: globalThis.__LOG_LEVEL__ は undefined → isDev = true
// - 本番:   globalThis.__LOG_LEVEL__ = "production"   → isDev = false
// Jest 環境: import.meta を使わず globalThis 経由なのでパースエラーなし
const isDev = (typeof globalThis !== "undefined" && globalThis.__LOG_LEVEL__) !== "production";

// ===== 機密情報 redaction =====
// - 文字列: API キーらしきパターン (sk-, gsk-, Bearer xxx) を [REDACTED] に置換
// - オブジェクト: 機密キーの値を [REDACTED] に置換（1 段のみ、走査は無限ループ回避のため深さ制限あり）
const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "x-api-key",
  "x-goog-api-key",
  "openai-api-key",
  "anthropic-api-key",
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "private_key",
  "cookie",
  "set-cookie",
  "sessionid"
]);
const REDACTED = "[REDACTED]";
const SK_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|gsk_[A-Za-z0-9]{8,}|AIzaSy[A-Za-z0-9_-]{8,})\b/g;
const BEARER_PATTERN = /\b[Bb]earer\s+[A-Za-z0-9._\-+/=]{8,}\b/g;
const BEARER_REPLACE = "Bearer " + REDACTED;
const MAX_DEPTH = 4;

function redactString(value) {
  return value.replace(SK_PATTERN, REDACTED).replace(BEARER_PATTERN, BEARER_REPLACE);
}

function redactValue(value, seen, depth) {
  if (depth >= MAX_DEPTH) return value;
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  // Error / Date / RegExp / Map / Set は prototype や内部スロットを持つため
  // そのまま返す（logger に渡るのはほぼ Error のみ）。
  if (
    value instanceof Error ||
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set
  ) {
    return value;
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = redactValue(value[i], seen, depth + 1);
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const key of Object.keys(value)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactValue(value[key], seen, depth + 1);
    }
  }
  seen.delete(value);
  return out;
}

export function redactSecrets(arg) {
  return redactValue(arg, new WeakSet(), 0);
}

function toArgs(prefix, args) {
  const out = [prefix];
  for (let i = 0; i < args.length; i++) out.push(redactSecrets(args[i]));
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
