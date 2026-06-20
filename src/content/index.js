// ============================================================
//  main.js — 最小限のエントリポイント
//  初期化リトライ、SPA動画切り替え対応
// ============================================================

console.log("[YouTube 要約] main.js loaded");

function doInit() {
  if (!window.ys) {
    console.log("[YouTube 要約] window.ys not ready yet");
    return false;
  }
  if (window.ys.getPanelEl && window.ys.getPanelEl()) return true;
  console.log("[YouTube 要約] creating panel...");
  window.ys.createPanel();
  window.ys.bindEvents();
  window.ys.preloadTranscript();
  return true;
}

function init() {
  if (doInit()) return;
  // ysがまだ読み込まれていない場合はリトライ
  let retries = 0;
  const timer = setInterval(function() {
    retries++;
    if (doInit()) {
      clearInterval(timer);
    } else if (retries >= 30) {
      clearInterval(timer);
    }
  }, 300);
}

// 初期化フラグ（二重実行防止）
let __ysInited = false;
let __ysLastInitTime = 0;
const __YS_MIN_INIT_INTERVAL = 2000; // ms

// 無条件で即時実行（タイムスタンプガード付き）
function safeInit() {
  if (__ysInited) return;
  const now = Date.now();
  if (now - __ysLastInitTime < __YS_MIN_INIT_INTERVAL) return;
  __ysLastInitTime = now;
  __ysInited = true;
  init();
}

// ============================================================
//  初期化を ytd-app の準備完了まで待つ
//  （ブラウザ再起動時のタブ復元でも取りこぼさない）
// ============================================================

function waitForYtdApp(callback) {
  const app = document.querySelector("ytd-app");
  if (app) {
    callback();
    return;
  }
  const obs = new MutationObserver(function() {
    const app = document.querySelector("ytd-app");
    if (app) {
      obs.disconnect();
      callback();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

waitForYtdApp(function() {
  // yt-navigate-finish を購読（SPAナビゲーション完了を検知）
  document.addEventListener("yt-navigate-finish", function() {
    if (location.href.includes("youtube.com/watch")) {
      __ysInited = false;
      safeInit();
    }
  });

  // 既に動画ページにいる場合は即時実行
  if (location.href.includes("youtube.com/watch")) {
    safeInit();
  }
});

// ============================================================
//  SPA動画切り替え対応：URL変更を監視
// ============================================================
let lastUrl = location.href;
new MutationObserver(function() {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.indexOf("youtube.com/watch") !== -1) {
      setTimeout(function() {
        if (window.ys && window.ys.resetState) {
          window.ys.resetState();
          // resetState は字幕をリセットしないので個別にリセット
          if (window.ys.resetTranscript) window.ys.resetTranscript();
        }
        __ysInited = false;
        safeInit();
      }, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });