// ============================================================
//  ui.js — DOM操作を集約したYsUI名前空間
//  panel.jsのYspanel.getElに依存（読み込みはpanel.jsより後）
// ============================================================
(function() {
  'use strict';

  const S = window.__ysState;

  // ===== プログレス表示 =====
  function showProgress(text) {
    const el = YsPanel.getEl("#ys-progress");
    if (el) {
      el.style.display = "block";
      el.textContent = text;
    }
    console.log("[YouTube 要約] " + text);
  }

  function hideProgress() {
    const el = YsPanel.getEl("#ys-progress");
    if (el) el.style.display = "none";
  }

  // ===== エラー表示（ネットワーク状態検出付き） =====
  function showError(msg) {
    const el = YsPanel.getEl("#ys-error");
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
        if (S.activeTab && typeof YsTabs !== "undefined" && YsTabs.switchTab) {
          YsTabs.switchTab(S.activeTab);
        }
      };
    }
  }

  function hideError() {
    const el = YsPanel.getEl("#ys-error");
    if (el) el.style.display = "none";
  }

  // ===== 要約テキストエリア =====
  function setSummaryContent(content) {
    const el = YsPanel.getEl("#ys-summaryText");
    if (!el) return;
    setMarkdown(el, content);
    if (typeof YsAI !== "undefined" && YsAI.linkTimestamps) {
      YsAI.linkTimestamps(el);
    }
  }

  function clearSummaryContent() {
    const el = YsPanel.getEl("#ys-summaryText");
    if (el) el.textContent = "";
  }

  function setSummaryRaw(text) {
    const el = YsPanel.getEl("#ys-summaryText");
    if (el) el.innerHTML = text;
  }

  // ===== 情報ラベル =====
  function updateInfoLabel(text) {
    const el = YsPanel.getEl("#ys-infoLabel");
    if (el) el.textContent = text;
  }

  // ===== チャットエリア =====
  function showChatArea() {
    const el = YsPanel.getEl("#ys-chatArea");
    if (el) el.style.display = "block";
  }

  function hideChatArea() {
    const el = YsPanel.getEl("#ys-chatArea");
    if (el) el.style.display = "none";
  }

  // ===== ボタン制御 =====
  function disableRegenButton() {
    const btn = YsPanel.getEl("#ys-regenBtn");
    if (btn) btn.disabled = true;
  }

  function enableRegenButton() {
    const btn = YsPanel.getEl("#ys-regenBtn");
    if (btn) btn.disabled = false;
  }

  function showRegenButton() {
    const btn = YsPanel.getEl("#ys-regenBtn");
    if (btn) btn.style.display = "inline-block";
  }

  function hideRegenButton() {
    const btn = YsPanel.getEl("#ys-regenBtn");
    if (btn) btn.style.display = "none";
  }

  function showCopyButton() {
    const btn = YsPanel.getEl("#ys-copyBtn");
    if (btn) btn.style.display = "inline-block";
  }

  function hideCopyButton() {
    const btn = YsPanel.getEl("#ys-copyBtn");
    if (btn) btn.style.display = "none";
  }

  function enableSendButton() {
    const btn = YsPanel.getEl("#ys-chatSendBtn");
    if (btn) btn.disabled = false;
  }

  function disableSendButton() {
    const btn = YsPanel.getEl("#ys-chatSendBtn");
    if (btn) btn.disabled = true;
  }

  function focusChatInput() {
    const el = YsPanel.getEl("#ys-chatInput");
    if (el) { el.value = ""; el.focus(); }
  }

  // ===== チャット履歴 =====
  function appendChatMessage(role, text) {
    const history = YsPanel.getEl("#ys-chatHistory");
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

  function clearChatHistory() {
    const el = YsPanel.getEl("#ys-chatHistory");
    if (el) el.innerHTML = "";
  }

  // ===== 公開API =====
  window.YsUI = {
    showProgress: showProgress,
    hideProgress: hideProgress,
    showError: showError,
    hideError: hideError,
    setSummaryContent: setSummaryContent,
    clearSummaryContent: clearSummaryContent,
    setSummaryRaw: setSummaryRaw,
    updateInfoLabel: updateInfoLabel,
    showChatArea: showChatArea,
    hideChatArea: hideChatArea,
    disableRegenButton: disableRegenButton,
    enableRegenButton: enableRegenButton,
    showRegenButton: showRegenButton,
    hideRegenButton: hideRegenButton,
    showCopyButton: showCopyButton,
    hideCopyButton: hideCopyButton,
    enableSendButton: enableSendButton,
    disableSendButton: disableSendButton,
    focusChatInput: focusChatInput,
    appendChatMessage: appendChatMessage,
    clearChatHistory: clearChatHistory
  };

})();