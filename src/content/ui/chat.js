// ============================================================
//  chat.js — チャット送信 / 編集 / クリア
//  tabs.js から分離。sessionState 経由で状態にアクセスし、
//  UI ヘルパは ui.js / panel.js へ委譲する。
// ============================================================
import { uiState as S, sessionState } from "../../shared/state.js";
import { getEl } from "./panel.js";
import {
  appendChatMessage,
  appendAssistantPlaceholder,
  updateChatMessageBody,
  scrollContentToElement
} from "./ui.js";
import { callChatAPIStream } from "../../domain/api.js";
import { resolveApiConfig } from "../../domain/ai.js";
import { YsAbortError, YsTimeoutError } from "../../infrastructure/errors.js";
import { createRafThrottle } from "../../shared/raf-throttle.js";
import { linkAbortSignal } from "../../shared/abort-chain.js";
import { CHAT_HISTORY_SEED_LENGTH } from "../../shared/constants.js";

/**
 * 進行中のチャット応答を中断する。
 * 動画切り替え時などに呼び出すことを想定。
 */
export function abortChatStream() {
  if (sessionState.chatAbortController) {
    sessionState.chatAbortController.abort();
    sessionState.chatAbortController = null;
  }
  if (sessionState.chatAbortChain) {
    sessionState.chatAbortChain.disconnect();
    sessionState.chatAbortChain = null;
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
export async function onChatSend() {
  if (sessionState.chatBusy) return;
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
  sessionState.chatAbortController = controller;
  sessionState.chatAbortChain = chain;
  sessionState.chatBusy = true;
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
    if (sessionState.chatAbortController === controller) {
      sessionState.chatAbortController = null;
    }
    sessionState.chatBusy = false;
    if (input) {
      input.readOnly = false;
      input.focus();
    }
    // 親 abort との連動を解除（次の送信に備えてリセット）
    if (sessionState.chatAbortChain) {
      sessionState.chatAbortChain.disconnect();
      sessionState.chatAbortChain = null;
    }
  }
}

// ===== ユーザー質問の編集 =====
// 該当インデックス以降の chatHistory（その質問＋以降のAI回答）を削除し、
// 元テキストを入力欄へセット。ユーザーが書き換えて Enter → 通常フローで再生成。
export function handleEditUserMessage(idx) {
  if (sessionState.chatBusy) return;
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
  for (let i = CHAT_HISTORY_SEED_LENGTH; i < tab.chatHistory.length; i++) {
    const msg = tab.chatHistory[i];
    if (msg.role === "user" || msg.role === "assistant") {
      appendChatMessage(msg.role, msg.content, { editIndex: i });
    }
  }
}

// ===== チャットクリアボタン用ハンドラ =====
// tabs.js の bindEvents() から呼び出される。
// chatHistory の先頭 CHAT_HISTORY_SEED_LENGTH 件 (system/要約/初期プロンプト) は保持。
export function clearChatHistory() {
  if (sessionState.chatBusy) return;
  const tab = S.tabs[S.activeTab];
  if (tab) tab.chatHistory = tab.chatHistory.slice(0, CHAT_HISTORY_SEED_LENGTH);
  const hist = getEl("#ys-chatHistory");
  if (hist) hist.innerHTML = "";
  const chatInput = getEl("#ys-chatInput");
  if (chatInput) {
    chatInput.value = "";
    resetChatInputHeight(chatInput);
    chatInput.focus();
  }
}

// 入力欄の input イベントで高さを再計算する（bindEvents から addEventListener する用）
export function handleChatInputResize(el) {
  resetChatInputHeight(el);
}

// Enter キー押下時の送信判定（bindEvents の keydown ハンドラから呼ぶ）
export function shouldSubmitOnKey(e, chatInput) {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && !chatInput.readOnly;
}

// 編集ボタンの delegation ハンドラ（bindEvents から addEventListener する用）
export function handleChatHistoryClick(e) {
  const editBtn = e.target.closest(".ys-chat-edit-btn");
  if (!editBtn) return false;
  const idx = parseInt(editBtn.getAttribute("data-edit-index"), 10);
  if (isNaN(idx)) return false;
  handleEditUserMessage(idx);
  return true;
}
