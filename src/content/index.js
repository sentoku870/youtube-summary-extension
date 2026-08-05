// ============================================================
//  index.js — content script のエントリポイント（ESM版）
//  Port/Adapter でドメイン層に UI 実装を注入し、ytd-app 準備完了後に
//  safeInit() と startNavigationDetection() を起動する。
//
//  役割:
//    - setUiAdapter() で ui-* モジュール各関数を domain/ports に橋渡し
//    - パネル生成 / 字幕プリロード / イベント登録のライフサイクル
//    - SPA ナビゲーション検出は navigation.js に委譲
// ============================================================
import { setUiAdapter } from "../domain/ports.js";
import { createLogger } from "../shared/logger.js";
import { uiState, sessionState } from "../shared/state.js";
import { isYouTubeWatchPage } from "../shared/utils.js";
import { getEl, createPanel } from "./ui/panel.js";
import { bindEvents } from "./ui/tabs-events.js";
import { showError, hideProgress, showProgress, hideError } from "./ui/ui-progress.js";
import {
  setSummaryContent,
  clearSummaryContent,
  updateInfoLabel,
  showChatArea
} from "./ui/ui-summary.js";
import { focusChatInput, showCopyButton, showRegenButton } from "./ui/ui-buttons.js";
import { updateTabUI } from "./ui/tabs.js";
import { preloadTranscript } from "../domain/transcript.js";
import { startNavigationDetection } from "./navigation.js";

// 副作用付きリスナー（event-bus → UI 橋、chrome.runtime.onMessage）
import "./ui/event-bridge.js";
import "./ui/message-handler.js";

const log = createLogger("index");
log.log("index.js loaded");

// ===== ドメイン層へ UI Adapter を注入（Port/Adapter パターン） =====
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
  // T2-D1: パネル再利用時のプリロード漏れを修正
  if (!uiState.panelEl) {
    log.log("creating panel...");
    createPanel();
    bindEvents();
  }
  if (!sessionState.transcriptReady && !sessionState.preloadedTranscript) {
    preloadTranscript();
  }
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
export function safeInit() {
  if (uiState.initialized) return;
  const now = Date.now();
  if (now - uiState.lastInitTime < MIN_INIT_INTERVAL_MS) return;
  uiState.lastInitTime = now;
  uiState.initialized = true;
  init();
}

// 初期化を ytd-app の準備完了まで待つ
// （ブラウザ再起動時のタブ復元でも取りこぼさない）
export function waitForYtdApp(callback) {
  const app = document.querySelector("ytd-app");
  if (app) {
    callback();
    return;
  }
  const obs = new MutationObserver(function () {
    const app2 = document.querySelector("ytd-app");
    if (app2) {
      obs.disconnect();
      callback();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  return obs;
}

// モジュールロード時の自動初期化。テスト環境では
// globalThis.__TEST_NO_AUTO_INIT__ = true をセットすることで抑制できる。
if (!globalThis.__TEST_NO_AUTO_INIT__) {
  waitForYtdApp(function () {
    if (isYouTubeWatchPage(location.href)) {
      safeInit();
    }
    startNavigationDetection(safeInit);
  });
}
