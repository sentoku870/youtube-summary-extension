// ============================================================
//  tabs.js — タブ切替・チャット・UI更新・イベントバインド（ESM版）
//  UI操作は ui.js、タブ描画は tabs-ui.js へ分離済み。
// ============================================================
import { uiState as S, sessionState } from "../../shared/state.js";
import { getEl, enableAllButtons } from "./panel.js";
import {
  setSummaryRaw,
  disableRegenButton,
  enableRegenButton,
  appendChatMessage,
  appendAssistantPlaceholder,
  updateChatMessageBody,
  scrollContentToElement
} from "./ui.js";
import { updateTabUI, updateTabActive, renderTabContent } from "./tabs-ui.js";
import { callAI, abortCurrentStream, resolveApiConfig } from "../../domain/ai.js";
import { callChatAPIStream } from "../../domain/api.js";
import { YsAbortError, YsTimeoutError } from "../../infrastructure/errors.js";
import { loadButtonTitle } from "../../infrastructure/storage.js";
import { createRafThrottle } from "../../shared/raf-throttle.js";
import { linkAbortSignal } from "../../shared/abort-chain.js";

// tabs-ui.js からの再エクスポート（呼び出し側の互換用）
export { updateTabUI, updateTabActive, renderTabContent };

// チャット送信用のAbortController（連続送信やタブ切り替えで前の応答を中断）
let chatAbortController = null;
// 親（要約セッション）との連動を保持（disconnect 用）
let chatAbortChain = null;
// 送信中フラグ（送信ボタン廃止に伴い、textarea.readOnly + フラグで二重送信を防止）
let chatBusy = false;

/**
 * 進行中のチャット応答を中断する。
 * 動画切り替え時などに呼び出すことを想定。
 */
export function abortChatStream() {
  if (chatAbortController) {
    chatAbortController.abort();
    chatAbortController = null;
  }
  if (chatAbortChain) {
    chatAbortChain.disconnect();
    chatAbortChain = null;
  }
}

