// ============================================================
//  tabs.js — タブ切替・UI更新・ボタンタイトル・bindEvents エントリ
//  チャット送信 / 編集 → chat.js
//  chrome.storage.onChanged 監視 → storage-listener.js
//  描画ヘルパ → tabs-ui.js / ui.js
//  本モジュールは「タブ状態管理 + bindEvents エントリ」の薄いファサード。
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { getEl, enableAllButtons } from "./panel.js";
import { setSummaryRaw, disableRegenButton, enableRegenButton } from "./ui.js";
import { updateTabUI, updateTabActive, renderTabContent } from "./tabs-ui.js";
import { callAI, abortCurrentStream } from "../../domain/ai.js";
import { loadButtonTitle, loadSummaryCache } from "../../infrastructure/storage.js";
import { CHAT_HISTORY_SEED_LENGTH, TAB_IDS } from "../../shared/constants.js";
import { createLogger } from "../../shared/logger.js";
import { getCurrentVideoId } from "../../shared/utils.js";
import {
  onChatSend,
  abortChatStream,
  clearChatHistory,
  handleChatInputResize,
  shouldSubmitOnKey,
  handleChatHistoryClick
} from "./chat.js";
import { bindStorageListener } from "./storage-listener.js";

const log = createLogger("tabs");

// tabs-ui.js / chat.js からの再エクスポート（呼び出し側の互換用）
export { updateTabUI, updateTabActive, renderTabContent };
export { abortChatStream };

// ===== クリップボードコピー =====
function copyContent() {
  const tab = S.tabs[S.activeTab];
  if (!tab || !tab.content) return;
  try {
    navigator.clipboard.writeText(tab.content);
  } catch {
    log.error("clipboard write failed");
  }
}

// ===== タブ切り替え =====
export async function switchTab(mode) {
  const tab = S.tabs[mode];
  if (!tab) return;
  const panel = getEl("#ys-panel");
  if (!panel) return;
  if (S.activeTab === mode) {
    panel.style.display = "none";
    S.activeTab = null;
    updateTabActive();
    return;
  }
  S.activeTab = mode;
  panel.style.display = "flex";
  updateTabActive();
  if (tab.generated) {
    renderTabContent(mode);
    requestAnimationFrame(function () {
      scrollContentTop();
    });
  } else {
    const btn = getEl("#ys-btn-" + mode);
    if (btn) {
      btn.textContent = "⏳ 処理中...";
      btn.disabled = true;
    }
    // T2-A5: 未生成タブでも saveSummaryCache ヒット時は即時表示。
    // 同じ動画を再訪したときに API 0 回で要約を復元できる。
    // ボタンは「処理中...」のまま見えるため、ヒット時は明示的に復元する。
    const cached = await loadCachedSummary();
    if (cached) {
      applyCachedSummary(tab, cached);
      renderTabContent(mode);
      updateTabUI();
      if (btn) {
        btn.disabled = false;
        applyButtonTitles();
      }
      requestAnimationFrame(function () {
        scrollContentTop();
      });
      return;
    }
    try {
      // callAI は内部でエラー/中断を処理し、UIも更新するため
      // ここでは戻り値を使わず、finally でボタン状態を復元する。
      await callAI(mode, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        applyButtonTitles();
      }
    }
    requestAnimationFrame(function () {
      scrollContentTop();
    });
  }
}

// T2-A5: 現在の videoId に対する saveSummaryCache を取得。
// chatHistory は保存していないため、UI 復元は content / modelLabel / transcriptCount のみ。
async function loadCachedSummary() {
  try {
    const videoId = getCurrentVideoId();
    if (!videoId) return null;
    const cached = await loadSummaryCache(videoId);
    if (!cached) return null;
    return cached;
  } catch (e) {
    log.warn("loadCachedSummary failed:", e && e.message);
    return null;
  }
}

function applyCachedSummary(tab, cached) {
  tab.generated = true;
  tab.content = cached.content || "";
  tab.modelLabel = cached.modelLabel || "";
  tab.transcriptCount = cached.transcriptCount || 0;
  // config は保存していないため null。チャット開始時に再解決される。
  tab.config = null;
  // chatHistory は保存していない。system ロールのみのシードを入れてチャット可能に。
  if (!Array.isArray(tab.chatHistory) || tab.chatHistory.length < CHAT_HISTORY_SEED_LENGTH) {
    tab.chatHistory = [];
  }
}

// #ys-content-area のスクロール位置を先頭へ
// （旧: #ys-panel.scrollTop。スクロール領域を content-area に分離したため）
function scrollContentTop() {
  const area = getEl("#ys-content-area");
  if (area) area.scrollTop = 0;
}

// ===== 再生成 =====
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

// ===== ボタンタイトル適用 =====
// 全 3 ボタンを storage の btnTitle_* から取得し、未設定なら A/B/C にフォールバック。
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
