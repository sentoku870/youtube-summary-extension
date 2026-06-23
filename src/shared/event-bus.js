// ============================================================
//  event-bus.js — 軽量なpub/subイベントバス（ESM）
//  依存なし。UI/ドメイン層の疎結合な通信に使用。
// ============================================================
import { createLogger } from "./logger.js";

const log = createLogger("event-bus");

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
      log.error("listener error for '" + event + "':", e);
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
// DOM イベントと内部イベントを分離。
// 注意: index.js は生の YouTube DOM イベントを受けて内部イベントに橋渡しする。
// 後方互換: EVENTS は DOM_EVENTS と INTERNAL_EVENTS をマージしたシム。

// 生の DOM イベント（content script が受信する browser 標準 / YouTube カスタム）
export const DOM_EVENTS = {
  YT_NAVIGATE_FINISH: "yt-navigate-finish"
};

// 内部イベント（event-bus 経由、UI 層が購読する）
export const INTERNAL_EVENTS = {
  NAV_FINISH: "nav:finish",
  TRANSCRIPT_READY: "transcript-ready",
  TRANSCRIPT_FAILED: "transcript-failed",
  TRANSCRIPT_RETRY: "transcript-retry",
  SUMMARY_UPDATED: "summary-updated",
  TAB_CHANGED: "tab-changed",
  STATE_RESET: "state-reset"
};

// 既存コードが EVENTS.X で参照している場合のシム
export const EVENTS = Object.assign({}, DOM_EVENTS, INTERNAL_EVENTS);
