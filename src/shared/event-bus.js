// ============================================================
//  event-bus.js — 軽量なpub/subイベントバス（ESM）
//  依存なし。UI/ドメイン層の疎結合な通信に使用。
// ============================================================

// 内部リスナーマップ: { eventName: Set<callback> }
const listeners = {};

/**
 * イベントを購読する
 * @param {string} event - イベント名
 * @param {Function} callback - リスナー関数
 * @returns {Function} 購読解除関数（コールバック）
 */
export function on(event, callback) {
  if (!listeners[event]) {
    listeners[event] = new Set();
  }
  listeners[event].add(callback);
  return function unsubscribe() {
    off(event, callback);
  };
}

/**
 * イベント購読を解除する
 * @param {string} event - イベント名
 * @param {Function} callback - リスナー関数
 */
export function off(event, callback) {
  if (listeners[event]) {
    listeners[event].delete(callback);
  }
}

/**
 * イベントを発火する
 * @param {string} event - イベント名
 * @param {*} [payload] - ペイロード（任意）
 */
export function emit(event, payload) {
  if (!listeners[event]) return;
  // コピーしてイテレート（発火中のoffに対応）
  const cbs = Array.from(listeners[event]);
  for (let i = 0; i < cbs.length; i++) {
    try {
      cbs[i](payload);
    } catch (e) {
      console.error("[ys][event-bus] listener error for '" + event + "':", e);
    }
  }
}

/**
 * 全リスナーをクリア（テスト用）
 */
export function clearAll() {
  for (const key in listeners) {
    delete listeners[key];
  }
}

// ===== イベント名定数（タイポ防止） =====
// 注意: index.js は生の "yt-navigate-finish" DOMイベントを受けて
// 内部イベント "nav:finish" に橋渡ししている。両方を定義。
export const EVENTS = {
  YT_NAVIGATE_FINISH: "yt-navigate-finish", // 生のYouTube DOMイベント名
  NAV_FINISH: "nav:finish",                  // 内部イベント名（index.js で使用）
  TRANSCRIPT_READY: "transcript-ready",
  TRANSCRIPT_FAILED: "transcript-failed",
  TRANSCRIPT_RETRY: "transcript-retry",
  SUMMARY_UPDATED: "summary-updated",
  TAB_CHANGED: "tab-changed",
  STATE_RESET: "state-reset"
};