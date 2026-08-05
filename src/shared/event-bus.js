// ============================================================
//  event-bus.js — 軽量なpub/subイベントバス（ESM）
//  依存なし。UI/ドメイン層の疎結合な通信に使用。
//
//  イベント名は用途別に 2 種類:
//    DOM_EVENTS      - 生の YouTube DOM イベント名文字列
//                       (content script が受信する browser 標準 / YouTube カスタム)
//    INTERNAL_EVENTS - event-bus 経由のイベント名
//                       (UI 層・ドメイン層が購読する)
//
//  旧 EVENTS (両者のマージ) は P0-P1 で削除済み。
//  呼び出し側は用途に応じて import を使い分ける:
//    import { DOM_EVENTS } from ".../shared/event-bus.js";      // 例: navigation.js
//    import { INTERNAL_EVENTS } from ".../shared/event-bus.js";  // 例: event-bridge.js
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
  // リトライ UI からの通知を受け取り、event-bridge.js が switchTab を起動する。
  // ui.js (P0-P1 で削除) 当時は ui.js → tabs.js の直接 import を event-bus 経由で
  // 代替し循環依存を解消していた。今は ui.js がないので循環依存の名残だが、
  // 通知モデル自体は引き続き有効。
  SUMMARY_RETRY_CLICKED: "summary:retry-clicked"
};
