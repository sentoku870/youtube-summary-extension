// ============================================================
//  sidebar.js — 状態管理 + 再エクスポートのハブ（ESM版）
//  event-bridge.js: event-bus → UI 更新の橋渡し
//  message-handler.js: chrome.runtime.onMessage リスナー
//  index.js は本モジュール経由で各機能を import する。
// ============================================================
console.log("[YouTube 要約] sidebar.js loaded");
import { uiState, sessionState, resetSession } from "../../shared/state.js";
import { abortCurrentStream } from "../../domain/ai.js";
import { clearSummaryContent, hideProgress } from "./ui.js";
import { updateTabActive, bindEvents, applyButtonTitles, switchTab } from "./tabs.js";
import { createPanel } from "./panel.js";
import { preloadTranscript } from "../../domain/transcript.js";

// 分離したモジュールの副作用実行（リスナー登録）
import "./event-bridge.js";
import "./message-handler.js";

// ===== index.js 向けの再エクスポート =====
export {
  createPanel,
  bindEvents,
  applyButtonTitles,
  switchTab
};
export { preloadTranscript };

// ===== パネル状態参照 =====
export function getPanelEl() {
  return uiState.panelEl;
}

// ===== 字幕プリロード状態のリセット =====
export function resetTranscript() {
  sessionState.preloadedTranscript = null;
  sessionState.transcriptReady = false;
}

// ===== 動画切り替え用リセット =====
export function resetState() {
  abortCurrentStream();
  // セッション状態（動画単位データ）を初期化
  resetSession();
  if (uiState.panelEl) {
    const panel = uiState.panelEl.querySelector("#ys-panel");
    if (panel) panel.style.display = "none";
    (uiState.tabIds || ["summary", "customA", "customB"]).forEach(function (id) {
      const t = uiState.tabs[id];
      if (t) {
        t.generated = false;
        t.content = "";
        t.chatHistory = [];
      }
    });
    uiState.activeTab = null;
    updateTabActive();
    clearSummaryContent();
    hideProgress();
  }
}
