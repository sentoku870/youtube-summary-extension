// ============================================================
//  event-bridge.js — event-bus → UI 更新の橋渡し
//  Phase B-1: sidebar.js からイベント購読ロジックを分離
//  domain層が直接UIを操作しないよう、ここで受信してUI更新
// ============================================================
import { on, EVENTS } from "../../shared/event-bus.js";
import { applyButtonTitles } from "./tabs.js";
import { getEl } from "./panel.js";
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
});

on(EVENTS.TRANSCRIPT_RETRY, function () {
  const btnSummary = getEl("#ys-btn-summary");
  if (btnSummary) {
    btnSummary.textContent = "⏳ 字幕取得中...";
    btnSummary.disabled = true;
    btnSummary.onclick = null;
  }
});
