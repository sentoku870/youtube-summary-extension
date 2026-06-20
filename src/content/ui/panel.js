// ============================================================
//  panel.js — DOM生成・CSS読み込み・ボタン制御
//  IIFEモジュールパターン
// ============================================================
(function() {
  'use strict';

  // 共有状態の初期化（他のモジュールからwindow.__ysState経由でアクセス）
  // panel.js が最初に実行される新規ファイルのため、ここで初期化する
  if (!window.__ysState) {
    window.__ysState = {
      panelEl: null,
      transcriptText: "",
      preloadedTranscript: null,
      transcriptReady: false,
      activeTab: null,
      eventsBound: false,
      tabs: {},
      abortController: null,
      pendingRetry: false,
      videoMeta: null
    };
  }

  const S = window.__ysState;

  // ===== CSS動的読み込み =====
  function loadCSS() {
    if (document.getElementById("ys-sidebar-css")) return;
    const link = document.createElement("link");
    link.id = "ys-sidebar-css";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("content/sidebar.css");
    document.head.appendChild(link);
  }

  // ===== 内部ヘルパー =====
  function getEl(id) {
    return S.panelEl ? S.panelEl.querySelector(id) : null;
  }

  // ===== ボタン制御 =====
  function disableAllButtons() {
    const btns = S.panelEl ? S.panelEl.querySelectorAll(".ys-tab-row button") : [];
    btns.forEach(function(b) { b.disabled = true; });
  }

  function enableAllButtons() {
    const btns = S.panelEl ? S.panelEl.querySelectorAll(".ys-tab-row button") : [];
    btns.forEach(function(b) { b.disabled = false; });
  }

  // ===== #secondary が動画ページのものかを判定 =====
  function getWatchSecondary() {
    const sec = document.querySelector("#secondary");
    if (!sec) return null;
    // 動画ページの#secondaryのみを対象にする
    if (sec.closest("ytd-watch-flexy")) return sec;
    return null;
  }

  // ===== サイドバーDOM生成 =====
  function createPanel() {
    if (S.panelEl) return S.panelEl;
    loadCSS();

    S.tabIds = ["summary", "customA", "customB"];
    S.tabs = {};
    S.tabIds.forEach(function(id) {
      S.tabs[id] = {
        generated: false, content: "", config: null,
        modelLabel: "", transcriptCount: 0, chatHistory: []
      };
    });

    S.panelEl = document.createElement("div");
    S.panelEl.id = "yt-summary-root";
    S.panelEl.innerHTML =
      '<div class="ys-tab-row">' +
        '<button id="ys-btn-summary" class="ys-tab-btn">📝 要約</button>' +
        '<button id="ys-btn-customA" class="ys-tab-btn">📊 分析</button>' +
        '<button id="ys-btn-customB" class="ys-tab-btn">💡 考察</button>' +
      '</div>' +
      '<div id="ys-panel">' +
        '<div id="ys-error"></div>' +
        '<div id="ys-content-area">' +
          '<div id="ys-summaryText"></div>' +
          '<div id="ys-progress" style="display:none;padding:8px;background:#444;color:#fff;border-radius:4px;font-size:12px;margin:4px 0;"></div>' +
          '<div id="ys-infoRow">' +
            '<span id="ys-infoLabel"></span>' +
            '<button id="ys-copyBtn" class="ys-action-btn" style="display:none;margin-left:8px;">📋 コピー</button>' +
            '<button id="ys-regenBtn" class="ys-action-btn" style="display:none;margin-left:4px;">🔄 再生成</button>' +
          '</div>' +
          '<div id="ys-chatArea" style="display:none;">' +
            '<div id="ys-chatHistory"></div>' +
            '<div class="chat-row">' +
              '<input type="text" id="ys-chatInput" placeholder="質問を入力..." />' +
              '<button id="ys-chatSendBtn" disabled>送信</button>' +
              '<button id="ys-chatClearBtn">クリア</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    disableAllButtons();
    const btnSummary = getEl("#ys-btn-summary");
    if (btnSummary) btnSummary.textContent = "⏳ 字幕取得中...";

    const secondary = getWatchSecondary();
    if (secondary) {
      secondary.insertBefore(S.panelEl, secondary.firstChild);
    } else {
      // #secondary がない場合（YouTubeのレイアウト変更など）、body直下にフォールバック
      document.body.appendChild(S.panelEl);
      const obs = new MutationObserver(function(mutations, ob) {
        const sec = getWatchSecondary();
        if (sec && S.panelEl.parentNode !== sec) {
          sec.insertBefore(S.panelEl, sec.firstChild);
          ob.disconnect();
          document.removeEventListener("yt-navigate-finish", onNavFinish);
        }
      });
      obs.observe(document.documentElement || document.body, { childList: true, subtree: true });

      function onNavFinish() {
        const sec = getWatchSecondary();
        if (sec && S.panelEl && S.panelEl.parentNode !== sec) {
          sec.insertBefore(S.panelEl, sec.firstChild);
        }
        document.removeEventListener("yt-navigate-finish", onNavFinish);
        obs.disconnect();
      }
      document.addEventListener("yt-navigate-finish", onNavFinish);

      setTimeout(function() {
        obs.disconnect();
        document.removeEventListener("yt-navigate-finish", onNavFinish);
      }, 30000);
    }

    // テーマ・フォントサイズを適用（保存済み設定がある場合）
    if (typeof applyTheme === "function") applyTheme();
    if (typeof applyFontSize === "function") applyFontSize();

    return S.panelEl;
  }

  // ===== 公開API =====
  window.YsPanel = {
    getEl: getEl,
    createPanel: createPanel,
    disableAllButtons: disableAllButtons,
    enableAllButtons: enableAllButtons
  };

})();