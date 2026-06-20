// ============================================================
//  sidebar.js — 状態管理 + メッセージ通信 + 公開API(ys)
//  責務毎に分割されたモジュールのエントリポイント
//    - panel.js: DOM生成・CSS読み込み・ボタン制御 (YsPanel)
//    - transcript.js: 字幕取得・プリロード (YsTranscript)
//    - ai.js: AI呼び出し・Map-Reduce要約 (YsAI)
//    - ui.js: DOM操作集約 (YsUI)
//    - tabs.js: タブ切替・チャット・UI更新 (YsTabs)
// ============================================================
console.log("[YouTube 要約] sidebar.js loaded");
(function () {
  "use strict";

  // 共有状態は panel.js で初期化済み
  const S = window.__ysState;

  // ===== 動画切り替え用リセット =====
  function resetState() {
    YsAI.abortCurrentStream();
    if (S.panelEl) {
      const panel = S.panelEl.querySelector("#ys-panel");
      if (panel) panel.style.display = "none";
      (S.tabIds || ["summary", "customA", "customB"]).forEach(function (id) {
        const t = S.tabs[id];
        if (t) {
          t.generated = false;
          t.content = "";
          t.chatHistory = [];
        }
      });
      S.videoMeta = null;
      S.activeTab = null;
      YsTabs.updateTabActive();
      YsUI.clearSummaryContent();
      YsUI.hideProgress();
    }
  }

  // ===== メッセージリスナー =====
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === "ysPing") {
      sendResponse({ alive: true });
    }
    if (msg.action === "ysGetTranscript") {
      (async function () {
        try {
          const lang =
            msg.config && msg.config.lang ? msg.config.lang : undefined;
          const config = lang ? { lang: lang } : undefined;
          const r = await window.__fetchYtTranscript(config);
          sendResponse({ transcript: r.all, player: r.player });
        } catch (e) {
          sendResponse({ error: e.message });
        }
      })();
      return true;
    }
    if (msg.action === "ysForcePanel") {
      if (!S.panelEl) {
        YsPanel.createPanel();
        YsTabs.bindEvents();
        if (typeof applyFontSize === "function") applyFontSize();
        if (typeof applyTheme === "function") applyTheme();
      }
      if (S.panelEl) {
        S.panelEl.style.display = "";
        YsTranscript.preloadTranscript();
      }
      sendResponse({ done: true });
    }
    if (msg.action === "ysTriggerAi") {
      console.log("[ys] ysTriggerAi mode=" + msg.mode);
      (async function () {
        try {
          // パネルが未生成なら生成
          if (!S.panelEl) {
            YsPanel.createPanel();
            YsTabs.bindEvents();
            if (typeof applyFontSize === "function") applyFontSize();
            if (typeof applyTheme === "function") applyTheme();
            console.log("[ys] ysTriggerAi panel created");
          }
          if (S.panelEl) {
            S.panelEl.style.display = "";
          }
          // 字幕をプリロード
          await YsTranscript.preloadTranscript();
          console.log("[ys] ysTriggerAi preload done, starting switchTab");
          // 対象タブを切り替え（AI処理開始）— awaitせず非同期実行
          YsTabs.switchTab(msg.mode).catch(function(err) {
            console.error("[ys] ysTriggerAi switchTab error:", err);
          });
          sendResponse({ success: true });
        } catch (e) {
          console.error("[ys] ysTriggerAi error:", e);
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }
  });
  } catch (e) {
    console.warn("[ys] runtime.onMessage listener could not be registered (extension context may be invalid).");
  }

  // ===== main.js 向け公開API =====
  window.ys = {
    createPanel: YsPanel.createPanel,
    bindEvents: YsTabs.bindEvents,
    preloadTranscript: YsTranscript.preloadTranscript,
    resetTranscript: function () {
      S.preloadedTranscript = null;
      S.transcriptReady = false;
    },
    resetState: resetState,
    applyButtonTitles: YsTabs.applyButtonTitles,
    getPanelEl: function () {
      return S.panelEl;
    },
  };
})();
