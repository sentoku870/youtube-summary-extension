// ============================================================
//  tabs-ui.js — タブUI更新・コンテンツ描画（純粋描画ロジック）
//  Phase C-1: tabs.js からUI描画関数を分離
//  Phase P1-D: tabs.js から applyButtonTitles も移行。
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { getEl, enableAllButtons } from "./panel.js";
import { hideProgress } from "./ui-progress.js";
import {
  clearSummaryContent,
  updateInfoLabel,
  hideChatArea,
  setSummaryContent,
  showChatArea
} from "./ui-summary.js";
import {
  hideRegenButton,
  hideCopyButton,
  showRegenButton,
  showCopyButton,
  focusChatInput
} from "./ui-buttons.js";
import { appendChatMessage } from "./ui-chat.js";
import { loadButtonTitle } from "../../infrastructure/storage-config.js";
import { CHAT_HISTORY_SEED_LENGTH, TAB_IDS } from "../../shared/constants.js";

// ===== タブUI更新（ドット表示） =====
export function updateTabUI() {
  (S.tabIds || TAB_IDS).forEach(function (id) {
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
  (S.tabIds || TAB_IDS).forEach(function (id) {
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
    for (let i = CHAT_HISTORY_SEED_LENGTH; i < tab.chatHistory.length; i++) {
      const msg = tab.chatHistory[i];
      if (msg.role === "user" || msg.role === "assistant") {
        appendChatMessage(msg.role, msg.content, { editIndex: i });
      }
    }
  }
  focusChatInput();
}

// ===== ボタンタイトル適用 =====
// 全 3 ボタンを storage の btnTitle_* から取得し、未設定なら A/B/C にフォールバック。
// 同じモジュール内の updateTabUI を最後に呼ぶことで、ドットの同期も保証する。
export async function applyButtonTitles() {
  const btnSummary = getEl("#ys-btn-summary");
  const btnA = getEl("#ys-btn-customA");
  const btnB = getEl("#ys-btn-customB");
  const [titleS, titleA, titleB] = await Promise.all([
    loadButtonTitle("summary"),
    loadButtonTitle("customA"),
    loadButtonTitle("customB")
  ]);
  if (btnSummary) btnSummary.textContent = titleS ? "📝 " + titleS : "📝 A";
  if (btnA) btnA.textContent = titleA ? "📊 " + titleA : "📊 B";
  if (btnB) btnB.textContent = titleB ? "💡 " + titleB : "💡 C";
  enableAllButtons();
  updateTabUI();
}
