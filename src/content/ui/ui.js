// ============================================================
//  ui.js — DOM操作を集約（ESM版）
//  UI操作関数を一元管理。他モジュールは ESM import で利用。
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { getEl } from "./panel.js";
import { setMarkdown } from "../../domain/markdown.js";
import { linkTimestamps } from "../../domain/ai.js";
import { switchTab } from "./tabs.js";

// ===== プログレス表示 =====
export function showProgress(text) {
  const el = getEl("#ys-progress");
  if (el) {
    el.style.display = "block";
    el.textContent = text;
  }
  console.log("[YouTube 要約] " + text);
}

export function hideProgress() {
  const el = getEl("#ys-progress");
  if (el) el.style.display = "none";
}

// ===== エラー表示（ネットワーク状態検出付き） =====
export function showError(msg) {
  const el = getEl("#ys-error");
  if (!el) return;
  if (!navigator.onLine) {
    el.innerHTML = '<span>🌐 オフラインです。インターネット接続を確認してください。</span>';
    el.style.display = "block";
    return;
  }
  el.innerHTML = '<span>' + msg + '</span>' +
    '<button id="ys-errorRetryBtn" class="ys-action-btn" style="margin-left:8px;">🔄 再試行</button>';
  el.style.display = "block";

  const retryBtn = el.querySelector("#ys-errorRetryBtn");
  if (retryBtn) {
    retryBtn.onclick = function() {
      el.style.display = "none";
      if (S.activeTab) {
        switchTab(S.activeTab);
      }
    };
  }
}

export function hideError() {
  const el = getEl("#ys-error");
  if (el) el.style.display = "none";
}

// ===== 要約テキストエリア =====
export function setSummaryContent(content) {
  const el = getEl("#ys-summaryText");
  if (!el) return;
  setMarkdown(el, content);
  linkTimestamps(el);
}

export function clearSummaryContent() {
  const el = getEl("#ys-summaryText");
  if (el) el.textContent = "";
}

export function setSummaryRaw(text) {
  const el = getEl("#ys-summaryText");
  if (el) el.innerHTML = text;
}

// ===== 情報ラベル =====
export function updateInfoLabel(text) {
  const el = getEl("#ys-infoLabel");
  if (el) el.textContent = text;
}

// ===== チャットエリア =====
export function showChatArea() {
  const el = getEl("#ys-chatArea");
  if (el) el.style.display = "block";
}

export function hideChatArea() {
  const el = getEl("#ys-chatArea");
  if (el) el.style.display = "none";
}

// ===== ボタン制御 =====
export function disableRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.disabled = true;
}

export function enableRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.disabled = false;
}

export function showRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.style.display = "inline-block";
}

export function hideRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.style.display = "none";
}

export function showCopyButton() {
  const btn = getEl("#ys-copyBtn");
  if (btn) btn.style.display = "inline-block";
}

export function hideCopyButton() {
  const btn = getEl("#ys-copyBtn");
  if (btn) btn.style.display = "none";
}

export function focusChatInput() {
  const el = getEl("#ys-chatInput");
  if (el) { el.value = ""; el.style.height = "auto"; el.focus(); }
}

// ===== チャット履歴 =====
// opts.editIndex (number) を渡すと role=user メッセージに編集ボタンを付与。
// data-edit-index 属性に chatHistory 配列上のインデックスを保持し、
// クリックは #ys-chatArea で delegation して tabs.js 側で処理する。
// 戻り値: { div, body }（本文 body には markdown 共通クラス .ys-md を付与）
export function appendChatMessage(role, text, opts) {
  const history = getEl("#ys-chatHistory");
  if (!history) return null;
  const { div, body } = createChatMessage(role, text, opts);
  history.appendChild(div);
  scrollToBottom();
  return { div: div, body: body };
}

// チャットメッセージ要素を構築（追加せず要素だけ返す）
function createChatMessage(role, text, opts) {
  const div = document.createElement("div");
  div.className = "chat-msg " + role;
  const body = document.createElement("div");
  body.className = "chat-msg-body ys-md";
  if (typeof text === "string") setMarkdown(body, text);
  div.appendChild(body);
  if (role === "user" && opts && typeof opts.editIndex === "number") {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ys-chat-edit-btn";
    editBtn.textContent = "✏️ 編集";
    editBtn.title = "この質問を編集";
    editBtn.setAttribute("data-edit-index", String(opts.editIndex));
    div.appendChild(editBtn);
  }
  return { div: div, body: body };
}

// ストリーミング表示用の空AI回答を作成。戻り値: { div, body }
export function appendAssistantPlaceholder() {
  const history = getEl("#ys-chatHistory");
  if (!history) return null;
  const div = document.createElement("div");
  div.className = "chat-msg assistant";
  const body = document.createElement("div");
  body.className = "chat-msg-body ys-md chat-msg-streaming";
  body.textContent = "…";
  div.appendChild(body);
  history.appendChild(div);
  return { div: div, body: body };
}

// 既存メッセージの本文を markdown 再描画（ストリーミング更新用）
export function updateChatMessageBody(bodyEl, text) {
  if (!bodyEl) return;
  setMarkdown(bodyEl, text);
}

// #ys-content-area を末尾へスクロール（ページ全体は動かさない）
function scrollToBottom() {
  const area = getEl("#ys-content-area");
  if (area) area.scrollTop = area.scrollHeight;
}

// 指定要素の上端が見えるよう #ys-content-area のみスクロール。
// ストリーミング開始時にAI回答の先頭をビューポートに固定するため。
export function scrollContentToElement(el) {
  if (!el) return;
  const area = getEl("#ys-content-area");
  if (!area) return;
  const areaRect = area.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const delta = elRect.top - areaRect.top;
  area.scrollTop = Math.max(0, area.scrollTop + delta - 4);
}

export function clearChatHistory() {
  const el = getEl("#ys-chatHistory");
  if (el) el.innerHTML = "";
}