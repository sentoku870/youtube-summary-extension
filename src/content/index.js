// ============================================================
//  index.js — 最小限のエントリポイント（ESM版）
//  初期化リトライ、SPA動画切り替え対応、event-bus 統合
//  Phase A-3c: Port/Adapter パターン (setUiAdapter) で直接注入
//  Phase A: setInterval を低速化 + 自動停止、popstate/hashchange で即時検出
// ============================================================
import { on, emit, EVENTS } from "../shared/event-bus.js";
import { setUiAdapter } from "../domain/ports.js";
import { createLogger } from "../shared/logger.js";
import {
  createPanel,
  bindEvents,
  preloadTranscript,
  resetState,
  resetTranscript,
  getPanelEl
} from "./ui/sidebar.js";
import {
  showError,
  hideProgress,
  showProgress,
  setSummaryContent,
  clearSummaryContent,
  updateInfoLabel,
  showChatArea,
  focusChatInput,
  showCopyButton,
  showRegenButton,
  hideError
} from "./ui/ui.js";
import { getEl } from "./ui/panel.js";
import { updateTabUI } from "./ui/tabs.js";
import { isYouTubeWatchPage } from "../shared/utils.js";
import { uiState } from "../shared/state.js";

const log = createLogger("index");
log.log("index.js loaded");

// ===== ドメイン層へ UI Adapter を注入（Port/Adapter パターン） =====
// content/ui 層の実装を ports.js の抽象インターフェースに結びつける。
// これにより ai.js は window.* を一切参照せず、純粋に抽象に依存する。
setUiAdapter({
  showError: showError,
  hideProgress: hideProgress,
  showProgress: showProgress,
  setSummaryContent: setSummaryContent,
  clearSummaryContent: clearSummaryContent,
  updateInfoLabel: updateInfoLabel,
  showChatArea: showChatArea,
  focusChatInput: focusChatInput,
  showCopyButton: showCopyButton,
  showRegenButton: showRegenButton,
  hideError: hideError,
  getSummaryTextEl: function () {
    return getEl("#ys-summaryText");
  },
  updateTabUI: updateTabUI
});

const MIN_INIT_INTERVAL_MS = 2000;

function doInit() {
  if (getPanelEl && getPanelEl()) return true;
  log.log("creating panel...");
  createPanel();
  bindEvents();
  preloadTranscript();
  return true;
}

function init() {
  try {
    if (doInit()) return;
  } catch (e) {
    log.warn("doInit failed:", e);
  }
}

// タイムスタンプガード付きで初期化（二重実行防止）
function safeInit() {
  if (uiState.initialized) return;
  const now = Date.now();
  if (now - uiState.lastInitTime < MIN_INIT_INTERVAL_MS) return;
  uiState.lastInitTime = now;
  uiState.initialized = true;
  init();
}

// 動画切り替え時のリセット＋再初期化（共通処理）
function handleNavigation() {
  // URLオブジェクトでホスト名＋パスを厳密判定（Shorts対応）
  if (!isYouTubeWatchPage(location.href)) return;
  resetState();
  resetTranscript();
  uiState.initialized = false;
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
  const obs = new MutationObserver(function () {
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
document.addEventListener(EVENTS.YT_NAVIGATE_FINISH, function () {
  emit(EVENTS.NAV_FINISH, { url: location.href });
});

// yt-page-data-updated のフォールバック
// （稀に yt-navigate-finish が発火しない環境向け。これも NAV_FINISH へ橋渡し）
document.addEventListener("yt-page-data-updated", function () {
  emit(EVENTS.NAV_FINISH, { url: location.href });
});

// History API 経由のナビゲーション（popstate は back/forward のみ発火だが保険として）
window.addEventListener("popstate", function () {
  emit(EVENTS.NAV_FINISH, { url: location.href });
});

// ハッシュ変化（#t=123s などのシーク変化もここに来るが、watch判定で弾かれる）
window.addEventListener("hashchange", function () {
  if (/[#&]t=\d+/.test(location.hash)) return;
  emit(EVENTS.NAV_FINISH, { url: location.href });
});

// BFCache (Back-Forward Cache) 復元対応
// 「戻る」「進む」でページがキャッシュから復元されたときは content script は
// 再実行されないため、pageshow の persisted フラグで再初期化をトリガする。
window.addEventListener("pageshow", function (ev) {
  if (ev.persisted && isYouTubeWatchPage(location.href)) {
    log.log("BFCache から復元されました。再初期化します。");
    uiState.initialized = false;
    handleNavigation();
  }
});

// SPAナビゲーション完了を event-bus 経由で購読
on(EVENTS.NAV_FINISH, function (payload) {
  if (payload && payload.url && isYouTubeWatchPage(payload.url)) {
    handleNavigation();
  }
});

waitForYtdApp(function () {
  // 既に動画ページにいる場合は即時実行
  if (isYouTubeWatchPage(location.href)) {
    safeInit();
  }
});

// ============================================================
//  SPA動画切り替え対応：URL ポーリングの最終フォールバック
//  第1層: yt-navigate-finish (YouTube SPA イベント)
//  第2層: yt-page-data-updated / popstate / hashchange (ブラウザ標準)
//  第3層: 3秒間隔ポーリング（稀に第1〜2層が発火しない環境向け）
//  ポーリングは 5 分間ナビがなければ自動停止（CPU 負荷対策）
// ============================================================
const FALLBACK_POLL_INTERVAL_MS = 3000;
const FALLBACK_POLL_MAX_IDLE_MS = 5 * 60 * 1000;

let lastObservedUrl = location.href;
let lastNavAt = Date.now();
let fallbackTimerId = null;

function startFallbackPolling() {
  if (fallbackTimerId !== null) return;
  fallbackTimerId = setInterval(function () {
    const url = location.href;
    if (url !== lastObservedUrl) {
      lastObservedUrl = url;
      lastNavAt = Date.now();
      if (isYouTubeWatchPage(url)) {
        handleNavigation();
      }
      return;
    }
    // ナビが長時間ない場合はポーリングを停止（CPU負荷軽減）
    if (Date.now() - lastNavAt > FALLBACK_POLL_MAX_IDLE_MS) {
      clearInterval(fallbackTimerId);
      fallbackTimerId = null;
    }
  }, FALLBACK_POLL_INTERVAL_MS);
}

startFallbackPolling();
