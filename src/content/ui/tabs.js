// ============================================================
//  tabs.js — タブ切替・チャット・UI更新・ボタンタイトル・イベントバインド
//  IIFEモジュールパターン
// ============================================================
(function() {
  'use strict';

  const S = window.__ysState;

  // ===== タブUI更新 =====
  function updateTabUI() {
    (S.tabIds || ["summary", "customA", "customB"]).forEach(function(id) {
      const btn = YsPanel.getEl("#ys-btn-" + id);
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
  function updateTabActive() {
    (S.tabIds || ["summary", "customA", "customB"]).forEach(function(id) {
      const btn = YsPanel.getEl("#ys-btn-" + id);
      if (!btn) return;
      btn.classList.toggle("ys-active", S.activeTab === id);
    });
  }

  // ===== クリップボードコピー =====
  function copyContent() {
    const tab = S.tabs[S.activeTab];
    if (!tab || !tab.content) return;
    try {
      navigator.clipboard.writeText(tab.content);
    } catch (_) {
      console.error("[ys] clipboard write failed");
    }
  }

  // ===== タブコンテンツ描画 =====
  function renderTabContent(mode) {
    const tab = S.tabs[mode];
    if (!tab) return;
    const chatHistory = YsPanel.getEl("#ys-chatHistory");

    if (!tab.generated) {
      YsUI.clearSummaryContent();
      YsUI.updateInfoLabel("");
      YsUI.hideChatArea();
      YsUI.hideRegenButton();
      YsUI.hideCopyButton();
      YsUI.hideProgress();
      return;
    }

    YsUI.setSummaryContent(tab.content);
    YsUI.updateInfoLabel("使用モデル: " + tab.modelLabel + " | 字幕 " + tab.transcriptCount + " 件");
    YsUI.showRegenButton();
    YsUI.showCopyButton();
    YsUI.showChatArea();

    if (chatHistory) {
      chatHistory.innerHTML = "";
      for (let i = 3; i < tab.chatHistory.length; i++) {
        const msg = tab.chatHistory[i];
        if (msg.role === "user" || msg.role === "assistant") {
          YsUI.appendChatMessage(msg.role, msg.content);
        }
      }
    }
    YsUI.focusChatInput();
    YsUI.enableSendButton();
  }

  // ===== タブ切り替え =====
  async function switchTab(mode) {
    const tab = S.tabs[mode];
    if (!tab) return;
    const panel = YsPanel.getEl("#ys-panel");
    if (!panel) return;
    if (S.activeTab === mode) {
      panel.style.display = "none";
      S.activeTab = null;
      updateTabActive();
      return;
    }
    S.activeTab = mode;
    panel.style.display = "block";
    updateTabActive();
    if (tab.generated) {
      renderTabContent(mode);
      requestAnimationFrame(function() { if (panel) panel.scrollTop = 0; });
    } else {
      const btn = YsPanel.getEl("#ys-btn-" + mode);
      if (btn) {
        btn.textContent = "⏳ 処理中...";
        btn.disabled = true;
      }
      try {
        const success = await YsAI.callAI(mode, true);
        // callAIがfalseを返した（エラー/中断）場合でも、finallyでボタンは戻る
      } finally {
        if (btn) {
          btn.disabled = false;
          applyButtonTitles();
        }
      }
      requestAnimationFrame(function() { if (panel) panel.scrollTop = 0; });
    }
  }

  // ===== 再生成 =====
  async function regenerate() {
    const mode = S.activeTab;
    if (!mode) return;
    const tab = S.tabs[mode];
    if (!tab) return;

    YsAI.abortCurrentStream();

    tab.generated = false;
    tab.content = "";
    tab.chatHistory = [];

    YsUI.setSummaryRaw("⏳ 再生成中...");
    YsUI.disableRegenButton();

    try {
      await YsAI.callAI(mode, false);
    } finally {
      YsUI.enableRegenButton();
      updateTabUI();
    }
  }

  // ===== チャット送信 =====
  async function onChatSend() {
    const input = YsPanel.getEl("#ys-chatInput");
    const text = input ? input.value.trim() : "";
    if (!text) return;
    if (input) input.value = "";

    const sendBtn = YsPanel.getEl("#ys-chatSendBtn");
    if (sendBtn) sendBtn.disabled = true;

    const tab = S.tabs[S.activeTab];
    if (!tab || !tab.generated) {
      YsUI.appendChatMessage("assistant", "[エラー] 先に要約・分析を生成してください。");
      return;
    }

    YsUI.appendChatMessage("user", text);
    tab.chatHistory.push({ role: "user", content: text });

    try {
      let config = tab.config;
      if (!config || !config.apiKey) {
        config = await YsAI.resolveApiConfig(S.activeTab);
      }
      if (!config || !config.apiKey) {
        YsUI.appendChatMessage("assistant", "[エラー] API設定がされていません。");
        return;
      }

      let accumulated = "";
      await callChatAPIStream(
        [{ role: "system", content: S.tabs[S.activeTab].chatHistory[0].content }].concat(tab.chatHistory),
        config,
        function(chunk) {
          accumulated = chunk;
        },
        function(fullText) {
          accumulated = fullText || accumulated;
          tab.chatHistory.push({ role: "assistant", content: accumulated });
          YsUI.appendChatMessage("assistant", accumulated);
          if (sendBtn) sendBtn.disabled = false;
        }
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof YsAbortError || e instanceof YsTimeoutError) return;
      if (e.message && e.message.indexOf("中断") !== -1) return;
      YsUI.appendChatMessage("assistant", "[エラー] " + e.message);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  // ===== ボタンタイトル適用 =====
  async function applyButtonTitles() {
    const btnSummary = YsPanel.getEl("#ys-btn-summary");
    const btnA = YsPanel.getEl("#ys-btn-customA");
    const btnB = YsPanel.getEl("#ys-btn-customB");
    if (btnSummary) btnSummary.textContent = "📝 要約";
    const titleA = await loadButtonTitle("customA");
    if (btnA) btnA.textContent = titleA ? "📊 " + titleA : "📊 分析";
    const titleB = await loadButtonTitle("customB");
    if (btnB) btnB.textContent = titleB ? "💡 " + titleB : "💡 考察";
    YsPanel.enableAllButtons();
    updateTabUI();
  }

  // ===== イベントバインド =====
  function bindEvents() {
    if (S.eventsBound) return;
    S.eventsBound = true;

    (S.tabIds || ["summary", "customA", "customB"]).forEach(function(id) {
      const btn = YsPanel.getEl("#ys-btn-" + id);
      if (btn) btn.addEventListener("click", function() { switchTab(id); });
    });

    const sendBtn = YsPanel.getEl("#ys-chatSendBtn");
    if (sendBtn) sendBtn.addEventListener("click", onChatSend);

    const chatInput = YsPanel.getEl("#ys-chatInput");
    if (chatInput) {
      chatInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          const btn = YsPanel.getEl("#ys-chatSendBtn");
          if (btn && !btn.disabled) btn.click();
        }
      });
    }

    const regenBtn = YsPanel.getEl("#ys-regenBtn");
    if (regenBtn) regenBtn.addEventListener("click", regenerate);

    const copyBtn = YsPanel.getEl("#ys-copyBtn");
    if (copyBtn) copyBtn.addEventListener("click", copyContent);

    // 設定変更を150msデバウンス（saveAllBtnの一括保存時に複数回発火するのを防止）
    let debounceTimer = null;
    try {
      chrome.storage.onChanged.addListener(function(changes) {
      let shouldUpdate = false;
      for (const key in changes) {
        if (key.indexOf("btnTitle_") === 0 || key.indexOf("prompt_") === 0) {
          shouldUpdate = true; break;
        }
      }
        if (!shouldUpdate) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          applyButtonTitles();
        }, 150);
      });
    } catch (e) {
      console.warn("[ys] storage.onChanged listener could not be registered (extension context may be invalid).");
    }
  }

  // ===== 公開API =====
  window.YsTabs = {
    switchTab: switchTab,
    updateTabUI: updateTabUI,
    updateTabActive: updateTabActive,
    applyButtonTitles: applyButtonTitles,
    bindEvents: bindEvents
  };

})();