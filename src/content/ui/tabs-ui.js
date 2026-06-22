// ============================================================
//  tabs-ui.js — タブUI更新・コンテンツ描画（純粋描画ロジック）
//  Phase C-1: tabs.js からUI描画関数を分離
// ============================================================
import { state as S } from "../../shared/state.js";
import { getEl } from "./panel.js";
import {
  clearSummaryContent, updateInfoLabel, hideChatArea,
  hideRegenButton, hideCopyButton, hideProgress,
  setSummaryContent, showRegenButton, showCopyButton, showChatArea,
  appendChatMessage, focusChatInput, enableSendButton
} from "./ui.js";

// ===== タブUI更新（ドット表示） =====
export function updateTabUI() {
  (S.tabIds || ["summary", "customA", "customB"]).forEach(function(id) {
    const btn = getEl("#ys-btn-" + id);
    if (!btn) return;
    const tab = S.tabs[id];
    const hasDot = tab && tab.generated;
    const dotSpan = btn.querySelector(".ys-dot");
    if (hasDot) {
      if (!dotSpan) {
        const d = document.createElement("span");
        d.className = "ys-dot";
        d.textContent = " ●";
        btn.appendChild(d);
      }
    } else {
      if (dotSpan) dotSpan.remove();
    }
  });
}

// ===== タブのアクティブ状態更新 =====
export function updateTabActive() {
  (S.tabIds || ["summary", "customA", "customB"]).forEach(function(id) {
    const btn = getEl("#ys-btn-" + id);
    if (!btn) return;
    btn.classList.toggle("ys-active", S.activeTab === id);
  });
}

// ===== タブコンテンツ描画 =====
export function renderTabContent(mode) {
  const tab = S.tabs[mode];
  if (!tab) return;
  const chatHistory = getEl("#ys-chatHistory");

  if (!tab.generated) {
    clearSummaryContent();
    updateInfoLabel("");
    hideChatArea();
    hideRegenButton();
    hideCopyButton();
    hideProgress();
    return;
  }

  setSummaryContent(tab.content);
  updateInfoLabel("使用モデル: " + tab.modelLabel + " | 字幕 " + tab.transcriptCount + " 件");
  showRegenButton();
  showCopyButton();
  showChatArea();

  if (chatHistory) {
    chatHistory.innerHTML = "";
    for (let i = 3; i < tab.chatHistory.length; i++) {
      const msg = tab.chatHistory[i];
      if (msg.role === "user" || msg.role === "assistant") {
        appendChatMessage(msg.role, msg.content);
      }
    }
  }
  focusChatInput();
  enableSendButton();
}