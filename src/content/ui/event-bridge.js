// ============================================================
//  event-bridge.js — event-bus → UI 更新の橋渡し
//  Phase B-1: sidebar.js からイベント購読ロジックを分離
//  domain層が直接UIを操作しないよう、ここで受信してUI更新
//  A-3: SUMMARY_RETRY_CLICKED を購読してswitchTabを起動。ui.js → tabs.js の
//       直接 import を event-bus 経由で代替し循環依存を解消。
// ============================================================
import { on, EVENTS } from "../../shared/event-bus.js";
import { applyButtonTitles, switchTab } from "./tabs.js";
import { getEl, enableAllButtons } from "./panel.js";
import { retryTranscript } from "../../domain/transcript.js";

// ===== transcript.js のイベントを購読してUI更新 =====
// domain層が直接UIを操作しないよう、ここで橋渡しする
on(EVENTS.TRANSCRIPT_READY, function () {
  applyButtonTitles();
});

on(EVENTS.TRANSCRIPT_FAILED, function () {
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

on(EVENTS.TRANSCRIPT_RETRY, function () {
  const btnSummary = getEl("#ys-btn-summary");
  if (btnSummary) {
    btnSummary.textContent = "⏳ 字幕取得中...";
    btnSummary.disabled = true;
    btnSummary.onclick = null;
  }
});

// ===== A-3: showError 内 retry ボタン → switchTab =====
// ui.js の showError が retry ボタンクリックで発火する SUMMARY_RETRY_CLICKED を受け取り、
// アクティブなタブを再トリガする。ui.js から tabs.js への直接依存を切断した結果、
// この橋渡しが唯一の呼び出し経路になる。
on(EVENTS.SUMMARY_RETRY_CLICKED, function (payload) {
  const activeTab = payload && payload.activeTab;
  if (activeTab) {
    switchTab(activeTab);
  }
});
