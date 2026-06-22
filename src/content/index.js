// ============================================================
//  index.js — 最小限のエントリポイント（ESM版）
//  初期化リトライ、SPA動画切り替え対応、event-bus 統合
//  Phase A-3c: Port/Adapter パターン (setUiAdapter) で直接注入
// ============================================================
import { on, emit, EVENTS } from "../shared/event-bus.js";
import { setUiAdapter } from "../domain/ports.js";
import { createPanel, bindEvents, preloadTranscript, resetState, resetTranscript, getPanelEl } from "./ui/sidebar.js";
import {
  showError, hideProgress, showProgress, setSummaryContent,
  clearSummaryContent, updateInfoLabel, showChatArea, focusChatInput,
  enableSendButton, showCopyButton, showRegenButton, hideError
} from "./ui/ui.js";
import { getEl } from "./ui/panel.js";
import { updateTabUI } from "./ui/tabs.js";
import { isYouTubeWatchPage } from "../shared/utils.js";

console.log("[YouTube 要約] index.js loaded");

// ===== ドメイン層へ UI Adapter を注入（Port/Adapter パターン） =====
// content/ui 層の実装を ports.js の抽象インターフェースに結びつける。
// これにより ai.js は window.Ys* を一切参照せず、純粋に抽象に依存する。
setUiAdapter({
  showError: showError,
  hideProgress: hideProgress,
  showProgress: showProgress,
  setSummaryContent: setSummaryContent,
  clearSummaryContent: clearSummaryContent,
  updateInfoLabel: updateInfoLabel,
  showChatArea: showChatArea,
  focusChatInput: focusChatInput,
  enableSendButton: enableSendButton,
  showCopyButton: showCopyButton,
  showRegenButton: showRegenButton,
  hideError: hideError,
  getSummaryTextEl: function() { return getEl("#ys-summaryText"); },
  updateTabUI: updateTabUI
});

function doInit() {
  if (getPanelEl && getPanelEl()) return true;
  console.log("[YouTube 要約] creating panel...");
  createPanel();
  bindEvents();
  preloadTranscript();
  return true;
}

function init() {
  try {
    if (doInit()) return;
  } catch (e) {
    console.warn("[YouTube 要約] doInit failed:", e);
  }
  // 失敗時はリトライしない（ESM化で ys の待ちは不要）
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

// 動画切り替え時のリセット＋再初期化（共通処理）
function handleNavigation() {
  // URLオブジェクトでホスト名＋パスを厳密判定（Shorts対応）
  if (!isYouTubeWatchPage(location.href)) return;
  resetState();
  resetTranscript();
  __ysInited = false;
  safeInit();
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

// yt-navigate-finish を event-bus の NAV_FINISH イベントへ橋渡し
// （生のDOMイベントを直接使う箇所をこの1箇所に集約）
document.addEventListener(EVENTS.YT_NAVIGATE_FINISH, function() {
  emit(EVENTS.NAV_FINISH, { url: location.href });
});

// SPAナビゲーション完了を event-bus 経由で購読
on(EVENTS.NAV_FINISH, function(payload) {
  if (payload && payload.url && isYouTubeWatchPage(payload.url)) {
    handleNavigation();
  }
});

waitForYtdApp(function() {
  // 既に動画ページにいる場合は即時実行
  if (isYouTubeWatchPage(location.href)) {
    safeInit();
  }
});

// ============================================================
//  SPA動画切り替え対応：yt-navigate-finish のフォールバック
//  （yt-navigate-finish が発火しない稀な環境向け。
//   document全体の MutationObserver より軽量なポーリング方式を採用）
// ============================================================
let lastUrl = location.href;
setInterval(function() {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (isYouTubeWatchPage(url)) {
      handleNavigation();
    }
  }
}, 1000);
