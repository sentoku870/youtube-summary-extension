// ============================================================
//  ui-chat.js — チャット履歴の描画と制御（ESM版）
//  Phase B-1: ui.js から分割。チャットメッセージ DOM 生成と
//  スクロール制御（content-area 内）を担当。
// ============================================================
import { getEl } from "./panel.js";
import { setMarkdown } from "../../domain/markdown.js";

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