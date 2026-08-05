// ============================================================
//  event-bridge.js — event-bus → UI 更新の橋渡し
//  Phase B-1: sidebar.js からイベント購読ロジックを分離
//  domain層が直接UIを操作しないよう、ここで受信してUI更新
//  A-3: SUMMARY_RETRY_CLICKED を購読して switchTab を起動。
//  P0-P1: ui.js 削除済み。SUMMARY_RETRY_CLICKED 発火元は ui-progress.js。
// ============================================================
import { on, INTERNAL_EVENTS } from "../../shared/event-bus.js";
import { switchTab } from "./tabs.js";
import { applyButtonTitles } from "./tabs-ui.js";
import { getEl, enableAllButtons } from "./panel.js";
import { retryTranscript } from "../../domain/transcript.js";

// ===== transcript.js のイベントを購読してUI更新 =====
// domain層が直接UIを操作しないよう、ここで橋渡しする
on(INTERNAL_EVENTS.TRANSCRIPT_READY, function () {
  applyButtonTitles();
});

on(INTERNAL_EVENTS.TRANSCRIPT_FAILED, function () {
  const btnSummary = getEl("#ys-btn-summary");
  if (btnSummary) {
    btnSummary.textContent = "⏳ 字幕取得失敗（再試行）";
    btnSummary.disabled = false;
    btnSummary.onclick = function () {
      retryTranscript();
    };
  }
  // ★ 字幕取得に失敗しても B/C ボタンは有効のままにし、
  //   ユーザが別タブを押せば AI 実行側で再取得を試みることができる。
  enableAllButtons();
});

on(INTERNAL_EVENTS.TRANSCRIPT_RETRY, function () {
  const btnSummary = getEl("#ys-btn-summary");
  if (btnSummary) {
    btnSummary.textContent = "⏳ 字幕取得中...";
    btnSummary.disabled = true;
    btnSummary.onclick = null;
  }
});

// ===== A-3: リトライ UI ボタン → switchTab =====
// SUMMARY_RETRY_CLICKED 発火元は ui-progress.js の showError() 内 retry ボタン。
// event-bridge.js がこれを受け取り、アクティブなタブを再トリガする。
// 旧 ui.js 時代の名残で残している命名。
on(INTERNAL_EVENTS.SUMMARY_RETRY_CLICKED, function (payload) {
  const activeTab = payload && payload.activeTab;
  if (activeTab) {
    switchTab(activeTab);
  }
});
