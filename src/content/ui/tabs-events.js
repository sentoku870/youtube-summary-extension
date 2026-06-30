// ============================================================
//  tabs-events.js — bindEvents 専用のイベントハンドラ集約（ESM版）
//  Phase B-2: tabs.js から bindEvents を分離。
//  タブボタン click / チャット送信 / 編集 / 再生成 / コピー / storage.onChanged
//  のDOM イベント登録を一元化し、tabs.js を「状態 + ロジック」の薄層にする。
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { getEl } from "./panel.js";
import { TAB_IDS } from "../../shared/constants.js";
import { createLogger } from "../../shared/logger.js";
import {
  onChatSend,
  abortChatStream,
  clearChatHistory,
  handleChatInputResize,
  shouldSubmitOnKey,
  handleChatHistoryClick
} from "./chat.js";
import { bindStorageListener } from "./storage-listener.js";
import { switchTab, applyButtonTitles } from "./tabs.js";

const log = createLogger("tabs-events");

// ===== クリップボードコピー =====
// bindEvents の click ハンドラからのみ呼ばれるため、こちらに配置。
function copyContent() {
  const tab = S.tabs[S.activeTab];
  if (!tab || !tab.content) return;
  try {
    navigator.clipboard.writeText(tab.content);
  } catch {
    log.error("clipboard write failed");
  }
}

// ===== 再生成 =====
// bindEvents の regenBtn クリックからのみ呼ばれる。
import { setSummaryRaw, disableRegenButton, enableRegenButton } from "./ui.js";
import { updateTabUI } from "./tabs-ui.js";
import { callAI, abortCurrentStream } from "../../domain/ai.js";

async function regenerate() {
  const mode = S.activeTab;
  if (!mode) return;
  const tab = S.tabs[mode];
  if (!tab) return;

  abortCurrentStream();
  abortChatStream();

  tab.generated = false;
  tab.content = "";
  tab.chatHistory = [];

  setSummaryRaw("⏳ 再生成中...");
  disableRegenButton();

  try {
    await callAI(mode, false);
  } finally {
    enableRegenButton();
    updateTabUI();
  }
}

// ===== イベントバインド =====
export function bindEvents() {
  if (S.eventsBound) return;
  S.eventsBound = true;

  (S.tabIds || TAB_IDS).forEach(function (id) {
    const btn = getEl("#ys-btn-" + id);
    if (btn)
      btn.addEventListener("click", function () {
        switchTab(id);
      });
  });

  const chatInput = getEl("#ys-chatInput");
  if (chatInput) {
    // Enter=送信 / Shift+Enter=改行。IME 変換中と送信中(readOnly)は無視。
    chatInput.addEventListener("keydown", function (e) {
      if (shouldSubmitOnKey(e, chatInput)) {
        e.preventDefault();
        onChatSend();
      }
    });
    // 入力に応じて高さ自動調整
    chatInput.addEventListener("input", function () {
      handleChatInputResize(chatInput);
    });
  }

  const chatClearBtn = getEl("#ys-chatClearBtn");
  if (chatClearBtn) chatClearBtn.addEventListener("click", clearChatHistory);

  // 編集ボタンのクリックをチャット履歴全体で delegation
  // （appendChatMessage で動的に生成されるため、都度 bind せず親で一括受領）
  const chatHistoryEl = getEl("#ys-chatHistory");
  if (chatHistoryEl) {
    chatHistoryEl.addEventListener("click", function (e) {
      handleChatHistoryClick(e);
    });
  }

  const regenBtn = getEl("#ys-regenBtn");
  if (regenBtn) regenBtn.addEventListener("click", regenerate);

  const copyBtn = getEl("#ys-copyBtn");
  if (copyBtn) copyBtn.addEventListener("click", copyContent);

  // chrome.storage.onChanged 監視（設定変更でボタンタイトル/プロンプト更新）
  bindStorageListener(function () {
    applyButtonTitles();
  });
}