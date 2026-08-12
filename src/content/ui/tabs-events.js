// ============================================================
//  tabs-events.js — bindEvents 専用のイベントハンドラ集約（ESM版）
//  Phase B-2: tabs.js から bindEvents を分離。
//  タブボタン click / チャット送信 / 編集 / 再生成 / コピー / storage.onChanged
//  のDOM イベント登録を一元化し、tabs.js を「状態 + ロジック」の薄層にする。
// ============================================================
import { uiState as S, setSessionState } from "../../shared/state.js";
import { getEl } from "./panel.js";
import { TAB_IDS } from "../../shared/constants.js";
import { createLogger } from "../../shared/logger.js";
import {
  onChatSend,
  abortChatStream,
  clearChatHistory,
  handleChatInputResize,
  resetChatHistoryDom,
  shouldSubmitOnKey,
  handleChatHistoryClick
} from "./chat.js";
import { bindStorageListener } from "./storage-listener.js";
import { switchTab } from "./tabs.js";
import { applyButtonTitles } from "./tabs-ui.js";

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
import { setSummaryRaw } from "./ui-summary.js";
import {
  disableRegenButton,
  enableRegenButton,
  hideRegenButton,
  hideCopyButton
} from "./ui-buttons.js";
import { updateInfoLabel, hideChatArea } from "./ui-summary.js";
import { updateTabUI } from "./tabs-ui.js";
import { callAI, abortCurrentStream } from "../../domain/ai.js";

/**
 * 再生成失敗時に UI を初期状態に戻す。
 * handleAiErrors がエラー表示と要約領域クリアを担うが、copy ボタンや
 * 旧 infoLabel は触らないため、ここでまとめて隠す。
 * @param {string} mode
 */
function resetUiOnRegenerateFailure(mode) {
  if (S.activeTab === mode) {
    hideCopyButton();
    hideChatArea();
    updateInfoLabel("");
    hideRegenButton();
  }
}

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

  // state と DOM の両方を空にする。state だけだと古い Q&A が
  // 画面上に残って見えてしまう。
  resetChatHistoryDom();

  // 旧回答は保持し、新チャンクで上書きさせる (NOTES.md シナリオ 3)。
  // 「⏳ 再生成中...」を直前のセルで表示してユーザーに進捗を伝える。
  setSummaryRaw("⏳ 再生成中...");
  disableRegenButton();

  // 再生成中フラグを立てる。チャット送信をブロックし
  // 「先に要約を生成してください」誤メッセージの混入を防ぐ。
  setSessionState({ isRegenerating: true });

  try {
    // callAI に { isRegenerate: true } を渡し、入口の clearSummaryContent を
    // スキップさせる。旧回答は新チャンク到着までそのまま残る。
    const ok = await callAI(mode, false, { isRegenerate: true });
    if (!ok) {
      // 中断 / API エラー / 上限超過など。最終的なエラー表示は
      // handleAiErrors が行う。ここでは UI の整合性確保のみ。
      resetUiOnRegenerateFailure(mode);
    }
  } catch (e) {
    // callAI 自体は try/catch で全エラーを吸収して false を返す設計だが、
    // 念のため保険としてここでも UI を初期化する。
    log.error("regenerate failed unexpectedly:", e);
    resetUiOnRegenerateFailure(mode);
  } finally {
    setSessionState({ isRegenerating: false });
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