// ===== クリップボードコピー =====
function copyContent() {
  const tab = S.tabs[S.activeTab];
  if (!tab || !tab.content) return;
  try {
    navigator.clipboard.writeText(tab.content);
  } catch {
    console.error("[YouTube 要約] clipboard write failed");
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

// ===== チャット入力欄の高さ自動リサイズ =====
// 1行〜max-height(8em相当)の範囲で伸縮。max-height 到達後は入力欄内部でスクロール。
function resetChatInputHeight(el) {
  if (!el) return;
  el.style.height = "auto";
  const maxStr = getComputedStyle(el).maxHeight;
  const maxPx = parseFloat(maxStr);
  const next = isNaN(maxPx) ? el.scrollHeight : Math.min(el.scrollHeight, maxPx);
  el.style.height = next + "px";
}

// ===== チャット送信 =====
async function onChatSend() {
  if (chatBusy) return;
  const input = getEl("#ys-chatInput");
  const text = input ? input.value.trim() : "";
  if (!text) return;
  if (input) {
    input.value = "";
    resetChatInputHeight(input);
  }

  const tab = S.tabs[S.activeTab];
  if (!tab || !tab.generated) {
    appendChatMessage("assistant", "[エラー] 先に要約・分析を生成してください。");
    return;
  }

  // editIndex = 追加前の chatHistory 長。編集ボタンの data-edit-index と対応
  const editIndex = tab.chatHistory.length;
  const userMsg = appendChatMessage("user", text, { editIndex: editIndex });
  tab.chatHistory.push({ role: "user", content: text });

  // 進行中のチャットがあれば中断して新しいリクエストを開始
  abortChatStream();
  // 親（要約セッション）の abort に連動：動画切替時にチャットも自動中断される
  const chain = linkAbortSignal(
    sessionState.abortController && sessionState.abortController.signal
  );
  const controller = chain.controller;
  chatAbortController = controller;
  chatAbortChain = chain;
  chatBusy = true;
  if (input) input.readOnly = true;

  // AI回答の空枠を作成。
  // その後「ユーザー質問の上端」にスクロールすることで、ビューポート構成:
  //   上: 質問送信内容 → 下: AI回答の先頭
  //   上にスクロール: 前回の出力 / 下にスクロール: 回答の続き
  const placeholder = appendAssistantPlaceholder();
  if (userMsg && userMsg.div) scrollContentToElement(userMsg.div);

  let accumulated = "";
  // ストリーミング描画のスロットル（頻繁な marked+DOMPurify による卡回避）
  // RAF + 60ms 間隔で 1フレーム内の連続チャンクをまとめて1回だけ描画
  const renderThrottled = createRafThrottle(function (arg) {
    if (placeholder) updateChatMessageBody(placeholder.body, arg || "");
  }, 60);

  try {
    let config = tab.config;
    if (!config || !config.apiKey) {
      config = await resolveApiConfig(S.activeTab);
    }
    if (!config || !config.apiKey) {
      if (placeholder)
        updateChatMessageBody(placeholder.body, "[エラー] API設定がされていません。");
      return;
    }

    await callChatAPIStream(
      [{ role: "system", content: S.tabs[S.activeTab].chatHistory[0].content }].concat(
        tab.chatHistory
      ),
      config,
      function (chunk) {
        accumulated = chunk;
        renderThrottled(accumulated);
      },
      function (fullText) {
        accumulated = fullText || accumulated;
        // 最終確定描画（スロットルを待たず即時反映）
        renderThrottled.flush(accumulated);
        tab.chatHistory.push({ role: "assistant", content: accumulated });
      },
      controller.signal
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    if (e instanceof YsAbortError || e instanceof YsTimeoutError) return;
    if (e.message && e.message.indexOf("中断") !== -1) return;
    if (placeholder) updateChatMessageBody(placeholder.body, "[エラー] " + e.message);
  } finally {
    // コントローラがまだ自分を指している場合のみクリア
    if (chatAbortController === controller) {
      chatAbortController = null;
    }
    chatBusy = false;
    if (input) {
      input.readOnly = false;
      input.focus();
    }
    // 親 abort との連動を解除（次の送信に備えてリセット）
    if (chatAbortChain) {
      chatAbortChain.disconnect();
      chatAbortChain = null;
    }
  }
}

// ===== ユーザー質問の編集 =====
// 該当インデックス以降の chatHistory（その質問＋以降のAI回答）を削除し、
// 元テキストを入力欄へセット。ユーザーが書き換えて Enter → 通常フローで再生成。
function handleEditUserMessage(idx) {
  if (chatBusy) return;
  const tab = S.tabs[S.activeTab];
  if (!tab) return;
  abortChatStream();

  const originalMsg = tab.chatHistory[idx];
  const originalText = originalMsg ? originalMsg.content : "";

  tab.chatHistory = tab.chatHistory.slice(0, idx);
  rerenderChatOnly();

  const input = getEl("#ys-chatInput");
  if (input) {
    input.value = originalText;
    resetChatInputHeight(input);
    input.focus();
  }
}

// チャット履歴表示だけを再描画（要約テキスト等はそのまま）
// renderTabContent は focusChatInput で入力欄をクリアしてしまうため独立関数化。
function rerenderChatOnly() {
  const chatHistory = getEl("#ys-chatHistory");
  if (!chatHistory) return;
  chatHistory.innerHTML = "";
  const tab = S.tabs[S.activeTab];
  if (!tab) return;
  for (let i = 3; i < tab.chatHistory.length; i++) {
    const msg = tab.chatHistory[i];
    if (msg.role === "user" || msg.role === "assistant") {
      appendChatMessage(msg.role, msg.content, { editIndex: i });
    }
  }
}

// ===== ボタンタイトル適用 =====
export async function applyButtonTitles() {
  const btnSummary = getEl("#ys-btn-summary");
  const btnA = getEl("#ys-btn-customA");
  const btnB = getEl("#ys-btn-customB");
  if (btnSummary) btnSummary.textContent = "📝 要約";
  const titleA = await loadButtonTitle("customA");
  if (btnA) btnA.textContent = titleA ? "📊 " + titleA : "📊 分析";
  const titleB = await loadButtonTitle("customB");
  if (btnB) btnB.textContent = titleB ? "💡 " + titleB : "💡 考察";
  enableAllButtons();
  updateTabUI();
}

// ===== イベントバインド =====
export function bindEvents() {
  if (S.eventsBound) return;
  S.eventsBound = true;

  (S.tabIds || ["summary", "customA", "customB"]).forEach(function (id) {
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
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !chatInput.readOnly) {
        e.preventDefault();
        onChatSend();
      }
    });
    // 入力に応じて高さ自動調整
    chatInput.addEventListener("input", function () {
      resetChatInputHeight(chatInput);
    });
  }

  const chatClearBtn = getEl("#ys-chatClearBtn");
  if (chatClearBtn)
    chatClearBtn.addEventListener("click", function () {
      if (chatBusy) return;
      // chatHistory の先頭3件 (system/要約/初期プロンプト) は保持
      const tab = S.tabs[S.activeTab];
      if (tab) tab.chatHistory = tab.chatHistory.slice(0, 3);
      const hist = getEl("#ys-chatHistory");
      if (hist) hist.innerHTML = "";
      if (chatInput) {
        chatInput.value = "";
        resetChatInputHeight(chatInput);
        chatInput.focus();
      }
    });

  // 編集ボタンのクリックをチャット履歴全体で delegation
  // （appendChatMessage で動的に生成されるため、都度 bind せず親で一括受領）
  const chatHistoryEl = getEl("#ys-chatHistory");
  if (chatHistoryEl) {
    chatHistoryEl.addEventListener("click", function (e) {
      const editBtn = e.target.closest(".ys-chat-edit-btn");
      if (!editBtn) return;
      const idx = parseInt(editBtn.getAttribute("data-edit-index"), 10);
      if (isNaN(idx)) return;
      handleEditUserMessage(idx);
    });
  }

  const regenBtn = getEl("#ys-regenBtn");
  if (regenBtn) regenBtn.addEventListener("click", regenerate);

  const copyBtn = getEl("#ys-copyBtn");
  if (copyBtn) copyBtn.addEventListener("click", copyContent);

  // 設定変更を150msデバウンス（saveAllBtnの一括保存時に複数回発火するのを防止）
  let debounceTimer = null;
  try {
    chrome.storage.onChanged.addListener(function (changes) {
      let shouldUpdate = false;
      for (const key in changes) {
        if (key.indexOf("btnTitle_") === 0 || key.indexOf("prompt_") === 0) {
          shouldUpdate = true;
          break;
        }
      }
      if (!shouldUpdate) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        applyButtonTitles();
      }, 150);
    });
  } catch {
    console.warn(
      "[YouTube 要約] storage.onChanged listener could not be registered (extension context may be invalid)."
    );
  }
}
