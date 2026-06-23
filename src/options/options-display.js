// ============================================================
//  options-display.js — 表示設定タブ UI
//  テーマ・フォントサイズ・パネル高さ・字幕言語の保存。
// ============================================================
import { set, K } from "../infrastructure/storage.js";
import { getVal, showStatus } from "./options-shared.js";

// ===== イベント登録（DOMContentLoaded で呼ぶ） =====
export function initDisplayTab() {
  // 表示設定のみ保存
  document.getElementById("saveDisplayBtn").addEventListener("click", async function () {
    await set({
      [K.FONT_SIZE]: getVal("fontSize"),
      [K.PANEL_HEIGHT]: getVal("panelHeight"),
      [K.THEME]: getVal("theme"),
      [K.SUBTITLE_LANG]: getVal("subtitleLang")
    });
    showStatus("displayStatus", "✓ 保存しました");
  });
}
