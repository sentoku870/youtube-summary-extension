// ============================================================
//  ui.js — DOM操作を集約（ESM版）
//  UI操作関数を一元管理。他モジュールは ESM import で利用。
// ============================================================
import { state as S } from "../../shared/state.js";
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

export function enableSendButton() {
  const btn = getEl("#ys-chatSendBtn");
  if (btn) btn.disabled = false;
}

export function disableSendButton() {
  const btn = getEl("#ys-chatSendBtn");
  if (btn) btn.disabled = true;
}

export function focusChatInput() {
  const el = getEl("#ys-chatInput");
  if (el) { el.value = ""; el.focus(); }
}

// ===== チャット履歴 =====
export function appendChatMessage(role, text) {
  const history = getEl("#ys-chatHistory");
  if (!history) return;
  const div = document.createElement("div");
  div.className = "chat-msg " + role;
  setMarkdown(div, text);
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
  requestAnimationFrame(function() {
    div.scrollIntoView({ block: "start", behavior: "auto" });
  });
}

export function clearChatHistory() {
  const el = getEl("#ys-chatHistory");
  if (el) el.innerHTML = "";
}