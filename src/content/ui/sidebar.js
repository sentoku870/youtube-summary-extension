// ============================================================
//  sidebar.js — 状態管理 + 再エクスポートのハブ（ESM版）
//  event-bridge.js: event-bus → UI 更新の橋渡し
//  message-handler.js: chrome.runtime.onMessage リスナー
//  index.js は本モジュール経由で各機能を import する。
// ============================================================
console.log("[YouTube 要約] sidebar.js loaded");
import { state as S } from "../../shared/state.js";
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
  return S.panelEl;
}

// ===== 字幕プリロード状態のリセット =====
export function resetTranscript() {
  S.preloadedTranscript = null;
  S.transcriptReady = false;
}

// ===== 動画切り替え用リセット =====
export function resetState() {
  abortCurrentStream();
  if (S.panelEl) {
    const panel = S.panelEl.querySelector("#ys-panel");
    if (panel) panel.style.display = "none";
    (S.tabIds || ["summary", "customA", "customB"]).forEach(function (id) {
      const t = S.tabs[id];
      if (t) {
        t.generated = false;
        t.content = "";
        t.chatHistory = [];
      }
    });
    S.videoMeta = null;
    S.activeTab = null;
    updateTabActive();
    clearSummaryContent();
    hideProgress();
  }
}